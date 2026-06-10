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
from scipy.stats import binomtest, friedmanchisquare, wilcoxon

ROOT = Path(__file__).resolve().parent
PAIRS_CSV = ROOT / "pairs.csv"
SAMPLES_DIR = ROOT / "data" / "samples" / "our-3"
OUTPUT_DIR = ROOT / "analysis-output"

RatingDimension = Literal["goal", "structural", "design"]

DIMENSIONS: tuple[RatingDimension, ...] = ("goal", "structural", "design")

DIMENSION_LABELS: dict[RatingDimension, str] = {
    "goal": "Goal alignment",
    "structural": "Structural cohesion",
    "design": "Design alignment",
}

DIMENSION_CONFIG: dict[RatingDimension, tuple[str, str, str]] = {
    "goal": ("goal_alignment", "goal_left_score", "goal_right_score"),
    "structural": (
        "structural_cohesion",
        "structural_left_score",
        "structural_right_score",
    ),
    "design": ("design_alignment", "design_left_score", "design_right_score"),
}

SCORE_COLUMNS = [
    "goal_left_score",
    "goal_right_score",
    "structural_left_score",
    "structural_right_score",
    "design_left_score",
    "design_right_score",
]

EXPECTED_FULLY_ZERO_SAMPLES = 3

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

LIKERT_ORDER = [
    "left_better",
    "left_slightly",
    "similar",
    "right_slightly",
    "right_better",
]

ALPHA = 0.05

ELAPSED_RE = re.compile(r"elapsed_s=([\d.]+)")

VS_ORIGINAL_PIPELINES: tuple[PipelineId, ...] = (
    "baseline",
    "full",
    "full-sonnet",
)

TIMING_PIPELINE_IDS: tuple[PipelineId, ...] = (
    "baseline",
    "engine-only",
    "map-only",
    "full",
)

TIMING_COMPARISON_PAIRS: list[tuple[PipelineId, PipelineId]] = [
    ("baseline", "full"),
    ("baseline", "map-only"),
    ("baseline", "engine-only"),
    ("map-only", "full"),
    ("engine-only", "full"),
]

PIPELINE_COLORS: dict[PipelineId, str] = {
    "baseline": "#dc2626",
    "engine-only": "#f59e0b",
    "map-only": "#8b5cf6",
    "full": "#059669",
    "full-sonnet": "#2563eb",
}

# 2×2 ablation: rows = action (immediate patch → rules engine),
# columns = perception (full DOM → DOM compression).
ABLATION_MATRIX: tuple[tuple[PipelineId, PipelineId], tuple[PipelineId, PipelineId]] = (
    ("baseline", "map-only"),
    ("engine-only", "full"),
)

ABLATION_ROW_LABELS = ("Immediate patch", "Rules engine")
ABLATION_COL_LABELS = ("Full DOM", "DOM compression")

ABLATION_PIPELINE_IDS: tuple[PipelineId, PipelineId, PipelineId, PipelineId] = (
    "baseline",
    "engine-only",
    "map-only",
    "full",
)

ABLATION_MARGINAL_PAIRS: list[tuple[PipelineId, PipelineId, PipelineId, str]] = [
    ("baseline", "map-only", "map-only", "Map effect (immediate patch)"),
    ("engine-only", "full", "full", "Map effect (rules engine)"),
    ("baseline", "engine-only", "engine-only", "Engine effect (full DOM)"),
    ("map-only", "full", "full", "Engine effect (DOM compression)"),
]


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


def find_fully_zero_samples(df: pd.DataFrame) -> list[str]:
    numeric = df[SCORE_COLUMNS].fillna(0)
    totals = numeric.groupby(df["sample_hex"]).sum().sum(axis=1)
    zero_samples = totals[totals == 0].index.tolist()
    if len(zero_samples) != EXPECTED_FULLY_ZERO_SAMPLES:
        raise ValueError(
            f"Expected exactly {EXPECTED_FULLY_ZERO_SAMPLES} fully-zero samples, "
            f"found {len(zero_samples)}: {zero_samples}"
        )
    return zero_samples


