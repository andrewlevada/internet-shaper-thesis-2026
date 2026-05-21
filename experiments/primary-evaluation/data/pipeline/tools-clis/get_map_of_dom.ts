#!/usr/bin/env -S deno run -A

import { DOMParser } from "linkedom"
import { parseFlags } from "./lib/parse-flags.ts"

function usage(): never {
	console.error(`Usage:
  deno run -A get_map_of_dom.ts --snapshot <path-to-html>

Reads snapshot HTML from disk and prints the same compact DOM map as the browser-extension agent tool.`)
	Deno.exit(1)
}

const NODE_TEXT = 3
const NODE_ELEMENT = 1

const COMMON_CLASS_FREQUENCY_THRESHOLD = 0.05

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

function isDataAttribute(name: string): boolean {
	return name.startsWith("data-")
}

function getClassName(element: Element): string {
	const cn = element.className
	if (typeof cn === "string") return cn
	if (cn && typeof cn === "object" && "baseVal" in cn) {
		return (cn as SVGAnimatedString).baseVal
	}
	return ""
}

function setClassName(element: Element, value: string): void {
	const cn = element.className
	if (typeof cn === "string") {
		element.className = value
	} else if (cn && typeof cn === "object" && "baseVal" in cn) {
		;(cn as SVGAnimatedString).baseVal = value
	}
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
	return new Set(getClassName(element).split(/\s+/).filter(Boolean))
}

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
		tags.push(child.tagName.toLowerCase())
	}
	return tags
}

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

function childTagSequencesMatchForSiblings(a: string[], b: string[]): boolean {
	const maxLen = Math.max(a.length, b.length)
	const dist = levenshteinSequences(a, b)
	if (maxLen <= 3) return dist === 0
	if (maxLen <= 8) return dist <= 1
	if (maxLen <= 15) return dist <= 2
	return dist <= 3
}

function siblingsMatchForTruncation(a: Element, b: Element): boolean {
	const tagA = a.tagName.toLowerCase()
	const tagB = b.tagName.toLowerCase()
	if (tagA !== tagB) return false
	if ((a.id || "") !== (b.id || "")) return false
	if (!classTokensMatchForSiblings(getClassTokens(a), getClassTokens(b))) {
		return false
	}
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
		const cn = getClassName(el)
		if (cn) {
			for (const cls of cn.split(/\s+/).filter(Boolean)) {
				counts.set(cls, (counts.get(cls) || 0) + 1)
			}
		}
		for (const child of el.children) {
			walk(child)
		}
	}

	walk(element)
	return counts
}

function countElements(element: Element): number {
	let count = 1
	for (const child of element.children) {
		count += countElements(child)
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
		const cn = getClassName(el)
		if (cn) {
			const remaining = cn
				.split(/\s+/)
				.filter((cls) => cls && !toRemove.has(cls))
				.join(" ")
			setClassName(el, remaining)
		}
		for (const child of el.children) {
			walk(child)
		}
	}

	walk(element)
	return toRemove
}

function hasSignificantText(element: Element): boolean {
	return [...element.childNodes]
		.filter((n) => n.nodeType === NODE_TEXT)
		.some((n) => n.textContent?.trim())
}

function collapseChain(element: Element, doc: Document): number {
	const chain: Element[] = []
	let current = element

	while (current.children.length === 1) {
		const child = current.children[0]
		if (child.children.length === 0) break
		if (hasSignificantText(current)) break
		chain.push(child)
		current = child
	}

	if (chain.length === 0) return 0

	const deepest = chain[chain.length - 1]
	const finalContent = [...deepest.childNodes]

	const wrappersClasses = new Set<string>()
	const wrappersAttributes = new Map<string, string>()

	for (const wrapper of chain) {
		for (const attr of wrapper.attributes) {
			if (attr.name === "class") {
				const parentClasses = getClassName(element).split(/\s+/).filter(Boolean)
				const wrapperClasses = getClassName(wrapper)
					.split(/\s+/)
					.filter(Boolean)

				const filtered = wrapperClasses.filter(
					(cls) => !parentClasses.includes(cls),
				)
				for (const cls of filtered) wrappersClasses.add(cls)
			} else if (!element.hasAttribute(attr.name)) {
				wrappersAttributes.set(attr.name, attr.value)
			}
		}
	}

	chain[0].remove()

	for (const node of finalContent) {
		element.appendChild(node)
	}

	let commentText = ` -${chain.length} wrappers `

	if (wrappersClasses.size > 0) {
		commentText += ` class="${[...wrappersClasses].join(" ")}"`
	}
	if (wrappersAttributes.size > 0) {
		commentText += ` ${[...wrappersAttributes.entries()].map(([name, value]) => `${name}="${value}"`).join(" ")}`
	}

	const comment = doc.createComment(commentText)
	element.insertBefore(comment, element.firstChild)

	return chain.length
}

