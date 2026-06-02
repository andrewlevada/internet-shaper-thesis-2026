#!/usr/bin/env python3
"""Statistical analysis of primary evaluation pairwise results."""

from __future__ import annotations

import math
import re
import statistics
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import tiktoken
from scipy.stats import binomtest, friedmanchisquare, wilcoxon

ROOT = Path(__file__).resolve().parent
PAIRS_CSV = ROOT / "pairs.csv"
WIN_MATRIX_CSV = ROOT / "win-matrix.csv"
SAMPLES_DIR = ROOT / "data" / "samples" / "our-3"
OUTPUT_DIR = ROOT / "analysis-output"

PipelineId = Literal[
    "original",
    "baseline",
    "engine-only",
    "map-only",
    "full",
    "full-sonnet",
]

FOLDER_TO_ID: dict[str, PipelineId] = {
    "1-original": "original",
    "2-baseline": "baseline",
    "3-engine-only": "engine-only",
    "4-map-only": "map-only",
    "5-full": "full",
    "6-full-sonnet": "full-sonnet",
}

COMPARISON_PAIRS: list[tuple[PipelineId, PipelineId]] = [
    ("original", "baseline"),
    ("original", "full"),
    ("original", "full-sonnet"),
    ("baseline", "full"),
    ("full", "full-sonnet"),
    ("baseline", "engine-only"),
    ("baseline", "map-only"),
    ("engine-only", "full"),
    ("map-only", "full"),
]

QWEN_MODEL_CONTEXT = 262_144
VISIBLE_TOKEN_BUDGET = QWEN_MODEL_CONTEXT - 60_000

LIKERT_TO_SCORE = {
    "left_better": 2,
    "left_slightly": 1,
    "similar": 0,
    "right_slightly": -1,
    "right_better": -2,
}

ALPHA = 0.05

ELAPSED_RE = re.compile(r"elapsed_s=([\d.]+)")

AGENT_PIPELINE_IDS: tuple[PipelineId, ...] = (
    "baseline",
    "engine-only",
    "map-only",
    "full",
    "full-sonnet",
)

TIMING_COMPARISON_PAIRS: list[tuple[PipelineId, PipelineId]] = [
    ("baseline", "full"),
    ("baseline", "map-only"),
    ("baseline", "engine-only"),
    ("map-only", "full"),
    ("engine-only", "full"),
    ("full", "full-sonnet"),
    ("baseline", "full-sonnet"),
]

PIPELINE_COLORS: dict[PipelineId, str] = {
    "baseline": "#dc2626",
    "engine-only": "#f59e0b",
    "map-only": "#8b5cf6",
    "full": "#059669",
    "full-sonnet": "#2563eb",
}


@dataclass(frozen=True)
class TestResult:
    name: str
    n: int
    statistic: float | None
    p_value: float
    significant: bool
    effect_summary: str
    notes: str = ""


def folder_to_id(folder: str) -> PipelineId:
    if folder in FOLDER_TO_ID:
        return FOLDER_TO_ID[folder]
    raise KeyError(f"Unknown pipeline folder: {folder}")


def load_pairs() -> pd.DataFrame:
    df = pd.read_csv(PAIRS_CSV)
    df["left_id"] = df["left_pipeline"].map(folder_to_id)
    df["right_id"] = df["right_pipeline"].map(folder_to_id)
    return df


def load_win_matrix() -> pd.DataFrame:
    raw = WIN_MATRIX_CSV.read_text(encoding="utf-8")
    lines = [line for line in raw.strip().splitlines() if line.strip()]
    header = lines[0].split(";")
    rows = []
    for line in lines[1:]:
        parts = line.split(";")
        row_name = parts[0]
        values = parts[1:]
        for col_name, value in zip(header[1:], values):
            if not value:
                continue
            rows.append(
                {
                    "row_folder": row_name,
                    "col_folder": col_name,
                    "wins": int(value),
                }
            )
    matrix = pd.DataFrame(rows)
    matrix["row_id"] = matrix["row_folder"].map(folder_to_id)
    matrix["col_id"] = matrix["col_folder"].map(folder_to_id)
    return matrix


def normalize_pair(left: PipelineId, right: PipelineId) -> tuple[PipelineId, PipelineId]:
    return (left, right) if left < right else (right, left)


def filter_pair(df: pd.DataFrame, a: PipelineId, b: PipelineId) -> pd.DataFrame:
    mask = ((df["left_id"] == a) & (df["right_id"] == b)) | (
        (df["left_id"] == b) & (df["right_id"] == a)
    )
    return df.loc[mask].copy()


