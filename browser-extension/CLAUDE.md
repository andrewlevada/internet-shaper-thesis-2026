# Internet Shaper Browser Extension

## Fiber

This chrome extension is built with [fiber-extension](../fiber/README.md)
framework. It is not yet published on npm — we are using a local version.

```bash
cd browser-extension
pnpm dev    # Dev mode with HMR
pnpm build  # Production build
```

You may adjust, fix and improve fiber while developing this extension. After
changing it's code rebuild to see updates.

## Reactive UI with Signals

Chrome content scripts block `customElements` (it's null in the isolated world), so we
can't use LitElement's `@customElement` decorator or `customElements.define()`.

Instead, we use **@lit-labs/preact-signals** with standalone lit-html:

```typescript
import { html as litHtml, render } from "lit";
import { signal, computed, withWatch } from "@lit-labs/preact-signals";

// Wrap html tag to auto-watch signals
const html = withWatch(litHtml);

// Reactive state
const status = signal("");
const isLoading = signal(false);
const buttonText = computed(() => isLoading.value ? "..." : "Run");

// Template - signals auto-update via withWatch
function renderUI(root: ShadowRoot) {
  return html`
    <span>${status}</span>
    <button ?disabled=${isLoading}>${buttonText}</button>
  `;
}

// Update state, DOM updates automatically
status.value = "Loading...";
```

Key points:
- Use `signal()` for reactive state (replaces `@state()`)
- Use `computed()` for derived values
- Wrap `html` with `withWatch()` to auto-watch signals in templates
- Import both `signal` and `computed` from `@lit-labs/preact-signals` (same package)
- Render with `render(template, shadowRoot)` from lit

## Best Practices

- Use Lit's `css` template for styles instead of inline styles
- Run `deno check` and `deno lint --fix` after making changes (without pnpm exec)
