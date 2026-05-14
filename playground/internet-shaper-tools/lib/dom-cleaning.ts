import { DOMParser } from "linkedom"

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

/** Strips non-structural markup; subtree hiding uses computed styles in live capture only. */
export function applyFullCleaning(html: string): string {
	let out = html
	out = removeElements(out, ["head", "script", "link", "style", "noscript"])
	out = cleanSvgContents(out)
	out = removeComments(out)
	return out
}
