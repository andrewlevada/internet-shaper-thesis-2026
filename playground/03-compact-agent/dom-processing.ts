import {
	DOMParser,
	type Element,
	Node,
} from "https://deno.land/x/deno_dom@v0.1.48/deno-dom-wasm.ts"

const ALLOWED_ATTRIBUTES = new Set([
	"alt",
	"aria-label",
	"class",
	"id",
	"label",
	"name",
	"placeholder",
	"role",
	"title",
	"type",
	"value",
])

/** Strip class tokens whose occurrence count is strictly greater than this fraction of all elements. */
export const COMMON_CLASS_FREQUENCY_THRESHOLD = 0.05

function isDataAttribute(name: string): boolean {
	return name.startsWith("data-")
}

function filterAttributes(element: Element): void {
	const toRemove: string[] = []
	for (const attr of element.attributes) {
		if (!ALLOWED_ATTRIBUTES.has(attr.name) && !isDataAttribute(attr.name)) {
			toRemove.push(attr.name)
		}
	}
	for (const name of toRemove) {
		element.removeAttribute(name)
	}
}

function getClassTokens(element: Element): Set<string> {
	return new Set(element.className.split(/\s+/).filter(Boolean))
}

/** Symmetric difference size |A Δ B| for class token sets. */
function classTokenSymmetricDifferenceSize(
	a: Set<string>,
	b: Set<string>,
): number {
	let n = 0
	for (const t of a) {
		if (!b.has(t)) n++
	}
	for (const t of b) {
		if (!a.has(t)) n++
	}
	return n
}

/**
 * Class bag similarity: strict for few classes, then allow growing token mismatch budget.
 * - max 1–2 classes on either side: sets must match exactly.
 * - 3–9: symmetric difference ≤ 2 (tolerates one extra / one mismatch pair).
 * - 10+: symmetric difference ≤ 3.
 */
function classTokensMatchForSiblings(a: Set<string>, b: Set<string>): boolean {
	const maxLen = Math.max(a.size, b.size)
	const sym = classTokenSymmetricDifferenceSize(a, b)
	if (maxLen <= 2) return sym === 0
	if (maxLen <= 9) return sym <= 2
	return sym <= 3
}

function getImmediateChildTags(element: Element): string[] {
	const tags: string[] = []
	for (const child of element.children) {
		tags.push((child as Element).tagName.toLowerCase())
	}
	return tags
}

/** Levenshtein edit distance on ordered tag sequences. */
function levenshteinSequences(a: string[], b: string[]): number {
	const m = a.length
	const n = b.length
	if (m === 0) return n
	if (n === 0) return m
	const row = new Array<number>(n + 1)
	for (let j = 0; j <= n; j++) row[j] = j
	for (let i = 1; i <= m; i++) {
		let prev = row[0]
		row[0] = i
		for (let j = 1; j <= n; j++) {
			const tmp = row[j]
			const cost = a[i - 1] === b[j - 1] ? 0 : 1
			row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost)
			prev = tmp
		}
	}
	return row[n]
}

/**
 * Immediate child tag structures match within an edit-distance budget tied to sequence length.
 */
function childTagSequencesMatchForSiblings(a: string[], b: string[]): boolean {
	const maxLen = Math.max(a.length, b.length)
	const dist = levenshteinSequences(a, b)
	if (maxLen <= 3) return dist === 0
	if (maxLen <= 8) return dist <= 1
	if (maxLen <= 15) return dist <= 2
	return dist <= 3
}

/**
 * Consecutive list items are "the same shape" for truncation when tag+id match exactly,
 * class tokens pass tiered bag similarity, and immediate child tag order is within edit distance.
 */
function siblingsMatchForTruncation(a: Element, b: Element): boolean {
	const tagA = a.tagName.toLowerCase()
	const tagB = b.tagName.toLowerCase()
	if (tagA !== tagB) return false
	if ((a.id || "") !== (b.id || "")) return false
	if (!classTokensMatchForSiblings(getClassTokens(a), getClassTokens(b)))
		return false
	if (
		!childTagSequencesMatchForSiblings(
			getImmediateChildTags(a),
			getImmediateChildTags(b),
		)
	) {
		return false
	}
	return true
}

function countAllClasses(element: Element): Map<string, number> {
	const counts = new Map<string, number>()

	function walk(el: Element) {
		for (const cls of el.className.split(/\s+/).filter(Boolean)) {
			counts.set(cls, (counts.get(cls) || 0) + 1)
		}
		for (const child of el.children) {
			walk(child as Element)
		}
	}

	walk(element)
	return counts
}

function countElements(element: Element): number {
	let count = 1
	for (const child of element.children) {
		count += countElements(child as Element)
	}
	return count
}

function removeHighFrequencyClasses(
	element: Element,
	threshold: number,
): Set<string> {
	const classCounts = countAllClasses(element)
	const totalElements = countElements(element)
	const cutoff = totalElements * threshold

	const toRemove = new Set<string>()
	for (const [cls, count] of classCounts) {
		if (count > cutoff) {
			toRemove.add(cls)
		}
	}

	function walk(el: Element) {
		if (el.className) {
			const remaining = el.className
				.split(/\s+/)
				.filter((cls) => cls && !toRemove.has(cls))
				.join(" ")
			el.className = remaining
		}
		for (const child of el.children) {
			walk(child as Element)
		}
	}

	walk(element)
	return toRemove
}

function hasSignificantText(element: Element): boolean {
	return [...element.childNodes]
		.filter((n) => n.nodeType === Node.TEXT_NODE)
		.some((n) => n.textContent?.trim())
}

