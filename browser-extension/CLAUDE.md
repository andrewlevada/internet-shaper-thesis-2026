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

## Trusted Types & CSP Bypass

Sites like YouTube enforce strict Content Security Policy (CSP) and Trusted Types,
which block `eval()`, `new Function()`, inline scripts, and dynamic script URLs.

To execute dynamic rule logic on these sites, we use a two-layer approach:

1. **CSP bypass**: `chrome.scripting.executeScript` with `world: "MAIN"` injects
   code directly into the page's main world, bypassing CSP restrictions for the
   initial function.

2. **Trusted Types bypass**: Inside the injected function, we create a Trusted
   Types policy named "fiber-extension" that permits `createScript`. This allows
   using `eval(trustedScript)` to execute dynamic rule logic.

```typescript
// Fiber creates the policy automatically in executeInMainWorld
// In the browser extension, rule logic uses it like this:
const createFn = (logic: string) => {
  const code = `(function(element) { ${logic} })`;
  if (w.__fiberTTPolicy) {
    const trusted = w.__fiberTTPolicy.createScript(code);
    return (0, eval)(trusted);
  }
  return (0, eval)(code); // Fallback for sites without Trusted Types
};
```

Content scripts run in an isolated world exempt from page CSP/Trusted Types, but
any scripts they inject into the DOM are subject to page restrictions. That's why
we use `chrome.scripting.executeScript` from the background script instead.

## Best Practices

- Use Lit's `css` template for styles instead of inline styles
- Run `deno check` and `deno lint --fix` after making changes (without pnpm exec)
