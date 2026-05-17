#!/usr/bin/env python3

from __future__ import annotations

import csv
import sys
from collections import defaultdict
from pathlib import Path
from urllib.parse import unquote, urlparse


HERE = Path(__file__).resolve().parent
INPUT_CSV = HERE / "04-cleaned-pages.csv"
OUTPUT_CSV = HERE / "05-smapled-pages.csv"

HOMEPAGE_KIND = "homepage"
INTERNAL_POOL_KIND = "internal_pool"
INTERNAL_SAMPLE_SIZE = 3


Row = dict[str, str]


def main() -> None:
    if not INPUT_CSV.is_file():
        print(f"Missing input CSV: {INPUT_CSV}", file=sys.stderr)
        sys.exit(1)

    fieldnames, rows = read_rows(INPUT_CSV)
    groups = group_by_seed_domain(rows)

    sampled_rows: list[Row] = []

    for seed_domain, group_rows in groups.items():
        group_sample = sample_group(seed_domain, group_rows)
        sampled_rows.extend(group_sample)

    write_rows(OUTPUT_CSV, fieldnames, sampled_rows)

    print("Done")
    print(f"Wrote {OUTPUT_CSV} ({len(sampled_rows)} rows)")

def read_rows(path: Path) -> tuple[list[str], list[Row]]:
    with path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        if fieldnames is None:
            print("CSV has no header", file=sys.stderr)
            sys.exit(1)
        return list(fieldnames), list(reader)


def group_by_seed_domain(rows: list[Row]) -> dict[str, list[Row]]:
    groups: dict[str, list[Row]] = defaultdict(list)
    for row in rows:
        seed_domain = row.get("seed_domain", "").strip()
        if not seed_domain:
            print(f"Skipping row without seed_domain: {row}", file=sys.stderr)
            continue
        groups[seed_domain].append(row)
    return dict(groups)


def sample_group(seed_domain: str, group_rows: list[Row]) -> list[Row]:
    homepage_rows = [row for row in group_rows if row.get("link_kind") == HOMEPAGE_KIND]
    internal_rows = list(
        row for row in group_rows if row.get("link_kind") == INTERNAL_POOL_KIND
    )

    if not homepage_rows:
        print(f"{seed_domain}: no homepage row", file=sys.stderr)
        seed: list[Row] = []
    else:
        if len(homepage_rows) > 1:
            print(
                f"{seed_domain}: {len(homepage_rows)} homepage rows; included the first"
            )
        seed = [homepage_rows[0]]

    if len(internal_rows) < INTERNAL_SAMPLE_SIZE:
        print(
            f"{seed_domain}: only {len(internal_rows)} internal_pool rows available"
        )

    return seed + sample_farthest(
            candidates=internal_rows,
            seed=seed,
            count=INTERNAL_SAMPLE_SIZE,
        )


def sample_farthest(
    candidates: list[Row],
    seed: list[Row],
    count: int,
) -> list[Row]:
    selected: list[Row] = []
    remaining = sorted(candidates, key=lambda row: row.get("url", ""))

    while remaining and len(selected) < count:
        next_row = max(
            remaining,
            key=lambda row: (
                total_path_distance(row, seed + selected),
                row.get("url", ""),
            ),
        )
        selected.append(next_row)
        remaining.remove(next_row)

    return selected


def total_path_distance(candidate: Row, selected: list[Row]) -> int:
    if not selected:
        return 0

    candidate_url = candidate.get("url", "")
    return sum(
        path_edit_distance(candidate_url, selected_row.get("url", ""))
        for selected_row in selected
    )


def path_edit_distance(url_a: str, url_b: str) -> int:
    path_a = path_segments(url_a)
    path_b = path_segments(url_b)

    if len(path_a) < len(path_b):
        path_a, path_b = path_b, path_a

    previous_row = list(range(len(path_b) + 1))

    for i, segment_a in enumerate(path_a, start=1):
        current_row = [i]
        for j, segment_b in enumerate(path_b, start=1):
            insertion = current_row[j - 1] + 1
            deletion = previous_row[j] + 1
            substitution = previous_row[j - 1] + (segment_a != segment_b)
            current_row.append(min(insertion, deletion, substitution))
        previous_row = current_row

    return previous_row[-1]


def path_segments(url: str) -> list[str]:
    path = unquote(urlparse(url).path)
    return [segment for segment in path.split("/") if segment]


def write_rows(path: Path, fieldnames: list[str], rows: list[Row]) -> None:
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


if __name__ == "__main__":
    main()