def load_pairs() -> tuple[pd.DataFrame, list[str]]:
    df = pd.read_csv(PAIRS_CSV)
    df["left_id"] = df["left_pipeline"].map(folder_to_id)
    df["right_id"] = df["right_pipeline"].map(folder_to_id)
    excluded = find_fully_zero_samples(df)
    filtered = df[~df["sample_hex"].isin(excluded)].copy()
    return filtered, excluded


def win_matrix_path(dimension: RatingDimension) -> Path:
    return ROOT / f"win-matrix-{dimension}.csv"


def load_win_matrix(dimension: RatingDimension) -> pd.DataFrame:
    raw = win_matrix_path(dimension).read_text(encoding="utf-8")
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


def filter_dimension_rows(
    df: pd.DataFrame, dimension: RatingDimension
) -> pd.DataFrame:
    _, left_col, right_col = DIMENSION_CONFIG[dimension]
    return df[df[left_col].notna() & df[right_col].notna()].copy()


def pair_scores(row: pd.Series, dimension: RatingDimension) -> tuple[int, int]:
    _, left_col, right_col = DIMENSION_CONFIG[dimension]
    return int(row[left_col]), int(row[right_col])


def favored_pipeline(
    left_score: int,
    right_score: int,
    left_id: PipelineId,
    right_id: PipelineId,
) -> PipelineId | None:
    if left_score > right_score:
        return left_id
    if right_score > left_score:
        return right_id
    return None


def binary_win_for(
    row: pd.Series,
    target: PipelineId,
    dimension: RatingDimension,
) -> int | None:
    left_score, right_score = pair_scores(row, dimension)
    winner = favored_pipeline(
        left_score, right_score, row["left_id"], row["right_id"]
    )
    if winner is None:
        return None
    return 1 if winner == target else 0


def signed_score_for_target(
    row: pd.Series,
    target: PipelineId,
    dimension: RatingDimension,
) -> int:
    left_score, right_score = pair_scores(row, dimension)
    if target == row["left_id"]:
        return left_score - right_score
    if target == row["right_id"]:
        return right_score - left_score
    raise ValueError(f"{target} not in pair ({row['left_id']}, {row['right_id']})")


def exact_binomial_win_rate(wins: int, total: int) -> TestResult:
    if total == 0:
        return TestResult(
            "Exact binomial (win rate vs 50%)",
            0,
            None,
            1.0,
            False,
            "No comparisons",
        )
    result = binomtest(wins, n=total, p=0.5, alternative="two-sided")
    p = float(result.pvalue)
    rate = wins / total
    return TestResult(
        "Exact binomial (win rate vs 50%)",
        total,
        float(result.statistic) if result.statistic is not None else None,
        p,
        p < ALPHA,
        f"win rate = {rate:.1%} ({wins}/{total})",
    )


def adaptation_success_vs_original(
    row: pd.Series,
    treatment: PipelineId,
    dimension: RatingDimension,
) -> int:
    """1 if treatment beats original; 0 for tie (failed adaptation) or loss."""
    outcome = binary_win_for(row, treatment, dimension)
    return 1 if outcome == 1 else 0


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
    df: pd.DataFrame,
    treatment: PipelineId,
    dimension: RatingDimension,
    label: str,
) -> dict[str, object]:
    subset = filter_dimension_rows(filter_pair(df, "original", treatment), dimension)
    wins = 0
    catastrophic_losses = 0
    standard_fails = 0
    for _, row in subset.iterrows():
        outcome = binary_win_for(row, treatment, dimension)
        if outcome == 1:
            wins += 1
        elif outcome == 0:
            catastrophic_losses += 1
        else:
            standard_fails += 1
    n = len(subset)
    sign = exact_binomial_win_rate(wins, n)
    return {
        "label": label,
        "treatment": treatment,
        "dimension": dimension,
        "n_samples": n,
        "wins": wins,
        "catastrophic_losses": catastrophic_losses,
        "standard_fails": standard_fails,
        "win_rate": wins / n if n else math.nan,
        "sign_test": sign,
    }


