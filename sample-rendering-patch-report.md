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

