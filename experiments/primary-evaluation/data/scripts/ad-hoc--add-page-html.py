#!/usr/bin/env python3
"""Backfill page.html for existing dom-compression snapshots and our-3 seed samples.

Iterates:
  - experiments/dom-compression-analysis/data/snapshots/NNN/
  - experiments/primary-evaluation/data/seed-samples/our-3/NNN/original/

For each folder that has raw.mhtml but no page.html, extracts and writes page.html.
"""

from __future__ import annotations

import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
DATA_DIR = SCRIPT_DIR.parent
PIPELINE_DIR = DATA_DIR / "pipeline"

sys.path.insert(0, str(PIPELINE_DIR))
from mhtml_utils import extract_page_html  # noqa: E402


REPO_ROOT = DATA_DIR.parent.parent
SNAPSHOTS_DIR = REPO_ROOT / "dom-compression-analysis" / "data" / "snapshots"
SEED_OUR3_DIR = DATA_DIR / "seed-samples" / "our-3"


def backfill_dir(target: Path) -> None:
    mhtml_path = target / "raw.mhtml"
    page_path = target / "page.html"
    if not mhtml_path.is_file():
        return
    if page_path.is_file():
        print(f"  skip (already exists): {page_path.relative_to(REPO_ROOT)}")
        return
    html = extract_page_html(mhtml_path)
    page_path.write_text(html, encoding="utf-8")
    print(f"  wrote {page_path.relative_to(REPO_ROOT)} ({len(html)} chars)")


def main() -> None:
    total = 0

    print(f"Backfilling dom-compression snapshots: {SNAPSHOTS_DIR}")
    for snapshot_dir in sorted(SNAPSHOTS_DIR.iterdir()):
        if snapshot_dir.is_dir():
            backfill_dir(snapshot_dir)
            total += 1

    print(f"\nBackfilling our-3 seed samples: {SEED_OUR3_DIR}")
    for sample_dir in sorted(SEED_OUR3_DIR.iterdir()):
        original_dir = sample_dir / "original"
        if original_dir.is_dir():
            backfill_dir(original_dir)
            total += 1

    print(f"\nDone. Processed {total} directories.")


if __name__ == "__main__":
    main()
