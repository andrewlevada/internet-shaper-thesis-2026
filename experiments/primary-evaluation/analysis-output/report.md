# Primary evaluation — statistical analysis



## Corpus and exclusions

Human pairwise evaluation covers **65** samples (585 judgments) after excluding **3** samples with all-zero scores: `0e4fe2f8, e1d82f59, eda9143e`.

## Pairwise human judgments (three rating scales)

Each comparison uses hierarchical ratings on goal alignment, structural cohesion, and design alignment. Binary win scores (0/1) are derived per scale from the exported CSV.

## Goal alignment



### 1a. vs original

Win = reviewer prefers treatment over original. Standard fail = tied (`similar`). Catastrophic fail = treatment rated worse than original.

#### baseline

- Win rate: **83.1%** (54 wins, 1 catastrophic fails, 10 standard fails, n=65)

- Exact binomial (win rate vs 50%): n=65, stat=0.8308, p=6.028e-08 (significant at α=0.05); win rate = 83.1% (54/65)

#### full

- Win rate: **89.2%** (58 wins, 0 catastrophic fails, 7 standard fails, n=65)

- Exact binomial (win rate vs 50%): n=65, stat=0.8923, p=4.271e-11 (significant at α=0.05); win rate = 89.2% (58/65)

#### full-sonnet

- Win rate: **96.9%** (63 wins, 0 catastrophic fails, 2 standard fails, n=65)

- Exact binomial (win rate vs 50%): n=65, stat=0.9692, p=1.163e-16 (significant at α=0.05); win rate = 96.9% (63/65)

#### Paired McNemar (same samples, success vs original)

- baseline vs full: McNemar exact: n=14, stat=0.3571, p=0.424 (not significant at α=0.05); discordant 5 vs 9

- full vs full-sonnet: McNemar exact: n=7, stat=0.1429, p=0.125 (not significant at α=0.05); discordant 1 vs 6

#### Discordant pairs: baseline vs full

- Baseline succeeds & full fails **5**, full succeeds & baseline fails **9**, concordant **51**

#### Discordant pairs: full vs full-sonnet

- Full succeeds & sonnet fails **1**, sonnet succeeds & full fails **6**, concordant **58**

### 1b. baseline vs full

- Mean signed score favoring full: **+0.09** (n=65)

- Wilcoxon signed-rank: n=28, stat=159.5, p=0.3386 (not significant at α=0.05); median signed score = +1.00

- Binary (decisive) sign test: Exact binomial (sign test): n=28, stat=0.6071, p=0.3449 (not significant at α=0.05); win rate = 60.7% (17/28 decisive)

### 2b. full vs full-sonnet

- Mean signed score favoring sonnet: **+0.14**

- Wilcoxon signed-rank: n=17, stat=36, p=0.05688 (not significant at α=0.05); median signed score = +1.00

- Binary sign test: Exact binomial (sign test): n=17, stat=0.7647, p=0.04904 (significant at α=0.05); win rate = 76.5% (13/17 decisive)

### Ablation matrix (perception × action)



Bradley–Terry model fit on decisive pairwise preferences among `baseline`, `engine-only`, `map-only`, and `full` only (ties excluded). Strengths are normalized with `baseline` = 1.



| | Full DOM | DOM compression |

|---|---|---|

| Immediate patch | **baseline** — λ=1.00, share **22.7%** (42W/45L/108T) | **map-only** — λ=0.69, share **15.7%** (19W/34L/77T) |

| Rules engine | **engine-only** — λ=1.12, share **25.4%** (25W/27L/78T) | **full** — λ=1.59, share **36.2%** (47W/27L/121T) |



#### Pairwise comparisons (observed vs Bradley–Terry)



| Pair | Observed | BT predicted | Record |

|------|----------|--------------|--------|

| baseline vs engine-only | 45.2% | 47.3% | 14–17 |

| baseline vs map-only | 60.7% | 59.1% | 17–11 |

| baseline vs full | 39.3% | 38.5% | 11–17 |

| engine-only vs map-only | — | 61.8% | 0–0 |

| engine-only vs full | 38.1% | 41.2% | 8–13 |

| map-only vs full | 32.0% | 30.2% | 8–17 |



