#!/usr/bin/env python3
"""Render publication-style summary tables from total.csv."""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import matplotlib.pyplot as plt
import pandas as pd

ROOT = Path(__file__).resolve().parent
TOTAL_CSV = ROOT / "total.csv"
SAMPLES_CSV = ROOT / "samples.csv"
OUTPUT_DIR = ROOT / "output"
OUTPUT_LOG = OUTPUT_DIR / "total-summary-table.log"

METRIC_LABELS: dict[str, str] = {
    "raw_chars": "Raw DOM",
    "visible_chars": "Visible DOM",
    "compressed_visible_chars": "Compressed DOM",
    "raw_tokens": "Raw DOM",
    "visible_tokens": "Visible DOM",
    "compressed_visible_tokens": "Compressed DOM",
}

COMPRESSION_BASE: dict[str, str] = {
    "compressed_visible_chars": "visible_chars",
    "compressed_visible_tokens": "visible_tokens",
}

STAT_COLUMNS = ("Mean", "Median", "Min", "Max")


@dataclass(frozen=True)
class TableSpec:
    filename: str
    title: str
    metrics: tuple[str, ...]
    show_compression: bool


TABLE_SPECS: tuple[TableSpec, ...] = (
    TableSpec(
        "chars-raw-visible.png",
        "DOM sizes analysis — characters",
        ("raw_chars", "visible_chars"),
        False,
    ),
    TableSpec(
        "chars-compressed.png",
        "DOM sizes analysis — characters",
        ("raw_chars", "visible_chars", "compressed_visible_chars"),
        True,
    ),
    TableSpec(
        "tokens-raw-visible.png",
        "DOM compression — tokens",
        ("raw_tokens", "visible_tokens"),
        False,
    ),
    TableSpec(
        "tokens-compressed.png",
        "DOM compression — tokens",
        ("raw_tokens", "visible_tokens", "compressed_visible_tokens"),
        True,
    ),
)


def table_subtitle(spec: TableSpec, sample_count: int) -> str:
    n = f"n={sample_count} snapshots" if sample_count else "page snapshots"
    if spec.show_compression:
        return f"With compressed DOM · compression = visible median ÷ compressed median ({n})"
    return f"Raw & visible DOM ({n})"


def format_count(value: float) -> str:
    if value >= 1_000_000:
        return f"{value / 1_000_000:.2f}M"
    if value >= 10_000:
        return f"{value / 1_000:.1f}k"
    if float(value).is_integer():
        return f"{int(value):,}"
    return f"{value:,.1f}"


def format_compression_factor(compressed: float, baseline: float) -> str:
    if baseline <= 0 or compressed <= 0:
        return "—"
    factor = baseline / compressed
    if factor >= 100:
        return f"÷{factor:.0f}×"
    if factor >= 10:
        return f"÷{factor:.1f}×"
    return f"÷{factor:.2f}×"


def load_sample_count(samples_csv: Path) -> int:
    if not samples_csv.exists():
        return 0
    return len(pd.read_csv(samples_csv))


def build_metric_lookup(df: pd.DataFrame) -> dict[str, pd.Series]:
    return {str(row["metric"]): row for _, row in df.iterrows()}


def build_table_rows(
    lookup: dict[str, pd.Series],
    metrics: tuple[str, ...],
    show_compression: bool,
) -> list[list[str]]:
    rows: list[list[str]] = []
    for metric in metrics:
        row = lookup[metric]
        median = float(row["median"])
        compression = "—"
        if show_compression:
            base_metric = COMPRESSION_BASE.get(metric)
            if base_metric and base_metric in lookup:
                compression = format_compression_factor(
                    median, float(lookup[base_metric]["median"])
                )

        cells = [
            METRIC_LABELS[metric],
            format_count(float(row["mean"])),
            format_count(median),
            format_count(float(row["min"])),
            format_count(float(row["max"])),
        ]
        if show_compression:
            cells.append(compression)
        rows.append(cells)
    return rows


