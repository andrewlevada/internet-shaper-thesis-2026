---
name: lit-signals-standalone
description: >
  Use always when working on the browser extension for critical context on the codebase's stack
---

# Standalone lit-html with Preact Signals

This skill covers the specific setup where you use `@lit-labs/preact-signals` with standalone `lit-html` (no LitElement). This is common in Chrome extension content scripts where `customElements` is null in the isolated world.

## The Core Problem

With LitElement, you'd use the `SignalWatcher` mixin which automatically triggers re-renders when signals change. But without LitElement, there's no component lifecycle to trigger updates.

The `withWatch` wrapper from `@lit-labs/preact-signals` tracks signal accesses in templates, but it does NOT automatically re-render. It only sets up the tracking - something else must call `render()` again.

## The Pattern

### Setup
```typescript
import { html as litHtml, render } from "lit";
import { signal, computed, withWatch } from "@lit-labs/preact-signals";

// Wrap html to track signal accesses
const html = withWatch(litHtml);

// Create signals
const count = signal(0);
const doubled = computed(() => count.value * 2);
```

### Reading signals in templates
Access `.value` directly in template expressions:
```typescript
function renderCounter(root: HTMLElement) {
  return html`<p>Count: ${count.value}, Doubled: ${doubled.value}</p>`;
}
```

### The Re-render Problem
This WON'T auto-update when `count` changes:
```typescript
count.value = 5; // DOM stays stale
```

### Solution: Manual Re-render
Pass a rerender callback to event handlers:
```typescript
function renderCounter(root: HTMLElement) {
  const rerender = () => render(renderCounter(root), root);

  return html`
    <p>Count: ${count.value}</p>
    <button @click=${() => { count.value++; rerender(); }}>
      Increment
    </button>
  `;
}
```

### For Handlers in Separate Functions
When handlers are defined outside the render function, create a factory that receives the rerender callback:
```typescript
function createHandlers(rerender: () => void) {
  return {
    onIncrement: () => {
      count.value++;
      rerender();
    },
    onDecrement: () => {
      count.value--;
      rerender();
    }
  };
}

function renderCounter(root: HTMLElement) {
  const rerender = () => render(renderCounter(root), root);
  const handlers = createHandlers(rerender);

  return html`
    <button @click=${handlers.onDecrement}>-</button>
    <span>${count.value}</span>
    <button @click=${handlers.onIncrement}>+</button>
  `;
}
```

## Common Pitfalls

### 1. Pre-computed signal values don't trigger updates
Bad - value is captured at call time:
```typescript
function renderItem(value: string | undefined) {
  // value is already resolved, template can't track the signal
  return html`${value !== undefined ? html`<span>${value}</span>` : null}`;
}

// Called like:
renderItem(mySignal.value[index]) // Won't update when signal changes
```

Good - pass the signal, access .value in template:
```typescript
function renderItem(mySignal: Signal<Record<number, string>>, index: number) {
  return html`
    ${mySignal.value[index] !== undefined
      ? html`<span>${mySignal.value[index]}</span>`
      : null}
  `;
}
```

### 2. Forgetting to rerender after signal mutation
Any code path that mutates a signal and expects DOM updates must call rerender:
```typescript
// Bad
function handleClick() {
  mySignal.value = newValue;
  // DOM is now stale
}

// Good
function handleClick(rerender: () => void) {
  mySignal.value = newValue;
  rerender();
}
```

### 3. Signals in .map() callbacks
When mapping over arrays and using signals, the signal access happens during the map execution. Pass signals to child render functions rather than pre-resolving:
```typescript
// Correct pattern
items.map((item, i) => renderChild(item, i, mySignal, callbacks))

// Inside renderChild, access mySignal.value[i] in the template
```

## When You Don't Need Manual Rerender

If the signal change is followed by a page reload or navigation, you don't need to rerender:
```typescript
function handleDelete(index: number) {
  deleteFromStorage(index);
  location.reload(); // No rerender needed
}
```

## Quick Checklist

When signal changes don't reflect in DOM:
1. Is `withWatch(litHtml)` being used for the `html` tag?
2. Is `.value` accessed inside the template (not pre-computed)?
3. Is `rerender()` called after mutating the signal?
4. For child components: is the signal passed through, not its resolved value?