#### Marginal component effects (Bradley–Terry)

- **Map effect (immediate patch)**: P(`map-only` ≻ `baseline`) = **40.9%**

- **Map effect (rules engine)**: P(`full` ≻ `engine-only`) = **58.8%**

- **Engine effect (full DOM)**: P(`engine-only` ≻ `baseline`) = **52.7%**

- **Engine effect (DOM compression)**: P(`full` ≻ `map-only`) = **69.8%**



#### Main effects (average BT win probability when adding component)

- Map: **49.8%** (40.9%, 58.8%)

- Rules engine: **61.3%** (52.7%, 69.8%)

### 3. Component contribution

#### baseline vs engine-only

- Decisive win rate for **engine-only**: **54.8%** (17W/14L/34T, n=65)

- Sign test: Exact binomial (sign test): n=31, stat=0.5484, p=0.7201 (not significant at α=0.05); win rate = 54.8% (17/31 decisive)

- Wilcoxon (signed score favoring engine-only): Wilcoxon signed-rank: n=31, stat=224, p=0.6496 (not significant at α=0.05); median signed score = +1.00

#### baseline vs map-only

- Decisive win rate for **map-only**: **39.3%** (11W/17L/37T, n=65)

- Sign test: Exact binomial (sign test): n=28, stat=0.3929, p=0.3449 (not significant at α=0.05); win rate = 39.3% (11/28 decisive)

- Wilcoxon (signed score favoring map-only): Wilcoxon signed-rank: n=28, stat=159.5, p=0.3272 (not significant at α=0.05); median signed score = -1.00

#### engine-only vs full

- Decisive win rate for **full**: **61.9%** (13W/8L/44T, n=65)

- Sign test: Exact binomial (sign test): n=21, stat=0.619, p=0.3833 (not significant at α=0.05); win rate = 61.9% (13/21 decisive)

- Wilcoxon (signed score favoring full): Wilcoxon signed-rank: n=21, stat=88, p=0.3554 (not significant at α=0.05); median signed score = +1.00

#### map-only vs full

- Decisive win rate for **full**: **68.0%** (17W/8L/40T, n=65)

- Sign test: Exact binomial (sign test): n=25, stat=0.68, p=0.1078 (not significant at α=0.05); win rate = 68.0% (17/25 decisive)

- Wilcoxon (signed score favoring full): Wilcoxon signed-rank: n=25, stat=104, p=0.1199 (not significant at α=0.05); median signed score = +1.00

#### baseline vs full

- Decisive win rate for **full**: **60.7%** (17W/11L/37T, n=65)

- Sign test: Exact binomial (sign test): n=28, stat=0.6071, p=0.3449 (not significant at α=0.05); win rate = 60.7% (17/28 decisive)

- Wilcoxon (signed score favoring full): Wilcoxon signed-rank: n=28, stat=159.5, p=0.3386 (not significant at α=0.05); median signed score = +1.00

## Structural cohesion



### 1a. vs original

Win = reviewer prefers treatment over original. Standard fail = tied (`similar`). Catastrophic fail = treatment rated worse than original.

#### baseline

- Win rate: **0.0%** (0 wins, 0 catastrophic fails, 10 standard fails, n=10)

- Exact binomial (win rate vs 50%): n=10, stat=0, p=0.001953 (significant at α=0.05); win rate = 0.0% (0/10)

#### full

- Win rate: **0.0%** (0 wins, 0 catastrophic fails, 7 standard fails, n=7)

- Exact binomial (win rate vs 50%): n=7, stat=0, p=0.01562 (significant at α=0.05); win rate = 0.0% (0/7)

#### full-sonnet

- Win rate: **0.0%** (0 wins, 0 catastrophic fails, 2 standard fails, n=2)

- Exact binomial (win rate vs 50%): n=2, stat=0, p=0.5 (not significant at α=0.05); win rate = 0.0% (0/2)

#### Paired McNemar (same samples, success vs original)

- baseline vs full: McNemar exact: n=0, stat=—, p=1 (not significant at α=0.05); No discordant pairs

- full vs full-sonnet: McNemar exact: n=0, stat=—, p=1 (not significant at α=0.05); No discordant pairs