function collapseChain(element: Element): number {
	// Find the entire collapsible chain starting from this element's single child
	const chain: Element[] = []
	let current = element

	while (current.children.length === 1) {
		const child = current.children[0] as Element
		// Stop if child is a leaf node
		if (child.children.length === 0) break
		// Stop if there's significant text content
		if (hasSignificantText(current)) break
		chain.push(child)
		current = child
	}

	if (chain.length === 0) return 0

	// Get the final element (deepest in chain)
	const deepest = chain[chain.length - 1]
	const finalContent = [...deepest.childNodes]

	// Merge all attributes from the chain into the parent
	for (const wrapper of chain) {
		for (const attr of wrapper.attributes) {
			if (attr.name === "class") {
				const parentClasses = element.className.split(/\s+/).filter(Boolean)
				const wrapperClasses = wrapper.className.split(/\s+/).filter(Boolean)
				const merged = [...new Set([...parentClasses, ...wrapperClasses])]
				element.className = merged.join(" ")
			} else if (!element.hasAttribute(attr.name)) {
				element.setAttribute(attr.name, attr.value)
			}
		}
	}

	// Remove the first child (which contains the whole chain)
	chain[0].remove()

	// Add the final content to parent
	for (const node of finalContent) {
		element.appendChild(node)
	}

	// Add comment
	const comment = element.ownerDocument?.createComment(
		` -${chain.length} wrappers `,
	)
	if (comment) {
		element.insertBefore(comment, element.firstChild)
	}

	return chain.length
}

function collapseSingleChildChains(element: Element): number {
	let collapsedCount = 0

	// First, try to collapse chain starting from this element
	collapsedCount += collapseChain(element)

	// Then process all children (which may now be different after collapsing)
	for (const child of [...element.children]) {
		collapsedCount += collapseSingleChildChains(child as Element)
	}

	return collapsedCount
}

function truncateSiblingLists(element: Element): number {
	let truncatedItems = 0

	const children = [...element.children]
	let i = 0

	while (i < children.length) {
		const child = children[i] as Element
		let groupEnd = i + 1

		while (groupEnd < children.length) {
			const sibling = children[groupEnd] as Element
			if (!siblingsMatchForTruncation(child, sibling)) break
			groupEnd++
		}

		const groupSize = groupEnd - i
		if (groupSize >= 3) {
			// Remove all but first, add comment
			for (let j = i + 1; j < groupEnd; j++) {
				children[j].remove()
				truncatedItems++
			}

			// Add comment after the first element
			const comment = element.ownerDocument?.createComment(
				` -${groupSize - 1} siblings `,
			)
			if (comment && child.nextSibling) {
				element.insertBefore(comment, child.nextSibling)
			} else if (comment) {
				element.appendChild(comment)
			}
		}

		i = groupEnd
	}

	// Recurse into remaining children
	for (const child of [...element.children]) {
		truncatedItems += truncateSiblingLists(child as Element)
	}

	return truncatedItems
}

function filterAllAttributes(element: Element): void {
	filterAttributes(element)
	for (const child of element.children) {
		filterAllAttributes(child as Element)
	}
}

function removeEmptyAttributes(element: Element): void {
	const toRemove: string[] = []
	for (const attr of element.attributes) {
		if (!attr.value.trim()) {
			toRemove.push(attr.name)
		}
	}
	for (const name of toRemove) {
		element.removeAttribute(name)
	}
	for (const child of element.children) {
		removeEmptyAttributes(child as Element)
	}
}

export interface MapResult {
	html: string
	stats: {
		collapsedWrappers: number
		truncatedListItems: number
		removedClasses: number
	}
}

export function createDomMap(html: string): MapResult {
	const doc = new DOMParser().parseFromString(html, "text/html")
	if (!doc?.body) {
		throw new Error("Failed to parse HTML")
	}

	const body = doc.body as Element

	// Step 1: Filter attributes
	filterAllAttributes(body)

	// Step 2: Remove high-frequency classes
	const removedClasses = removeHighFrequencyClasses(
		body,
		COMMON_CLASS_FREQUENCY_THRESHOLD,
	)

	// Step 3: Collapse single-child chains
	const collapsedWrappers = collapseSingleChildChains(body)

	// Step 4: Truncate sibling lists
	const truncatedListItems = truncateSiblingLists(body)

	// Step 5: Remove empty attributes
	removeEmptyAttributes(body)

	return {
		html: body.outerHTML,
		stats: {
			collapsedWrappers,
			truncatedListItems,
			removedClasses: removedClasses.size,
		},
	}
}

export function extractElement(
	html: string,
	selector: string,
	includeChildren: boolean,
): string {
	const doc = new DOMParser().parseFromString(html, "text/html")
	if (!doc) {
		throw new Error("Failed to parse HTML")
	}

	const element = doc.querySelector(selector)
	if (!element) {
		return `No element found matching selector: ${selector}`
	}

	if (includeChildren) {
		return (element as Element).outerHTML
	}

	// Return just the opening tag and direct text content
	const el = element as Element
	const tagName = el.tagName.toLowerCase()
	const attrs = [...el.attributes]
		.map((a) => `${a.name}="${a.value}"`)
		.join(" ")
	const openTag = attrs ? `<${tagName} ${attrs}>` : `<${tagName}>`

	const directText = [...el.childNodes]
		.filter((n) => n.nodeType === Node.TEXT_NODE)
		.map((n) => n.textContent?.trim())
		.filter(Boolean)
		.join(" ")

	const childSummary =
		el.children.length > 0
			? `<!-- ${el.children.length} child elements -->`
			: ""

	return `${openTag}${directText}${childSummary}</${tagName}>`
}