def analyze_quality_pair(
    df: pd.DataFrame,
    a: PipelineId,
    b: PipelineId,
    favor: PipelineId,
    dimension: RatingDimension,
    label: str,
) -> dict[str, object]:
    subset = filter_dimension_rows(filter_pair(df, a, b), dimension)
    scores = [
        signed_score_for_target(row, favor, dimension) for _, row in subset.iterrows()
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
        "dimension": dimension,
        "n_samples": len(subset),
        "scores": scores,
        "wilcoxon": wilcox,
        "sign_test": sign,
        "mean_score": statistics.mean(scores) if scores else math.nan,
    }


def compare_two_treatments_vs_original(
    df: pd.DataFrame,
    t_a: PipelineId,
    t_b: PipelineId,
    dimension: RatingDimension,
    label: str,
) -> dict[str, object]:
    samples = sorted(df["sample_hex"].unique())
    b_win = 0
    c_win = 0
    ties = 0
    for sample in samples:
        row_a = filter_dimension_rows(
            filter_pair(df[df["sample_hex"] == sample], "original", t_a),
            dimension,
        )
        row_b = filter_dimension_rows(
            filter_pair(df[df["sample_hex"] == sample], "original", t_b),
            dimension,
        )
        if row_a.empty or row_b.empty:
            continue
        oa = adaptation_success_vs_original(row_a.iloc[0], t_a, dimension)
        ob = adaptation_success_vs_original(row_b.iloc[0], t_b, dimension)
        if oa == 1 and ob == 0:
            b_win += 1
        elif oa == 0 and ob == 1:
            c_win += 1
        else:
            ties += 1
    mcnemar = mcnemar_exact(b_win, c_win)
    return {
        "label": label,
        "t_a": t_a,
        "t_b": t_b,
        "dimension": dimension,
        "a_wins_b_loses": b_win,
        "b_wins_a_loses": c_win,
        "concordant": ties,
        "mcnemar": mcnemar,
    }


def plot_win_rate_vs_original(
    df: pd.DataFrame, dimension: RatingDimension, path: Path
) -> tuple[list[dict[str, object]], TestResult, TestResult]:
    """Bar chart of win rate vs original for baseline, full, and full-sonnet."""
    results = [
        analyze_vs_original(df, pipeline, dimension, pipeline)
        for pipeline in VS_ORIGINAL_PIPELINES
    ]
    mcnemar_bf = compare_two_treatments_vs_original(
        df, "baseline", "full", dimension, "baseline vs full"
    )["mcnemar"]
    mcnemar_fs = compare_two_treatments_vs_original(
        df, "full", "full-sonnet", dimension, "full vs full-sonnet"
    )["mcnemar"]

    labels = list(VS_ORIGINAL_PIPELINES)
    rates = [r["win_rate"] * 100 for r in results]
    colors = [PIPELINE_COLORS[p] for p in labels]

    fig, ax = plt.subplots(figsize=(7, 5))
    x = np.arange(len(labels))
    bars = ax.bar(x, rates, color=colors, edgecolor="white", width=0.6)
    ax.set_xticks(x, labels)
    ax.set_ylabel("Win rate vs original (%)")
    ax.set_ylim(0, 105)
    ax.set_title(f"{DIMENSION_LABELS[dimension]} — adaptation success vs original")
    ax.axhline(50, color="#9ca3af", linestyle="--", linewidth=1, label="Chance (50%)")

    for bar, result in zip(bars, results):
        ax.text(
            bar.get_x() + bar.get_width() / 2,
            bar.get_height() + 1.5,
            f"{result['win_rate']:.0%}",
            ha="center",
            va="bottom",
            fontsize=9,
        )

    ymax = max(rates) if rates else 100

    ax.legend(loc="upper left")
    fig.tight_layout()
    fig.savefig(path, dpi=160)
    plt.close(fig)
    return results, mcnemar_bf, mcnemar_fs


def plot_win_matrix(matrix: pd.DataFrame, path: Path, dimension: RatingDimension) -> None:
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
    ax.set_title(f"Win matrix — {DIMENSION_LABELS[dimension]}")
    fig.colorbar(im, ax=ax, fraction=0.046, pad=0.04)
    fig.tight_layout()
    fig.savefig(path, dpi=160)
    plt.close(fig)


