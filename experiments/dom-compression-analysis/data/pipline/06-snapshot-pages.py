#!/usr/bin/env python3

from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright
from snapshot_capture import (
    VIEWPORT,
    chromium_user_agent,
    recapture_snapshot,
)

HERE = Path(__file__).resolve().parent
INPUT_CSV = HERE / "05-smapled-pages.csv"
SNAPSHOTS_DIR = HERE.parent / "raw-snapshots"
MANIFEST_CSV = SNAPSHOTS_DIR / "data.csv"
FILTERED_MANIFEST_CSV = HERE.parent / "snapshots" / "data.csv"

FOLDER_WIDTH = 3

MANIFEST_FIELDS = [
    "folder",
    "url",
    "final_url",
    "seed_domain",
]

Row = dict[str, str]


def main() -> None:
    args = parse_args()

    if not INPUT_CSV.is_file():
        print(f"Missing input CSV: {INPUT_CSV}", file=sys.stderr)
        sys.exit(1)

    input_rows = read_input_rows(INPUT_CSV)
    SNAPSHOTS_DIR.mkdir(exist_ok=True)

    manifest_rows = read_manifest_rows()
    manual_patch_folders = parse_manual_patch(args.manual_patch)

    with sync_playwright() as p:
        browser = p.chromium.launch(
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
            if args.recollect_all:
                recollect_all_snapshots(tab, manifest_rows)
            elif manual_patch_folders is None:
                capture_new_snapshots(tab, input_rows, manifest_rows)
            else:
                patch_snapshots_manually(tab, manifest_rows, manual_patch_folders)
        finally:
            context.close()
            browser.close()

    print("Done")
    print(f"Wrote {MANIFEST_CSV} ({len(manifest_rows)} rows)")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Capture HTML and screenshots for sampled pages.",
    )
    parser.add_argument(
        "--manual-patch",
        metavar="FOLDERS",
        help=(
            "Comma-separated snapshot folders to recapture in headed mode, "
            "for example: --manual-patch 1,5,6,8,30"
        ),
    )
    parser.add_argument(
        "--recollect-all",
        action="store_true",
        help=(
            "Recapture every snapshot listed in the filtered snapshots manifest "
            "(snapshots/data.csv), replacing existing raw-snapshots in place."
        ),
    )
    return parser.parse_args()


def parse_manual_patch(value: str | None) -> list[str] | None:
    if value is None:
        return None

    folders: list[str] = []
    seen: set[str] = set()

    for raw_part in value.split(","):
        part = raw_part.strip()
        if not part:
            print(f"Invalid --manual-patch value: {value}", file=sys.stderr)
            sys.exit(1)
        if not part.isdigit() or int(part) <= 0:
            print(f"Invalid snapshot folder number: {part}", file=sys.stderr)
            sys.exit(1)

        folder_name = format_folder_name(int(part))
        if folder_name not in seen:
            folders.append(folder_name)
            seen.add(folder_name)

    if not folders:
        print("--manual-patch requires at least one folder number", file=sys.stderr)
        sys.exit(1)

    return folders


def recollect_all_snapshots(tab, manifest_rows: list[Row]) -> None:
    if not FILTERED_MANIFEST_CSV.is_file():
        print(f"Missing filtered manifest: {FILTERED_MANIFEST_CSV}", file=sys.stderr)
        sys.exit(1)

    with FILTERED_MANIFEST_CSV.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        source_rows = list(reader)

    print(f"Recollecting {len(source_rows)} snapshots from filtered manifest...")
    SNAPSHOTS_DIR.mkdir(exist_ok=True)

    updated_rows: list[Row] = []

    for row in source_rows:
        folder_name = row.get("folder", "").strip()
        ok, final_url = capture_snapshot(tab, row, folder_name, replace_existing=True)
        if not ok:
            updated_rows.append(row)
            continue

        updated_rows.append(
            {
                "folder": folder_name,
                "url": row.get("url", ""),
                "final_url": final_url,
                "seed_domain": row.get("seed_domain", ""),
            }
        )
        manifest_rows.clear()
        manifest_rows.extend(updated_rows)
        write_manifest_rows(manifest_rows)


def capture_new_snapshots(tab, input_rows: list[Row], manifest_rows: list[Row]) -> None:
    next_idx = next_folder_index(manifest_rows)

    for row in input_rows:
        folder_name = format_folder_name(next_idx)
        ok, final_url = capture_snapshot(tab, row, folder_name)
        if not ok:
            continue

        manifest_rows.append(
            {
                "folder": folder_name,
                "url": row.get("url", ""),
                "final_url": final_url,
                "seed_domain": row.get("seed_domain", ""),
            }
        )
        write_manifest_rows(manifest_rows)
        next_idx += 1


def patch_snapshots_manually(
    tab,
    manifest_rows: list[Row],
    folder_names: list[str],
) -> None:
    rows_by_folder = {row.get("folder", ""): row for row in manifest_rows}
    missing = [folder_name for folder_name in folder_names if folder_name not in rows_by_folder]
    if missing:
        print(
            f"Cannot patch folders missing from {MANIFEST_CSV}: {', '.join(missing)}",
            file=sys.stderr,
        )
        sys.exit(1)

    for folder_name in folder_names:
        row = rows_by_folder[folder_name]
        ok, final_url = capture_snapshot(
            tab,
            row,
            folder_name,
            replace_existing=True,
            manual=True,
        )
        if not ok:
            continue

        replace_manifest_row(
            manifest_rows,
            folder_name,
            {
                "folder": folder_name,
                "url": row.get("url", ""),
                "final_url": final_url,
                "seed_domain": row.get("seed_domain", ""),
            },
        )
        write_manifest_rows(manifest_rows)


def read_input_rows(path: Path) -> list[Row]:
    with path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        if reader.fieldnames is None:
            print("CSV has no header", file=sys.stderr)
            sys.exit(1)
        return list(reader)


def read_manifest_rows() -> list[Row]:
    if not MANIFEST_CSV.is_file():
        return []

    with MANIFEST_CSV.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        if reader.fieldnames is None:
            print(f"Warning: {MANIFEST_CSV} has no header; starting a new manifest", file=sys.stderr)
            return []
        return list(reader)


def next_folder_index(manifest_rows: list[Row]) -> int:
    indexes: list[int] = []

    for row in manifest_rows:
        folder = row.get("folder", "")
        if folder.isdigit():
            indexes.append(int(folder))

    for child in SNAPSHOTS_DIR.iterdir():
        if child.is_dir() and child.name.isdigit():
            indexes.append(int(child.name))

    return max(indexes, default=0) + 1


def format_folder_name(index: int) -> str:
    return str(index).zfill(FOLDER_WIDTH)


def capture_snapshot(
    tab,
    row: Row,
    folder_name: str,
    *,
    replace_existing: bool = False,
    manual: bool = False,
) -> tuple[bool, str]:
    url = row.get("url", "").strip()
    return recapture_snapshot(
        tab,
        url,
        SNAPSHOTS_DIR / folder_name,
        replace_existing=replace_existing,
        manual=manual,
        label=folder_name,
    )


def write_manifest_rows(rows: list[Row]) -> None:
    with MANIFEST_CSV.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=MANIFEST_FIELDS, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def replace_manifest_row(rows: list[Row], folder_name: str, replacement: Row) -> None:
    for index, row in enumerate(rows):
        if row.get("folder", "") == folder_name:
            rows[index] = replacement
            return

    raise RuntimeError(f"manifest row not found for folder {folder_name}")


if __name__ == "__main__":
    main()
