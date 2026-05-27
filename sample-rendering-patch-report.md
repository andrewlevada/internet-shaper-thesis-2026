# Sample rendering patch experiment (our-2/004–006)

YouTube cat-search samples 004, 005, and 006 share the same captured HTML (`source-snapshot: 004`). After ~2 days, screenshots broke while agent-edited variants still existed. Rerunning the full agent pipeline was ruled out.

## Problem

Archived HTML is replayed locally for screenshots via Playwright. YouTube pages depend on live CDN bundles (`ytmainappweb` ss/js, `/s/player/…`, `/s/desktop/…`) and on loading subresources from the correct origin. Some bundle URLs rot quickly; replay method also matters.

Initial misread: relative URLs resolving against `about:blank`. User confirmed the same `set_content` replay worked ~12 hours earlier — the regression was primarily **expired/rotated asset URLs + replay context**, not a new pipeline bug.

## What we tried

Three approaches, one sample each, **all 6 variants** (`1-original` … `6-full-sonnet`):

| Sample | Approach | HTML change | Screenshot replay |
|--------|----------|-------------|---------------------|
| **004** | `base-href` | Inject `<base href="{final-url}">`; fix `//` → `https://` | `page.set_content(html)` |
| **005** | `set-content-url` | None | Intercept document at `final-url`, `page.goto(url)` with saved HTML body |
| **006** | `refresh-assets-from-live` | Fetch live page; replace ytmainappweb ss/js, player hash, desktop hash; HEAD-check remaining broken URLs against live suffix map | `page.set_content(html)` |

Tooling added:

- `experiments/primary-evaluation/data/scripts/patch-sample-rendering.py`
- `prep-samples.py`: skip `copy_original_variant()` on `--screenshots-only` (was reverting patched `1-original` + `task.json`)
- `lib/screenshot.py`: route+goto for `render-approach: set-content-url` (Playwright Python has no `set_content(url=)`)

## Pitfall we hit

`copy_original_variant()` copies seed `raw.html` → `1-original/index.html` and seed `task.json` → sample `task.json` on every normal pipeline run. First patch pass updated variants but **1-original was wiped** when screenshots ran before the `--screenshots-only` guard existed.

## Manual validation

Checked `1-original/screenshot.png` after re-patch + `--force-screenshots`:

- **004 (`base-href`):** failed — blank/unstyled page. `<base>` + `set_content` is not enough for YouTube in headless replay.
- **005 (`set-content-url`):** **worked best, but not perfectly** — layout, nav, filters, and most result rows render; some thumbnails/media still missing or stale (e.g. main video thumb grey/empty while Shorts shelf thumbs load).
- **006 (`refresh-assets-from-live`):** failed — refreshed CDN URLs in HTML did not fix replay without correct document origin; still blank with `set_content`.

## Insights

1. **Replay origin beats URL patching alone** for heavy SPAs (YouTube): serving saved HTML as the document at `final-url` lets relative paths and live subresources resolve correctly.
2. **`<base href>` helps simpler sites** (MediaWiki `/load.php`, Next.js `/_next/…`) but is insufficient for YouTube + `set_content`.
3. **Live asset refresh is necessary but not sufficient** when bundles 404; it must be paired with route+goto (or full re-capture) for YouTube.
4. **Protect patched artifacts** — any step that recopies seed `raw.html` into `1-original` will undo HTML patches; mark replay mode in `task.json` instead of mutating HTML when possible.
5. **Site-specific strategy** — expect a tiered fix: route+goto default for SPAs; base-href or asset refresh for static/CSS-heavy pages.

---

## Follow-up: `renew-sample` (re-capture + replay)

The patch approaches above did not reliably fix rendering. **Rerunning the full agent pipeline was ruled out**, so a different strategy was implemented: re-capture fresh HTML at the dom-compression snapshot source, propagate it through seed/eval samples, deterministically replay saved agent mutations (no LLM), then re-screenshot.

### Strategy

```text
samples/our-2/{NNN}/task.json  →  source-snapshot
snapshots/data.csv             →  capture URL
snapshots/{id}/                →  headed Playwright re-capture (raw.html, visible.html, screenshot.png)
seed-samples/our-2/{NNN}/original/  →  propagate fresh HTML
samples/our-2/{NNN}/1-original/     →  copy raw.html → index.html
samples/our-2/{NNN}/{variant}/work/ →  reset raw.html + visible.html
agent.log (edit calls) / rules.json →  replay mutations → index.html
screenshot.png                   →  regenerate all 6 variants
```

For the full `our-2` fold: **42 samples**, **14 unique snapshots** (deduplicated by `source-snapshot`).

### Tooling added

| File | Purpose |
|------|---------|
| `experiments/primary-evaluation/data/scripts/renew-sample.py` | Main orchestrator |
| `experiments/dom-compression-analysis/data/pipline/snapshot_capture.py` | Shared headed Playwright recapture helper (extracted from `06-snapshot-pages.py`) |
| `experiments/primary-evaluation/data/scripts/report-edit-replay-comparison.py` | CSV comparing original vs replay successful edit counts |

`06-snapshot-pages.py` refactored to import `recapture_snapshot()` from `snapshot_capture.py` (behavior unchanged; writes to `raw-snapshots/` as before). Renew writes to **`snapshots/{id}/`** (final filtered store used by seed pipeline).

### `renew-sample.py` CLI

