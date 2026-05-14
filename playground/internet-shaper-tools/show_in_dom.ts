#!/usr/bin/env -S deno run -A
/**
 * CLI analogue of agent tool `show_in_dom`: extract subtree HTML by selector from a snapshot file.
 */

import { extractElement } from "./lib/dom-processing.ts"
import { appendRunLog } from "./lib/run-log.ts"

/** Default `depth` when omitted (matches browser-extension SHOW_IN_DOM_DEFAULT_DEPTH). */
const SHOW_IN_DOM_DEFAULT_DEPTH = 3

function parseFlags(argv: string[]): Map<string, string> {
	const m = new Map<string, string>()
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i]
		if (!arg.startsWith("--")) continue
		const key = arg.slice(2)
		const next = argv[i + 1]
		if (next && !next.startsWith("--")) {
			m.set(key, next)
			i++
		} else {
			m.set(key, "true")
		}
	}
	return m
}

function usage(): never {
	console.error(`Usage:
  deno run -A show_in_dom.ts --snapshot <path-to-html> --query-selector <css> [--depth <n>]

Default depth is ${SHOW_IN_DOM_DEFAULT_DEPTH} (element levels below the matched node).`)
	Deno.exit(1)
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
		appendRunLog({
			tool: "show_in_dom",
			config: { snapshot, query_selector: querySelector, depth },
			outputChars: 0,
			error: msg,
		})
		console.error(msg)
		Deno.exit(1)
	}

	console.log(result)

	const logHref = appendRunLog({
		tool: "show_in_dom",
		config: { snapshot, query_selector: querySelector, depth },
		outputChars: result.length,
		outputPreview: result,
	})
	console.error(`Run log: ${logHref}`)
}

main()
