import { renderMain } from "./pages/index.ts"
import { renderRules } from "./pages/rules.ts"
import {
	loadRules,
	refreshElementCounts,
	refreshSavedRules,
	savedRules,
	setView,
	shouldOpenRulesOnLoad,
	view,
} from "./store.ts"

// Re-export public API
export {
	loadRules,
	refreshElementCounts,
	refreshSavedRules,
	savedRules,
	setView,
	shouldOpenRulesOnLoad,
}

export function createOverlayTemplate(renderRoot: HTMLElement | ShadowRoot) {
	const renderMainView = (root: HTMLElement | ShadowRoot) =>
		renderMain(root, renderRulesView)
	const renderRulesView = (root: HTMLElement | ShadowRoot) =>
		renderRules(root, renderMainView)

	return view.value === "rules"
		? renderRulesView(renderRoot)
		: renderMainView(renderRoot)
}