def plot_likert_distributions(
    df: pd.DataFrame, path: Path, dimension: RatingDimension
) -> None:
    rating_col, _, _ = DIMENSION_CONFIG[dimension]
    pairs_to_plot = [
        ("baseline", "full", "full", "1b: baseline vs full"),
        ("full", "full-sonnet", "full-sonnet", "2b: full vs full-sonnet"),
        ("baseline", "engine-only", "engine-only", "3: baseline vs engine-only"),
        ("baseline", "map-only", "map-only", "3: baseline vs map-only"),
    ]
    fig, axes = plt.subplots(2, 2, figsize=(10, 8))
    for ax, (a, b, _favor, title) in zip(axes.flatten(), pairs_to_plot):
        subset = filter_dimension_rows(filter_pair(df, a, b), dimension)
        counts = {k: 0 for k in LIKERT_ORDER}
        for rating in subset[rating_col]:
            if pd.isna(rating) or rating == "na":
                continue
            counts[str(rating)] = counts.get(str(rating), 0) + 1
        ax.bar(LIKERT_ORDER, [counts[k] for k in LIKERT_ORDER], color="#4f46e5", alpha=0.85)
        ax.set_title(title)
        ax.tick_params(axis="x", rotation=35)
        ax.set_ylabel("Count")
    fig.suptitle(
        f"{DIMENSION_LABELS[dimension]} — preference distributions",
        y=1.02,
    )
    fig.tight_layout()
    fig.savefig(path, dpi=160, bbox_inches="tight")
    plt.close(fig)


@dataclass(frozen=True)
class AblationCell:
    pipeline: PipelineId
    bt_strength: float
    bt_share: float
    wins: int
    losses: int
    ties: int


@dataclass(frozen=True)
class AblationPairwise:
    a: PipelineId
    b: PipelineId
    wins_a: int
    wins_b: int
    observed_rate_a: float
    bt_rate_a: float


@dataclass(frozen=True)
class AblationBradleyTerry:
    strengths: dict[PipelineId, float]
    records: dict[PipelineId, tuple[int, int, int]]
    pairwise: list[AblationPairwise]


def ablation_decisive_record(
    df: pd.DataFrame, pipeline: PipelineId, dimension: RatingDimension
) -> tuple[int, int, int]:
    wins = losses = ties = 0
    subset = filter_dimension_rows(df, dimension)
    ablation = set(ABLATION_PIPELINE_IDS)
    for _, row in subset.iterrows():
        left, right = row["left_id"], row["right_id"]
        if pipeline not in (left, right):
            continue
        opponent = right if left == pipeline else left
        if opponent not in ablation:
            continue
        outcome = binary_win_for(row, pipeline, dimension)
        if outcome is None:
            ties += 1
        elif outcome == 1:
            wins += 1
        else:
            losses += 1
    return wins, losses, ties


def fit_ablation_bradley_terry(
    df: pd.DataFrame, dimension: RatingDimension
) -> AblationBradleyTerry:
    pipelines = list(ABLATION_PIPELINE_IDS)
    index = {pipeline: i for i, pipeline in enumerate(pipelines)}
    wins = np.zeros((len(pipelines), len(pipelines)))
    subset = filter_dimension_rows(df, dimension)
    for _, row in subset.iterrows():
        left, right = row["left_id"], row["right_id"]
        if left not in index or right not in index:
            continue
        outcome = binary_win_for(row, left, dimension)
        if outcome == 1:
            wins[index[left], index[right]] += 1
        elif outcome == 0:
            wins[index[right], index[left]] += 1

    strength = np.ones(len(pipelines))
    for _ in range(200):
        updated = np.zeros(len(pipelines))
        for i in range(len(pipelines)):
            total_wins = float(wins[i].sum())
            denominator = 0.0
            for j in range(len(pipelines)):
                if i == j:
                    continue
                comparisons = wins[i, j] + wins[j, i]
                if comparisons:
                    denominator += comparisons / (strength[i] + strength[j])
            updated[i] = total_wins / denominator if denominator else strength[i]
        anchor = updated[0] if updated[0] else 1.0
        updated /= anchor
        if np.max(np.abs(updated - strength)) < 1e-10:
            strength = updated
            break
        strength = updated

    strengths = {
        pipeline: float(strength[index[pipeline]]) for pipeline in pipelines
    }
    records = {
        pipeline: ablation_decisive_record(df, pipeline, dimension)
        for pipeline in pipelines
    }

    pairwise: list[AblationPairwise] = []
    for i, a in enumerate(pipelines):
        for j, b in enumerate(pipelines):
            if i >= j:
                continue
            wins_a = int(wins[i, j])
            wins_b = int(wins[j, i])
            total = wins_a + wins_b
            observed = wins_a / total if total else math.nan
            bt_rate = strengths[a] / (strengths[a] + strengths[b])
            pairwise.append(
                AblationPairwise(
                    a=a,
                    b=b,
                    wins_a=wins_a,
                    wins_b=wins_b,
                    observed_rate_a=observed,
                    bt_rate_a=bt_rate,
                )
            )
    return AblationBradleyTerry(
        strengths=strengths, records=records, pairwise=pairwise
    )


