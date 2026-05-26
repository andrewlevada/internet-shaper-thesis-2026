#!/usr/bin/env python3
"""Seed seed-samples/instruct-4-edit from the Instruct4Edit benchmark dataset.

Uses the same random sample selection as playground/instruct4edit-01-03-90-eval
(mulberry32 seed 83947801, 100 entries from dangtruong01/Instruct4Edit).

Writes task.json and original/{raw,visible}.html only. HTML is round-tripped through
linkedom's DOMParser (same as pipeline read tools) so void-element serialization
matches show_in_dom output. Screenshots are created later by prep-samples.py.

Usage (from repo root or this directory):
  python3 experiments/primary-evaluation/data/scripts/seed-instruct-4-edit.py
  python3 seed-instruct-4-edit.py --count 5 --dry-run
"""

from __future__ import annotations

import argparse
import json
import subprocess
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
DATA_DIR = SCRIPT_DIR.parent
PIPELINE_DIR = DATA_DIR / "pipeline"
RESERIALIZE_CLI = SCRIPT_DIR / "reserialize_html.ts"
SEED_FOLD = DATA_DIR / "seed-samples" / "instruct-4-edit"
LOGS_DIR = SCRIPT_DIR / "logs"
CACHE_DIR = SCRIPT_DIR / "cache"

DATASET_REPO = "dangtruong01/Instruct4Edit"
JSON_REL_PATH = "data/datasets/instruction_tuning_data.json"
DEFAULT_SAMPLE_COUNT = 10
DEFAULT_RNG_SEED = 83947801
GOAL_FALLBACK = "I want to change how the page looks"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Populate seed-samples/instruct-4-edit from Instruct4Edit.",
    )
    parser.add_argument(
        "--count",
        type=int,
        default=DEFAULT_SAMPLE_COUNT,
        help=f"Number of samples to write (default: {DEFAULT_SAMPLE_COUNT}).",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=DEFAULT_RNG_SEED,
        help=f"mulberry32 seed for sample selection (default: {DEFAULT_RNG_SEED}).",
    )
    parser.add_argument(
        "--dataset-path",
        type=Path,
        help="Local instruction_tuning_data.json (default: fetch or use cache).",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite existing sample folders.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print selection only; do not write seed files.",
    )
    return parser.parse_args()


def _imul32(a: int, b: int) -> int:
    value = ((a & 0xFFFFFFFF) * (b & 0xFFFFFFFF)) & 0xFFFFFFFF
    if value >= 0x80000000:
        value -= 0x100000000
    return value


def mulberry32(initial_seed: int):
    state = initial_seed & 0xFFFFFFFF

    def rand() -> float:
        nonlocal state
        state = (state + 0x6D2B79F5) & 0xFFFFFFFF
        t = state
        t = ((t ^ (t >> 15)) * (t | 1)) & 0xFFFFFFFF
        t = (t ^ ((t + _imul32(t ^ (t >> 7), t | 61)) & 0xFFFFFFFF)) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296

    return rand


def shuffle(items: list[dict], seed: int) -> list[dict]:
    out = list(items)
    rand = mulberry32(seed)
    for i in range(len(out) - 1, 0, -1):
        j = int(rand() * (i + 1))
        out[i], out[j] = out[j], out[i]
    return out


def resolve_dataset_commit() -> str | None:
    url = f"https://api.github.com/repos/{DATASET_REPO}/commits/main"
    request = urllib.request.Request(url, headers={"Accept": "application/vnd.github+json"})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        return None
    sha = payload.get("sha")
    return sha if isinstance(sha, str) else None


def fetch_dataset_bytes(commit_sha: str | None) -> tuple[bytes, str]:
    if commit_sha:
        url = f"https://raw.githubusercontent.com/{DATASET_REPO}/{commit_sha}/{JSON_REL_PATH}"
    else:
        url = f"https://raw.githubusercontent.com/{DATASET_REPO}/main/{JSON_REL_PATH}"

    with urllib.request.urlopen(url, timeout=120) as response:
        return response.read(), url


def load_dataset(dataset_path: Path | None) -> tuple[list[dict], str | None, str]:
    if dataset_path is not None:
        if not dataset_path.is_file():
            raise FileNotFoundError(f"Dataset not found: {dataset_path}")
        return json.loads(dataset_path.read_text(encoding="utf-8")), None, str(dataset_path)

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_json = CACHE_DIR / "instruction_tuning_data.json"
    cache_meta = CACHE_DIR / "dataset-source.txt"

    if cache_json.is_file():
        commit_sha = None
        if cache_meta.is_file():
            for line in cache_meta.read_text(encoding="utf-8").splitlines():
                if line.startswith("commit_sha:"):
                    value = line.split(":", 1)[1].strip()
                    if value and value != "unknown":
                        commit_sha = value
                    break
        return json.loads(cache_json.read_text(encoding="utf-8")), commit_sha, str(cache_json)

    commit_sha = resolve_dataset_commit()
    raw_bytes, fetched_url = fetch_dataset_bytes(commit_sha)
    cache_json.write_bytes(raw_bytes)
    cache_meta.write_text(
        f"fetched_url: {fetched_url}\ncommit_sha: {commit_sha or 'unknown'}\n",
        encoding="utf-8",
    )
    return json.loads(raw_bytes.decode("utf-8")), commit_sha, fetched_url