def favored_pipeline(
    rating: str, left_id: PipelineId, right_id: PipelineId
) -> PipelineId | None:
    if rating in ("left_better", "left_slightly"):
        return left_id
    if rating in ("right_better", "right_slightly"):
        return right_id
    return None


def binary_win_for(
    rating: str,
    target: PipelineId,
    left_id: PipelineId,
    right_id: PipelineId,
) -> int | None:
    winner = favored_pipeline(rating, left_id, right_id)
    if winner is None:
        return None
    return 1 if winner == target else 0


def likert_for_target(
    rating: str,
    target: PipelineId,
    left_id: PipelineId,
    right_id: PipelineId,
) -> int:
    raw = LIKERT_TO_SCORE[rating]
    if target == left_id:
        return raw
    if target == right_id:
        return -raw
    raise ValueError(f"{target} not in pair ({left_id}, {right_id})")


def exact_sign_test_binary(wins: int, losses: int) -> TestResult:
    n = wins + losses
    if n == 0:
        return TestResult(
            "Exact binomial (sign test)",
            0,
            None,
            1.0,
            False,
            "No decisive votes (all ties)",
        )
    result = binomtest(wins, n=n, p=0.5, alternative="two-sided")
    p = float(result.pvalue)
    rate = wins / n
    return TestResult(
        "Exact binomial (sign test)",
        n,
        float(result.statistic) if result.statistic is not None else None,
        p,
        p < ALPHA,
        f"win rate = {rate:.1%} ({wins}/{n} decisive)",
    )


def wilcoxon_signed_rank(values: list[float]) -> TestResult:
    non_zero = [v for v in values if v != 0]
    if len(non_zero) < 1:
        return TestResult(
            "Wilcoxon signed-rank",
            0,
            None,
            1.0,
            False,
            "No non-zero paired differences",
        )
    try:
        stat, p = wilcoxon(non_zero, alternative="two-sided", zero_method="wilcox")
    except ValueError as exc:
        return TestResult(
            "Wilcoxon signed-rank",
            len(non_zero),
            None,
            1.0,
            False,
            str(exc),
        )
    median = statistics.median(non_zero)
    return TestResult(
        "Wilcoxon signed-rank",
        len(non_zero),
        float(stat),
        float(p),
        float(p) < ALPHA,
        f"median signed score = {median:+.2f}",
    )


def mcnemar_exact(b: int, c: int) -> TestResult:
    """b = A wins & B loses; c = A loses & B wins (discordant pairs)."""
    n = b + c
    if n == 0:
        return TestResult(
            "McNemar exact",
            0,
            None,
            1.0,
            False,
            "No discordant pairs",
        )
    result = binomtest(min(b, c), n=n, p=0.5, alternative="two-sided")
    p = float(result.pvalue)
    return TestResult(
        "McNemar exact",
        n,
        float(result.statistic) if result.statistic is not None else None,
        p,
        p < ALPHA,
        f"discordant {b} vs {c}",
    )


def analyze_vs_original(
    df: pd.DataFrame, treatment: PipelineId, label: str
) -> dict[str, object]:
    subset = filter_pair(df, "original", treatment)
    wins = 0
    losses = 0
    ties = 0
    for _, row in subset.iterrows():
        outcome = binary_win_for(
            row["rating"], treatment, row["left_id"], row["right_id"]
        )
        if outcome is None:
            ties += 1
        elif outcome == 1:
            wins += 1
        else:
            losses += 1
    sign = exact_sign_test_binary(wins, losses)
    return {
        "label": label,
        "treatment": treatment,
        "n_samples": len(subset),
        "wins": wins,
        "losses": losses,
        "ties": ties,
        "success_rate_decisive": wins / (wins + losses) if wins + losses else math.nan,
        "success_rate_all": wins / len(subset) if len(subset) else math.nan,
        "sign_test": sign,
    }


def analyze_quality_pair(
    df: pd.DataFrame, a: PipelineId, b: PipelineId, favor: PipelineId, label: str
) -> dict[str, object]:
    subset = filter_pair(df, a, b)
    scores = [
        likert_for_target(row["rating"], favor, row["left_id"], row["right_id"])
        for _, row in subset.iterrows()
    ]
    wilcox = wilcoxon_signed_rank([float(s) for s in scores])
    wins = sum(1 for s in scores if s > 0)
    losses = sum(1 for s in scores if s < 0)
    ties = sum(1 for s in scores if s == 0)
    sign = exact_sign_test_binary(wins, losses)
    return {
        "label": label,
        "pair": (a, b),
        "favor": favor,
        "n_samples": len(subset),
        "scores": scores,
        "wilcoxon": wilcox,
        "sign_test": sign,
        "mean_score": statistics.mean(scores) if scores else math.nan,
    }


