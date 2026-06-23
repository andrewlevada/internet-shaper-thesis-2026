# AGENTS.md

## Cursor Cloud specific instructions

Internet Shaper is a pnpm + Deno monorepo (see `CLAUDE.md` and each package's
`CLAUDE.md` for stack details and canonical commands). The runnable products are
the **browser-extension** and the **web-app**; the Python `data/pipeline` is
research tooling (heavy torch/GPU + LLM, not provisioned here).

### Installing dependencies (non-obvious)

`pnpm install` runs a root `prepare` script (`lefthook install`) that **fails**
in Cursor because the environment manages git `core.hooksPath`. The dependency
postinstalls themselves (esbuild, sharp) succeed, so install with scripts off
and rebuild only the native packages:

```bash
pnpm install --ignore-scripts
pnpm rebuild esbuild sharp
```

The global pnpm setting `verify-deps-before-run=false` is configured so that
`pnpm dev` / `pnpm build` do not auto-trigger that failing install. Lefthook git
hooks are intentionally not installed (Cursor owns the hooks path).

### browser-extension (main product)

- Built on the sibling `fiber` repo via `fiber-extension: link:../../fiber`;
  `fiber` must be built (`dist/`) first — see `../fiber/AGENTS.md`.
- `pnpm dev` (Vite + fiber live-reload) writes a loadable extension to
  `dist/`; load that folder via `chrome://extensions` (Developer mode → Load
  unpacked). `pnpm build` is the production build. In `dev`/serve mode the icon
  plugin logs an `emitFile() not supported` warning and skips icon generation —
  benign; icons are produced by `pnpm build`.
- The page-adaptation agent needs an LLM key entered through the overlay's
  "API Key" button (Anthropic, or a Vercel AI Gateway key per the model). The
  overlay UI, live DOM-context measurement, and "Save DOM snap" (DOM
  capture/cleaning pipeline) work without a key.
- Lint/format per `CLAUDE.md`: run `deno check` and `deno lint --fix` in
  `browser-extension`; repo-wide formatting/linting is Biome via `pnpm check`.

### web-app (evaluation tool, separate product)

- `pnpm dev` (Next.js, Turbopack) serves on `http://localhost:3000`. It is a
  client-only tool with no backend/DB; the home page expects a `.zip` archive of
  evaluation samples to proceed past the upload screen.
