#!/usr/bin/env python3
"""Renew evaluation samples by re-capturing dom-compression snapshots and replaying agent edits.

Re-captures fresh HTML for each unique source-snapshot referenced by the target samples,
propagates HTML through seed-samples and evaluation variants, replays edit tool calls from
agent.log and rules from rules.json (no LLM), then regenerates screenshots.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import shutil
import subprocess
import sys
import tempfile
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
DATA_DIR = SCRIPT_DIR.parent
PIPELINE_DIR = DATA_DIR / "pipeline"
SEED_DIR = DATA_DIR / "seed-samples"
SAMPLES_DIR = DATA_DIR / "samples"
LOGS_DIR = SCRIPT_DIR / "logs"
RESERIALIZE_CLI = SCRIPT_DIR / "reserialize_html.ts"
DENO_CONFIG = PIPELINE_DIR / "deno.json"

REPO_ROOT = SCRIPT_DIR.parents[3]
DOM_PIPELINE_DIR = REPO_ROOT / "experiments/dom-compression-analysis/data/pipline"
SNAPSHOTS_DIR = REPO_ROOT / "experiments/dom-compression-analysis/data/snapshots"
SNAPSHOTS_CSV = SNAPSHOTS_DIR / "data.csv"

HTML_FILES = ("raw.html", "visible.html")
RENDER_PATCH_KEYS = ("render-approach", "render-document-url")

sys.path.insert(0, str(PIPELINE_DIR))
sys.path.insert(0, str(DOM_PIPELINE_DIR))

from config import AGENT_PIPELINE_IDS, PIPELINES, PipelineConfig  # noqa: E402
from paths import agent_variant_paths  # noqa: E402
from agent import (  # noqa: E402
    _apply_update_rules,
    _prepare_edit_arguments,
    _run_deno,
    copy_over_the_final,
)
from lib.screenshot import screenshot_variant  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402
from snapshot_capture import VIEWPORT, chromium_user_agent, recapture_snapshot  # noqa: E402

TOOL_CALL_RE = re.compile(r"^--- TOOL CALL: (\w+) ---$", re.MULTILINE)


@dataclass
class SampleRef:
    sample_id: str
    fold: str
    sample_num: str
    source_snapshot: str
    seed_dir: Path
    sample_dir: Path


@dataclass
class ReplayResult:
    pipeline_folder: str
    edit_calls: int = 0
    edit_failures: list[str] = field(default_factory=list)
    rules_applied: int = 0
    rules_failed: bool = False
    skipped: bool = False
    skip_reason: str = ""


@dataclass
class RenewState:
    log_lines: list[str]
    dry_run: bool
    continue_on_edit_failure: bool
    skip_replay: bool = False
    snapshot_final_urls: dict[str, str] = field(default_factory=dict)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Re-capture dom-compression snapshots and replay agent edits for evaluation samples.",
    )
    parser.add_argument(
        "--sample",
        required=True,
        metavar="ID",
        help="Fold (e.g. our-2) or sample id (e.g. our-2/005).",
    )
    parser.add_argument(
        "--skip-recapture",
        action="store_true",
        help="Skip live browser recapture; only propagate existing snapshot HTML, replay, screenshot.",
    )
    parser.add_argument(
        "--skip-replay",
        action="store_true",
        help="Skip applying edits and rules; agent variants get unmodified fresh HTML as index.html.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print planned actions without writing files.",
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Abort variant replay on first edit failure (default: continue).",
    )
    parser.add_argument(
        "--auto-capture",
        action="store_true",
        help="Skip the 45s headed-browser wait before each recapture (capture immediately after cookie accept).",
    )
    return parser.parse_args()


def log(state: RenewState, message: str) -> None:
    print(message, flush=True)
    state.log_lines.append(message)


def is_sample_dir(path: Path) -> bool:
    return path.is_dir() and (path / "task.json").is_file()


def list_sample_ids(sample_filter: str) -> list[str]:
    sample_path = SAMPLES_DIR / sample_filter
    if not sample_path.is_dir():
        print(f"Sample not found: {sample_path}", file=sys.stderr)
        sys.exit(1)

    if is_sample_dir(sample_path):
        return [sample_filter]

    ids = sorted(
        f"{sample_filter}/{child.name}"
        for child in sample_path.iterdir()
        if is_sample_dir(child)
    )
    if not ids:
        print(f"No samples under {sample_path}", file=sys.stderr)
        sys.exit(1)
    return ids


def load_task_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def write_task_json(path: Path, task: dict) -> None:
    path.write_text(
        json.dumps(task, indent="\t", ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def resolve_samples(sample_ids: list[str]) -> list[SampleRef]:
    refs: list[SampleRef] = []
    for sample_id in sample_ids:
        fold, sample_num = sample_id.split("/", 1)
        sample_dir = SAMPLES_DIR / sample_id
        seed_dir = SEED_DIR / sample_id
        if not seed_dir.is_dir():
            raise FileNotFoundError(f"Missing seed dir: {seed_dir}")

        task_path = sample_dir / "task.json"
        if not task_path.is_file():
            task_path = seed_dir / "task.json"
        task = load_task_json(task_path)
        source_snapshot = str(task.get("source-snapshot", "")).strip()
        if not source_snapshot:
            raise ValueError(f"{sample_id}: task.json missing source-snapshot")

        refs.append(
            SampleRef(
                sample_id=sample_id,
                fold=fold,
                sample_num=sample_num,
                source_snapshot=source_snapshot.zfill(3),
                seed_dir=seed_dir,
                sample_dir=sample_dir,
            )
        )
    return refs


def read_snapshots_csv() -> list[dict[str, str]]:
    if not SNAPSHOTS_CSV.is_file():
        raise FileNotFoundError(f"Missing snapshots manifest: {SNAPSHOTS_CSV}")

    with SNAPSHOTS_CSV.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames is None:
            raise RuntimeError(f"{SNAPSHOTS_CSV} has no header")
        return list(reader)


def write_snapshots_csv(rows: list[dict[str, str]]) -> None:
    fieldnames = ["folder", "url", "final_url", "seed_domain"]
    with SNAPSHOTS_CSV.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def snapshot_row_for(folder: str, rows: list[dict[str, str]]) -> dict[str, str]:
    for row in rows:
        if row.get("folder", "") == folder:
            return row
    raise KeyError(f"Snapshot folder {folder} not found in {SNAPSHOTS_CSV}")


def reserialize_html_file(path: Path) -> str:
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
        detail = proc.stderr.strip() or proc.stdout.strip() or f"exit {proc.returncode}"
        raise RuntimeError(f"reserialize_html failed for {path}: {detail}")
    return proc.stdout


def reserialize_snapshot_dir(snapshot_dir: Path, *, dry_run: bool) -> None:
    for name in HTML_FILES:
        html_path = snapshot_dir / name
        if not html_path.is_file():
            raise FileNotFoundError(f"Missing {html_path}")
        if dry_run:
            continue
        html_path.write_text(reserialize_html_file(html_path), encoding="utf-8")


def recapture_snapshots(
    state: RenewState,
    snapshot_ids: list[str],
    csv_rows: list[dict[str, str]],
    *,
    auto_capture: bool,
) -> None:
    if state.dry_run:
        for snapshot_id in snapshot_ids:
            row = snapshot_row_for(snapshot_id, csv_rows)
            log(state, f"would recapture snapshot {snapshot_id}: {row.get('url', '')}")
        return

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            headless=False,
            args=["--no-sandbox", "--disable-setuid-sandbox"],
        )
        context = browser.new_context(
            viewport=VIEWPORT,
            user_agent=chromium_user_agent(browser.version, headless=False),
            locale="en-US",
        )
        tab = context.new_page()
        try:
            for snapshot_id in snapshot_ids:
                row = snapshot_row_for(snapshot_id, csv_rows)
                url = row.get("url", "").strip()
                dest_dir = SNAPSHOTS_DIR / snapshot_id
                ok, final_url = recapture_snapshot(
                    tab,
                    url,
                    dest_dir,
                    replace_existing=True,
                    manual=not auto_capture,
                    label=snapshot_id,
                )
                if not ok:
                    log(state, f"FAIL recapture snapshot {snapshot_id}")
                    continue

                state.snapshot_final_urls[snapshot_id] = final_url
                for csv_row in csv_rows:
                    if csv_row.get("folder", "") == snapshot_id:
                        csv_row["final_url"] = final_url
                        break

                reserialize_snapshot_dir(dest_dir, dry_run=False)
                log(state, f"OK recaptured snapshot {snapshot_id} -> {final_url}")
        finally:
            context.close()
            browser.close()

    write_snapshots_csv(csv_rows)


def strip_render_patch_keys(task: dict) -> bool:
    changed = False
    for key in RENDER_PATCH_KEYS:
        if key in task:
            task.pop(key)
            changed = True
    return changed


def update_task_final_url(task_path: Path, final_url: str, *, dry_run: bool) -> None:
    if not final_url:
        return
    task = load_task_json(task_path)
    changed = strip_render_patch_keys(task)
    if task.get("final-url") != final_url:
        task["final-url"] = final_url
        changed = True
    if changed and not dry_run:
        write_task_json(task_path, task)


def propagate_html(
    state: RenewState,
    sample: SampleRef,
    snapshot_dir: Path,
    final_url: str,
) -> None:
    original_seed = sample.seed_dir / "original"
    original_cfg = PIPELINES["original"]

    if state.dry_run:
        log(
            state,
            f"would propagate snapshot {sample.source_snapshot} -> {sample.sample_id} "
            f"(seed original + 1-original + work dirs)",
        )
        return

    original_seed.mkdir(parents=True, exist_ok=True)
    for name in (*HTML_FILES, "screenshot.png"):
        src = snapshot_dir / name
        if src.is_file():
            shutil.copy2(src, original_seed / name)

    for task_path in (sample.seed_dir / "task.json", sample.sample_dir / "task.json"):
        if task_path.is_file():
            update_task_final_url(task_path, final_url, dry_run=False)

    dest_original = sample.sample_dir / original_cfg.folder
    dest_original.mkdir(parents=True, exist_ok=True)
    shutil.copy2(snapshot_dir / "raw.html", dest_original / "index.html")

    for pipeline_id in AGENT_PIPELINE_IDS:
        pipeline = PIPELINES[pipeline_id]
        paths = agent_variant_paths(sample.sample_dir / pipeline.folder)
        paths.work_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy2(snapshot_dir / "raw.html", paths.raw_html)
        shutil.copy2(snapshot_dir / "visible.html", paths.visible_html)

    log(state, f"OK propagated HTML for {sample.sample_id}")


def finalize_variants_without_replay(state: RenewState, sample: SampleRef) -> None:
    if state.dry_run:
        log(state, f"would copy fresh raw.html -> index.html for agent variants of {sample.sample_id}")
        return

    for pipeline_id in AGENT_PIPELINE_IDS:
        paths = agent_variant_paths(sample.sample_dir / PIPELINES[pipeline_id].folder)
        if paths.raw_html.is_file():
            copy_over_the_final(paths)
    log(state, f"OK finalized agent variants (no replay) for {sample.sample_id}")


def parse_edit_tool_calls(agent_log_path: Path) -> list[dict]:
    if not agent_log_path.is_file():
        return []

    content = agent_log_path.read_text(encoding="utf-8")
    calls: list[dict] = []
    parts = TOOL_CALL_RE.split(content)
    # parts: [preamble, name1, body1, name2, body2, ...]
    index = 1
    while index + 1 < len(parts):
        name = parts[index].strip()
        body = parts[index + 1]
        index += 2
        if name != "edit":
            continue

        json_text = body.split("\n--- TOOL RESULT:", 1)[0].strip()
        if not json_text or json_text == "(no input)":
            continue
        try:
            arguments = json.loads(json_text)
        except json.JSONDecodeError:
            continue
        if not isinstance(arguments, dict):
            continue
        calls.append(arguments)
    return calls


def apply_edit_call(raw_html: Path, arguments: dict) -> tuple[bool, str]:
    edits = arguments.get("edits")
    if isinstance(edits, list) and not edits:
        return True, "skipped empty edits"

    try:
        prepared = _prepare_edit_arguments(arguments)
    except ValueError as exc:
        return False, str(exc)

    edits = prepared.get("edits")
    if not isinstance(edits, list) or not edits:
        return True, "skipped empty edits"

    edits_payload = json.dumps({"edits": edits}, ensure_ascii=False)
    with tempfile.NamedTemporaryFile(
        mode="w",
        suffix=".edits.json",
        delete=False,
        encoding="utf-8",
    ) as edits_file:
        edits_file.write(edits_payload)
        edits_path = edits_file.name

    try:
        code, out, err = _run_deno(
            "edit.ts",
            [
                "--snapshot",
                str(raw_html),
                "--edits",
                edits_path,
                "--output",
                str(raw_html),
            ],
        )
        message = (out or err or "").strip()
        if code != 0:
            return False, message or "edit failed"
        return True, message or "edit applied"
    finally:
        Path(edits_path).unlink(missing_ok=True)


def replay_variant(
    state: RenewState,
    sample: SampleRef,
    pipeline: PipelineConfig,
) -> ReplayResult:
    result = ReplayResult(pipeline_folder=pipeline.folder)
    variant_dir = sample.sample_dir / pipeline.folder
    paths = agent_variant_paths(variant_dir)

    if not paths.agent_log.is_file():
        result.skipped = True
        result.skip_reason = "missing agent.log"
        return result

    if state.dry_run:
        result.skipped = True
        result.skip_reason = "dry run"
        return result

    if pipeline.uses_edit:
        edit_calls = parse_edit_tool_calls(paths.agent_log)
        for call_index, arguments in enumerate(edit_calls, start=1):
            ok, message = apply_edit_call(paths.raw_html, arguments)
            if not ok:
                failure = f"edit call #{call_index}: {message}"
                result.edit_failures.append(failure)
                if not state.continue_on_edit_failure:
                    break
            else:
                result.edit_calls += 1

    elif pipeline.uses_rules:
        if not paths.rules_json.is_file():
            result.skipped = True
            result.skip_reason = "missing rules.json"
            copy_over_the_final(paths)
            return result

        rules = json.loads(paths.rules_json.read_text(encoding="utf-8"))
        if not isinstance(rules, list):
            result.rules_failed = True
            copy_over_the_final(paths)
            return result

        if rules:
            try:
                _apply_update_rules(paths.raw_html, rules, paths.raw_html)
                result.rules_applied = len(rules)
            except RuntimeError as exc:
                result.rules_failed = True
                log(
                    state,
                    f"[{sample.sample_id}] rules apply failed in {pipeline.folder}: {exc}",
                )

    copy_over_the_final(paths)
    return result


def append_renew_footer(
    agent_log_path: Path,
    replay: ReplayResult,
    *,
    dry_run: bool,
) -> None:
    if dry_run or not agent_log_path.is_file():
        return

    timestamp = datetime.now(timezone.utc).isoformat()
    lines = [
        "=== Renew replay ===",
        "",
        f"timestamp: {timestamp}",
        f"pipeline: {replay.pipeline_folder}",
    ]
    if replay.skipped:
        lines.append(f"skipped: {replay.skip_reason}")
    else:
        lines.append(f"edit_calls_applied: {replay.edit_calls}")
        if replay.edit_failures:
            lines.append(f"edit_failures: {len(replay.edit_failures)}")
            lines.extend(f"  - {item}" for item in replay.edit_failures)
        lines.append(f"rules_applied: {replay.rules_applied}")
        if replay.rules_failed:
            lines.append("rules_failed: true")
    lines.append("")

    with agent_log_path.open("a", encoding="utf-8") as handle:
        handle.write("\n".join(lines))


def screenshot_variants(state: RenewState, sample: SampleRef) -> None:
    for pipeline_id in ("original", *AGENT_PIPELINE_IDS):
        pipeline = PIPELINES[pipeline_id]
        variant_dir = sample.sample_dir / pipeline.folder
        html_path = agent_variant_paths(variant_dir).index_html
        output_path = variant_dir / "screenshot.png"

        if not html_path.is_file():
            log(state, f"[{sample.sample_id}] skip screenshot {pipeline.folder} (no index.html)")
            continue

        if state.dry_run:
            log(state, f"would screenshot {sample.sample_id}/{pipeline.folder}")
            continue

        log(state, f"[{sample.sample_id}] screenshot {pipeline.folder}")
        try:
            screenshot_variant(html_path=html_path, output_path=output_path)
        except Exception as exc:
            log(state, f"[{sample.sample_id}] screenshot failed {pipeline.folder}: {exc}")


def main() -> None:
    args = parse_args()
    timestamp = datetime.now(timezone.utc).isoformat()
    file_ts = timestamp.replace(":", "-")
    log_slug = args.sample.replace("/", "-")
    log_path = LOGS_DIR / f"{file_ts}-renew-sample-{log_slug}.log"

    state = RenewState(
        log_lines=[],
        dry_run=args.dry_run,
        continue_on_edit_failure=not args.strict,
        skip_replay=args.skip_replay,
    )

    sample_ids = list_sample_ids(args.sample)
    samples = resolve_samples(sample_ids)
    snapshots_by_id: dict[str, list[SampleRef]] = defaultdict(list)
    for sample in samples:
        snapshots_by_id[sample.source_snapshot].append(sample)
    snapshot_ids = sorted(snapshots_by_id.keys())

    csv_rows = read_snapshots_csv()

    log(state, "Renew evaluation samples")
    log(state, "-" * 48)
    log(state, f"timestamp (UTC): {timestamp}")
    log(state, f"target: {args.sample}")
    log(state, f"samples: {len(samples)}")
    log(state, f"unique snapshots: {len(snapshot_ids)} ({', '.join(snapshot_ids)})")
    log(state, f"skip recapture: {args.skip_recapture}")
    log(state, f"skip replay: {args.skip_replay}")
    log(state, f"dry run: {args.dry_run}")
    log(state, f"auto capture: {args.auto_capture}")
    log(state, "")

    if not args.skip_recapture:
        log(state, "=== Phase 2: Recapture snapshots ===")
        recapture_snapshots(state, snapshot_ids, csv_rows, auto_capture=args.auto_capture)
        log(state, "")
    else:
        for snapshot_id in snapshot_ids:
            row = snapshot_row_for(snapshot_id, csv_rows)
            final_url = row.get("final_url", "")
            if final_url:
                state.snapshot_final_urls[snapshot_id] = final_url

    log(state, "=== Phase 3: Propagate HTML ===")
    for sample in samples:
        snapshot_dir = SNAPSHOTS_DIR / sample.source_snapshot
        if not (snapshot_dir / "raw.html").is_file():
            log(state, f"FAIL {sample.sample_id}: missing {snapshot_dir}/raw.html")
            continue
        final_url = state.snapshot_final_urls.get(
            sample.source_snapshot,
            snapshot_row_for(sample.source_snapshot, csv_rows).get("final_url", ""),
        )
        propagate_html(state, sample, snapshot_dir, final_url)
    log(state, "")

    log(state, "=== Phase 4: Replay agent mutations ===")
    replay_results: list[tuple[SampleRef, ReplayResult]] = []
    if args.skip_replay:
        log(state, "(skipped — agent variants use unmodified fresh HTML)")
        for sample in samples:
            finalize_variants_without_replay(state, sample)
    else:
        for sample in samples:
            for pipeline_id in AGENT_PIPELINE_IDS:
                pipeline = PIPELINES[pipeline_id]
                replay = replay_variant(state, sample, pipeline)
                append_renew_footer(
                    agent_variant_paths(sample.sample_dir / pipeline.folder).agent_log,
                    replay,
                    dry_run=state.dry_run,
                )
                replay_results.append((sample, replay))
                if replay.skipped:
                    log(state, f"[{sample.sample_id}] skip {pipeline.folder}: {replay.skip_reason}")
                elif replay.edit_failures:
                    log(
                        state,
                        f"[{sample.sample_id}] {pipeline.folder}: "
                        f"{replay.edit_calls} edits OK, {len(replay.edit_failures)} failed",
                    )
                elif pipeline.uses_rules:
                    log(
                        state,
                        f"[{sample.sample_id}] {pipeline.folder}: "
                        f"{replay.rules_applied} rules applied"
                        + (" (failed)" if replay.rules_failed else ""),
                    )
                else:
                    log(
                        state,
                        f"[{sample.sample_id}] {pipeline.folder}: "
                        f"{replay.edit_calls} edits applied",
                    )
    log(state, "")

    log(state, "=== Phase 5: Screenshots ===")
    for sample in samples:
        screenshot_variants(state, sample)
    log(state, "")

    edit_failures = sum(1 for _, replay in replay_results if replay.edit_failures)
    rules_failures = sum(1 for _, replay in replay_results if replay.rules_failed)
    log(state, f"edit failure variants: {edit_failures}")
    log(state, f"rules failure variants: {rules_failures}")
    log(state, f"log file: {log_path}")

    if not args.dry_run:
        LOGS_DIR.mkdir(parents=True, exist_ok=True)
        log_path.write_text("\n".join(state.log_lines) + "\n", encoding="utf-8")
        print(f"\nLog: {log_path}")

    if edit_failures and args.strict:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