def compare_two_treatments_vs_original(
    df: pd.DataFrame, t_a: PipelineId, t_b: PipelineId, label: str
) -> dict[str, object]:
    samples = sorted(df["sample_hex"].unique())
    b_win = 0
    c_win = 0
    ties = 0
    for sample in samples:
        row_a = filter_pair(
            df[df["sample_hex"] == sample], "original", t_a
        )
        row_b = filter_pair(
            df[df["sample_hex"] == sample], "original", t_b
        )
        if row_a.empty or row_b.empty:
            continue
        oa = binary_win_for(
            row_a.iloc[0]["rating"], t_a, row_a.iloc[0]["left_id"], row_a.iloc[0]["right_id"]
        )
        ob = binary_win_for(
            row_b.iloc[0]["rating"], t_b, row_b.iloc[0]["left_id"], row_b.iloc[0]["right_id"]
        )
        if oa is None or ob is None:
            ties += 1
            continue
        if oa == 1 and ob == 0:
            b_win += 1
        elif oa == 0 and ob == 1:
            c_win += 1
    mcnemar = mcnemar_exact(b_win, c_win)
    return {
        "label": label,
        "t_a": t_a,
        "t_b": t_b,
        "a_wins_b_loses": b_win,
        "b_wins_a_loses": c_win,
        "ties": ties,
        "mcnemar": mcnemar,
    }


def baseline_processability() -> pd.DataFrame:
    encoding = tiktoken.get_encoding("o200k_base")
    token_pat = re.compile(r"prompt_tokens=(\d+)")
    rows = []
    for sample_dir in sorted(SAMPLES_DIR.iterdir()):
        if not sample_dir.is_dir():
            continue
        log_path = sample_dir / "2-baseline" / "agent.log"
        visible = sample_dir / "2-baseline" / "work" / "visible.html"
        if not visible.exists():
            visible = sample_dir / "1-original" / "work" / "visible.html"
        visible_tokens = None
        if visible.exists():
            visible_tokens = len(
                encoding.encode(visible.read_text(encoding="utf-8", errors="replace"))
            )
        ran = log_path.exists()
        max_prompt = None
        overflow = False
        edited = False
        if ran:
            text = log_path.read_text(encoding="utf-8", errors="replace")
            tokens = [int(m.group(1)) for m in token_pat.finditer(text)]
            max_prompt = max(tokens) if tokens else None
            overflow = "=== Context overflow ===" in text or "Context overflow:" in text
            edited = "(edited raw.html" in text
        fits_visible = (
            visible_tokens is not None and visible_tokens <= VISIBLE_TOKEN_BUDGET
        )
        rows.append(
            {
                "sample": sample_dir.name,
                "baseline_ran": ran,
                "visible_tokens": visible_tokens,
                "fits_visible_budget": fits_visible,
                "max_prompt_tokens": max_prompt,
                "context_overflow": overflow,
                "produced_edits": edited,
                "processable_ran_ok": ran and not overflow,
                "processable_fits_context": fits_visible if visible_tokens else None,
            }
        )
    return pd.DataFrame(rows)


def plot_success_rates(results: list[dict[str, object]], path: Path) -> None:
    labels = [r["label"] for r in results]
    rates = [r["success_rate_decisive"] * 100 for r in results]
    ns = [r["n_samples"] for r in results]
    fig, ax = plt.subplots(figsize=(8, 4.5))
    colors = ["#6b7280", "#2563eb", "#7c3aed", "#059669"]
    bars = ax.bar(labels, rates, color=colors[: len(labels)], edgecolor="white")
    ax.axhline(50, color="#9ca3af", linestyle="--", linewidth=1, label="Chance (50%)")
    ax.set_ylabel("Success rate vs original (%)")
    ax.set_ylim(0, 100)
    ax.set_title("Task completion: share of decisive human judgments favoring treatment")
    for bar, n in zip(bars, ns):
        ax.text(
            bar.get_x() + bar.get_width() / 2,
            bar.get_height() + 2,
            f"n={n}",
            ha="center",
            va="bottom",
            fontsize=9,
        )
    ax.legend(loc="upper right")
    fig.tight_layout()
    fig.savefig(path, dpi=160)
    plt.close(fig)


