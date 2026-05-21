#!/usr/bin/env -S deno run -A

import { parseFlags } from "./lib/parse-flags.ts"

/** Matches browser-extension gateway cap (gateway-limits.ts). */
const MAX_TOOL_OUTPUT_CHARS = 96_000

const TRUNCATION_SUFFIX =
	"\n\n<!-- truncated: tool output capped; use show_in_dom or smaller edits for full detail -->"

function usage(): never {
	console.error(`Usage:
  deno run -A get_dom.ts --snapshot <path-to-html>

Reads snapshot HTML from disk and prints its contents (truncated when very large).`)
	Deno.exit(1)
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

	if (rawHtml.length <= MAX_TOOL_OUTPUT_CHARS) {
		console.log(rawHtml)
		return
	}

	console.log(rawHtml.slice(0, MAX_TOOL_OUTPUT_CHARS) + TRUNCATION_SUFFIX)
}

main()
