/** Capture-time removal of computed-style-invisible body subtrees. */

const NODE_ELEMENT = 1

function computedStyle(el: Element): CSSStyleDeclaration {
	const view = el.ownerDocument.defaultView
	if (!view) throw new Error("Element has no defaultView for getComputedStyle")
	return view.getComputedStyle(el)
}

function computedOpacityIsZero(cs: CSSStyleDeclaration): boolean {
	const raw = cs.opacity?.trim() ?? ""
	if (raw === "") return false
	const n = Number.parseFloat(raw)
	return Number.isFinite(n) && n === 0
}

function childNodePathFromRoot(root: Node, node: Node): number[] | null {
	const path: number[] = []
	let current: Node | null = node

	while (current && current !== root) {
		const parent: Node | null = current.parentNode
		if (!parent) return null
		path.push([...parent.childNodes].indexOf(current as ChildNode))
		current = parent
	}

	if (current !== root) return null
	return path.reverse()
}

function nodeAtChildNodePath(root: Node, path: number[]): Node | null {
	let current: Node | null = root

	for (const index of path) {
		current = current.childNodes[index] ?? null
		if (!current) return null
	}

	return current
}

function isElementNode(node: Node | null): node is Element {
	return node?.nodeType === NODE_ELEMENT
}

function hiddenStripRootPaths(doc: Document, body: HTMLElement): number[][] {
	const paths: number[][] = []
	const htmlEl = doc.documentElement

	function visit(el: Element, inDisplayNoneSubtree: boolean): void {
		const cs = computedStyle(el)
		const inDisplayNone = inDisplayNoneSubtree || cs.display === "none"
		const strip =
			inDisplayNone || cs.visibility === "hidden" || computedOpacityIsZero(cs)

		if (strip) {
			const path = childNodePathFromRoot(htmlEl, el)
			if (path) paths.push(path)
			return
		}

		for (const child of el.children) {
			visit(child, inDisplayNone)
		}
	}

	for (const child of body.children) {
		visit(child, false)
	}

	return paths
}

/** Full document HTML (no doctype), browser-serialized after visibility filtering. */
export function captureDocumentHtml(doc: Document): string {
	const htmlEl = doc.documentElement
	if (!htmlEl) return ""

	const body = doc.body
	if (!body) {
		return htmlEl.outerHTML
	}

	const clone = htmlEl.cloneNode(true) as Element
	const stripNodes = hiddenStripRootPaths(doc, body)
		.map((path) => nodeAtChildNodePath(clone, path))
		.filter(isElementNode)

	for (const node of stripNodes) {
		node.remove()
	}

	return clone.outerHTML
}