#### Discordant pairs: baseline vs full

- Baseline succeeds & full fails **0**, full succeeds & baseline fails **0**, concordant **1**

#### Discordant pairs: full vs full-sonnet

- Full succeeds & sonnet fails **0**, sonnet succeeds & full fails **0**, concordant **1**

### 1b. baseline vs full

- Mean signed score favoring full: **+0.05** (n=37)

- Wilcoxon signed-rank: n=2, stat=0, p=0.5 (not significant at α=0.05); median signed score = +1.00

- Binary (decisive) sign test: Exact binomial (sign test): n=2, stat=1, p=0.5 (not significant at α=0.05); win rate = 100.0% (2/2 decisive)

### 2b. full vs full-sonnet

- Mean signed score favoring sonnet: **+0.02**

- Wilcoxon signed-rank: n=1, stat=0, p=1 (not significant at α=0.05); median signed score = +1.00

- Binary sign test: Exact binomial (sign test): n=1, stat=1, p=1 (not significant at α=0.05); win rate = 100.0% (1/1 decisive)

### Ablation matrix (perception × action)



Bradley–Terry model fit on decisive pairwise preferences among `baseline`, `engine-only`, `map-only`, and `full` only (ties excluded). Strengths are normalized with `baseline` = 1.



| | Full DOM | DOM compression |

|---|---|---|

| Immediate patch | **baseline** — λ=1.00, share **6.0%** (2W/5L/101T) | **map-only** — λ=1.50, share **8.9%** (3W/6L/68T) |

| Rules engine | **engine-only** — λ=3.31, share **19.7%** (1W/1L/76T) | **full** — λ=10.97, share **65.4%** (7W/1L/113T) |



#### Pairwise comparisons (observed vs Bradley–Terry)



| Pair | Observed | BT predicted | Record |

|------|----------|--------------|--------|

| baseline vs engine-only | 0.0% | 23.2% | 0–1 |

| baseline vs map-only | 50.0% | 40.0% | 2–2 |

| baseline vs full | 0.0% | 8.4% | 0–2 |

| engine-only vs map-only | — | 68.8% | 0–0 |

| engine-only vs full | 0.0% | 23.2% | 0–1 |

| map-only vs full | 20.0% | 12.0% | 1–4 |



#### Marginal component effects (Bradley–Terry)

- **Map effect (immediate patch)**: P(`map-only` ≻ `baseline`) = **60.0%**

- **Map effect (rules engine)**: P(`full` ≻ `engine-only`) = **76.8%**

- **Engine effect (full DOM)**: P(`engine-only` ≻ `baseline`) = **76.8%**

- **Engine effect (DOM compression)**: P(`full` ≻ `map-only`) = **88.0%**



#### Main effects (average BT win probability when adding component)

- Map: **68.4%** (60.0%, 76.8%)

- Rules engine: **82.4%** (76.8%, 88.0%)

### 3. Component contribution

#### baseline vs engine-only

- Decisive win rate for **engine-only**: **100.0%** (1W/0L/33T, n=34)

- Sign test: Exact binomial (sign test): n=1, stat=1, p=1 (not significant at α=0.05); win rate = 100.0% (1/1 decisive)

- Wilcoxon (signed score favoring engine-only): Wilcoxon signed-rank: n=1, stat=0, p=1 (not significant at α=0.05); median signed score = +1.00

#### baseline vs map-only

- Decisive win rate for **map-only**: **50.0%** (2W/2L/33T, n=37)

- Sign test: Exact binomial (sign test): n=4, stat=0.5, p=1 (not significant at α=0.05); win rate = 50.0% (2/4 decisive)

- Wilcoxon (signed score favoring map-only): Wilcoxon signed-rank: n=4, stat=5, p=1 (not significant at α=0.05); median signed score = +0.00

#### engine-only vs full

- Decisive win rate for **full**: **100.0%** (1W/0L/43T, n=44)

- Sign test: Exact binomial (sign test): n=1, stat=1, p=1 (not significant at α=0.05); win rate = 100.0% (1/1 decisive)

- Wilcoxon (signed score favoring full): Wilcoxon signed-rank: n=1, stat=0, p=1 (not significant at α=0.05); median signed score = +1.00

