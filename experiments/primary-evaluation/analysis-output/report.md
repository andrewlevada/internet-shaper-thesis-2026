# Primary evaluation — statistical analysis



## 0. Baseline processability (corpus, n=42)

- Baseline agent ran on **100.0%** (42/42) samples.

- Visible DOM alone fits a conservative context budget (202,144 tokens) on **78.6%** of samples; the rest are too large for a single `get_dom` call without compression.

- Context overflow during baseline run: **0** samples.

- Baseline produced edits (index.html) on **100.0%** of samples.

- Full pipeline (`5-full`) ran on **100.0%** (42/42) samples.

Human pairwise evaluation covers **15** samples (135 judgments).

## 1a. Task completion vs original

### original vs baseline

- Success rate (decisive only): **100.0%** (12 wins, 0 losses, 3 ties, n=15)

- Exact binomial (sign test): n=12, stat=1, p=0.0004883 (significant at α=0.05); win rate = 100.0% (12/12 decisive)

### original vs full

- Success rate (decisive only): **100.0%** (11 wins, 0 losses, 4 ties, n=15)

- Exact binomial (sign test): n=11, stat=1, p=0.0009766 (significant at α=0.05); win rate = 100.0% (11/11 decisive)

### Paired comparison: baseline vs full (both vs original)

- Discordant: baseline wins & full loses **0**, full wins & baseline loses **0**, ties **7**

- McNemar exact: n=0, stat=—, p=1 (not significant at α=0.05); No discordant pairs

## 1b. Quality (baseline vs full)

- Mean signed Likert score favoring full: **-0.27** (n=15)

- Wilcoxon signed-rank: n=10, stat=22, p=0.625 (not significant at α=0.05); median signed score = -2.00

- Binary (decisive) sign test: Exact binomial (sign test): n=10, stat=0.4, p=0.7539 (not significant at α=0.05); win rate = 40.0% (4/10 decisive)

## 2a. full-sonnet vs original

- Success rate (decisive): **100.0%** (11/11 decisive)

- Exact binomial (sign test): n=11, stat=1, p=0.0009766 (significant at α=0.05); win rate = 100.0% (11/11 decisive)

## 2b. full vs full-sonnet (quality)

- Mean signed score favoring sonnet: **+0.27**

- Wilcoxon signed-rank: n=4, stat=2.5, p=0.625 (not significant at α=0.05); median signed score = +2.00

- Binary sign test: Exact binomial (sign test): n=4, stat=0.75, p=0.625 (not significant at α=0.05); win rate = 75.0% (3/4 decisive)

### Paired: full vs sonnet (both vs original)

- Discordant: full **0**, sonnet **0**

- McNemar exact: n=0, stat=—, p=1 (not significant at α=0.05); No discordant pairs

## 3. Component contribution

### baseline vs engine-only

- Decisive win rate for **engine-only**: **22.2%** (2W/7L/6T, n=15)

- Sign test: Exact binomial (sign test): n=9, stat=0.2222, p=0.1797 (not significant at α=0.05); win rate = 22.2% (2/9 decisive)

- Wilcoxon (Likert favoring engine-only): Wilcoxon signed-rank: n=9, stat=10, p=0.1641 (not significant at α=0.05); median signed score = -2.00

### baseline vs map-only

- Decisive win rate for **map-only**: **83.3%** (5W/1L/9T, n=15)

- Sign test: Exact binomial (sign test): n=6, stat=0.8333, p=0.2188 (not significant at α=0.05); win rate = 83.3% (5/6 decisive)

- Wilcoxon (Likert favoring map-only): Wilcoxon signed-rank: n=6, stat=3.5, p=0.2188 (not significant at α=0.05); median signed score = +2.00

### engine-only vs full

- Decisive win rate for **full**: **80.0%** (4W/1L/10T, n=15)

- Sign test: Exact binomial (sign test): n=5, stat=0.8, p=0.375 (not significant at α=0.05); win rate = 80.0% (4/5 decisive)

- Wilcoxon (Likert favoring full): Wilcoxon signed-rank: n=5, stat=3.5, p=0.4375 (not significant at α=0.05); median signed score = +2.00

### map-only vs full

- Decisive win rate for **full**: **28.6%** (2W/5L/8T, n=15)

- Sign test: Exact binomial (sign test): n=7, stat=0.2857, p=0.4531 (not significant at α=0.05); win rate = 28.6% (2/7 decisive)

