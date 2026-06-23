#!/usr/bin/env -S deno run -A
/**
 * CLI analogue of agent tool `show_in_dom`: extract subtree HTML by selector from a snapshot file.
 */

import { DOMParser } from "linkedom"
import { parseFlags } from "./lib/parse-flags.ts"

/** Default `depth` when omitted (matches browser-extension SHOW_IN_DOM_DEFAULT_DEPTH). */
const SHOW_IN_DOM_DEFAULT_DEPTH = 3

function usage(): never {
	console.error(`Usage:
  deno run -A show_in_dom.ts --snapshot <path-to-html> --query-selector <css> [--depth <n>]

Default depth is ${SHOW_IN_DOM_DEFAULT_DEPTH} (element levels below the matched node).`)
	Deno.exit(1)
}

function pruneShowInDomDepth(el: Element, remaining: number): void {
	const doc = el.ownerDocument
	if (!doc) throw new Error("pruneShowInDomDepth: missing ownerDocument")

	if (remaining <= 0) {
		const elementChildren = [...el.children]
		const n = elementChildren.length
		for (const c of elementChildren) el.removeChild(c)
		if (n > 0) {
			el.appendChild(doc.createComment(` -${n} children `))
		}
		return
	}
	for (const child of [...el.children]) {
		pruneShowInDomDepth(child, remaining - 1)
	}
}

function extractElement(html: string, selector: string, depth: number): string {
	if (!Number.isFinite(depth) || !Number.isInteger(depth) || depth < 0) {
		throw new Error("extractElement: depth must be a non-negative integer")
	}

	const parser = new DOMParser()
	const doc = parser.parseFromString(html, "text/html")
	if (!doc) {
		throw new Error("Failed to parse HTML")
	}

	const element = doc.querySelector(selector)
	if (!element) {
		return `No element found matching selector: ${selector}`
	}

	const clone = element.cloneNode(true) as Element
	pruneShowInDomDepth(clone, depth)
	return clone.outerHTML
}

function main(): void {
	const flags = parseFlags(Deno.args)
	const snapshot = flags.get("snapshot")
	const querySelector = flags.get("query-selector")
	const depthRaw = flags.get("depth")
	if (!snapshot || !querySelector) usage()

	let depth = SHOW_IN_DOM_DEFAULT_DEPTH
	if (depthRaw !== undefined) {
		const n = Number.parseInt(depthRaw, 10)
		if (!Number.isFinite(n) || n < 0) {
			console.error("--depth must be a non-negative integer")
			Deno.exit(1)
		}
		depth = n
	}

	let rawHtml: string
	try {
		rawHtml = Deno.readTextFileSync(snapshot)
	} catch (e) {
		console.error(String(e))
		Deno.exit(1)
	}

	let result: string
	try {
		result = extractElement(rawHtml, querySelector, depth)
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e)
		console.error(msg)
		Deno.exit(1)
	}

	console.log(result)
}

main()