def plot_win_matrix(matrix: pd.DataFrame, path: Path) -> None:
    pipelines = [
        "original",
        "baseline",
        "engine-only",
        "map-only",
        "full",
        "full-sonnet",
    ]
    folders = [k for k, v in FOLDER_TO_ID.items() if v in pipelines]
    id_to_folder = {v: k for k, v in FOLDER_TO_ID.items()}
    idx = [id_to_folder[p] for p in pipelines]
    data = np.zeros((len(pipelines), len(pipelines)))
    for i, row_id in enumerate(pipelines):
        for j, col_id in enumerate(pipelines):
            if row_id == col_id:
                continue
            match = matrix[
                (matrix["row_id"] == row_id) & (matrix["col_id"] == col_id)
            ]
            if not match.empty:
                data[i, j] = match.iloc[0]["wins"]
    fig, ax = plt.subplots(figsize=(8, 6))
    im = ax.imshow(data, cmap="Blues")
    ax.set_xticks(range(len(pipelines)), pipelines, rotation=45, ha="right")
    ax.set_yticks(range(len(pipelines)), pipelines)
    for i in range(len(pipelines)):
        for j in range(len(pipelines)):
            if i == j:
                continue
            ax.text(j, i, int(data[i, j]), ha="center", va="center", color="#111")
    ax.set_title("Win matrix (binary judgments aggregated)")
    fig.colorbar(im, ax=ax, fraction=0.046, pad=0.04)
    fig.tight_layout()
    fig.savefig(path, dpi=160)
    plt.close(fig)


def plot_likert_distributions(df: pd.DataFrame, path: Path) -> None:
    pairs_to_plot = [
        ("baseline", "full", "full", "1b: baseline vs full (quality)"),
        ("full", "full-sonnet", "full-sonnet", "2b: full vs full-sonnet (quality)"),
        ("baseline", "engine-only", "engine-only", "3: baseline vs engine-only"),
        ("baseline", "map-only", "map-only", "3: baseline vs map-only"),
    ]
    fig, axes = plt.subplots(2, 2, figsize=(10, 8))
    order = ["left_better", "left_slightly", "similar", "right_slightly", "right_better"]
    for ax, (a, b, favor, title) in zip(axes.flatten(), pairs_to_plot):
        subset = filter_pair(df, a, b)
        counts = {k: 0 for k in order}
        for rating in subset["rating"]:
            counts[rating] = counts.get(rating, 0) + 1
        ax.bar(order, [counts[k] for k in order], color="#4f46e5", alpha=0.85)
        ax.set_title(title)
        ax.tick_params(axis="x", rotation=35)
        ax.set_ylabel("Count")
    fig.suptitle("Likert preference distributions (raw ratings)", y=1.02)
    fig.tight_layout()
    fig.savefig(path, dpi=160, bbox_inches="tight")
    plt.close(fig)


def plot_component_wins(df: pd.DataFrame, path: Path) -> None:
    pairs = [
        ("baseline", "engine-only", "engine-only"),
        ("baseline", "map-only", "map-only"),
        ("engine-only", "full", "full"),
        ("map-only", "full", "full"),
        ("baseline", "full", "full"),
    ]
    labels = []
    rates = []
    for a, b, favor in pairs:
        subset = filter_pair(df, a, b)
        wins = losses = 0
        for _, row in subset.iterrows():
            outcome = binary_win_for(
                row["rating"], favor, row["left_id"], row["right_id"]
            )
            if outcome is None:
                continue
            if outcome == 1:
                wins += 1
            else:
                losses += 1
        labels.append(f"{favor}\nvs {a}")
        rates.append(100 * wins / (wins + losses) if wins + losses else 0)
    fig, ax = plt.subplots(figsize=(9, 4.5))
    ax.barh(labels, rates, color="#0d9488")
    ax.axvline(50, color="#9ca3af", linestyle="--", linewidth=1)
    ax.set_xlabel("Decisive win rate (%)")
    ax.set_title("Component contribution: decisive preference for favored pipeline")
    ax.set_xlim(0, 100)
    fig.tight_layout()
    fig.savefig(path, dpi=160)
    plt.close(fig)


def plot_processability(proc: pd.DataFrame, path: Path) -> None:
    total = len(proc)
    ran = proc["baseline_ran"].sum()
    fits = proc["processable_fits_context"].sum()
    fig, ax = plt.subplots(figsize=(6, 4))
    labels = ["Baseline ran", "Visible DOM fits budget", "Produced edits"]
    values = [
        100 * ran / total,
        100 * fits / total,
        100 * proc["produced_edits"].sum() / total,
    ]
    ax.bar(labels, values, color=["#2563eb", "#7c3aed", "#059669"])
    ax.set_ylim(0, 100)
    ax.set_ylabel("Share of corpus samples (%)")
    ax.set_title(
        f"Baseline processability (n={total}, visible budget ≤ {VISIBLE_TOKEN_BUDGET:,} tokens)"
    )
    for i, v in enumerate(values):
        ax.text(i, v + 2, f"{v:.0f}%", ha="center")
    fig.tight_layout()
    fig.savefig(path, dpi=160)
    plt.close(fig)


