/**
 * Capture-time removal of subtrees that are invisible from computed CSS (body only).
 * Uses ownerDocument.defaultView.getComputedStyle — not inline attributes alone.
 */

const NODE_ELEMENT = 1
const NODE_TEXT = 3
const NODE_COMMENT = 8

const VOID_HTML = new Set([
	"area",
	"base",
	"br",
	"col",
	"embed",
	"hr",
	"img",
	"input",
	"link",
	"meta",
	"param",
	"source",
	"track",
	"wbr",
])

const RAW_TEXT_TAGS = new Set(["script", "style", "textarea", "title"])

function computedStyle(el: Element): CSSStyleDeclaration {
	const view = el.ownerDocument.defaultView
	if (!view) throw new Error("Element has no defaultView for getComputedStyle")
	return view.getComputedStyle(el)
}

function childElements(el: Element): Element[] {
	if (el.tagName === "TEMPLATE") {
		const t = el as HTMLTemplateElement
		return [...t.content.children]
	}
	return [...el.children]
}

/** True if any ancestor of `el` has computed display:none (not `el` itself). */
function hasDisplayNoneAncestor(el: Element): boolean {
	let p: Element | null = el.parentElement
	while (p) {
		if (computedStyle(p).display === "none") return true
		p = p.parentElement
	}
	return false
}

function computedOpacityIsZero(cs: CSSStyleDeclaration): boolean {
	const raw = cs.opacity?.trim() ?? ""
	if (raw === "") return false
	const n = Number.parseFloat(raw)
	return Number.isFinite(n) && n === 0
}

/** Walk body subtree; roots of maximal invisible subtrees end up in the set. */
export function markInvisibleStripRoots(body: HTMLElement): WeakSet<Element> {
	const stripRoots = new WeakSet<Element>()

	function visit(el: Element, inDisplayNoneSubtree: boolean): void {
		if (el === body) {
			for (const child of childElements(el)) {
				visit(child, hasDisplayNoneAncestor(child))
			}
			return
		}

		const cs = computedStyle(el)
		const inDisplayNone = inDisplayNoneSubtree || cs.display === "none"
		const strip =
			inDisplayNone || cs.visibility === "hidden" || computedOpacityIsZero(cs)

		if (strip) {
			stripRoots.add(el)
			return
		}

		for (const child of childElements(el)) {
			visit(child, inDisplayNone)
		}
	}

	visit(body, false)
	return stripRoots
}

function escapeAttr(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/"/g, "&quot;")
		.replace(/</g, "&lt;")
}

function escapeTextData(data: string): string {
	return data.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function escapeRawTextForElement(tag: string, content: string): string {
	const re = new RegExp(`</${tag}(?=(\\s|>|/))`, "gi")
	return content.replace(re, `<\\/${tag}`)
}

function serializeAttrs(el: Element): string {
	let s = ""
	for (const attr of [...el.attributes]) {
		if (attr.value === "") s += ` ${attr.name}`
		else s += ` ${attr.name}="${escapeAttr(attr.value)}"`
	}
	return s
}

function serializeOpenTagAttrs(el: Element): string {
	return serializeAttrs(el)
}

function serializeNode(node: Node, stripRoots: WeakSet<Element>): string {
	if (node.nodeType === NODE_TEXT) {
		const text = (node as Text).data
		const parent = node.parentElement
		if (parent && RAW_TEXT_TAGS.has(parent.tagName.toLowerCase())) {
			return text
		}
		return escapeTextData(text)
	}
	if (node.nodeType === NODE_COMMENT) {
		return `<!--${(node as Comment).data}-->`
	}
	if (node.nodeType === NODE_ELEMENT) {
		return serializeElementNode(node as Element, stripRoots)
	}
	return ""
}

function serializeChildNodes(
	parent: Node,
	stripRoots: WeakSet<Element>,
): string {
	let out = ""
	for (const child of parent.childNodes) {
		out += serializeNode(child, stripRoots)
	}
	return out
}

function serializeElementNode(
	el: Element,
	stripRoots: WeakSet<Element>,
): string {
	if (stripRoots.has(el)) return ""

	const tag = el.tagName.toLowerCase()
	const attrs = serializeAttrs(el)

	if (tag === "template") {
		const t = el as HTMLTemplateElement
		const inner = serializeChildNodes(t.content, stripRoots)
		return `<template${attrs}>${inner}</template>`
	}

	if (VOID_HTML.has(tag)) {
		return `<${tag}${attrs}>`
	}

	if (RAW_TEXT_TAGS.has(tag)) {
		let raw = ""
		for (const n of el.childNodes) {
			if (n.nodeType === NODE_TEXT) raw += (n as Text).data
			else if (n.nodeType === NODE_COMMENT) {
				raw += `<!--${(n as Comment).data}-->`
			} else if (n.nodeType === NODE_ELEMENT) {
				raw += serializeElementNode(n as Element, stripRoots)
			}
		}
		raw = escapeRawTextForElement(tag, raw)
		return `<${tag}${attrs}>${raw}</${tag}>`
	}

	return `<${tag}${attrs}>${serializeChildNodes(el, stripRoots)}</${tag}>`
}

/** Serializes body’s child nodes, dropping subtrees whose roots are in stripRoots. */
export function serializeBodyInnerHtml(
	body: HTMLElement,
	stripRoots: WeakSet<Element>,
): string {
	return serializeChildNodes(body, stripRoots)
}

/** Full document HTML (no doctype), head verbatim, body visibility-filtered. */
export function captureDocumentHtml(doc: Document): string {
	const htmlEl = doc.documentElement
	if (!htmlEl) return ""

	const body = doc.body
	if (!body) {
		return htmlEl.outerHTML
	}

	const stripRoots = markInvisibleStripRoots(body)
	const bodyInner = serializeBodyInnerHtml(body, stripRoots)
	const headHtml = doc.head?.outerHTML ?? ""
	const htmlAttrs = serializeOpenTagAttrs(htmlEl)
	const bodyAttrs = serializeOpenTagAttrs(body)

	return `<html${htmlAttrs}>${headHtml}<body${bodyAttrs}>${bodyInner}</body></html>`
}
