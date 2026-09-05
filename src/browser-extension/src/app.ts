import "./lit-trusted-types-shim.ts"
import { overlay } from "fiber-extension"
import { applyRules } from "./agent/rules-engine.ts"
import {
	createOverlayTemplate,
	refreshElementCounts,
	refreshSavedRules,
	savedRules,
	setView,
	shouldOpenRulesOnLoad,
} from "./ui/index.ts"

async function main() {
	console.log("Internet Shaper loaded")

	await refreshSavedRules()
	if (savedRules.value.length > 0) {
		await applyRules(savedRules.value)
		const enabledCount = savedRules.value.filter(
			(r) => r.enabled !== false,
		).length
		console.log(`Applied ${enabledCount} saved rules`)
	}

	const templateFactory = (root: ShadowRoot) => createOverlayTemplate(root)

	// Set up toggle listener
	overlay.showOnAction(templateFactory)

	// Auto-open rules list if returning from delete/toggle
	if (shouldOpenRulesOnLoad()) {
		await refreshElementCounts()
		setView("rules")
		overlay.show(templateFactory)
	}
}

main()
