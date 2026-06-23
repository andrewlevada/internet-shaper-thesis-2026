#!/usr/bin/env -S deno run -A
/**
 * Round-trip HTML through linkedom's DOMParser so stored snapshots match
 * show_in_dom / get_dom / get_map_of_dom serialization (e.g. void elements),
 * and strip HTML comment nodes.
 */

import { DOMParser } from "linkedom"
import { parseFlags } from "../pipeline/tools-clis/lib/parse-flags.ts"

function usage(): never {
	console.error(`Usage:
  deno run -A reserialize_html.ts [--input <path-to-html>]

Reads HTML from --input or stdin and prints linkedom-reserialized HTML.`)
	Deno.exit(1)
}

const COMMENT_NODE = 8

function removeCommentNodes(node: Node): void {
	for (const child of [...node.childNodes]) {
		if (child.nodeType === COMMENT_NODE) {
			child.remove()
		} else {
			removeCommentNodes(child)
		}
	}
}

function reserializeHtml(html: string): string {
	const doc = new DOMParser().parseFromString(html, "text/html")
	if (!doc?.documentElement) {
		throw new Error("Failed to parse HTML")
	}

	removeCommentNodes(doc)

	const doctype = doc.doctype
	const prefix = doctype ? `<!DOCTYPE ${doctype.name}>\n\n` : ""
	return `${prefix}${doc.documentElement.outerHTML}`
}

function readStdin(): string {
	const chunks: Uint8Array[] = []
	const buf = new Uint8Array(65536)
	while (true) {
		const n = Deno.stdin.readSync(buf)
		if (n === null) break
		if (n === 0) continue
		chunks.push(buf.slice(0, n))
	}

	const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
	const out = new Uint8Array(total)
	let offset = 0
	for (const chunk of chunks) {
		out.set(chunk, offset)
		offset += chunk.length
	}
	return new TextDecoder().decode(out)
}

function main(): void {
	const flags = parseFlags(Deno.args)
	const inputPath = flags.get("input")

	let html: string
	if (inputPath) {
		try {
			html = Deno.readTextFileSync(inputPath)
		} catch (e) {
			console.error(String(e))
			Deno.exit(1)
		}
	} else if (!Deno.stdin.isTerminal()) {
		html = readStdin()
	} else {
		usage()
	}

	let result: string
	try {
		result = reserializeHtml(html)
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e)
		console.error(msg)
		Deno.exit(1)
	}

	console.log(result)
}

main()
