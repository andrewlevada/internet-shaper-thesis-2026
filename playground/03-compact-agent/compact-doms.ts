#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env --allow-net

/**
 * Compacts raw HTML under `doms/`, writes `doms/compacted/*.html`, and logs
 * configuration + per-file metrics under `logs/<timestamp>-compact-doms.log`.
 */

import { load } from "https://deno.land/std@0.224.0/dotenv/mod.ts"
import { join } from "https://deno.land/std@0.224.0/path/mod.ts"
import { PLAYGROUND_LOG_MANUAL_NOTE_LINE } from "../log-manual-note.ts"
import {
	COMMON_CLASS_FREQUENCY_THRESHOLD,
	createDomMap,
} from "./dom-processing.ts"

await load({ export: true })

const SCRIPT_VERSION = "03-compact-agent/compact-doms/1"
const API_URL = "https://api.anthropic.com/v1/messages/count_tokens"
const MODEL = "claude-sonnet-4-6"

function logSection(lines: string[], title: string) {
	lines.push(title)
	lines.push("-".repeat(Math.min(title.length, 72)))
}

async function countTokens(content: string): Promise<number> {
	const apiKey = Deno.env.get("ANTHROPIC_API_KEY")
	if (!apiKey) throw new Error("ANTHROPIC_API_KEY required")

	const response = await fetch(API_URL, {
		method: "POST",
		headers: {
			"x-api-key": apiKey,
			"content-type": "application/json",
			"anthropic-version": "2023-06-01",
		},
		body: JSON.stringify({
			model: MODEL,
			messages: [{ role: "user", content }],
		}),
	})

	if (!response.ok) {
		throw new Error(`API error: ${response.status}`)
	}

	const data = await response.json()
	return data.input_tokens
}

const scriptDir = new URL(".", import.meta.url).pathname
const domsDir = join(scriptDir, "doms")
const outputDir = join(domsDir, "compacted")
const logsDir = join(scriptDir, "logs")
const timestamp = new Date().toISOString()
const fileTimestamp = timestamp.replace(/[:.]/g, "-")
const logPath = join(logsDir, `${fileTimestamp}-compact-doms.log`)
const logLines: string[] = []

await Deno.mkdir(outputDir, { recursive: true })
await Deno.mkdir(logsDir, { recursive: true })

logLines.push(PLAYGROUND_LOG_MANUAL_NOTE_LINE)
logLines.push("")
logSection(logLines, "DOM compaction run")
logLines.push(`timestamp (UTC): ${timestamp}`)
logLines.push(`script: ${SCRIPT_VERSION}`)
logLines.push(`token counter API: ${API_URL}`)
logLines.push(`token counter model: ${MODEL}`)
logLines.push(`input dir: doms/`)
logLines.push(`output dir: doms/compacted/`)
logLines.push(
	`common class threshold: count > elements × ${COMMON_CLASS_FREQUENCY_THRESHOLD} (strict >${COMMON_CLASS_FREQUENCY_THRESHOLD * 100}%)`,
)
logLines.push("")

console.log("Compacting DOMs...\n")

for await (const entry of Deno.readDir(domsDir)) {
	if (!entry.isFile && !entry.isSymlink) continue
	if (!entry.name.endsWith(".html")) continue

	const inputPath = join(domsDir, entry.name)
	const outputPath = join(outputDir, entry.name)

	const raw = await Deno.readTextFile(inputPath)
	const result = createDomMap(raw)

	await Deno.writeTextFile(outputPath, result.html)

	const [rawTokens, compactedTokens] = await Promise.all([
		countTokens(raw),
		countTokens(result.html),
	])

	const charReduction = ((1 - result.html.length / raw.length) * 100).toFixed(1)
	const tokenReduction = ((1 - compactedTokens / rawTokens) * 100).toFixed(1)

	logSection(logLines, entry.name)
	logLines.push(
		`Chars:  ${raw.length.toLocaleString()} -> ${result.html.length.toLocaleString()} (${charReduction}% reduction)`,
	)
	logLines.push(
		`Tokens: ${rawTokens.toLocaleString()} -> ${compactedTokens.toLocaleString()} (${tokenReduction}% reduction)`,
	)
	logLines.push(
		`${result.stats.collapsedWrappers} wrappers, ${result.stats.truncatedListItems} siblings, ${result.stats.removedClasses} classes`,
	)
	logLines.push("")

	console.log(`${entry.name}`)
	console.log(
		`  Chars:  ${raw.length.toLocaleString()} -> ${result.html.length.toLocaleString()} (${charReduction}% reduction)`,
	)
	console.log(
		`  Tokens: ${rawTokens.toLocaleString()} -> ${compactedTokens.toLocaleString()} (${tokenReduction}% reduction)`,
	)
	console.log(
		`  ${result.stats.collapsedWrappers} wrappers, ${result.stats.truncatedListItems} siblings, ${result.stats.removedClasses} classes`,
	)
	console.log()
}

logLines.push(`output: ${outputDir}`)
logLines.push(`log file: ${logPath}`)
await Deno.writeTextFile(logPath, logLines.join("\n"))

console.log(`Output: ${outputDir}`)
console.log(`\nLog: ${logPath}`)
