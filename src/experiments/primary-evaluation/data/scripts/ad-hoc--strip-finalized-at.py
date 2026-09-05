#!/usr/bin/env python3
"""Strip finalized_at from seed sample task.json files so they can be re-finalized.

Usage:
  python3 ad-hoc--strip-finalized-at.py
  python3 ad-hoc--strip-finalized-at.py --sample our-3
  python3 ad-hoc--strip-finalized-at.py --dry-run
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
DATA_DIR = SCRIPT_DIR.parent
SEED_SAMPLES_DIR = DATA_DIR / "seed-samples"

SAMPLE_DIR_RE = re.compile(r"^\d+$")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Strip finalized_at from seed sample task.json files.",
    )
    parser.add_argument(
        "--sample",
        action="append",
        help="Only process these seed-samples subfolders (default: all). Repeatable.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print planned actions without modifying files.",
    )
    return parser.parse_args()


def resolve_folds(selected: list[str] | None) -> list[Path]:
    if not SEED_SAMPLES_DIR.is_dir():
        raise FileNotFoundError(f"Seed samples directory not found: {SEED_SAMPLES_DIR}")
    if selected:
        folds = [SEED_SAMPLES_DIR / name for name in selected]
        missing = [str(p) for p in folds if not p.is_dir()]
        if missing:
            raise FileNotFoundError(f"Unknown seed fold(s): {', '.join(missing)}")
        return folds
    return sorted(p for p in SEED_SAMPLES_DIR.iterdir() if p.is_dir())


def main() -> None:
    args = parse_args()
    folds = resolve_folds(args.sample)

    stripped = 0
    skipped = 0

    for fold_dir in folds:
        sample_dirs = sorted(
            [p for p in fold_dir.iterdir() if p.is_dir() and SAMPLE_DIR_RE.match(p.name)],
            key=lambda p: int(p.name),
        )
        for sample_dir in sample_dirs:
            task_path = sample_dir / "task.json"
            if not task_path.is_file():
                continue
            task = json.loads(task_path.read_text(encoding="utf-8"))
            if "finalized_at" not in task:
                skipped += 1
                continue
            rel = sample_dir.relative_to(SEED_SAMPLES_DIR)
            if args.dry_run:
                print(f"would strip finalized_at from {rel}/task.json")
            else:
                del task["finalized_at"]
                task_path.write_text(
                    json.dumps(task, indent="\t", ensure_ascii=False) + "\n",
                    encoding="utf-8",
                )
                print(f"stripped {rel}/task.json")
            stripped += 1

    print(f"\ndone: {stripped} stripped, {skipped} already without finalized_at")


if __name__ == "__main__":
    main()
