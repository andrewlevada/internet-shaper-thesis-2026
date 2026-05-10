/**
 * Mirrors playground `01-dom-cleaning`: strip non-structural markup before DOM compaction.
 */

function removeElements(html: string, selectors: string[]): string {
	const doc = new DOMParser().parseFromString(html, "text/html")
	for (const selector of selectors) {
		for (const el of doc.querySelectorAll(selector)) {
			el.remove()
		}
	}
	return doc.documentElement?.outerHTML ?? ""
}

function cleanSvgContents(html: string): string {
	const doc = new DOMParser().parseFromString(html, "text/html")
	for (const svg of doc.querySelectorAll("svg")) {
		const children = [...svg.children]
		for (const child of children) {
			if (child.tagName.toLowerCase() !== "title") {
				child.remove()
			}
		}
	}
	return doc.documentElement?.outerHTML ?? ""
}

function removeComments(html: string): string {
	return html.replace(/<!--[\s\S]*?-->/g, "")
}

function removeHiddenElements(html: string): string {
	const doc = new DOMParser().parseFromString(html, "text/html")
	for (const el of doc.querySelectorAll("[style]")) {
		const style = el.getAttribute("style") ?? ""
		if (style.includes("display:none") || style.includes("display: none")) {
			el.remove()
		}
	}
	return doc.documentElement?.outerHTML ?? ""
}

/**
 * Same ordered steps as playground `applyFullCleaning` (through `04-remove-comments`).
 */
export function applyFullCleaning(html: string): string {
	let out = html
	out = removeElements(out, ["head", "script", "link", "style", "noscript"])
	out = removeHiddenElements(out)
	out = cleanSvgContents(out)
	out = removeComments(out)
	return out
}
