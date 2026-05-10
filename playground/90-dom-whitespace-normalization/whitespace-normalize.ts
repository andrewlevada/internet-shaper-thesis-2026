/**
 * HTML whitespace normalization for pipeline preprocessing: parse markup,
 * drop whitespace-only text nodes outside raw-text contexts, collapse runs
 * of whitespace in remaining text nodes (pre/script/style/textarea unchanged).
 */
import {
	DOMParser,
	type Element,
	Node,
} from "https://deno.land/x/deno_dom@v0.1.48/deno-dom-wasm.ts"

const RAW_ANCESTOR_TAGS = new Set(["script", "style", "pre", "textarea"])

function hasRawTextAncestor(el: Element | null): boolean {
	let p: Element | null = el

	while (p) {
		if (RAW_ANCESTOR_TAGS.has(p.tagName.toLowerCase())) return true
		p = p.parentElement
	}

	return false
}

function normalizeElementSubtree(root: Element): void {
	const walk = (el: Element) => {
		const children = [...el.childNodes]

		for (const child of children) {
			if (child.nodeType === Node.TEXT_NODE) {
				if (hasRawTextAncestor(child.parentElement)) continue
				const raw = child.textContent ?? ""

				if (/^\s*$/.test(raw)) {
					child.parentNode?.removeChild(child)
					continue
				}

				const collapsed = raw.replace(/\s+/g, " ")
				if (collapsed !== raw) child.textContent = collapsed
				continue
			}

			if (child.nodeType === Node.ELEMENT_NODE) {
				walk(child as Element)
			}
		}
	}

	walk(root)
}

/**
 * Parses `html` as `text/html` and returns `document.body.outerHTML` after
 * whitespace normalization. Input is treated as a body fragment (same shape
 * as compacted samples in playground `03`).
 */
export function normalizeHtmlWhitespace(html: string): string {
	const doc = new DOMParser().parseFromString(html, "text/html")
	const body = doc.body
	if (!body) return html

	normalizeElementSubtree(body)
	return body.outerHTML
}
