#!/usr/bin/env python3
"""Finalize seed samples: renumber folders, reserialize HTML, stamp finalized_at.

For each fold under seed-samples/, processes every numbered sample folder:
  1. Skips entries whose task.json already has finalized_at
  2. Round-trips original/raw.html and original/visible.html through reserialize_html.ts
  3. Writes finalized_at (Unix epoch ms) into task.json
  4. Renumbers sample folders to 001..N without gaps

Usage:
  python3 finalize-seed-samples.py
  python3 finalize-seed-samples.py --sample our-2
  python3 finalize-seed-samples.py --dry-run
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
DATA_DIR = SCRIPT_DIR.parent
PIPELINE_DIR = DATA_DIR / "pipeline"
SEED_SAMPLES_DIR = DATA_DIR / "seed-samples"
RESERIALIZE_CLI = SCRIPT_DIR / "reserialize_html.ts"
DENO_CONFIG = PIPELINE_DIR / "deno.json"
LOGS_DIR = SCRIPT_DIR / "logs"

SAMPLE_WIDTH = 3
SAMPLE_DIR_RE = re.compile(r"^\d+$")
HTML_FILES = ("raw.html", "visible.html")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Finalize seed samples: reserialize HTML, stamp finalized_at, renumber folders.",
    )
    parser.add_argument(
        "--sample",
        action="append",
        help="Only process these seed-samples subfolders (default: all). Repeatable.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print planned actions without writing files or renaming folders.",
    )
    return parser.parse_args()


def sample_folder_name(index: int) -> str:
    return f"{index:0{SAMPLE_WIDTH}d}"


def list_sample_dirs(fold_dir: Path) -> list[Path]:
    if not fold_dir.is_dir():
        return []

    samples = [
        path
        for path in fold_dir.iterdir()
        if path.is_dir() and SAMPLE_DIR_RE.match(path.name)
    ]
    return sorted(samples, key=lambda path: int(path.name))


def reserialize_html_file(path: Path) -> str:
    if not RESERIALIZE_CLI.is_file():
        raise FileNotFoundError(f"Missing reserialize CLI: {RESERIALIZE_CLI}")

    proc = subprocess.run(
        [
            "deno",
            "run",
            "-A",
            f"--config={DENO_CONFIG}",
            str(RESERIALIZE_CLI),
            "--input",
            str(path),
        ],
        capture_output=True,
        text=True,
        cwd=SCRIPT_DIR,
        check=False,
    )
    if proc.returncode != 0:
        detail = proc.stderr.strip() or proc.stdout.strip() or f"exit code {proc.returncode}"
        raise RuntimeError(f"reserialize_html failed for {path}: {detail}")

    return proc.stdout


def load_task_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def write_task_json(path: Path, task: dict) -> None:
    path.write_text(
        json.dumps(task, indent="\t", ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def finalize_sample(sample_dir: Path, *, dry_run: bool, log_lines: list[str]) -> bool:
    task_path = sample_dir / "task.json"
    if not task_path.is_file():
        log_lines.append(f"skip {sample_dir}: missing task.json")
        return False

    task = load_task_json(task_path)
    if "finalized_at" in task:
        log_lines.append(f"skip {sample_dir.name}: already finalized")
        return False

    original_dir = sample_dir / "original"
    missing = [name for name in HTML_FILES if not (original_dir / name).is_file()]
    if missing:
        raise FileNotFoundError(
            f"{sample_dir}: missing original/{', '.join(missing)}",
        )

    finalized_at = int(time.time() * 1000)
    rel = sample_dir.relative_to(SEED_SAMPLES_DIR)

    if dry_run:
        log_lines.append(
            f"would finalize {rel}: reserialize {', '.join(HTML_FILES)}, "
            f"finalized_at={finalized_at}",
        )
        return True

    for name in HTML_FILES:
        html_path = original_dir / name
        reserialized = reserialize_html_file(html_path)
        html_path.write_text(reserialized, encoding="utf-8")

    task["finalized_at"] = finalized_at
    write_task_json(task_path, task)
    log_lines.append(f"OK finalized {rel} (finalized_at={finalized_at})")
    return True


def normalize_folder_names(fold_dir: Path, *, dry_run: bool, log_lines: list[str]) -> int:
    samples = list_sample_dirs(fold_dir)
    if not samples:
        return 0

    renames: list[tuple[Path, str]] = []
    for index, sample_dir in enumerate(samples, start=1):
        target_name = sample_folder_name(index)
        if sample_dir.name != target_name:
            renames.append((sample_dir, target_name))

    if not renames:
        log_lines.append(f"{fold_dir.name}: folder names already normalized ({len(samples)} samples)")
        return 0

    fold_label = fold_dir.relative_to(SEED_SAMPLES_DIR)
    if dry_run:
        for sample_dir, target_name in renames:
            log_lines.append(f"would rename {fold_label}/{sample_dir.name} -> {target_name}")
        return len(renames)

    temp_names: list[tuple[Path, str]] = []
    for sample_dir, target_name in renames:
        temp_path = fold_dir / f"__finalize_tmp__{sample_dir.name}"
        if temp_path.exists():
            raise RuntimeError(f"temp path already exists: {temp_path}")
        sample_dir.rename(temp_path)
        temp_names.append((temp_path, target_name))

    for temp_path, target_name in temp_names:
        final_path = fold_dir / target_name
        if final_path.exists():
            raise RuntimeError(f"target path already exists: {final_path}")
        temp_path.rename(final_path)
        log_lines.append(f"renamed {fold_label}/{temp_path.name.removeprefix('__finalize_tmp__')} -> {target_name}")

    log_lines.append(f"{fold_label}: normalized {len(renames)} folder name(s)")
    return len(renames)


def resolve_folds(selected: list[str] | None) -> list[Path]:
    if not SEED_SAMPLES_DIR.is_dir():
        raise FileNotFoundError(f"Seed samples directory not found: {SEED_SAMPLES_DIR}")

    if selected:
        folds = [SEED_SAMPLES_DIR / name for name in selected]
        missing = [str(path) for path in folds if not path.is_dir()]
        if missing:
            raise FileNotFoundError(f"Unknown seed fold(s): {', '.join(missing)}")
        return folds

    return sorted(path for path in SEED_SAMPLES_DIR.iterdir() if path.is_dir())


def main() -> None:
    args = parse_args()
    timestamp = datetime.now(timezone.utc).isoformat()
    file_ts = timestamp.replace(":", "-")
    log_path = LOGS_DIR / f"{file_ts}-finalize-seed-samples.log"
    log_lines: list[str] = []

    folds = resolve_folds(args.sample)
    log_lines.extend(
        [
            "Finalize seed samples",
            "-" * 48,
            f"timestamp (UTC): {timestamp}",
            f"script: {Path(__file__).name}",
            f"seed samples root: {SEED_SAMPLES_DIR}",
            f"folds: {', '.join(path.name for path in folds)}",
            f"html reserialize: {RESERIALIZE_CLI}",
            f"dry run: {args.dry_run}",
            "",
        ]
    )

    finalized_count = 0
    skipped_count = 0
    renamed_count = 0
    failures: list[str] = []

    for fold_dir in folds:
        log_lines.append(f"=== {fold_dir.name} ===")
        samples = list_sample_dirs(fold_dir)
        log_lines.append(f"samples found: {len(samples)}")

        for sample_dir in samples:
            try:
                did_finalize = finalize_sample(
                    sample_dir,
                    dry_run=args.dry_run,
                    log_lines=log_lines,
                )
                if did_finalize:
                    finalized_count += 1
                else:
                    skipped_count += 1
            except Exception as exc:  # noqa: BLE001 — collect per-sample failures
                rel = sample_dir.relative_to(SEED_SAMPLES_DIR)
                message = f"FAIL {rel}: {exc}"
                failures.append(message)
                log_lines.append(message)

        try:
            renamed_count += normalize_folder_names(
                fold_dir,
                dry_run=args.dry_run,
                log_lines=log_lines,
            )
        except Exception as exc:  # noqa: BLE001
            message = f"FAIL {fold_dir.name} renumber: {exc}"
            failures.append(message)
            log_lines.append(message)

        log_lines.append("")

    log_lines.extend(
        [
            f"finalized: {finalized_count}",
            f"skipped (already finalized or invalid): {skipped_count}",
            f"renamed folders: {renamed_count}",
        ]
    )
    if failures:
        log_lines.append(f"failures: {len(failures)}")

    log_lines.append("")
    log_lines.append(f"log file: {log_path}")

    if not args.dry_run:
        LOGS_DIR.mkdir(parents=True, exist_ok=True)
        log_path.write_text("\n".join(log_lines) + "\n", encoding="utf-8")

    print("\n".join(log_lines))
    if not args.dry_run:
        print(f"\nLog: {log_path}")

    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
