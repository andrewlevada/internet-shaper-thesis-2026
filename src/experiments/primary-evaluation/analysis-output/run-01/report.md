# Primary evaluation — statistical analysis



Eval run: **run-01** (`eval-results/run-01/`).



## Corpus and exclusions

Human pairwise evaluation covers **15** samples (135 judgments) after excluding **0** samples with all-zero scores: _(none)_.

## Pairwise human judgments (single rating scale)

Each comparison uses a goal-alignment rating. Binary win scores (0/1) are derived from the exported CSV.

## Goal alignment



### 1a. vs original

Win = reviewer prefers treatment over original. Standard fail = tied (`similar`). Catastrophic fail = treatment rated worse than original.

#### baseline

- Win rate: **80.0%** (12 wins, 0 catastrophic fails, 3 standard fails, n=15)

- Exact binomial (win rate vs 50%): n=15, stat=0.8, p=0.03516 (significant at α=0.05); win rate = 80.0% (12/15)

#### full

- Win rate: **73.3%** (11 wins, 0 catastrophic fails, 4 standard fails, n=15)

- Exact binomial (win rate vs 50%): n=15, stat=0.7333, p=0.1185 (not significant at α=0.05); win rate = 73.3% (11/15)

#### full-sonnet

- Win rate: **73.3%** (11 wins, 0 catastrophic fails, 4 standard fails, n=15)

- Exact binomial (win rate vs 50%): n=15, stat=0.7333, p=0.1185 (not significant at α=0.05); win rate = 73.3% (11/15)

#### Paired McNemar (same samples, success vs original)

- baseline vs full: McNemar exact: n=7, stat=0.4286, p=1 (not significant at α=0.05); discordant 4 vs 3

- full vs full-sonnet: McNemar exact: n=0, stat=—, p=1 (not significant at α=0.05); No discordant pairs

#### Discordant pairs: baseline vs full

- Baseline succeeds & full fails **4**, full succeeds & baseline fails **3**, concordant **8**

#### Discordant pairs: full vs full-sonnet

- Full succeeds & sonnet fails **0**, sonnet succeeds & full fails **0**, concordant **15**

### 1b. baseline vs full

- Mean signed score favoring full: **-0.13** (n=15)

- Wilcoxon signed-rank: n=10, stat=22, p=0.625 (not significant at α=0.05); median signed score = -1.00

- Binary (decisive) sign test: Exact binomial (sign test): n=10, stat=0.4, p=0.7539 (not significant at α=0.05); win rate = 40.0% (4/10 decisive)

### 2b. full vs full-sonnet

- Mean signed score favoring sonnet: **+0.13**

- Wilcoxon signed-rank: n=4, stat=2.5, p=0.625 (not significant at α=0.05); median signed score = +1.00

- Binary sign test: Exact binomial (sign test): n=4, stat=0.75, p=0.625 (not significant at α=0.05); win rate = 75.0% (3/4 decisive)

### Ablation matrix (perception × action)



Bradley–Terry model fit on decisive pairwise preferences among `baseline`, `engine-only`, `map-only`, and `full` only (ties excluded). Strengths are normalized with `baseline` = 1.



| | Full DOM | DOM compression |

|---|---|---|

| Immediate patch | **baseline** — λ=1.00, share **19.2%** (14W/11L/20T) | **map-only** — λ=3.08, share **59.2%** (10W/3L/17T) |

| Rules engine | **engine-only** — λ=0.26, share **5.0%** (3W/11L/16T) | **full** — λ=0.86, share **16.6%** (10W/12L/23T) |



#### Pairwise comparisons (observed vs Bradley–Terry)



| Pair | Observed | BT predicted | Record |

|------|----------|--------------|--------|

| baseline vs engine-only | 77.8% | 79.5% | 7–2 |

| baseline vs map-only | 16.7% | 24.5% | 1–5 |

| baseline vs full | 60.0% | 53.8% | 6–4 |

| engine-only vs map-only | — | 7.7% | 0–0 |

| engine-only vs full | 20.0% | 23.1% | 1–4 |

| map-only vs full | 71.4% | 78.2% | 5–2 |



#### Marginal component effects (Bradley–Terry)

- **Map effect (immediate patch)**: P(`map-only` ≻ `baseline`) = **75.5%**

- **Map effect (rules engine)**: P(`full` ≻ `engine-only`) = **76.9%**

- **Engine effect (full DOM)**: P(`engine-only` ≻ `baseline`) = **20.5%**

- **Engine effect (DOM compression)**: P(`full` ≻ `map-only`) = **21.8%**



#### Main effects (average BT win probability when adding component)

- Map: **76.2%** (75.5%, 76.9%)

- Rules engine: **21.2%** (20.5%, 21.8%)

### 3. Component contribution

#### baseline vs engine-only

- Decisive win rate for **engine-only**: **22.2%** (2W/7L/6T, n=15)

- Sign test: Exact binomial (sign test): n=9, stat=0.2222, p=0.1797 (not significant at α=0.05); win rate = 22.2% (2/9 decisive)

- Wilcoxon (signed score favoring engine-only): Wilcoxon signed-rank: n=9, stat=10, p=0.1641 (not significant at α=0.05); median signed score = -1.00

#### baseline vs map-only

- Decisive win rate for **map-only**: **83.3%** (5W/1L/9T, n=15)