def eligible_entries(entries: list[dict]) -> list[dict]:
    eligible: list[dict] = []
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        entry_id = entry.get("id")
        original_html = entry.get("original_html")
        instruction = entry.get("instruction")
        if (
            isinstance(entry_id, str)
            and isinstance(original_html, str)
            and original_html.strip()
            and isinstance(instruction, str)
            and instruction.strip()
        ):
            eligible.append(entry)
    return eligible


def sample_folder_name(index: int) -> str:
    return f"{index:03d}"


def build_task_json(entry: dict) -> dict[str, str]:
    instruction = entry["instruction"].strip()
    return {
        "request-prompt": instruction,
        "goal": GOAL_FALLBACK,
        "source-id": entry["id"],
    }


def reserialize_html(html: str) -> str:
    """Round-trip HTML through linkedom so seed snapshots match pipeline tool output."""
    if not RESERIALIZE_CLI.is_file():
        raise FileNotFoundError(f"Missing reserialize CLI: {RESERIALIZE_CLI}")

    # we use a cli because the serizlizer is a typescript lib
    proc = subprocess.run(
        ["deno", "run", "-A", str(RESERIALIZE_CLI)],
        input=html,
        capture_output=True,
        text=True,
        cwd=PIPELINE_DIR,
        check=False,
    )
    if proc.returncode != 0:
        detail = proc.stderr.strip() or proc.stdout.strip() or f"exit code {proc.returncode}"
        raise RuntimeError(f"reserialize_html failed: {detail}")

    return proc.stdout


def write_sample(
    *,
    index: int,
    entry: dict,
    force: bool,
    log_lines: list[str],
) -> None:
    sample_dir = SEED_FOLD / sample_folder_name(index)
    original_dir = sample_dir / "original"

    if sample_dir.exists() and not force:
        log_lines.append(f"skip {sample_dir.name}: already exists (use --force to overwrite)")
        return

    if sample_dir.exists():
        import shutil

        shutil.rmtree(sample_dir)

    original_dir.mkdir(parents=True, exist_ok=True)

    raw_html = reserialize_html(entry["original_html"])
    (original_dir / "raw.html").write_text(raw_html, encoding="utf-8")
    (original_dir / "visible.html").write_text(raw_html, encoding="utf-8")
    (sample_dir / "task.json").write_text(
        json.dumps(build_task_json(entry), indent="\t", ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    log_lines.append(
        f"OK instruct-4-edit/{sample_folder_name(index)} ← {entry['id']} "
        f"({len(raw_html)} chars)"
    )


def main() -> None:
    args = parse_args()
    timestamp = datetime.now(timezone.utc).isoformat()
    file_ts = timestamp.replace(":", "-")
    log_path = LOGS_DIR / f"{file_ts}-seed-instruct-4-edit.log"
    log_lines: list[str] = []

    log_lines.extend(
        [
            "Seed instruct-4-edit from Instruct4Edit benchmark",
            "-" * 48,
            f"timestamp (UTC): {timestamp}",
            f"script: {Path(__file__).name}",
            f"sample count: {args.count}",
            f"rng seed (mulberry32): {args.seed}",
            f"dataset repo: {DATASET_REPO}",
            f"dataset path: {JSON_REL_PATH}",
            f"output fold: {SEED_FOLD}",
            f"html reserialize: {RESERIALIZE_CLI}",
            "screenshots: deferred to prep-samples.py",
            f"dry run: {args.dry_run}",
            "",
        ]
    )

    entries, commit_sha, dataset_source = load_dataset(args.dataset_path)
    log_lines.append(f"dataset source: {dataset_source}")
    if commit_sha:
        log_lines.append(f"dataset commit sha: {commit_sha}")
    log_lines.append(f"total entries: {len(entries)}")

    eligible = eligible_entries(entries)
    log_lines.append(f"eligible entries: {len(eligible)}")

    if args.count <= 0:
        raise SystemExit("--count must be positive")
    if args.count > len(eligible):
        raise SystemExit(
            f"Requested {args.count} samples but only {len(eligible)} eligible entries exist.",
        )

    picked = shuffle(eligible, args.seed)[: args.count]
    log_lines.append(f"picked ids: {', '.join(entry['id'] for entry in picked)}")
    log_lines.append("")

    if args.dry_run:
        for index, entry in enumerate(picked, start=1):
            log_lines.append(
                f"would write instruct-4-edit/{sample_folder_name(index)} ← {entry['id']}",
            )
    else:
        SEED_FOLD.mkdir(parents=True, exist_ok=True)
        LOGS_DIR.mkdir(parents=True, exist_ok=True)
        failures: list[str] = []

        for index, entry in enumerate(picked, start=1):
            try:
                write_sample(
                    index=index,
                    entry=entry,
                    force=args.force,
                    log_lines=log_lines,
                )
            except Exception as exc:  # noqa: BLE001 — collect per-sample failures
                message = f"FAIL instruct-4-edit/{sample_folder_name(index)} ({entry['id']}): {exc}"
                failures.append(message)
                log_lines.append(message)

        if failures:
            log_lines.append("")
            log_lines.append(f"failures: {len(failures)}")

    log_lines.append("")
    log_lines.append(f"log file: {log_path}")

    if not args.dry_run:
        LOGS_DIR.mkdir(parents=True, exist_ok=True)
        log_path.write_text("\n".join(log_lines) + "\n", encoding="utf-8")

    print("\n".join(log_lines))
    if not args.dry_run:
        print(f"\nLog: {log_path}")


if __name__ == "__main__":
    main()
