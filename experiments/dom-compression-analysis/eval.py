#!/usr/bin/env python3

from __future__ import annotations

import csv
import statistics
import subprocess
import sys
from pathlib import Path
from typing import Any
import tiktoken


here = Path(__file__).resolve().parent
REPO_ROOT = here.parents[1]
DATA_DIR = here / "data/snapshots"
SNAPSHOT_GLOB = "[0-9][0-9][0-9]"
TOOL_PATH = REPO_ROOT / "playground/internet-shaper-tools/get_map_of_dom.ts"
SAMPLES_CSV = here / "samples.csv"
TOTAL_CSV = here / "total.csv"
TOKEN_ENCODING = "o200k_base"


def main() -> int:
    data_dir = DATA_DIR.resolve()
    tool_path = TOOL_PATH.resolve()

    if not data_dir.exists():
        raise FileNotFoundError(f"Data directory does not exist: {data_dir}")
    if not tool_path.exists():
        raise FileNotFoundError(f"DOM map tool does not exist: {tool_path}")

    snapshot_dirs = sorted(path for path in data_dir.glob(SNAPSHOT_GLOB) if path.is_dir())
    if not snapshot_dirs:
        raise FileNotFoundError(
            f"No snapshots matched {SNAPSHOT_GLOB!r} under {data_dir}"
        )

    encoding = tiktoken.get_encoding(TOKEN_ENCODING)
    sample_rows: list[dict[str, Any]] = []

    for index, snapshot_dir in enumerate(snapshot_dirs, start=1):
        print(f"[{index}/{len(snapshot_dirs)}] {snapshot_dir.relative_to(data_dir)}")
        raw_path = snapshot_dir / "raw.html"
        visible_path = snapshot_dir / "visible.html"
        if not raw_path.exists():
            raise FileNotFoundError(f"Missing raw snapshot: {raw_path}")
        if not visible_path.exists():
            raise FileNotFoundError(f"Missing visible snapshot: {visible_path}")

        raw_html = raw_path.read_text(encoding="utf-8", errors="replace")
        visible_html = visible_path.read_text(encoding="utf-8", errors="replace")
        compressed_visible_dom = run_dom_map(tool_path, visible_path)
        sample_rows.append(
            build_sample_row(
                data_dir,
                snapshot_dir,
                raw_html,
                visible_html,
                compressed_visible_dom,
                encoding,
            )
        )

    total_rows = build_total_rows(sample_rows)
    write_samples_csv(SAMPLES_CSV.resolve(), sample_rows)
    write_total_csv(TOTAL_CSV.resolve(), total_rows)

    print(f"Wrote {SAMPLES_CSV}")
    print(f"Wrote {TOTAL_CSV}")
    return 0


def count_tokens(text: str, encoding: tiktoken.Encoding) -> int:
    return len(encoding.encode(text))


def run_dom_map(tool_path: Path, snapshot_path: Path) -> str:
    command = [
        "deno",
        "run",
        "-A",
        str(tool_path),
        "--snapshot",
        str(snapshot_path),
    ]
    result = subprocess.run(
        command,
        cwd=tool_path.parent,
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(
            "\n".join(
                [
                    f"Compression failed for {snapshot_path}",
                    f"Command: {' '.join(command)}",
                    f"Exit code: {result.returncode}",
                    f"stderr: {result.stderr.strip()}",
                ]
            )
        )
    return result.stdout


def build_sample_row(
    data_dir: Path,
    snapshot_dir: Path,
    raw_html: str,
    visible_html: str,
    compressed_visible_dom: str,
    encoding: tiktoken.Encoding,
) -> dict[str, Any]:
    raw_chars = len(raw_html)
    visible_chars = len(visible_html)
    compressed_visible_chars = len(compressed_visible_dom)
    raw_tokens = count_tokens(raw_html, encoding)
    visible_tokens = count_tokens(visible_html, encoding)
    compressed_visible_tokens = count_tokens(compressed_visible_dom, encoding)

    return {
        "snapshot": snapshot_dir.name,
        "path": str(snapshot_dir.relative_to(data_dir)),
        "raw_chars": raw_chars,
        "visible_chars": visible_chars,
        "compressed_visible_chars": compressed_visible_chars,        
        "raw_tokens": raw_tokens,
        "visible_tokens": visible_tokens,
        "compressed_visible_tokens": compressed_visible_tokens,
    }


def summary_stats(values: list[int]) -> dict[str, Any]:
    return {
        "mean": round(statistics.mean(values), 2),
        "median": round(statistics.median(values), 2),
        "min": round(min(values), 2),
        "max": round(max(values), 2),
    }


def write_samples_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def build_total_rows(sample_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    total_rows: list[dict[str, Any]] = []
    for metric, column in [
        ("raw_chars", "raw_chars"),
        ("visible_chars", "visible_chars"),
        ("compressed_visible_chars", "compressed_visible_chars"),
        ("raw_tokens", "raw_tokens"),
        ("visible_tokens", "visible_tokens"),
        ("compressed_visible_tokens", "compressed_visible_tokens"),
    ]:
        stats = summary_stats([int(row[column]) for row in sample_rows])
        total_rows.append({"metric": metric, **stats})
    return total_rows


def write_total_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["metric", "mean", "median", "min", "max"])
        writer.writeheader()
        writer.writerows(rows)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"error: {error}", file=sys.stderr)
        raise SystemExit(1)
