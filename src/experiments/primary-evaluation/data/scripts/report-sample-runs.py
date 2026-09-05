#!/usr/bin/env python3
"""Run this after all the samples are prepped to calculate avarage time it took to process ech pipeline

Usage:
  python3 report-sample-runs.py --sample our-2
  python3 report-sample-runs.py --sample our
"""

from __future__ import annotations

import argparse
import re
import statistics
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
DATA_DIR = SCRIPT_DIR.parent
PIPELINE_DIR = DATA_DIR / "pipeline"
SAMPLES_DIR = DATA_DIR / "samples"
LOGS_DIR = SCRIPT_DIR / "logs"

sys.path.insert(0, str(PIPELINE_DIR))

from config import AGENT_PIPELINE_IDS, PIPELINES  # noqa: E402

ELAPSED_RE = re.compile(r"elapsed_s=([\d.]+)")
PIPELINE_HEADER_RE = re.compile(r"^Pipeline: (.+?) \(([^)]+)\)")
APPLY_FAILED_RE = re.compile(r"Apply failed: set_update_rules failed")

PIPELINE_FOLDERS = tuple(PIPELINES[pid].folder for pid in AGENT_PIPELINE_IDS)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Report mean/median pipeline run times and apply failures for a sample fold.",
    )
    parser.add_argument(
        "--sample",
        metavar="FOLD",
        required=True,
        help="Sample fold to analyze (e.g. our-2).",
    )
    parser.add_argument(
        "--output",
        metavar="PATH",
        help="Report output path (default: samples/{fold}/report.log).",
    )
    return parser.parse_args()


def human_minutes(seconds: float) -> str:
    if seconds >= 60:
        return f" ({seconds / 60:.1f} min)"
    return ""


def analyze_fold(fold: str) -> tuple[list[str], dict[str, list[float]], list[tuple[str, str, str]]]:
    fold_dir = SAMPLES_DIR / fold
    if not fold_dir.is_dir():
        raise FileNotFoundError(f"Sample fold not found: {fold_dir}")

    durations: dict[str, list[float]] = defaultdict(list)
    apply_failures: list[tuple[str, str, str]] = []

    for agent_log in sorted(fold_dir.glob("*/*/agent.log")):
        text = agent_log.read_text(encoding="utf-8", errors="replace")
        rel = agent_log.relative_to(fold_dir)
        sample_id = rel.parts[0]
        folder = rel.parts[1]

        header_match = PIPELINE_HEADER_RE.search(text)
        pipeline_folder = header_match.group(2) if header_match else folder

        elapsed_values = [float(match.group(1)) for match in ELAPSED_RE.finditer(text)]
        if elapsed_values:
            durations[pipeline_folder].append(sum(elapsed_values))

        if APPLY_FAILED_RE.search(text):
            reason_line = next(
                (line.strip() for line in text.splitlines() if line.startswith("Apply failed:")),
                "Apply failed",
            )
            apply_failures.append((f"{fold}/{sample_id}", pipeline_folder, reason_line))

    sample_count = len({path.parent.parent.name for path in fold_dir.glob("*/*/agent.log")})

    lines: list[str] = [
        f"Generated: {datetime.now(timezone.utc).isoformat()}",
        f"Input: samples/{fold}/*/agent.log",
        "Metric: sum of elapsed_s across API request rounds per agent.log (model inference time)",
        "",
        f"Fold: {fold}",
        f"Samples with agent logs: {sample_count}",
        "",
        "=== Pipeline run times (API elapsed, seconds) ===",
        "",
    ]

    seen_folders = set(durations)
    ordered_folders = [folder for folder in PIPELINE_FOLDERS if folder in seen_folders]
    ordered_folders.extend(sorted(seen_folders - set(ordered_folders)))

    for folder in ordered_folders:
        values = sorted(durations.get(folder, []))
        if not values:
            lines.append(f"{folder}: no runs")
            continue

        mean = statistics.mean(values)
        median = statistics.median(values)
        lines.extend(
            [
                f"{folder}:",
                f"  runs: {len(values)}",
                f"  mean: {mean:.1f}s{human_minutes(mean)}",
                f"  median: {median:.1f}s{human_minutes(median)}",
                f"  min: {min(values):.1f}s",
                f"  max: {max(values):.1f}s",
                "",
            ]
        )

    lines.extend(
        [
            "=== Apply failures (set_update_rules could not run) ===",
            "",
            f"total: {len(apply_failures)}",
            "",
        ]
    )

    if apply_failures:
        for sample, pipeline_folder, reason in apply_failures:
            lines.extend(
                [
                    f"- {sample} / {pipeline_folder}",
                    f"  {reason}",
                    "",
                ]
            )
    else:
        lines.extend(["(none)", ""])

    return lines, durations, apply_failures


def main() -> None:
    args = parse_args()
    timestamp = datetime.now(timezone.utc).isoformat()
    file_ts = timestamp.replace(":", "-")
    log_path = LOGS_DIR / f"{file_ts}-report-sample-runs.log"
    report_path = Path(args.output) if args.output else SAMPLES_DIR / args.sample / "report.log"

    report_lines, durations, apply_failures = analyze_fold(args.sample)
    report_text = "\n".join(report_lines).rstrip() + "\n"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(report_text, encoding="utf-8")

    log_lines = [
        "Report sample runs",
        "-" * 48,
        f"timestamp (UTC): {timestamp}",
        f"script: {Path(__file__).name}",
        f"fold: {args.sample}",
        f"report: {report_path}",
        "",
        report_text.rstrip(),
        "",
        f"log file: {log_path}",
    ]

    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    log_path.write_text("\n".join(log_lines) + "\n", encoding="utf-8")

    print(report_text, end="")
    print(f"Wrote {report_path}")
    print(f"Log: {log_path}")


if __name__ == "__main__":
    main()
