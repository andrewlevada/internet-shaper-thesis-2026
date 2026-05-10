#!/usr/bin/env -S deno run --allow-read --allow-write

/**
 * Reads compacted DOM samples via symlinks under `inputs/`, normalizes
 * insignificant whitespace (see `whitespace-normalize.ts`), writes paired
 * outputs under `output/from-03` and `output/from-04`, and logs configuration +
 * per-file metrics under `logs/`.
 */

import { join } from "https://deno.land/std@0.224.0/path/mod.ts"
import { PLAYGROUND_LOG_MANUAL_NOTE_LINE } from "../log-manual-note.ts"
import { normalizeHtmlWhitespace } from "./whitespace-normalize.ts"

const SCRIPT_VERSION = "05-dom-whitespace-normalization/1"

interface InputSource {
	id: string
	symlinkName: string
	outputSubdir: string
}

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

function logSection(lines: string[], title: string) {
	lines.push(title)
	lines.push("-".repeat(Math.min(title.length, 72)))
}

async function resolveSymlinkTarget(
	scriptDir: string,
	name: string,
): Promise<string> {
	const linkPath = join(scriptDir, "inputs", name)
	const real = await Deno.realPath(linkPath)
	return real
}

async function main() {
	const scriptDir = new URL(".", import.meta.url).pathname
	const logsDir = join(scriptDir, "logs")
	const timestamp = new Date().toISOString()
	const fileTimestamp = timestamp.replace(/[:.]/g, "-")
	const logPath = join(logsDir, `${fileTimestamp}-whitespace-normalize.log`)
	const logLines: string[] = []

	await Deno.mkdir(logsDir, { recursive: true })

	logLines.push(PLAYGROUND_LOG_MANUAL_NOTE_LINE)
	logLines.push("")
	logSection(logLines, "DOM whitespace normalization run")
	logLines.push(`timestamp (UTC): ${timestamp}`)
	logLines.push(`script: ${SCRIPT_VERSION}`)
	logLines.push(
		`normalizer: parse as text/html; drop whitespace-only text nodes outside script/style/pre/textarea; collapse whitespace runs in other text nodes`,
	)
	logLines.push("")

	for (const src of SOURCES) {
		const inputDir = join(scriptDir, "inputs", src.symlinkName)
		const outputDir = join(scriptDir, "output", src.outputSubdir)
		await Deno.mkdir(outputDir, { recursive: true })

		let resolvedInput: string
		try {
			resolvedInput = await resolveSymlinkTarget(scriptDir, src.symlinkName)
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e)
			logLines.push(
				`ERROR: could not resolve inputs/${src.symlinkName} -> ${src.id}`,
			)
			logLines.push(`  ${msg}`)
			logLines.push("")
			console.error(`Skip ${src.id}: ${msg}`)
			continue
		}

		logSection(logLines, `source: ${src.id}`)
		logLines.push(`input symlink: inputs/${src.symlinkName}`)
		logLines.push(`resolved path: ${resolvedInput}`)
		logLines.push(`output dir: output/${src.outputSubdir}`)
		logLines.push("")

		let fileCount = 0
		for await (const entry of Deno.readDir(inputDir)) {
			if (!entry.isFile && !entry.isSymlink) continue
			if (!entry.name.endsWith(".html")) continue

			fileCount++
			const inputPath = join(inputDir, entry.name)
			const raw = await Deno.readTextFile(inputPath)
			const normalized = normalizeHtmlWhitespace(raw)
			await Deno.writeTextFile(join(outputDir, entry.name), normalized)

			const reduction =
				raw.length === 0
					? "0.0"
					: ((1 - normalized.length / raw.length) * 100).toFixed(1)
			const line = `${entry.name}: chars ${raw.length} -> ${normalized.length} (${reduction}% smaller)`
			logLines.push(line)
			console.log(`[${src.outputSubdir}] ${line}`)
		}

		if (fileCount === 0) {
			logLines.push("(no .html files in input dir)")
		}
		logLines.push("")
	}

	logLines.push(`log file: ${logPath}`)
	await Deno.writeTextFile(logPath, logLines.join("\n"))
	console.log(`\nLog: ${logPath}`)
}

main()