def format_duration(seconds: float) -> str:
    if seconds >= 60:
        return f"{seconds:.1f}s ({seconds / 60:.1f} min)"
    return f"{seconds:.1f}s"


def collect_pipeline_times() -> pd.DataFrame:
    """Sum of API round elapsed_s per sample × pipeline (model inference time)."""
    rows: list[dict[str, object]] = []
    for sample_dir in sorted(SAMPLES_DIR.iterdir()):
        if not sample_dir.is_dir():
            continue
        sample = sample_dir.name
        for folder, pipeline_id in FOLDER_TO_ID.items():
            if pipeline_id not in AGENT_PIPELINE_IDS:
                continue
            log_path = sample_dir / folder / "agent.log"
            if not log_path.exists():
                continue
            text = log_path.read_text(encoding="utf-8", errors="replace")
            elapsed = [
                float(m.group(1)) for m in ELAPSED_RE.finditer(text)
            ]
            if not elapsed:
                continue
            rows.append(
                {
                    "sample": sample,
                    "folder": folder,
                    "pipeline_id": pipeline_id,
                    "elapsed_s": sum(elapsed),
                    "api_rounds": len(elapsed),
                }
            )
    return pd.DataFrame(rows)


def summarize_pipeline_times(times: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for pipeline_id in AGENT_PIPELINE_IDS:
        values = times.loc[times["pipeline_id"] == pipeline_id, "elapsed_s"]
        if values.empty:
            continue
        rows.append(
            {
                "pipeline_id": pipeline_id,
                "n": len(values),
                "mean_s": values.mean(),
                "median_s": values.median(),
                "std_s": values.std(ddof=1) if len(values) > 1 else 0.0,
                "min_s": values.min(),
                "max_s": values.max(),
            }
        )
    return pd.DataFrame(rows)


def paired_time_comparison(
    times: pd.DataFrame, slower: PipelineId, faster: PipelineId, label: str
) -> dict[str, object]:
    pivot = times.pivot_table(
        index="sample", columns="pipeline_id", values="elapsed_s", aggfunc="first"
    )
    paired = pivot[[slower, faster]].dropna()
    a = paired[slower].to_numpy()
    b = paired[faster].to_numpy()
    diffs = a - b
    try:
        stat, p = wilcoxon(a, b, alternative="two-sided")
    except ValueError as exc:
        return {
            "label": label,
            "slower": slower,
            "faster": faster,
            "n": len(paired),
            "wilcoxon": TestResult(
                "Wilcoxon signed-rank (paired times)",
                len(paired),
                None,
                1.0,
                False,
                str(exc),
            ),
        }
    median_slower = float(np.median(a))
    median_faster = float(np.median(b))
    median_diff = float(np.median(diffs))
    speedup = median_slower / median_faster if median_faster else math.nan
    faster_wins = int(np.sum(diffs > 0))
    return {
        "label": label,
        "slower": slower,
        "faster": faster,
        "n": len(paired),
        "median_slower_s": median_slower,
        "median_faster_s": median_faster,
        "median_diff_s": median_diff,
        "speedup_factor": speedup,
        "faster_wins_samples": faster_wins,
        "wilcoxon": TestResult(
            "Wilcoxon signed-rank (paired times)",
            len(paired),
            float(stat),
            float(p),
            float(p) < ALPHA,
            (
                f"median {slower}={format_duration(median_slower)}, "
                f"{faster}={format_duration(median_faster)}, "
                f"Δ={median_diff:+.1f}s, speedup×{speedup:.2f}; "
                f"{faster} faster on {faster_wins}/{len(paired)} samples"
            ),
        ),
    }


def analyze_pipeline_timing(times: pd.DataFrame) -> dict[str, object]:
    summary = summarize_pipeline_times(times)
    comparisons = [
        paired_time_comparison(times, a, b, f"{a} vs {b}")
        for a, b in TIMING_COMPARISON_PAIRS
    ]
    pivot = times.pivot_table(
        index="sample", columns="pipeline_id", values="elapsed_s", aggfunc="first"
    )
    friedman_cols = [p for p in AGENT_PIPELINE_IDS if p in pivot.columns]
    friedman_data = pivot[friedman_cols].dropna()
    if len(friedman_data) >= 2:
        stat, p = friedmanchisquare(
            *[friedman_data[col].to_numpy() for col in friedman_cols]
        )
        friedman = TestResult(
            "Friedman test (all pipelines)",
            len(friedman_data),
            float(stat),
            float(p),
            float(p) < ALPHA,
            f"compared {', '.join(friedman_cols)} on same samples",
        )
    else:
        friedman = TestResult(
            "Friedman test (all pipelines)",
            0,
            None,
            1.0,
            False,
            "Insufficient paired samples",
        )
    return {
        "summary": summary,
        "comparisons": comparisons,
        "friedman": friedman,
    }


def plot_pipeline_time_distribution(times: pd.DataFrame, path: Path) -> None:
    order = list(AGENT_PIPELINE_IDS)
    data = [times.loc[times["pipeline_id"] == p, "elapsed_s"].to_numpy() for p in order]
    labels = order
    fig, ax = plt.subplots(figsize=(9, 5))
    bp = ax.boxplot(
        data,
        tick_labels=labels,
        patch_artist=True,
        medianprops={"color": "#111", "linewidth": 2},
    )
    for patch, pipeline_id in zip(bp["boxes"], order):
        patch.set_facecolor(PIPELINE_COLORS.get(pipeline_id, "#94a3b8"))
        patch.set_alpha(0.75)
    ax.set_ylabel("API inference time per sample (s)")
    ax.set_title("Pipeline processing time (sum of API round elapsed_s)")
    fig.tight_layout()
    fig.savefig(path, dpi=160)
    plt.close(fig)


def plot_pipeline_time_medians(summary: pd.DataFrame, path: Path) -> None:
    fig, ax = plt.subplots(figsize=(8, 4.5))
    pipelines = summary["pipeline_id"].tolist()
    medians = summary["median_s"].tolist()
    colors = [PIPELINE_COLORS.get(p, "#94a3b8") for p in pipelines]
    bars = ax.bar(pipelines, medians, color=colors, edgecolor="white")
    ax.set_ylabel("Median API inference time (s)")
    ax.set_title("Median processing time by pipeline")
    for bar, mean_s in zip(bars, summary["mean_s"]):
        ax.text(
            bar.get_x() + bar.get_width() / 2,
            bar.get_height() + 3,
            f"μ={mean_s:.0f}s",
            ha="center",
            va="bottom",
            fontsize=8,
        )
    fig.tight_layout()
    fig.savefig(path, dpi=160)
    plt.close(fig)


def plot_speedup_vs_baseline(times: pd.DataFrame, path: Path) -> None:
    pivot = times.pivot_table(
        index="sample", columns="pipeline_id", values="elapsed_s", aggfunc="first"
    )
    baseline = pivot["baseline"]
    others = [p for p in AGENT_PIPELINE_IDS if p != "baseline"]
    speedups = []
    labels = []
    for pipeline_id in others:
        paired = pd.concat([baseline, pivot[pipeline_id]], axis=1, keys=["baseline", pipeline_id]).dropna()
        ratio = paired["baseline"] / paired[pipeline_id]
        speedups.append(ratio.to_numpy())
        labels.append(pipeline_id)
    fig, ax = plt.subplots(figsize=(8, 5))
    bp = ax.boxplot(
        speedups,
        tick_labels=labels,
        patch_artist=True,
        medianprops={"color": "#111", "linewidth": 2},
    )
    for patch, pipeline_id in zip(bp["boxes"], labels):
        patch.set_facecolor(PIPELINE_COLORS.get(pipeline_id, "#94a3b8"))
        patch.set_alpha(0.75)
    ax.axhline(1.0, color="#9ca3af", linestyle="--", linewidth=1, label="No speedup (×1)")
    ax.set_ylabel("Speedup vs baseline (baseline time ÷ pipeline time)")
    ax.set_title("Per-sample speedup relative to baseline")
    ax.legend(loc="upper right")
    fig.tight_layout()
    fig.savefig(path, dpi=160)
    plt.close(fig)


def timing_report_sections(timing: dict[str, object]) -> list[str]:
    summary: pd.DataFrame = timing["summary"]
    sections = [
        "## 4. Pipeline processing time",
        "",
        "Metric: sum of `elapsed_s` across API request rounds in each `agent.log` "
        "(model inference time only; excludes screenshot capture and rule apply).",
        "",
        "### Summary (n=42 samples per pipeline)",
        "",
        "| Pipeline | Median | Mean | Min | Max |",
        "|----------|--------|------|-----|-----|",
    ]
    for _, row in summary.iterrows():
        sections.append(
            f"| {row['pipeline_id']} | {format_duration(row['median_s'])} | "
            f"{format_duration(row['mean_s'])} | {format_duration(row['min_s'])} | "
            f"{format_duration(row['max_s'])} |"
        )
    sections.append("")
    sections.append(f"### Omnibus: {fmt_test(timing['friedman'])}")
    sections.append("")
    sections.append(
        "### Paired comparisons (Wilcoxon signed-rank on same sample, α=0.05)"
    )
    sections.append("")
    for comp in timing["comparisons"]:
        w: TestResult = comp["wilcoxon"]
        sections.append(f"**{comp['label']}**")
        sections.append(
            f"- Median {comp['slower']}: {format_duration(comp['median_slower_s'])}; "
            f"median {comp['faster']}: {format_duration(comp['median_faster_s'])}; "
            f"speedup **×{comp['speedup_factor']:.2f}**"
        )
        sections.append(f"- {fmt_test(w)}")
        sections.append("")
    return sections


def fmt_test(t: TestResult) -> str:
    sig = "significant" if t.significant else "not significant"
    stat = "—" if t.statistic is None else f"{t.statistic:.4g}"
    return (
        f"{t.name}: n={t.n}, stat={stat}, p={t.p_value:.4g} ({sig} at α={ALPHA}); "
        f"{t.effect_summary}"
    )


def write_report(sections: list[str]) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    report = "\n\n".join(sections)
    (OUTPUT_DIR / "report.md").write_text(report + "\n", encoding="utf-8")
    print(report)


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    df = load_pairs()
    matrix = load_win_matrix()
    proc = baseline_processability()
    proc.to_csv(OUTPUT_DIR / "baseline-processability.csv", index=False)

    sections: list[str] = ["# Primary evaluation — statistical analysis", ""]

    # --- Q0 ---
    total = len(proc)
    ran_pct = 100 * proc["baseline_ran"].mean()
    fits_pct = 100 * proc["processable_fits_context"].mean()
    edit_pct = 100 * proc["produced_edits"].mean()
    overflow_n = int(proc["context_overflow"].sum())
    sections.append("## 0. Baseline processability (corpus, n={})".format(total))
    sections.append(
        f"- Baseline agent ran on **{ran_pct:.1f}%** ({int(proc['baseline_ran'].sum())}/{total}) samples."
    )
    sections.append(
        f"- Visible DOM alone fits a conservative context budget ({VISIBLE_TOKEN_BUDGET:,} tokens) on **{fits_pct:.1f}%** of samples; the rest are too large for a single `get_dom` call without compression."
    )
    sections.append(
        f"- Context overflow during baseline run: **{overflow_n}** samples."
    )
    sections.append(
        f"- Baseline produced edits (index.html) on **{edit_pct:.1f}%** of samples."
    )
    full_ran = sum(
        1
        for d in SAMPLES_DIR.iterdir()
        if d.is_dir() and (d / "5-full" / "agent.log").exists()
    )
    sections.append(
        f"- Full pipeline (`5-full`) ran on **{100 * full_ran / total:.1f}%** ({full_ran}/{total}) samples."
    )
    sections.append(
        f"Human pairwise evaluation covers **{df['sample_hex'].nunique()}** samples ({len(df)} judgments)."
    )

    plot_processability(proc, OUTPUT_DIR / "processability.png")

    # --- Q1a ---
    q1a_baseline = analyze_vs_original(df, "baseline", "original vs baseline")
    q1a_full = analyze_vs_original(df, "full", "original vs full")
    sections.append("## 1a. Task completion vs original")
    for r in (q1a_baseline, q1a_full):
        sections.append(f"### {r['label']}")
        sections.append(
            f"- Success rate (decisive only): **{r['success_rate_decisive']:.1%}** "
            f"({r['wins']} wins, {r['losses']} losses, {r['ties']} ties, n={r['n_samples']})"
        )
        sections.append(f"- {fmt_test(r['sign_test'])}")
    compare_bf = compare_two_treatments_vs_original(
        df, "baseline", "full", "baseline vs full (paired on same samples)"
    )
    sections.append("### Paired comparison: baseline vs full (both vs original)")
    sections.append(
        f"- Discordant: baseline wins & full loses **{compare_bf['a_wins_b_loses']}**, "
        f"full wins & baseline loses **{compare_bf['b_wins_a_loses']}**, ties **{compare_bf['ties']}**"
    )
    sections.append(f"- {fmt_test(compare_bf['mcnemar'])}")

    plot_success_rates(
        [q1a_baseline, q1a_full],
        OUTPUT_DIR / "success-vs-original.png",
    )

    # --- Q1b ---
    q1b = analyze_quality_pair(
        df, "baseline", "full", "full", "1b: baseline vs full (quality → full)"
    )
    sections.append("## 1b. Quality (baseline vs full)")
    sections.append(
        f"- Mean signed Likert score favoring full: **{q1b['mean_score']:+.2f}** (n={q1b['n_samples']})"
    )
    sections.append(f"- {fmt_test(q1b['wilcoxon'])}")
    sections.append(f"- Binary (decisive) sign test: {fmt_test(q1b['sign_test'])}")

    # --- Q2a / 2b ---
    q2a = analyze_vs_original(df, "full-sonnet", "original vs full-sonnet")
    q2b = analyze_quality_pair(
        df,
        "full",
        "full-sonnet",
        "full-sonnet",
        "2b: full vs full-sonnet (quality → sonnet)",
    )
    compare_models = compare_two_treatments_vs_original(
        df, "full", "full-sonnet", "full vs full-sonnet (both vs original)"
    )
    sections.append("## 2a. full-sonnet vs original")
    sections.append(
        f"- Success rate (decisive): **{q2a['success_rate_decisive']:.1%}** "
        f"({q2a['wins']}/{q2a['wins'] + q2a['losses']} decisive)"
    )
    sections.append(f"- {fmt_test(q2a['sign_test'])}")
    sections.append("## 2b. full vs full-sonnet (quality)")
    sections.append(f"- Mean signed score favoring sonnet: **{q2b['mean_score']:+.2f}**")
    sections.append(f"- {fmt_test(q2b['wilcoxon'])}")
    sections.append(f"- Binary sign test: {fmt_test(q2b['sign_test'])}")
    sections.append("### Paired: full vs sonnet (both vs original)")
    sections.append(
        f"- Discordant: full **{compare_models['a_wins_b_loses']}**, sonnet **{compare_models['b_wins_a_loses']}**"
    )
    sections.append(f"- {fmt_test(compare_models['mcnemar'])}")

    plot_success_rates(
        [q1a_full, q2a],
        OUTPUT_DIR / "success-full-vs-sonnet.png",
    )

    # --- Q3 component contribution ---
    sections.append("## 3. Component contribution")
    component_pairs = [
        ("baseline", "engine-only", "engine-only", "baseline vs engine-only"),
        ("baseline", "map-only", "map-only", "baseline vs map-only"),
        ("engine-only", "full", "full", "engine-only vs full"),
        ("map-only", "full", "full", "map-only vs full"),
        ("baseline", "full", "full", "baseline vs full"),
    ]
    for a, b, favor, label in component_pairs:
        subset = filter_pair(df, a, b)
        wins = losses = ties = 0
        for _, row in subset.iterrows():
            outcome = binary_win_for(
                row["rating"], favor, row["left_id"], row["right_id"]
            )
            if outcome is None:
                ties += 1
            elif outcome == 1:
                wins += 1
            else:
                losses += 1
        sign = exact_sign_test_binary(wins, losses)
        qual = analyze_quality_pair(df, a, b, favor, label)
        sections.append(f"### {label}")
        sections.append(
            f"- Decisive win rate for **{favor}**: **{wins / (wins + losses):.1%}** "
            f"({wins}W/{losses}L/{ties}T, n={len(subset)})"
        )
        sections.append(f"- Sign test: {fmt_test(sign)}")
        sections.append(f"- Wilcoxon (Likert favoring {favor}): {fmt_test(qual['wilcoxon'])}")

    plot_component_wins(df, OUTPUT_DIR / "component-contribution.png")
    plot_likert_distributions(df, OUTPUT_DIR / "likert-distributions.png")
    plot_win_matrix(matrix, OUTPUT_DIR / "win-matrix.png")

    times = collect_pipeline_times()
    times.to_csv(OUTPUT_DIR / "pipeline-times.csv", index=False)
    timing = analyze_pipeline_timing(times)
    timing["summary"].to_csv(OUTPUT_DIR / "pipeline-time-summary.csv", index=False)
    sections.extend(timing_report_sections(timing))
    plot_pipeline_time_distribution(times, OUTPUT_DIR / "pipeline-times-boxplot.png")
    plot_pipeline_time_medians(
        timing["summary"], OUTPUT_DIR / "pipeline-times-medians.png"
    )
    plot_speedup_vs_baseline(times, OUTPUT_DIR / "pipeline-speedup-vs-baseline.png")

    sections.append("## Figures")
    for name in (
        "processability.png",
        "success-vs-original.png",
        "success-full-vs-sonnet.png",
        "likert-distributions.png",
        "component-contribution.png",
        "win-matrix.png",
        "pipeline-times-boxplot.png",
        "pipeline-times-medians.png",
        "pipeline-speedup-vs-baseline.png",
    ):
        sections.append(f"- `{OUTPUT_DIR.name}/{name}`")

    write_report(sections)


if __name__ == "__main__":
    main()
