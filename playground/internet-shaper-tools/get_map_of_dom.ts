#!/usr/bin/env -S deno run -A
/**
 * CLI analogue of agent tool `get_map_of_dom`: compact DOM map from a snapshot HTML file.
 */

import { buildDomMapToolText } from "./lib/dom-map-output.ts"
import { appendRunLog } from "./lib/run-log.ts"

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
  deno run -A get_map_of_dom.ts --snapshot <path-to-html>

Reads snapshot HTML from disk and prints the same compact DOM map as the browser-extension agent tool.`)
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

	let mapText: string
	let stats: {
		collapsedWrappers: number
		truncatedListItems: number
		removedClasses: number
	}
	let cleanedCharCount: number
	try {
		;({ mapText, stats, cleanedCharCount } = buildDomMapToolText(rawHtml))
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e)
		appendRunLog({
			tool: "get_map_of_dom",
			config: { snapshot },
			outputChars: 0,
			error: msg,
		})
		console.error(msg)
		Deno.exit(1)
	}

	console.log(mapText)

	const logHref = appendRunLog({
		tool: "get_map_of_dom",
		config: { snapshot, stats, cleanedCharCount },
		outputChars: mapText.length,
		outputPreview: mapText,
	})
	console.error(`Run log: ${logHref}`)
}

main()