```bash
# Full fold
python3 experiments/primary-evaluation/data/scripts/renew-sample.py --sample our-2

# Single sample
python3 experiments/primary-evaluation/data/scripts/renew-sample.py --sample our-2/005

# Skip live re-capture (propagate existing snapshot HTML, replay, screenshot)
python3 experiments/primary-evaluation/data/scripts/renew-sample.py --sample our-2 --skip-recapture

# Skip edit/rule replay (agent variants get unmodified fresh HTML)
python3 experiments/primary-evaluation/data/scripts/renew-sample.py --sample our-2 --skip-replay

# Skip 45s headed-browser wait before each recapture
python3 experiments/primary-evaluation/data/scripts/renew-sample.py --sample our-2 --auto-capture

# Dry run
python3 experiments/primary-evaluation/data/scripts/renew-sample.py --sample our-2 --dry-run
```

Logs: `experiments/primary-evaluation/data/scripts/logs/{timestamp}-renew-sample-{sample-id}.log`

### Headed recapture wait

Default recapture uses **headed Chromium**. After cookie accept, the browser waits **45 seconds** (user can interact with CAPTCHA/consent in the window) instead of blocking on Enter — so the script works in non-interactive/agent terminals. `--auto-capture` skips that wait.

### Screenshot replay

Screenshots use plain `page.set_content(html)` (no route+goto). This is **much faster** than intercepting at `final-url` but **YouTube/ heavy SPAs may render blank** even with fresh HTML (same origin issue as patch experiment). Static/CSS-heavy pages (weather.com, Pinterest, etc.) render correctly with `set_content` after re-capture.

Brief experiment: route+goto at `final-url` fixed YouTube `our-2/005` screenshots (~800 KB PNGs vs ~6 KB blank), but was removed for speed on full-fold runs.

### Pilot validation

| Sample | Snapshot | Result |
|--------|----------|--------|
| **our-2/005** | 004 (YouTube) | Re-capture OK; replay partial (1/4 baseline edits); route+goto screenshots worked; `set_content` screenshots blank |
| **our-2/010** | 051 (Pinterest) | Non-YouTube spot-check target (user request) |
| **our-2/002** | 047 (weather.com) | Re-capture + `set_content` screenshots render correctly after full run |

Full `our-2` run was started but interrupted partway through; many samples were processed before interrupt.

### Edit replay failures

Investigation (see comparison CSV below) found two dominant causes:

1. **Replay includes failed agent retries** — `parse_edit_tool_calls()` replays every `edit` call from `agent.log`, not just those with `Successfully replaced` in the following TOOL RESULT. Failed retries from the original conversation are re-attempted and fail again (noise).

2. **DOM drift after live re-capture** — edits were made against the **old** snapshot HTML; renew copies **fresh** re-captured HTML into `work/raw.html` before replay. Dynamic sites (YouTube filter chips, news markup, page bootstrap) differ between captures, so `oldText` no longer matches.

Secondary causes: ambiguous `oldText` (e.g. `", "` → 70k matches), DOM map placeholder comments (`<!-- -N children -->`) in map-only edits.

**Rules pipelines** (`3-engine-only`, `5-full`, `6-full-sonnet`) re-apply `rules.json` via `set_update_rules.ts` and generally fare better on fresh DOM than text-match edits.

### Edit replay comparison CSV

```bash
python3 experiments/primary-evaluation/data/scripts/report-edit-replay-comparison.py --sample our-2
```

Output example: `experiments/primary-evaluation/data/scripts/logs/{timestamp}-edit-replay-comparison-our-2.csv`

Columns: `sample`, `pipeline`, `original_successful`, `original_failed`, `replay_successful`, `replay_failed`, `successful_delta`, `comparison`.

**our-2 summary (84 edit-pipeline rows = 42 × baseline + map-only):**

| `comparison` | Count | Meaning |
|--------------|-------|---------|
| `match` | 35 | Same number of successful edits original vs replay |
| `all_lost` | 38 | All originally successful edits failed on replay |
| `partial_loss` | 10 | Some edits replayed, some lost |
| `replay_more` | 1 | More replay successes than original (`our-2/002/2-baseline` — failed retries succeed on fresh DOM) |

Worst partial losses: `our-2/027/2-baseline` (10→0), `our-2/032/4-map-only` (10→0), `our-2/021/2-baseline` (13→7).

### Possible follow-ups (not implemented)

1. Filter replay to **successful edits only** (pair tool call with TOOL RESULT containing `Successfully replaced`).
2. Persist `successful-edits.json` at agent run time; renew replays that instead of full conversational log.
3. Re-capture for `1-original` only; replay mutations against **archived** seed `original/raw.html`.
4. Split renew reporting into `replay_skipped_retry`, `replay_dom_miss`, `replay_ambiguous`.

### Insights (renew approach)

1. **Re-capture fixes rotted CDN URLs** at the source — the right fix for expired asset URLs vs patching HTML in place.
2. **Text-match edit replay onto fresh DOM is brittle** — expect failures on dynamic sites; rules replay is more robust.
3. **Screenshot method still matters** — fresh HTML + `set_content` is not enough for YouTube; route+goto at `final-url` works but is slow at scale.
4. **Agent log is a poor replay artifact** — includes failed retries; filter or persist successful edits separately.
5. **`--skip-replay` + `--skip-recapture`** useful for incremental refresh (HTML only, or screenshots only).

