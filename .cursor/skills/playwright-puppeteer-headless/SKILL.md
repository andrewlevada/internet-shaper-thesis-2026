---
name: playwright-puppeteer-headless
description: >
  Runs Playwright and puppeteer-core against Playwright-managed Chromium in this monorepo:
  install browsers from playground/, set PLAYWRIGHT_BROWSERS_PATH / CHROME_PATH, avoid Cursor
  sandbox spawn failures, and fix Deno vs pnpm cache mismatches. Use when launching headless
  Chromium, debugging “executable doesn’t exist”, Puppeteer launch failures, or agent shell
  browser automation in internet-shaper.
---

# Playwright and Puppeteer (headless Chromium)

## Where packages live

- Node deps: `playground/package.json` (`playwright`, `playwright-core`, `puppeteer-core`). Run Node scripts from `playground/` so imports resolve to `playground/node_modules`.
- Install browsers (needed once / after Playwright upgrades):

```bash
cd playground && pnpm run install-playwright-chromium
```

## Browser cache paths

- macOS default: `$HOME/Library/Caches/ms-playwright/`
- Linux default: `$HOME/.cache/ms-playwright/`

Export when tools fail to find browsers:

```bash
export PLAYWRIGHT_BROWSERS_PATH="$HOME/Library/Caches/ms-playwright"
```

Revision folder names change (e.g. `chromium-1217`). List the directory and pick the newest `chromium-*` that matches your Playwright version.

## Playwright (`playwright-core`)

- Typical launch: `chromium.launch({ headless: true })` after `playwright install chromium` from `playground/`.
- If resolution fails or points at the wrong architecture, pass `executablePath` explicitly to the **Google Chrome for Testing** binary inside the cache, e.g. macOS arm64:

```text
$PLAYWRIGHT_BROWSERS_PATH/chromium-<revision>/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing
```

## Puppeteer (`puppeteer-core`)

- **No bundled browser** — set `executablePath` (or env `CHROME_PATH` / `PUPPETEER_EXECUTABLE_PATH`) to Playwright’s Chrome for Testing path above, or to system Chrome/Chromium.
- In constrained environments, extra args sometimes help: `--no-sandbox`, `--disable-setuid-sandbox`.

## Deno + `npm:` imports

- Deno’s resolution for `npm:playwright-core` can differ from `pnpm` under `playground/`; `chromium.executablePath()` may point at a path that does not exist. Prefer **`CHROME_PATH`** (or `PUPPETEER_EXECUTABLE_PATH`) to a binary that passes `stat`.
- Full chrome-resolution order and commands: `playground/04-accessibility-tree-pruning/run.ts` header comments.

## Cursor agent / IDE shell

- Sandboxed agent terminals often **block or break spawning Chromium**, producing misleading errors (e.g. wrong arch subdirectory, “executable doesn’t exist”, Puppeteer `Code: null`).
- **Mitigation:** run the same command with full permissions, use the user’s external terminal, or rely on CI/local machine where browser subprocesses are allowed.

## Quick verification (Node, from `playground/`)

```bash
export PLAYWRIGHT_BROWSERS_PATH="$HOME/Library/Caches/ms-playwright"
node --input-type=module -e "
import { chromium } from 'playwright-core';
const b = await chromium.launch({ headless: true });
const p = await b.newPage();
await p.goto('https://example.com');
console.log(await p.title());
await b.close();
"
```

Replace with `puppeteer-core` + `executablePath` set to the Playwright **Google Chrome for Testing** path to verify Puppeteer.
