# Thesis Paper

## Typst

Sources live in [`doc/`](doc/). Install the [Typst CLI](https://github.com/typst/typst) (`brew install typst`, etc.), then from this folder:

```bash
pnpm compile    # one-shot PDF
pnpm watch      # recompile on save → doc/main.pdf
```

Direct invocation:

```bash
cd doc && typst compile main.typ main.pdf --font-path .
```

The template expects **Liberation Serif**. If the compiler warns about it, install Liberation fonts (for example `brew install --cask font-liberation`) or rely on Typst’s fallback.

## md-to-typst

Converts a Markdown file to Typst format.

```bash
deno run --allow-read --allow-write md-to-typst.ts <input.md> [output.typ]
```

