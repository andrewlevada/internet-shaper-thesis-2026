#!/usr/bin/env python3

from __future__ import annotations

import csv
from pathlib import Path


def main() -> None:
    here = Path(__file__).resolve().parent
    input_path = here / "00-top-116-domains-annotation-clustering.csv"
    output_path = here / "01-filtered-top-25.csv"

    top_n = 25
    kept: list[dict[str, str]] = []

    with input_path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        if fieldnames is None:
            raise SystemExit("CSV has no header row")

        for row in reader:
            if (row.get("needs_login") == "1.0" or
                row.get("charge_users") == "1.0" or
                row.get("industry") == "Adult"):
                continue

            kept.append(row)

    def pos_key(r: dict[str, str]) -> float:
        try:
            return float((r.get("position") or "999999").strip())
        except ValueError:
            return 999999.0

    kept_sorted = sorted(kept, key=pos_key)
    picked = kept_sorted[:top_n]

    with output_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(picked)

    print("Done")


if __name__ == "__main__":
    main()
