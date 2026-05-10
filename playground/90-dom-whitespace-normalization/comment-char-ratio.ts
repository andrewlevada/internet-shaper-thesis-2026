#!/usr/bin/env -S deno run --allow-read --allow-write

/**
 * Measures how much of each normalized HTML file (under `output/`) consists of
 * `<!-- ... -->` comment regions. Writes reproducibility logs under `logs/metrics/`.
 */

import { basename, join } from "https://deno.land/std@0.224.0/path/mod.ts"
import { PLAYGROUND_LOG_MANUAL_NOTE_LINE } from "../log-manual-note.ts"

const SCRIPT_VERSION = "05-dom-whitespace-normalization/comment-char-ratio/1"

interface InputSource {
	id: string
	symlinkName: string
	outputSubdir: string
}

/** Mirrors `run.ts` — same output dirs analyzed post-whitespace-normalization. */
const SOURCES: InputSource[] = [
	{
		id: "03-compact-agent/doms/compacted",
		symlinkName: "from-03-compacted",
		outputSubdir: "from-03",
	},
	{
		id: "04-accessibility-tree-pruning/output/compacted",
		symlinkName: "from-04-compacted",
		outputSubdir: "from-04",
	},
]

/** Length of all non-overlapping `<!-- ... -->` spans (including delimiters). */
export function countHtmlCommentChars(html: string): number {
	let total = 0
	let i = 0
	while (i < html.length) {
		const start = html.indexOf("<!--", i)
		if (start === -1) break
		const end = html.indexOf("-->", start + 4)
		if (end === -1) break
		total += end + 3 - start
		i = end + 3
	}
	return total
}

function logSection(lines: string[], title: string) {
	lines.push(title)
	lines.push("-".repeat(Math.min(title.length, 72)))
}

async function main() {
	const scriptDir = new URL(".", import.meta.url).pathname
	const scriptName = basename(new URL(import.meta.url).pathname)
	const cliTail = Deno.args.length > 0 ? ` ${Deno.args.join(" ")}` : ""

	const metricsDir = join(scriptDir, "logs", "metrics")
	const timestamp = new Date().toISOString()
	const fileTimestamp = timestamp.replace(/[:.]/g, "-")
	const logPath = join(metricsDir, `${fileTimestamp}-comment-char-ratio.log`)
	const logLines: string[] = []

	await Deno.mkdir(metricsDir, { recursive: true })

	logLines.push(PLAYGROUND_LOG_MANUAL_NOTE_LINE)
	logLines.push("")
	logSection(logLines, "HTML comment character ratio (post step 05 output)")
	logLines.push(`timestamp (UTC): ${timestamp}`)
	logLines.push(`script: ${SCRIPT_VERSION}`)
	logLines.push(
		`reproduce: deno run --allow-read --allow-write ./${scriptName}${cliTail}`,
	)
	logLines.push(
		`metric: sum(length of <!-- ... --> spans) / total file length (characters)`,
	)
	logLines.push("")

	for (const src of SOURCES) {
		const outputDir = join(scriptDir, "output", src.outputSubdir)

		logSection(logLines, `artifact dir: output/${src.outputSubdir}`)
		logLines.push(`upstream source id: ${src.id}`)
		logLines.push(`path: ${outputDir}`)
		logLines.push("")

		let fileCount = 0
		try {
			for await (const entry of Deno.readDir(outputDir)) {
				if (!entry.isFile) continue
				if (!entry.name.endsWith(".html")) continue

				fileCount++
				const filePath = join(outputDir, entry.name)
				const html = await Deno.readTextFile(filePath)
				const commentChars = countHtmlCommentChars(html)
				const totalChars = html.length
				const pct = totalChars === 0 ? 0 : (commentChars / totalChars) * 100
				const pctStr = pct.toFixed(2)

				const line = `${entry.name}: comments ${commentChars} chars / ${totalChars} total (${pctStr}%)`
				logLines.push(line)
				console.log(`[${src.outputSubdir}] ${line}`)
			}
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e)
			logLines.push(`ERROR reading output dir: ${msg}`)
			console.error(`Skip output/${src.outputSubdir}: ${msg}`)
		}

		if (fileCount === 0) {
			logLines.push("(no .html files in output dir)")
		}
		logLines.push("")
	}

	logLines.push(`log file: ${logPath}`)
	await Deno.writeTextFile(logPath, logLines.join("\n"))
	console.log(`\nLog: ${logPath}`)
}

main()
