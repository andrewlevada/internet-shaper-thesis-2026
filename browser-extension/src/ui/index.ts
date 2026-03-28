import { renderMain } from "./constructor-overlay.ts";
import { renderRules } from "./rules-list.ts";
import {
  loadRules,
  refreshElementCounts,
  setView,
  shouldOpenRulesOnLoad,
  view,
} from "./store.ts";

// Re-export public API
export { loadRules, refreshElementCounts, setView, shouldOpenRulesOnLoad };

export function createOverlayTemplate(renderRoot: HTMLElement | ShadowRoot) {
  const renderMainView = (root: HTMLElement | ShadowRoot) =>
    renderMain(root, renderRulesView);
  const renderRulesView = (root: HTMLElement | ShadowRoot) =>
    renderRules(root, renderMainView);

  return view.value === "rules"
    ? renderRulesView(renderRoot)
    : renderMainView(renderRoot);
}