def style_table(
    table: plt.Table,
    columns: tuple[str, ...],
    rows: list[list[str]],
    show_compression: bool,
) -> None:
    header_color = "#1e3a5f"
    row_colors = ("#ffffff", "#f8fafc")
    compressed_color = "#ecfdf5"

    for col in range(len(columns)):
        cell = table[(0, col)]
        cell.set_facecolor(header_color)
        cell.set_text_props(color="white", fontweight="bold")
        cell.set_height(0.14)

    for row_idx, cells in enumerate(rows, start=1):
        is_compressed = show_compression and cells[-1] != "—"
        row_color = compressed_color if is_compressed else row_colors[(row_idx - 1) % 2]

        for col in range(len(columns)):
            cell = table[(row_idx, col)]
            cell.set_facecolor(row_color)
            cell.set_edgecolor("#cbd5e1")
            if col == 0:
                cell.get_text().set_ha("left")
                cell.PAD = 0.05


def render_table(
    spec: TableSpec,
    lookup: dict[str, pd.Series],
    sample_count: int,
    path: Path,
) -> None:
    columns = ("Representation", *STAT_COLUMNS)
    if spec.show_compression:
        columns = (*columns, "Compression")

    rows = build_table_rows(lookup, spec.metrics, spec.show_compression)
    row_count = len(rows)
    fig_width = 8.6 if spec.show_compression else 6.8
    fig_height = 0.95 + row_count * 0.45

    fig, ax = plt.subplots(figsize=(fig_width, fig_height))
    fig.patch.set_facecolor("white")
    ax.axis("off")
    ax.set_title(
        f"{spec.title}\n{table_subtitle(spec, sample_count)}",
        pad=2,
        y=1.0,
    )

    table = ax.table(
        cellText=rows,
        colLabels=columns,
        loc="upper center",
        cellLoc="center",
        colLoc="center",
        bbox=[0, 0, 1, 0.84],
    )
    table.auto_set_font_size(False)
    table.set_fontsize(10)
    table.scale(1, 1.6)
    style_table(table, columns, rows, spec.show_compression)

    path.parent.mkdir(parents=True, exist_ok=True)
    fig.subplots_adjust(top=0.80, bottom=0.02, left=0.02, right=0.98)
    fig.savefig(
        path,
        dpi=200,
        bbox_inches="tight",
        pad_inches=0.12,
        facecolor="white",
    )
    plt.close(fig)


def write_log(
    path: Path,
    input_csv: Path,
    output_paths: list[Path],
    sample_count: int,
    lookup: dict[str, pd.Series],
) -> None:
    lines = [
        f"generated_at={datetime.now(timezone.utc).isoformat()}",
        f"input_csv={input_csv}",
        f"sample_count={sample_count}",
        "",
        "output_files:",
    ]
    for output_path in output_paths:
        lines.append(f"  - {output_path}")

    lines.append("")
    lines.append("tables:")
    for spec in TABLE_SPECS:
        lines.append(f"  - {spec.filename}: {spec.title} / {table_subtitle(spec, sample_count)}")
        rows = build_table_rows(lookup, spec.metrics, spec.show_compression)
        columns = ("representation", *map(str.lower, STAT_COLUMNS))
        if spec.show_compression:
            columns = (*columns, "compression")
        for cells in rows:
            parts = [f"{col}={value}" for col, value in zip(columns, cells)]
            lines.append(f"      {', '.join(parts)}")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--input",
        type=Path,
        default=TOTAL_CSV,
        help="Path to total.csv",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=OUTPUT_DIR,
        help="Directory for rendered PNG tables",
    )
    args = parser.parse_args()

    df = pd.read_csv(args.input)
    lookup = build_metric_lookup(df)
    sample_count = load_sample_count(SAMPLES_CSV)

    output_paths: list[Path] = []
    for spec in TABLE_SPECS:
        output_path = args.output_dir / spec.filename
        render_table(spec, lookup, sample_count, output_path)
        output_paths.append(output_path.resolve())
        print(f"Wrote {output_path}")

    write_log(OUTPUT_LOG, args.input.resolve(), output_paths, sample_count, lookup)
    print(f"Wrote {OUTPUT_LOG}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
