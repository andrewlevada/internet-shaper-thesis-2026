#!/usr/bin/env python3

from __future__ import annotations

import csv
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
RAW_SNAPSHOTS_DIR = HERE.parent / "raw-snapshots"
SNAPSHOTS_DIR = HERE.parent / "snapshots"
RAW_MANIFEST_CSV = RAW_SNAPSHOTS_DIR / "data.csv"
MANIFEST_CSV = SNAPSHOTS_DIR / "data.csv"
FOLDER_WIDTH = 3

MANIFEST_FIELDS = [
    "folder",
    "url",
    "final_url",
    "seed_domain",
]

# manually selected
EXCLUDED_URLS = {
    "https://www.amazon.com/gp/subscribe-and-save/manager/viewsubscriptions",
    "https://learn.dict.naver.com/m/endic/today/conversation.dict",
    "https://www.pinterest.com/pin/84301824271050595",
    "https://www.google.com/sorry/index",
    "https://yandex.ru/products/my/orders",
    "https://cm.bilibili.com/cm/api/fees/pc/sync/v2",
    "https://www.pinterest.com/pin/65654107064590364",
    "https://s.iwan.qq.com/opengame/tenvideo/index.html",
    "https://www.fandom.com/topics/tv",
    "https://en.wikipedia.org/w/index.php"
}

Row = dict[str, str]


def main() -> None:
    if not RAW_MANIFEST_CSV.is_file():
        print(f"Missing manifest CSV: {RAW_MANIFEST_CSV}", file=sys.stderr)
        sys.exit(1)

    clone_raw_snapshots()

    rows = read_manifest_rows()
    validate_manifest(rows)

    excluded_rows = [row for row in rows if row["url"].strip() in EXCLUDED_URLS]
    excluded_urls = {row["url"].strip() for row in excluded_rows}
    missing_urls = sorted(EXCLUDED_URLS - excluded_urls)
    if missing_urls and excluded_rows:
        print("Missing excluded URLs in manifest:", file=sys.stderr)
        for url in missing_urls:
            print(f"- {url}", file=sys.stderr)
        sys.exit(1)
    if not excluded_rows:
        orphan_count = remove_unmanifested_numeric_folders({row["folder"] for row in rows})
        print("No excluded URLs found; manifest appears already filtered")
        print(f"Verified {len(rows)} snapshots")
        if orphan_count:
            print(f"Removed {orphan_count} unmanifested numeric folders")
        return

    excluded_folders = {row["folder"] for row in excluded_rows}
    kept_rows = [row.copy() for row in rows if row["folder"] not in excluded_folders]
    renames = plan_renames(kept_rows)

    remove_excluded_folders(excluded_folders)
    rename_kept_folders(renames)
    orphan_count = remove_unmanifested_numeric_folders({row["folder"] for row in kept_rows})
    write_manifest_rows(kept_rows)

    print(f"Excluded {len(excluded_rows)} snapshots")
    print(f"Renumbered {len(kept_rows)} snapshots")
    if orphan_count:
        print(f"Removed {orphan_count} unmanifested numeric folders")
    print(f"Wrote {MANIFEST_CSV}")


def clone_raw_snapshots() -> None:
    if not RAW_SNAPSHOTS_DIR.is_dir():
        print(f"Missing raw snapshots directory: {RAW_SNAPSHOTS_DIR}", file=sys.stderr)
        sys.exit(1)

    if SNAPSHOTS_DIR.exists():
        shutil.rmtree(SNAPSHOTS_DIR)

    shutil.copytree(RAW_SNAPSHOTS_DIR, SNAPSHOTS_DIR)
    print(f"Cloned {RAW_SNAPSHOTS_DIR.name} -> {SNAPSHOTS_DIR.name}")


def read_manifest_rows() -> list[Row]:
    with MANIFEST_CSV.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        if reader.fieldnames is None:
            print(f"CSV has no header: {MANIFEST_CSV}", file=sys.stderr)
            sys.exit(1)

        missing_fields = [field for field in MANIFEST_FIELDS if field not in reader.fieldnames]
        if missing_fields:
            print(f"CSV is missing fields: {', '.join(missing_fields)}", file=sys.stderr)
            sys.exit(1)

        return list(reader)


def validate_manifest(rows: list[Row]) -> None:
    seen_folders: set[str] = set()

    for row in rows:
        folder = row.get("folder", "").strip()
        if not folder.isdigit():
            print(f"Invalid folder value in manifest: {folder!r}", file=sys.stderr)
            sys.exit(1)
        if folder in seen_folders:
            print(f"Duplicate folder in manifest: {folder}", file=sys.stderr)
            sys.exit(1)
        seen_folders.add(folder)

        folder_path = SNAPSHOTS_DIR / folder
        if not folder_path.is_dir():
            print(f"Manifest folder does not exist: {folder_path}", file=sys.stderr)
            sys.exit(1)


def plan_renames(rows: list[Row]) -> list[tuple[str, str]]:
    renames: list[tuple[str, str]] = []

    for index, row in enumerate(rows, start=1):
        old_folder = row["folder"]
        new_folder = format_folder_name(index)
        row["folder"] = new_folder

        if old_folder != new_folder:
            renames.append((old_folder, new_folder))

    return renames


def remove_excluded_folders(folders: set[str]) -> None:
    for folder in sorted(folders):
        path = SNAPSHOTS_DIR / folder
        if path.exists():
            shutil.rmtree(path)


def remove_unmanifested_numeric_folders(manifest_folders: set[str]) -> int:
    removed = 0

    for path in SNAPSHOTS_DIR.iterdir():
        if path.is_dir() and path.name.isdigit() and path.name not in manifest_folders:
            shutil.rmtree(path)
            removed += 1

    return removed


def rename_kept_folders(renames: list[tuple[str, str]]) -> None:
    temporary_moves: list[tuple[Path, Path]] = []

    for old_folder, new_folder in renames:
        source = SNAPSHOTS_DIR / old_folder
        temporary = SNAPSHOTS_DIR / f".renumber-{old_folder}-to-{new_folder}.tmp"
        if temporary.exists():
            shutil.rmtree(temporary)
        source.rename(temporary)
        temporary_moves.append((temporary, SNAPSHOTS_DIR / new_folder))

    for temporary, target in temporary_moves:
        if target.exists():
            print(f"Refusing to overwrite existing folder: {target}", file=sys.stderr)
            sys.exit(1)
        temporary.rename(target)


def write_manifest_rows(rows: list[Row]) -> None:
    with MANIFEST_CSV.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=MANIFEST_FIELDS, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def format_folder_name(index: int) -> str:
    return str(index).zfill(FOLDER_WIDTH)


if __name__ == "__main__":
    main()
