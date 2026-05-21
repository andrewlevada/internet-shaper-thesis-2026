#!/usr/bin/env -S deno run -A

import { parseFlags } from "./lib/parse-flags.ts"

const BLOCK_RE =
	/<<<<<<< SEARCH\r?\n([\s\S]*?)\r?\n=======\r?\n([\s\S]*?)\r?\n>>>>>>> REPLACE/g

interface HunkResult {
	index: number
	applied: boolean
	reason?: string
}

function applySearchReplaceBlocks(
	source: string,
	patchText: string,
): { text: string; results: HunkResult[] } {
	const matches = [...patchText.matchAll(BLOCK_RE)]
	if (matches.length === 0) {
		throw new Error("No SEARCH/REPLACE blocks found in patch")
	}

	let text = source
	const results: HunkResult[] = []

	for (const [index, match] of matches.entries()) {
		const search = match[1]
		const replace = match[2]
		const first = text.indexOf(search)
		if (first === -1) {
			results.push({
				index: index + 1,
				applied: false,
				reason: "SEARCH text not found (exact match required)",
			})
			continue
		}
		const second = text.indexOf(search, first + search.length)
		if (second !== -1) {
			results.push({
				index: index + 1,
				applied: false,
				reason: "SEARCH text is ambiguous (matched more than once)",
			})
			continue
		}
		text = text.slice(0, first) + replace + text.slice(first + search.length)
		results.push({ index: index + 1, applied: true })
	}

	return { text, results }
}

function summarize(results: HunkResult[]): string {
	const applied = results.filter((r) => r.applied).length
	const failed = results.filter((r) => !r.applied)
	const lines = [`Applied ${applied}/${results.length} hunks.`]
	for (const fail of failed) {
		lines.push(`  hunk ${fail.index}: failed — ${fail.reason}`)
	}
	return lines.join("\n")
}

function main(): void {
	const flags = parseFlags(Deno.args)
	const snapshot = flags.get("snapshot")
	const patchPath = flags.get("patch")
	const output = flags.get("output")
	if (!snapshot || !patchPath || !output) return

	let source: string
	let patchText: string
	try {
		source = Deno.readTextFileSync(snapshot)
		patchText = Deno.readTextFileSync(patchPath)
	} catch (e) {
		console.error(String(e))
		Deno.exit(1)
	}

	let updated: string
	let results: HunkResult[]
	try {
		;({ text: updated, results } = applySearchReplaceBlocks(source, patchText))
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e)
		console.error(msg)
		Deno.exit(1)
	}

	try {
		Deno.writeTextFileSync(output, updated)
	} catch (e) {
		console.error(String(e))
		Deno.exit(1)
	}

	console.log(summarize(results))
	const allApplied = results.every((r) => r.applied)
	if (!allApplied) {
		Deno.exit(2)
	}
}

main()