- Sign test: Exact binomial (sign test): n=6, stat=0.8333, p=0.2188 (not significant at α=0.05); win rate = 83.3% (5/6 decisive)

- Wilcoxon (signed score favoring map-only): Wilcoxon signed-rank: n=6, stat=3.5, p=0.2188 (not significant at α=0.05); median signed score = +1.00

#### engine-only vs full

- Decisive win rate for **full**: **80.0%** (4W/1L/10T, n=15)

- Sign test: Exact binomial (sign test): n=5, stat=0.8, p=0.375 (not significant at α=0.05); win rate = 80.0% (4/5 decisive)

- Wilcoxon (signed score favoring full): Wilcoxon signed-rank: n=5, stat=3, p=0.3125 (not significant at α=0.05); median signed score = +1.00

#### map-only vs full

- Decisive win rate for **full**: **28.6%** (2W/5L/8T, n=15)

- Sign test: Exact binomial (sign test): n=7, stat=0.2857, p=0.4531 (not significant at α=0.05); win rate = 28.6% (2/7 decisive)

- Wilcoxon (signed score favoring full): Wilcoxon signed-rank: n=7, stat=8, p=0.375 (not significant at α=0.05); median signed score = -1.00

#### baseline vs full

- Decisive win rate for **full**: **40.0%** (4W/6L/5T, n=15)

- Sign test: Exact binomial (sign test): n=10, stat=0.4, p=0.7539 (not significant at α=0.05); win rate = 40.0% (4/10 decisive)

- Wilcoxon (signed score favoring full): Wilcoxon signed-rank: n=10, stat=22, p=0.625 (not significant at α=0.05); median signed score = -1.00

## Pipeline processing time



Metric: sum of `elapsed_s` across API request rounds in each `agent.log` (model inference time only; excludes screenshot capture and rule apply).



Compared pipelines ran on the same hardware (`baseline`, `engine-only`, `map-only`, `full`). `full-sonnet` is excluded — it ran on different hardware.



### Summary (n=68 samples per pipeline)



| Pipeline | Median | Mean | Min | Max |

|----------|--------|------|-----|-----|

| baseline | 131.1s (2.2 min) | 150.9s (2.5 min) | 8.1s | 635.1s (10.6 min) |

| engine-only | 82.8s (1.4 min) | 101.3s (1.7 min) | 7.0s | 368.7s (6.1 min) |

| map-only | 85.7s (1.4 min) | 126.5s (2.1 min) | 6.7s | 511.9s (8.5 min) |

| full | 45.7s | 63.3s (1.1 min) | 5.0s | 357.3s (6.0 min) |



### Omnibus: Friedman test (all pipelines): n=68, stat=94.57, p=2.283e-20 (significant at α=0.05); compared baseline, engine-only, map-only, full on same samples



### Paired comparisons (Wilcoxon signed-rank on same sample, α=0.05)



**baseline vs full**

- Median baseline: 131.1s (2.2 min); median full: 45.7s; speedup **×2.87**

- Wilcoxon signed-rank (paired times): n=68, stat=170, p=8.861e-10 (significant at α=0.05); median baseline=131.1s (2.2 min), full=45.7s, Δ=+55.0s, speedup×2.87; full faster on 62/68 samples



**baseline vs map-only**

- Median baseline: 131.1s (2.2 min); median map-only: 85.7s (1.4 min); speedup **×1.53**

- Wilcoxon signed-rank (paired times): n=68, stat=739, p=0.008004 (significant at α=0.05); median baseline=131.1s (2.2 min), map-only=85.7s (1.4 min), Δ=+15.4s, speedup×1.53; map-only faster on 50/68 samples



**baseline vs engine-only**

- Median baseline: 131.1s (2.2 min); median engine-only: 82.8s (1.4 min); speedup **×1.58**

- Wilcoxon signed-rank (paired times): n=68, stat=99, p=5.29e-11 (significant at α=0.05); median baseline=131.1s (2.2 min), engine-only=82.8s (1.4 min), Δ=+25.3s, speedup×1.58; engine-only faster on 60/68 samples



**map-only vs full**

- Median map-only: 85.7s (1.4 min); median full: 45.7s; speedup **×1.87**

- Wilcoxon signed-rank (paired times): n=68, stat=140, p=2.755e-10 (significant at α=0.05); median map-only=85.7s (1.4 min), full=45.7s, Δ=+30.0s, speedup×1.87; full faster on 63/68 samples



**engine-only vs full**

- Median engine-only: 82.8s (1.4 min); median full: 45.7s; speedup **×1.81**

- Wilcoxon signed-rank (paired times): n=68, stat=489, p=2.922e-05 (significant at α=0.05); median engine-only=82.8s (1.4 min), full=45.7s, Δ=+22.5s, speedup×1.81; full faster on 52/68 samples



## Figures

- `analysis-output/run-01/win-rate-vs-original-goal.png`

- `analysis-output/run-01/ablation-matrix-goal.png`

- `analysis-output/run-01/component-contribution-goal.png`

- `analysis-output/run-01/likert-distributions-goal.png`

- `analysis-output/run-01/win-matrix-goal.png`

- `analysis-output/run-01/pipeline-times-boxplot.png`

- `analysis-output/run-01/pipeline-times-medians.png`

- `analysis-output/run-01/pipeline-speedup-vs-baseline.png`
