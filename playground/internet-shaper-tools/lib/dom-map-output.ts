import { applyFullCleaning } from "./dom-cleaning.ts"
import {
	createDomMap,
	type MapResult,
	normalizeHtmlWhitespace,
} from "./dom-processing.ts"

/** Builds the same compact DOM map string the agent exposes via `get_map_of_dom` (before gateway capping). */
export function buildDomMapToolText(rawHtml: string): {
	mapText: string
	stats: MapResult["stats"]
	cleanedCharCount: number
} {
	const cleaned = applyFullCleaning(rawHtml)
	const mapResult = createDomMap(cleaned)
	const compactHtml = normalizeHtmlWhitespace(mapResult.html)
	const mapText = `${compactHtml}\n\n<!-- Stats: ${mapResult.stats.collapsedWrappers} wrappers collapsed, ${mapResult.stats.truncatedListItems} list items truncated -->`
	return {
		mapText,
		stats: mapResult.stats,
		cleanedCharCount: cleaned.length,
	}
}