def ablation_matrix_cells(bt: AblationBradleyTerry) -> list[list[AblationCell]]:
    total_strength = sum(bt.strengths.values())
    return [
        [
            AblationCell(
                pipeline=pipeline,
                bt_strength=bt.strengths[pipeline],
                bt_share=bt.strengths[pipeline] / total_strength,
                wins=bt.records[pipeline][0],
                losses=bt.records[pipeline][1],
                ties=bt.records[pipeline][2],
            )
            for pipeline in row
        ]
        for row in ABLATION_MATRIX
    ]


def bt_win_probability(
    strengths: dict[PipelineId, float], favor: PipelineId, other: PipelineId
) -> float:
    return strengths[favor] / (strengths[favor] + strengths[other])


def plot_ablation_matrix(
    cells: list[list[AblationCell]], path: Path, dimension: RatingDimension
) -> None:
    shares = [cell.bt_share * 100 for row in cells for cell in row]
    vmin = min(shares) - 2
    vmax = max(shares) + 2
    data = np.array([[cell.bt_share * 100 for cell in row] for row in cells])
    fig, ax = plt.subplots(figsize=(6.5, 5))
    im = ax.imshow(data, cmap="YlGn", vmin=vmin, vmax=vmax)
    ax.set_xticks(range(len(ABLATION_COL_LABELS)), ABLATION_COL_LABELS)
    ax.set_yticks(range(len(ABLATION_ROW_LABELS)), ABLATION_ROW_LABELS)
    ax.set_xlabel("Perception")
    ax.set_ylabel("Action")
    for i, row in enumerate(cells):
        for j, cell in enumerate(row):
            ax.text(
                j,
                i - 0.22,
                cell.pipeline,
                ha="center",
                va="center",
                fontsize=9,
                color="#374151",
            )
            ax.text(
                j,
                i + 0.02,
                f"{cell.bt_share:.0%}",
                ha="center",
                va="center",
                fontsize=14,
                fontweight="bold",
                color="#111",
            )
            ax.text(
                j,
                i + 0.28,
                f"λ={cell.bt_strength:.2f}",
                ha="center",
                va="center",
                fontsize=8,
                color="#4b5563",
            )
            ax.text(
                j,
                i + 0.42,
                f"{cell.wins}W/{cell.losses}L",
                ha="center",
                va="center",
                fontsize=7,
                color="#6b7280",
            )
    ax.set_title(
        f"{DIMENSION_LABELS[dimension]} — ablation matrix\n"
        "Bradley–Terry strength share (4-pipeline subset)"
    )
    fig.colorbar(
        im, ax=ax, fraction=0.046, pad=0.04, label="BT strength share (%)"
    )
    fig.tight_layout()
    fig.savefig(path, dpi=160)
    plt.close(fig)


def ablation_matrix_csv(cells: list[list[AblationCell]]) -> pd.DataFrame:
    rows: list[dict[str, object]] = []
    for row_label, row in zip(ABLATION_ROW_LABELS, cells):
        for col_label, cell in zip(ABLATION_COL_LABELS, row):
            rows.append(
                {
                    "action": row_label,
                    "perception": col_label,
                    "pipeline": cell.pipeline,
                    "bt_strength": cell.bt_strength,
                    "bt_share": cell.bt_share,
                    "wins": cell.wins,
                    "losses": cell.losses,
                    "ties": cell.ties,
                }
            )
    return pd.DataFrame(rows)


