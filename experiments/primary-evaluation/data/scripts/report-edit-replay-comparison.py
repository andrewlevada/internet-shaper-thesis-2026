#!/usr/bin/env python3
"""Compare successful original edit tool calls vs renew replay edit counts per sample/pipeline."""

from __future__ import annotations

import argparse
import csv
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
DATA_DIR = SCRIPT_DIR.parent
SAMPLES_DIR = DATA_DIR / "samples"
LOGS_DIR = SCRIPT_DIR / "logs"

EDIT_PIPELINES = ("2-baseline", "4-map-only")
RENEW_MARKER = "=== Renew replay ==="
TOOL_CALL_RE = re.compile(r"^--- TOOL CALL: (\w+) ---$", re.MULTILINE)
SUCCESS_RE = re.compile(r"Successfully replaced\s+\d+\s+block", re.IGNORECASE)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="CSV comparing original vs renew-replay successful edit counts.",
    )
    parser.add_argument(
        "--sample",
        default="our-2",
        help="Sample fold or id (default: our-2).",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Output CSV path (default: logs/{timestamp}-edit-replay-comparison-{fold}.csv).",
    )
    return parser.parse_args()


def list_sample_dirs(sample_filter: str) -> list[tuple[str, Path]]:
    root = SAMPLES_DIR / sample_filter
    if (root / "task.json").is_file():
        return [(sample_filter, root)]

    if not root.is_dir():
        print(f"Sample not found: {root}", file=sys.stderr)
        sys.exit(1)

    samples = sorted(
        (f"{sample_filter}/{child.name}", child)
        for child in root.iterdir()
        if child.is_dir() and (child / "task.json").is_file()
    )
    if not samples:
        print(f"No samples under {root}", file=sys.stderr)
        sys.exit(1)
    return samples


def original_section(content: str) -> str:
    index = content.find(RENEW_MARKER)
    if index == -1:
        return content
    return content[:index]


def count_original_edits(log_text: str) -> tuple[int, int, int, int]:
    """Return (total_calls, successful, failed, skipped_empty)."""
    total = 0
    successful = 0
    failed = 0
    skipped_empty = 0

    parts = TOOL_CALL_RE.split(log_text)
    index = 1
    while index + 1 < len(parts):
        name = parts[index].strip()
        body = parts[index + 1]
        index += 2
        if name != "edit":
            continue

        call_body, _, result_body = body.partition("\n--- TOOL RESULT:")
        result = result_body.split("\n---", 1)[0].strip() if result_body else ""

        json_text = call_body.strip()
        if not json_text or json_text == "(no input)":
            continue

        if "error: edit requires a non-empty edits array" in result:
            skipped_empty += 1
            continue

        if '"edits": []' in json_text or '"edits":[]' in json_text.replace(" ", ""):
            skipped_empty += 1
            continue

        total += 1
        if SUCCESS_RE.search(result):
            successful += 1
        else:
            failed += 1

    return total, successful, failed, skipped_empty


def parse_latest_renew_replay(content: str) -> dict[str, int | bool]:
    sections = content.split(RENEW_MARKER)
    if len(sections) < 2:
        return {
            "has_renew_replay": False,
            "replay_successful": 0,
            "replay_failed": 0,
        }

    latest = sections[-1]
    replay_successful = 0
    replay_failed = 0

    for line in latest.splitlines():
        stripped = line.strip()
        if stripped.startswith("edit_calls_applied:"):
            replay_successful = int(stripped.split(":", 1)[1].strip())
        elif stripped.startswith("edit_failures:"):
            replay_failed = int(stripped.split(":", 1)[1].strip())

    return {
        "has_renew_replay": True,
        "replay_successful": replay_successful,
        "replay_failed": replay_failed,
    }


def compare_match(original_successful: int, replay_successful: int, has_renew: bool) -> str:
    if not has_renew:
        return "no_replay"
    if original_successful == replay_successful:
        return "match"
    if replay_successful == 0 and original_successful > 0:
        return "all_lost"
    if replay_successful < original_successful:
        return "partial_loss"
    return "replay_more"


def build_rows(sample_filter: str) -> list[dict[str, str | int]]:
    rows: list[dict[str, str | int]] = []

    for sample_id, sample_dir in list_sample_dirs(sample_filter):
        for pipeline in EDIT_PIPELINES:
            agent_log = sample_dir / pipeline / "agent.log"
            if not agent_log.is_file():
                continue

            content = agent_log.read_text(encoding="utf-8")
            orig_text = original_section(content)
            total, original_successful, original_failed, skipped_empty = count_original_edits(
                orig_text
            )
            replay = parse_latest_renew_replay(content)
            replay_successful = int(replay["replay_successful"])
            replay_failed = int(replay["replay_failed"])
            has_renew = bool(replay["has_renew_replay"])

            rows.append(
                {
                    "sample": sample_id,
                    "pipeline": pipeline,
                    "original_total_calls": total,
                    "original_successful": original_successful,
                    "original_failed": original_failed,
                    "original_skipped_empty": skipped_empty,
                    "replay_successful": replay_successful if has_renew else "",
                    "replay_failed": replay_failed if has_renew else "",
                    "successful_delta": (
                        replay_successful - original_successful if has_renew else ""
                    ),
                    "comparison": compare_match(original_successful, replay_successful, has_renew),
                }
            )

    return rows


def main() -> None:
    args = parse_args()
    timestamp = datetime.now(timezone.utc).isoformat()
    file_ts = timestamp.replace(":", "-")
    fold_slug = args.sample.replace("/", "-")

    rows = build_rows(args.sample)
    output_path = args.output or (
        LOGS_DIR / f"{file_ts}-edit-replay-comparison-{fold_slug}.csv"
    )

    fieldnames = [
        "sample",
        "pipeline",
        "original_total_calls",
        "original_successful",
        "original_failed",
        "original_skipped_empty",
        "replay_successful",
        "replay_failed",
        "successful_delta",
        "comparison",
    ]

    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    applicable = [row for row in rows if row["comparison"] != "no_replay"]
    matches = sum(1 for row in applicable if row["comparison"] == "match")
    print(f"Wrote {len(rows)} rows to {output_path}")
    print(f"With renew replay: {len(applicable)}")
    print(f"Exact successful-count match: {matches}/{len(applicable)}")


if __name__ == "__main__":
    main()
