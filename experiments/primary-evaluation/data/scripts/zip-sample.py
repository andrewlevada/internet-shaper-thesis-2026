#!/usr/bin/env python3
"""Create a timestamped zip archive of a sample fold, excluding HTML files.

Usage:
  python3 zip-sample.py --sample our-2
"""

from __future__ import annotations

import argparse
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
DATA_DIR = SCRIPT_DIR.parent
SAMPLES_DIR = DATA_DIR / "samples"
LOGS_DIR = SCRIPT_DIR / "logs"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Zip a sample fold, preserving folder structure but excluding HTML files.",
    )
    parser.add_argument(
        "--sample",
        metavar="FOLD",
        required=True,
        help="Sample fold to archive (e.g. our-2).",
    )
    parser.add_argument(
        "--output",
        metavar="PATH",
        help="Output zip path (default: samples/{fold}-{timestamp}.zip).",
    )
    return parser.parse_args()


def timestamp_slug() -> str:
    return datetime.now(timezone.utc).isoformat().replace(":", "-")


def default_zip_path(fold: str) -> Path:
    return SAMPLES_DIR / f"{fold}-{timestamp_slug()}.zip"


def iter_files(fold_dir: Path) -> list[tuple[Path, str]]:
    entries: list[tuple[Path, str]] = []

    for path in sorted(fold_dir.rglob("*")):
        if not path.is_file():
            continue
        if path.suffix.lower() == ".html":
            continue

        arcname = path.relative_to(fold_dir.parent).as_posix()
        entries.append((path, arcname))

    return entries


def create_zip(fold: str, output_path: Path) -> tuple[int, int]:
    fold_dir = SAMPLES_DIR / fold
    if not fold_dir.is_dir():
        raise FileNotFoundError(f"Sample fold not found: {fold_dir}")

    files = iter_files(fold_dir)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(output_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for file_path, arcname in files:
            archive.write(file_path, arcname)

    return len(files), output_path.stat().st_size


def main() -> None:
    args = parse_args()
    timestamp = datetime.now(timezone.utc).isoformat()
    output_path = Path(args.output) if args.output else default_zip_path(args.sample)

    try:
        file_count, byte_size = create_zip(args.sample, output_path)
    except FileNotFoundError as error:
        print(error, file=sys.stderr)
        sys.exit(1)

    log_path = LOGS_DIR / f"{timestamp.replace(':', '-')}-zip-sample.log"
    log_lines = [
        "Zip sample",
        "-" * 48,
        f"timestamp (UTC): {timestamp}",
        f"script: {Path(__file__).name}",
        f"fold: {args.sample}",
        f"input: {SAMPLES_DIR / args.sample}",
        f"output: {output_path}",
        f"files: {file_count}",
        f"bytes: {byte_size}",
        f"log file: {log_path}",
    ]

    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    log_path.write_text("\n".join(log_lines) + "\n", encoding="utf-8")

    print(f"Created {output_path}")
    print(f"Files: {file_count}, size: {byte_size:,} bytes")
    print(f"Log: {log_path}")


if __name__ == "__main__":
    main()