def ablation_pairwise_csv(bt: AblationBradleyTerry) -> pd.DataFrame:
    return pd.DataFrame(
        [
            {
                "pipeline_a": pair.a,
                "pipeline_b": pair.b,
                "wins_a": pair.wins_a,
                "wins_b": pair.wins_b,
                "observed_rate_a": pair.observed_rate_a,
                "bt_rate_a": pair.bt_rate_a,
            }
            for pair in bt.pairwise
        ]
    )


def ablation_matrix_report_sections(
    bt: AblationBradleyTerry, cells: list[list[AblationCell]]
) -> list[str]:
    sections = [
        "### Ablation matrix (perception × action)",
        "",
        "Bradley–Terry model fit on decisive pairwise preferences among "
        "`baseline`, `engine-only`, `map-only`, and `full` only "
        "(ties excluded). Strengths are normalized with `baseline` = 1.",
        "",
        f"| | {ABLATION_COL_LABELS[0]} | {ABLATION_COL_LABELS[1]} |",
        "|---|---|---|",
    ]
    for row_label, row in zip(ABLATION_ROW_LABELS, cells):
        formatted = [
            (
                f"**{cell.pipeline}** — λ={cell.bt_strength:.2f}, "
                f"share **{cell.bt_share:.1%}** "
                f"({cell.wins}W/{cell.losses}L/{cell.ties}T)"
            )
            for cell in row
        ]
        sections.append(f"| {row_label} | {formatted[0]} | {formatted[1]} |")
    sections.append("")
    sections.append("#### Pairwise comparisons (observed vs Bradley–Terry)")
    sections.append("")
    sections.append("| Pair | Observed | BT predicted | Record |")
    sections.append("|------|----------|--------------|--------|")
    for pair in bt.pairwise:
        observed = (
            f"{pair.observed_rate_a:.1%}"
            if math.isfinite(pair.observed_rate_a)
            else "—"
        )
        sections.append(
            f"| {pair.a} vs {pair.b} | {observed} | "
            f"{pair.bt_rate_a:.1%} | {pair.wins_a}–{pair.wins_b} |"
        )
    sections.append("")
    sections.append("#### Marginal component effects (Bradley–Terry)")
    map_rates: list[float] = []
    engine_rates: list[float] = []
    for a, b, favor, label in ABLATION_MARGINAL_PAIRS:
        rate = bt_win_probability(bt.strengths, favor, a)
        if label.startswith("Map"):
            map_rates.append(rate)
        else:
            engine_rates.append(rate)
        sections.append(
            f"- **{label}**: P(`{favor}` ≻ `{a}`) = **{rate:.1%}**"
        )
    sections.append("")
    sections.append(
        "#### Main effects (average BT win probability when adding component)"
    )
    sections.append(
        f"- Map: **{statistics.mean(map_rates):.1%}** "
        f"({', '.join(f'{rate:.1%}' for rate in map_rates)})"
    )
    sections.append(
        f"- Rules engine: **{statistics.mean(engine_rates):.1%}** "
        f"({', '.join(f'{rate:.1%}' for rate in engine_rates)})"
    )
    return sections