#### map-only vs full

- Decisive win rate for **full**: **80.0%** (4W/1L/35T, n=40)

- Sign test: Exact binomial (sign test): n=5, stat=0.8, p=0.375 (not significant at α=0.05); win rate = 80.0% (4/5 decisive)

- Wilcoxon (signed score favoring full): Wilcoxon signed-rank: n=5, stat=3, p=0.3125 (not significant at α=0.05); median signed score = +1.00

#### baseline vs full

- Decisive win rate for **full**: **100.0%** (2W/0L/35T, n=37)

- Sign test: Exact binomial (sign test): n=2, stat=1, p=0.5 (not significant at α=0.05); win rate = 100.0% (2/2 decisive)

- Wilcoxon (signed score favoring full): Wilcoxon signed-rank: n=2, stat=0, p=0.5 (not significant at α=0.05); median signed score = +1.00

## Design alignment



### 1a. vs original

Win = reviewer prefers treatment over original. Standard fail = tied (`similar`). Catastrophic fail = treatment rated worse than original.

#### baseline

- Win rate: **0.0%** (0 wins, 0 catastrophic fails, 10 standard fails, n=10)

- Exact binomial (win rate vs 50%): n=10, stat=0, p=0.001953 (significant at α=0.05); win rate = 0.0% (0/10)

#### full

- Win rate: **0.0%** (0 wins, 0 catastrophic fails, 7 standard fails, n=7)

- Exact binomial (win rate vs 50%): n=7, stat=0, p=0.01562 (significant at α=0.05); win rate = 0.0% (0/7)

#### full-sonnet

- Win rate: **0.0%** (0 wins, 0 catastrophic fails, 2 standard fails, n=2)

- Exact binomial (win rate vs 50%): n=2, stat=0, p=0.5 (not significant at α=0.05); win rate = 0.0% (0/2)

#### Paired McNemar (same samples, success vs original)

- baseline vs full: McNemar exact: n=0, stat=—, p=1 (not significant at α=0.05); No discordant pairs

- full vs full-sonnet: McNemar exact: n=0, stat=—, p=1 (not significant at α=0.05); No discordant pairs

#### Discordant pairs: baseline vs full

- Baseline succeeds & full fails **0**, full succeeds & baseline fails **0**, concordant **1**

#### Discordant pairs: full vs full-sonnet

- Full succeeds & sonnet fails **0**, sonnet succeeds & full fails **0**, concordant **1**

### 1b. baseline vs full

- Mean signed score favoring full: **+0.14** (n=35)

- Wilcoxon signed-rank: n=7, stat=4, p=0.1094 (not significant at α=0.05); median signed score = +1.00

- Binary (decisive) sign test: Exact binomial (sign test): n=7, stat=0.8571, p=0.125 (not significant at α=0.05); win rate = 85.7% (6/7 decisive)

### 2b. full vs full-sonnet

- Mean signed score favoring sonnet: **-0.11**

- Wilcoxon signed-rank: n=17, stat=54, p=0.306 (not significant at α=0.05); median signed score = -1.00

- Binary sign test: Exact binomial (sign test): n=17, stat=0.3529, p=0.3323 (not significant at α=0.05); win rate = 35.3% (6/17 decisive)

### Ablation matrix (perception × action)



Bradley–Terry model fit on decisive pairwise preferences among `baseline`, `engine-only`, `map-only`, and `full` only (ties excluded). Strengths are normalized with `baseline` = 1.



| | Full DOM | DOM compression |

|---|---|---|

| Immediate patch | **baseline** — λ=1.00, share **17.8%** (7W/10L/84T) | **map-only** — λ=0.46, share **8.2%** (3W/10L/55T) |

| Rules engine | **engine-only** — λ=2.24, share **39.9%** (9W/6L/61T) | **full** — λ=1.91, share **34.1%** (16W/9L/88T) |



#### Pairwise comparisons (observed vs Bradley–Terry)



| Pair | Observed | BT predicted | Record |

|------|----------|--------------|--------|

| baseline vs engine-only | 33.3% | 30.9% | 2–4 |

