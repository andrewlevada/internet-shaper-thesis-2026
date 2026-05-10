/**
 * Ambient module for the deno_dom URL import used by playground scripts (Deno resolves
 * this at runtime; TypeScript uses this for editor and checker resolution).
 */
declare module "https://deno.land/x/deno_dom@v0.1.48/deno-dom-wasm.ts" {
	export const Node: {
		readonly TEXT_NODE: number
		readonly ELEMENT_NODE: number
		readonly DOCUMENT_NODE: number
		readonly COMMENT_NODE: number
	}

	export interface DomNode {
		nodeType: number
		textContent: string | null
	}

	export interface ChildNode extends DomNode {
		nextSibling: ChildNode | null
		remove(): void
	}

	export type NodeListOf<T extends Element> = ArrayLike<T> & Iterable<T>

	export interface Attr {
		readonly name: string
		readonly value: string
	}

	export interface Document {
		body: Element | null
		documentElement: Element | null
		querySelector(selectors: string): Element | null
		querySelectorAll(selectors: string): NodeListOf<Element>
		createComment(data: string): ChildNode
	}

	export interface Element extends ChildNode {
		tagName: string
		id: string
		className: string
		outerHTML: string
		attributes: Iterable<Attr>
		readonly children: NodeListOf<Element>
		childNodes: ArrayLike<ChildNode> & Iterable<ChildNode>
		firstChild: ChildNode | null
		ownerDocument: Document | null
		removeAttribute(name: string): void
		getAttribute(qualifiedName: string): string | null
		setAttribute(qualifiedName: string, value: string): void
		hasAttribute(qualifiedName: string): boolean
		appendChild<T extends DomNode>(node: T): T
		insertBefore<T extends DomNode>(node: T, child: DomNode | null): T
	}

	export class DOMParser {
		parseFromString(source: string, mimeType: string): Document
	}
}