def plot_component_wins(
    df: pd.DataFrame, path: Path, dimension: RatingDimension
) -> None:
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
        subset = filter_dimension_rows(filter_pair(df, a, b), dimension)
        wins = losses = 0
        for _, row in subset.iterrows():
            outcome = binary_win_for(row, favor, dimension)
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
    ax.set_title(
        f"{DIMENSION_LABELS[dimension]} — component contribution (decisive preference)"
    )
    ax.set_xlim(0, 100)
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
            if pipeline_id not in TIMING_PIPELINE_IDS:
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
    for pipeline_id in TIMING_PIPELINE_IDS:
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
    friedman_cols = [p for p in TIMING_PIPELINE_IDS if p in pivot.columns]
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
    order = list(TIMING_PIPELINE_IDS)
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
    others = [p for p in TIMING_PIPELINE_IDS if p != "baseline"]
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
    n_samples = int(summary["n"].max()) if not summary.empty else 0
    sections = [
        "## Pipeline processing time",
        "",
        "Metric: sum of `elapsed_s` across API request rounds in each `agent.log` "
        "(model inference time only; excludes screenshot capture and rule apply).",
        "",
        "Compared pipelines ran on the same hardware (`baseline`, `engine-only`, "
        "`map-only`, `full`). `full-sonnet` is excluded — it ran on different hardware.",
        "",
        f"### Summary (n={n_samples} samples per pipeline)",
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


def dimension_report_sections(
    df: pd.DataFrame, dimension: RatingDimension
) -> tuple[list[str], list[str]]:
    """Return markdown sections and generated figure filenames for one dimension."""
    sections: list[str] = [
        f"## {DIMENSION_LABELS[dimension]}",
        "",
    ]
    figure_names: list[str] = []
    dim_slug = dimension

    win_rate_plot = f"win-rate-vs-original-{dim_slug}.png"
    vs_original_results, mcnemar_bf, mcnemar_fs = plot_win_rate_vs_original(
        df, dimension, OUTPUT_DIR / win_rate_plot
    )
    figure_names.append(win_rate_plot)

    sections.append("### 1a. vs original")
    sections.append(
        "Win = reviewer prefers treatment over original. "
        "Standard fail = tied (`similar`). Catastrophic fail = treatment rated worse than original."
    )
    for r in vs_original_results:
        sections.append(f"#### {r['treatment']}")
        sections.append(
            f"- Win rate: **{r['win_rate']:.1%}** "
            f"({r['wins']} wins, {r['catastrophic_losses']} catastrophic fails, "
            f"{r['standard_fails']} standard fails, n={r['n_samples']})"
        )
        sections.append(f"- {fmt_test(r['sign_test'])}")
    sections.append("#### Paired McNemar (same samples, success vs original)")
    sections.append(f"- baseline vs full: {fmt_test(mcnemar_bf)}")
    sections.append(f"- full vs full-sonnet: {fmt_test(mcnemar_fs)}")

    compare_bf = compare_two_treatments_vs_original(
        df,
        "baseline",
        "full",
        dimension,
        "baseline vs full (paired on same samples)",
    )
    sections.append("#### Discordant pairs: baseline vs full")
    sections.append(
        f"- Baseline succeeds & full fails **{compare_bf['a_wins_b_loses']}**, "
        f"full succeeds & baseline fails **{compare_bf['b_wins_a_loses']}**, "
        f"concordant **{compare_bf['concordant']}**"
    )

    compare_models = compare_two_treatments_vs_original(
        df,
        "full",
        "full-sonnet",
        dimension,
        "full vs full-sonnet (both vs original)",
    )
    sections.append("#### Discordant pairs: full vs full-sonnet")
    sections.append(
        f"- Full succeeds & sonnet fails **{compare_models['a_wins_b_loses']}**, "
        f"sonnet succeeds & full fails **{compare_models['b_wins_a_loses']}**, "
        f"concordant **{compare_models['concordant']}**"
    )

    q1b = analyze_quality_pair(
        df,
        "baseline",
        "full",
        "full",
        dimension,
        "1b: baseline vs full",
    )
    sections.append("### 1b. baseline vs full")
    sections.append(
        f"- Mean signed score favoring full: **{q1b['mean_score']:+.2f}** (n={q1b['n_samples']})"
    )
    sections.append(f"- {fmt_test(q1b['wilcoxon'])}")
    sections.append(f"- Binary (decisive) sign test: {fmt_test(q1b['sign_test'])}")

    q2b = analyze_quality_pair(
        df,
        "full",
        "full-sonnet",
        "full-sonnet",
        dimension,
        "2b: full vs full-sonnet",
    )
    sections.append("### 2b. full vs full-sonnet")
    sections.append(
        f"- Mean signed score favoring sonnet: **{q2b['mean_score']:+.2f}**"
    )
    sections.append(f"- {fmt_test(q2b['wilcoxon'])}")
    sections.append(f"- Binary sign test: {fmt_test(q2b['sign_test'])}")

    ablation_bt = fit_ablation_bradley_terry(df, dimension)
    ablation_cells = ablation_matrix_cells(ablation_bt)
    ablation_plot = f"ablation-matrix-{dim_slug}.png"
    plot_ablation_matrix(ablation_cells, OUTPUT_DIR / ablation_plot, dimension)
    ablation_matrix_csv(ablation_cells).to_csv(
        OUTPUT_DIR / f"ablation-matrix-{dim_slug}.csv", index=False
    )
    ablation_pairwise_csv(ablation_bt).to_csv(
        OUTPUT_DIR / f"ablation-bt-pairwise-{dim_slug}.csv", index=False
    )
    sections.extend(ablation_matrix_report_sections(ablation_bt, ablation_cells))
    figure_names.append(ablation_plot)

    sections.append("### 3. Component contribution")
    component_pairs = [
        ("baseline", "engine-only", "engine-only", "baseline vs engine-only"),
        ("baseline", "map-only", "map-only", "baseline vs map-only"),
        ("engine-only", "full", "full", "engine-only vs full"),
        ("map-only", "full", "full", "map-only vs full"),
        ("baseline", "full", "full", "baseline vs full"),
    ]
    for a, b, favor, label in component_pairs:
        subset = filter_dimension_rows(filter_pair(df, a, b), dimension)
        wins = losses = ties = 0
        for _, row in subset.iterrows():
            outcome = binary_win_for(row, favor, dimension)
            if outcome is None:
                ties += 1
            elif outcome == 1:
                wins += 1
            else:
                losses += 1
        sign = exact_sign_test_binary(wins, losses)
        qual = analyze_quality_pair(df, a, b, favor, dimension, label)
        sections.append(f"#### {label}")
        decisive_rate = wins / (wins + losses) if wins + losses else math.nan
        sections.append(
            f"- Decisive win rate for **{favor}**: **{decisive_rate:.1%}** "
            f"({wins}W/{losses}L/{ties}T, n={len(subset)})"
        )
        sections.append(f"- Sign test: {fmt_test(sign)}")
        sections.append(
            f"- Wilcoxon (signed score favoring {favor}): {fmt_test(qual['wilcoxon'])}"
        )

    component_plot = f"component-contribution-{dim_slug}.png"
    likert_plot = f"likert-distributions-{dim_slug}.png"
    win_matrix_plot = f"win-matrix-{dim_slug}.png"
    plot_component_wins(df, OUTPUT_DIR / component_plot, dimension)
    plot_likert_distributions(df, OUTPUT_DIR / likert_plot, dimension)
    matrix = load_win_matrix(dimension)
    plot_win_matrix(matrix, OUTPUT_DIR / win_matrix_plot, dimension)
    figure_names.extend([component_plot, likert_plot, win_matrix_plot])

    return sections, figure_names


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    df, excluded_samples = load_pairs()

    sections: list[str] = ["# Primary evaluation — statistical analysis", ""]
    figure_names: list[str] = []

    sections.append("## Corpus and exclusions")
    sections.append(
        f"Human pairwise evaluation covers **{df['sample_hex'].nunique()}** samples "
        f"({len(df)} judgments) after excluding **{len(excluded_samples)}** samples "
        f"with all-zero scores: `{', '.join(excluded_samples)}`."
    )

    sections.append("## Pairwise human judgments (three rating scales)")
    sections.append(
        "Each comparison uses hierarchical ratings on goal alignment, structural cohesion, "
        "and design alignment. Binary win scores (0/1) are derived per scale from the exported CSV."
    )

    for dimension in DIMENSIONS:
        dim_sections, dim_figures = dimension_report_sections(df, dimension)
        sections.extend(dim_sections)
        figure_names.extend(dim_figures)

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
    figure_names.extend(
        [
            "pipeline-times-boxplot.png",
            "pipeline-times-medians.png",
            "pipeline-speedup-vs-baseline.png",
        ]
    )

    sections.append("## Figures")
    for name in figure_names:
        sections.append(f"- `{OUTPUT_DIR.name}/{name}`")

    write_report(sections)


if __name__ == "__main__":
    main()