| baseline vs map-only | 100.0% | 68.6% | 4–0 |

| baseline vs full | 14.3% | 34.3% | 1–6 |

| engine-only vs map-only | — | 83.0% | 0–0 |

| engine-only vs full | 55.6% | 53.9% | 5–4 |

| map-only vs full | 33.3% | 19.4% | 3–6 |



#### Marginal component effects (Bradley–Terry)

- **Map effect (immediate patch)**: P(`map-only` ≻ `baseline`) = **31.4%**

- **Map effect (rules engine)**: P(`full` ≻ `engine-only`) = **46.1%**

- **Engine effect (full DOM)**: P(`engine-only` ≻ `baseline`) = **69.1%**

- **Engine effect (DOM compression)**: P(`full` ≻ `map-only`) = **80.6%**



#### Main effects (average BT win probability when adding component)

- Map: **38.8%** (31.4%, 46.1%)

- Rules engine: **74.9%** (69.1%, 80.6%)

### 3. Component contribution

#### baseline vs engine-only

- Decisive win rate for **engine-only**: **66.7%** (4W/2L/27T, n=33)

- Sign test: Exact binomial (sign test): n=6, stat=0.6667, p=0.6875 (not significant at α=0.05); win rate = 66.7% (4/6 decisive)

- Wilcoxon (signed score favoring engine-only): Wilcoxon signed-rank: n=6, stat=7, p=0.5625 (not significant at α=0.05); median signed score = +1.00

#### baseline vs map-only

- Decisive win rate for **map-only**: **0.0%** (0W/4L/29T, n=33)

- Sign test: Exact binomial (sign test): n=4, stat=0, p=0.125 (not significant at α=0.05); win rate = 0.0% (0/4 decisive)

- Wilcoxon (signed score favoring map-only): Wilcoxon signed-rank: n=4, stat=0, p=0.125 (not significant at α=0.05); median signed score = -1.00

#### engine-only vs full

- Decisive win rate for **full**: **44.4%** (4W/5L/34T, n=43)

- Sign test: Exact binomial (sign test): n=9, stat=0.4444, p=1 (not significant at α=0.05); win rate = 44.4% (4/9 decisive)

- Wilcoxon (signed score favoring full): Wilcoxon signed-rank: n=9, stat=20, p=0.8203 (not significant at α=0.05); median signed score = -1.00

#### map-only vs full

- Decisive win rate for **full**: **66.7%** (6W/3L/26T, n=35)

- Sign test: Exact binomial (sign test): n=9, stat=0.6667, p=0.5078 (not significant at α=0.05); win rate = 66.7% (6/9 decisive)

- Wilcoxon (signed score favoring full): Wilcoxon signed-rank: n=9, stat=15, p=0.4258 (not significant at α=0.05); median signed score = +1.00

#### baseline vs full

- Decisive win rate for **full**: **85.7%** (6W/1L/28T, n=35)

- Sign test: Exact binomial (sign test): n=7, stat=0.8571, p=0.125 (not significant at α=0.05); win rate = 85.7% (6/7 decisive)

- Wilcoxon (signed score favoring full): Wilcoxon signed-rank: n=7, stat=4, p=0.1094 (not significant at α=0.05); median signed score = +1.00

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

- `analysis-output/win-rate-vs-original-goal.png`

- `analysis-output/ablation-matrix-goal.png`

- `analysis-output/component-contribution-goal.png`

- `analysis-output/likert-distributions-goal.png`

- `analysis-output/win-matrix-goal.png`

- `analysis-output/win-rate-vs-original-structural.png`

- `analysis-output/ablation-matrix-structural.png`

- `analysis-output/component-contribution-structural.png`

- `analysis-output/likert-distributions-structural.png`

- `analysis-output/win-matrix-structural.png`

- `analysis-output/win-rate-vs-original-design.png`

- `analysis-output/ablation-matrix-design.png`

- `analysis-output/component-contribution-design.png`

- `analysis-output/likert-distributions-design.png`

- `analysis-output/win-matrix-design.png`

- `analysis-output/pipeline-times-boxplot.png`

- `analysis-output/pipeline-times-medians.png`

- `analysis-output/pipeline-speedup-vs-baseline.png`