- Wilcoxon (Likert favoring full): Wilcoxon signed-rank: n=7, stat=8, p=0.375 (not significant at α=0.05); median signed score = -2.00

### baseline vs full

- Decisive win rate for **full**: **40.0%** (4W/6L/5T, n=15)

- Sign test: Exact binomial (sign test): n=10, stat=0.4, p=0.7539 (not significant at α=0.05); win rate = 40.0% (4/10 decisive)

- Wilcoxon (Likert favoring full): Wilcoxon signed-rank: n=10, stat=22, p=0.625 (not significant at α=0.05); median signed score = -2.00

## 4. Pipeline processing time



Metric: sum of `elapsed_s` across API request rounds in each `agent.log` (model inference time only; excludes screenshot capture and rule apply).



### Summary (n=42 samples per pipeline)



| Pipeline | Median | Mean | Min | Max |

|----------|--------|------|-----|-----|

| baseline | 162.8s (2.7 min) | 202.5s (3.4 min) | 14.2s | 513.6s (8.6 min) |

| engine-only | 63.4s (1.1 min) | 74.4s (1.2 min) | 6.7s | 155.1s (2.6 min) |

| map-only | 82.3s (1.4 min) | 116.8s (1.9 min) | 13.9s | 361.2s (6.0 min) |

| full | 34.4s | 37.6s | 9.4s | 119.8s (2.0 min) |

| full-sonnet | 28.2s | 33.1s | 14.1s | 78.5s (1.3 min) |



### Omnibus: Friedman test (all pipelines): n=42, stat=116.3, p=3.286e-24 (significant at α=0.05); compared baseline, engine-only, map-only, full, full-sonnet on same samples



### Paired comparisons (Wilcoxon signed-rank on same sample, α=0.05)



**baseline vs full**

- Median baseline: 162.8s (2.7 min); median full: 34.4s; speedup **×4.74**

- Wilcoxon signed-rank (paired times): n=42, stat=0, p=4.547e-13 (significant at α=0.05); median baseline=162.8s (2.7 min), full=34.4s, Δ=+126.8s, speedup×4.74; full faster on 42/42 samples



**baseline vs map-only**

- Median baseline: 162.8s (2.7 min); median map-only: 82.3s (1.4 min); speedup **×1.98**

- Wilcoxon signed-rank (paired times): n=42, stat=113, p=5.985e-06 (significant at α=0.05); median baseline=162.8s (2.7 min), map-only=82.3s (1.4 min), Δ=+66.0s, speedup×1.98; map-only faster on 36/42 samples



**baseline vs engine-only**

- Median baseline: 162.8s (2.7 min); median engine-only: 63.4s (1.1 min); speedup **×2.57**

- Wilcoxon signed-rank (paired times): n=42, stat=2, p=1.364e-12 (significant at α=0.05); median baseline=162.8s (2.7 min), engine-only=63.4s (1.1 min), Δ=+95.7s, speedup×2.57; engine-only faster on 41/42 samples



**map-only vs full**

- Median map-only: 82.3s (1.4 min); median full: 34.4s; speedup **×2.40**

- Wilcoxon signed-rank (paired times): n=42, stat=6, p=6.366e-12 (significant at α=0.05); median map-only=82.3s (1.4 min), full=34.4s, Δ=+52.6s, speedup×2.40; full faster on 41/42 samples



**engine-only vs full**

- Median engine-only: 63.4s (1.1 min); median full: 34.4s; speedup **×1.85**

- Wilcoxon signed-rank (paired times): n=42, stat=48, p=1.12e-08 (significant at α=0.05); median engine-only=63.4s (1.1 min), full=34.4s, Δ=+29.5s, speedup×1.85; full faster on 36/42 samples



**full vs full-sonnet**

- Median full: 34.4s; median full-sonnet: 28.2s; speedup **×1.22**

- Wilcoxon signed-rank (paired times): n=42, stat=311, p=0.07996 (not significant at α=0.05); median full=34.4s, full-sonnet=28.2s, Δ=+4.4s, speedup×1.22; full-sonnet faster on 26/42 samples



**baseline vs full-sonnet**

- Median baseline: 162.8s (2.7 min); median full-sonnet: 28.2s; speedup **×5.77**

- Wilcoxon signed-rank (paired times): n=42, stat=5, p=4.547e-12 (significant at α=0.05); median baseline=162.8s (2.7 min), full-sonnet=28.2s, Δ=+120.8s, speedup×5.77; full-sonnet faster on 40/42 samples