function collapseSingleChildChains(element: Element, doc: Document): number {
	let collapsedCount = 0

	collapsedCount += collapseChain(element, doc)

	for (const child of [...element.children]) {
		collapsedCount += collapseSingleChildChains(child, doc)
	}

	return collapsedCount
}

function truncateSiblingLists(element: Element, doc: Document): number {
	let truncatedItems = 0

	const children = [...element.children]
	let i = 0

	while (i < children.length) {
		const child = children[i]
		let groupEnd = i + 1

		while (groupEnd < children.length) {
			const sibling = children[groupEnd]
			if (!siblingsMatchForTruncation(child, sibling)) break
			groupEnd++
		}

		const groupSize = groupEnd - i
		if (groupSize >= 3) {
			for (let j = i + 1; j < groupEnd; j++) {
				children[j].remove()
				truncatedItems++
			}

			const comment = doc.createComment(` -${groupSize - 1} siblings `)
			if (child.nextSibling) {
				element.insertBefore(comment, child.nextSibling)
			} else {
				element.appendChild(comment)
			}
		}

		i = groupEnd
	}

	for (const child of [...element.children]) {
		truncatedItems += truncateSiblingLists(child, doc)
	}

	return truncatedItems
}

function filterAllAttributes(element: Element): void {
	filterAttributes(element)
	for (const child of element.children) {
		filterAllAttributes(child)
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
		removeEmptyAttributes(child)
	}
}

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
			if (child.nodeType === NODE_TEXT) {
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
			if (child.nodeType === NODE_ELEMENT) {
				walk(child as Element)
			}
		}
	}
	walk(root)
}

function normalizeHtmlWhitespace(html: string): string {
	const toParse =
		/^\s*<body[\s>]/i.test(html) && !/<html[\s>]/i.test(html)
			? `<!DOCTYPE html><html>${html}</html>`
			: html
	const doc = new DOMParser().parseFromString(toParse, "text/html")
	const body = doc.body
	if (!body) return html
	normalizeElementSubtree(body)
	return body.outerHTML
}

interface MapResult {
	html: string
	stats: {
		collapsedWrappers: number
		truncatedListItems: number
		removedClasses: number
	}
}

function createDomMap(html: string): MapResult {
	const parser = new DOMParser()
	const doc = parser.parseFromString(html, "text/html")
	if (!doc?.body) {
		throw new Error("Failed to parse HTML")
	}

	const body = doc.body

	filterAllAttributes(body)
	const removedClasses = removeHighFrequencyClasses(
		body,
		COMMON_CLASS_FREQUENCY_THRESHOLD,
	)
	const collapsedWrappers = collapseSingleChildChains(
		body,
		doc as unknown as Document,
	)
	const truncatedListItems = truncateSiblingLists(
		body,
		doc as unknown as Document,
	)
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

function applyFullCleaning(html: string): string {
	let out = html
	out = removeElements(out, ["head", "script", "link", "style", "noscript"])
	out = cleanSvgContents(out)
	out = removeComments(out)
	return out
}

function buildDomMapToolText(rawHtml: string): string {
	const cleaned = applyFullCleaning(rawHtml)
	const mapResult = createDomMap(cleaned)
	const compactHtml = normalizeHtmlWhitespace(mapResult.html)
	return `${compactHtml}\n\n<!-- Stats: ${mapResult.stats.collapsedWrappers} wrappers collapsed, ${mapResult.stats.truncatedListItems} list items truncated -->`
}

function main(): void {
	const flags = parseFlags(Deno.args)
	const snapshot = flags.get("snapshot")
	if (!snapshot) usage()

	let rawHtml: string
	try {
		rawHtml = Deno.readTextFileSync(snapshot)
	} catch (e) {
		console.error(String(e))
		Deno.exit(1)
	}

	let mapText: string
	try {
		mapText = buildDomMapToolText(rawHtml)
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e)
		console.error(msg)
		Deno.exit(1)
	}

	console.log(mapText)
}

main()
