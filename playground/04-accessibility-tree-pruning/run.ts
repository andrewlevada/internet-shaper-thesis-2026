#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env --allow-net --allow-run --allow-sys
/**
 * Accessibility-tree–guided DOM pruning prototype.
 *
 * Loads each `doms/*.html` in headless Chrome, unwraps elements whose
 * `backendNodeId` does not appear in `Accessibility.getFullAXTree`, then runs
 * the same compaction as playground/03 (`createDomMap`).
 *
 * Chrome resolution (first match wins):
 *   PUPPETEER_EXECUTABLE_PATH or CHROME_PATH (must exist on disk)
 *   Common install paths (macOS/Linux) and `command -v` for
 *   google-chrome-stable, google-chrome, chromium
 *   Playwright’s downloaded Chromium (Fiber-style e2e): `chromium.executablePath()`
 *   from `playwright-core` after `pnpm exec playwright install chromium` in `playground/`
 *   Else Puppeteer `channel: chrome` (Google Chrome.app only)
 *
 * Deno: `--allow-read --allow-write --allow-env --allow-net --allow-run --allow-sys`
 * (`allow-run` for Chrome subprocess; `allow-sys` needed for spawning on some platforms.)
 *
 * Requires: ANTHROPIC_API_KEY for token counts (same API as 03 compact-doms).
 */

import { load } from "https://deno.land/std@0.224.0/dotenv/mod.ts"
import { join, toFileUrl } from "https://deno.land/std@0.224.0/path/mod.ts"
import type { CDPSession } from "npm:puppeteer-core"
import puppeteer from "npm:puppeteer-core"

import {
	COMMON_CLASS_FREQUENCY_THRESHOLD,
	createDomMap,
} from "../03-compact-agent/dom-processing.ts"
import { PLAYGROUND_LOG_MANUAL_NOTE_LINE } from "../log-manual-note.ts"

async function loadEnvFromCommonLocations(): Promise<void> {
	const scriptDir = new URL(".", import.meta.url).pathname
	const candidates = [
		join(scriptDir, ".env"),
		join(scriptDir, "../.env"),
		join(scriptDir, "../../.env"),
	]
	for (const envPath of candidates) {
		try {
			await Deno.stat(envPath)
			await load({ export: true, envPath })
		} catch {
			// missing or unreadable
		}
	}
}

const API_URL = "https://api.anthropic.com/v1/messages/count_tokens"
const MODEL = "claude-sonnet-4-6"

const SKIP_UNWRAP_TAGS = new Set(["html", "head", "body"])

/** Minimal shape of DOM nodes returned over CDP. */
interface CdpDomNode {
	nodeId: number
	nodeType: number
	nodeName?: string
	localName?: string
	backendNodeId?: number
	/** When this node is a shadow root: do not mutate user-agent subtrees (CDP forbids it). */
	shadowRootType?: "user-agent" | "closed" | "open"
	children?: CdpDomNode[]
	shadowRoots?: CdpDomNode[]
	parentId?: number
}

type ChromeResolution =
	| { kind: "executablePath"; path: string }
	| { kind: "channel"; channel: "chrome" }

async function pathExists(path: string): Promise<boolean> {
	try {
		await Deno.stat(path)
		return true
	} catch {
		return false
	}
}

async function resolveCommandPath(cmd: string): Promise<string | undefined> {
	try {
		const isWin = Deno.build.os === "windows"
		const command = new Deno.Command(isWin ? "cmd" : "sh", {
			args: isWin
				? ["/d", "/s", "/c", `where ${cmd}`]
				: ["-c", `command -v ${cmd}`],
			stdout: "piped",
			stderr: "null",
		})
		const { code, stdout } = await command.output()
		if (code !== 0) return undefined
		const line = new TextDecoder()
			.decode(stdout)
			.trim()
			.split(/\r?\n/)[0]
			?.trim()
		return line || undefined
	} catch {
		return undefined
	}
}

/** Playwright-downloaded Chromium (same idea as Fiber `e2e/fixtures.ts`), usable as CDP host for puppeteer-core. */
async function tryPlaywrightChromiumExecutable(): Promise<string | undefined> {
	try {
		const { chromium } = await import("npm:playwright-core")
		const p = chromium.executablePath()
		if (p && (await pathExists(p))) return p
	} catch {
		/* not installed or `playwright install chromium` never run */
	}
	return undefined
}

/** Resolves a Chrome/Chromium binary, or falls back to Puppeteer’s Google Chrome channel. */
async function resolveChromeForPuppeteer(): Promise<ChromeResolution> {
	const fromEnv =
		Deno.env.get("PUPPETEER_EXECUTABLE_PATH")?.trim() ||
		Deno.env.get("CHROME_PATH")?.trim()
	if (fromEnv) {
		if (!(await pathExists(fromEnv))) {
			throw new Error(`Chrome binary not found at ${fromEnv}`)
		}
		return { kind: "executablePath", path: fromEnv }
	}

	const candidates = [
		"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
		"/Applications/Chromium.app/Contents/MacOS/Chromium",
		"/usr/bin/google-chrome-stable",
		"/usr/bin/google-chrome",
		"/usr/bin/chromium",
		"/usr/bin/chromium-browser",
		"/snap/bin/chromium",
	]
	for (const p of candidates) {
		if (await pathExists(p)) return { kind: "executablePath", path: p }
	}

	for (const name of [
		"google-chrome-stable",
		"google-chrome",
		"chromium",
		"chromium-browser",
	]) {
		const found = await resolveCommandPath(name)
		if (found && (await pathExists(found))) {
			return { kind: "executablePath", path: found }
		}
	}

	const playwrightChromium = await tryPlaywrightChromiumExecutable()
	if (playwrightChromium) {
		return { kind: "executablePath", path: playwrightChromium }
	}

	return { kind: "channel", channel: "chrome" }
}

function chromeResolutionLabel(r: ChromeResolution): string {
	return r.kind === "executablePath"
		? r.path
		: `channel:${r.channel} (system discovery)`
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
		throw new Error(`Token API error: ${response.status}`)
	}

	const data = (await response.json()) as { input_tokens: number }
	return data.input_tokens
}

function findDescendantBody(root: CdpDomNode): CdpDomNode | null {
	const nameOf = (n: CdpDomNode) =>
		(n.localName ?? n.nodeName ?? "").replace(/^#/, "").toLowerCase()
	if (root.nodeType === 1 && nameOf(root) === "body") return root
	for (const c of root.children ?? []) {
		const f = findDescendantBody(c as CdpDomNode)
		if (f) return f
	}
	for (const s of root.shadowRoots ?? []) {
		const sr = s as CdpDomNode
		if (sr.shadowRootType === "user-agent") continue
		const f = findDescendantBody(sr)
		if (f) return f
	}
	return null
}

/** Group key: shared parent for siblings; isolates nodes with no known parent. */
function pruneGroupKey(
	parentId: number | undefined,
	nodeId: number,
): number | string {
	return parentId !== undefined ? parentId : `orphan:${nodeId}`
}

interface PruneOperation {
	seq: number
	nodeId: number
	parentId: number | undefined
	childIds: number[]
	commentOuterHtml: string | null
}

/**
 * Snapshot nodes to unwrap/remove before any mutation, assign at most one
 * visibility comment per DOM parent container: `<!-- -N elements -->`.
 */
async function collectPruneOperations(
	client: CDPSession,
	root: CdpDomNode | undefined,
	axBackendIds: Set<number>,
): Promise<PruneOperation[]> {
	const staged: Array<{
		seq: number
		nodeId: number
		parentId: number | undefined
		childIds: number[]
		groupKey: number | string
	}> = []

	let seq = 0

	async function visitPostOrder(
		node: CdpDomNode,
		treeParent: CdpDomNode | null,
	) {
		for (const child of node.children ?? []) {
			await visitPostOrder(child as CdpDomNode, node)
		}
		for (const sr of node.shadowRoots ?? []) {
			const shadow = sr as CdpDomNode
			if (shadow.shadowRootType === "user-agent") continue
			await visitPostOrder(shadow, node)
		}

		if (node.nodeType !== 1) return
		const local =
			node.localName?.toLowerCase() ??
			node.nodeName?.replace(/^#/, "").toLowerCase() ??
			""
		if (SKIP_UNWRAP_TAGS.has(local)) return
		const bid = node.backendNodeId
		if (bid === undefined) return
		if (axBackendIds.has(bid)) return

		const { node: fresh } = await client.send("DOM.describeNode", {
			nodeId: node.nodeId,
			depth: 1,
		})
		const f = fresh as CdpDomNode
		const childIds = (f.children ?? []).map((c) => c.nodeId)
		const parentId = f.parentId

		if (childIds.length > 0 && parentId === undefined) return

		const groupKey = pruneGroupKey(treeParent?.nodeId, node.nodeId)
		staged.push({
			seq: seq++,
			nodeId: node.nodeId,
			parentId,
			childIds,
			groupKey,
		})
	}

	if (root) await visitPostOrder(root as CdpDomNode, null)

	const byParent = new Map<number | string, typeof staged>()
	for (const s of staged) {
		const k = s.groupKey
		let g = byParent.get(k)
		if (!g) {
			g = []
			byParent.set(k, g)
		}
		g.push(s)
	}

	const commentForGroup = (
		items: typeof staged,
	): { anchorSeq: number; text: string } => {
		const anchor = items.reduce((a, b) => (a.seq < b.seq ? a : b))
		const n = items.length
		const text = `<!-- -${n} elements -->`
		return { anchorSeq: anchor.seq, text }
	}

	const anchorComment = new Map<number, string>()
	for (const items of byParent.values()) {
		const { anchorSeq, text } = commentForGroup(items)
		anchorComment.set(anchorSeq, text)
	}

	return staged.map((s) => ({
		seq: s.seq,
		nodeId: s.nodeId,
		parentId: s.parentId,
		childIds: s.childIds,
		commentOuterHtml: anchorComment.get(s.seq) ?? null,
	}))
}

async function applyPruneOperations(
	client: CDPSession,
	operations: PruneOperation[],
): Promise<number> {
	let count = 0
	for (const op of operations) {
		const { nodeId, childIds, parentId, commentOuterHtml } = op
		if (childIds.length === 0) {
			if (commentOuterHtml) {
				await client.send("DOM.setOuterHTML", {
					nodeId,
					outerHTML: commentOuterHtml,
				})
			} else {
				await client.send("DOM.removeNode", { nodeId })
			}
		} else {
			if (!parentId) continue
			for (const childId of childIds) {
				await client.send("DOM.moveTo", {
					nodeId: childId,
					targetNodeId: parentId,
					insertBeforeNodeId: nodeId,
				})
			}
			if (commentOuterHtml) {
				await client.send("DOM.setOuterHTML", {
					nodeId,
					outerHTML: commentOuterHtml,
				})
			} else {
				await client.send("DOM.removeNode", { nodeId })
			}
		}
		count++
	}
	return count
}

async function unwrapElementsNotInAxTree(
	client: CDPSession,
	axBackendIds: Set<number>,
): Promise<number> {
	const { root } = await client.send("DOM.getDocument", {
		pierce: true,
		depth: -1,
	})

	const operations = await collectPruneOperations(
		client,
		root as CdpDomNode | undefined,
		axBackendIds,
	)
	return applyPruneOperations(client, operations)
}

async function axPruneBodyHtml(
	filePath: string,
	chrome: ChromeResolution,
): Promise<{
	bodyHtml: string
	axNodeCount: number
	unwrappedCount: number
	warnShellMissingFromAx: boolean
}> {
	const launch =
		chrome.kind === "executablePath"
			? { headless: true as const, executablePath: chrome.path }
			: { headless: true as const, channel: chrome.channel }

	let browser: Awaited<ReturnType<typeof puppeteer.launch>>
	try {
		browser = await puppeteer.launch(launch)
	} catch (e) {
		const detail = e instanceof Error ? e.message : String(e)
		throw new Error(
			`Failed to launch Chrome (${chromeResolutionLabel(chrome)}).\n${detail}\nInstall Google Chrome, or set CHROME_PATH / PUPPETEER_EXECUTABLE_PATH, or download Playwright Chromium (Fiber-style): from playground run \`pnpm run install-playwright-chromium\`.`,
		)
	}
	try {
		const page = await browser.newPage()
		const fileUrl = toFileUrl(filePath).href
		await page.goto(fileUrl, { waitUntil: "domcontentloaded" })

		const client = await page.createCDPSession()
		await client.send("Page.enable")
		await client.send("DOM.enable")
		await client.send("Accessibility.enable")

		const { nodes } = await client.send("Accessibility.getFullAXTree", {})
		const axBackendIds = new Set<number>()
		for (const n of nodes) {
			if (n.backendDOMNodeId !== undefined) {
				axBackendIds.add(n.backendDOMNodeId)
			}
		}

		const { root: docRoot } = await client.send("DOM.getDocument", {
			pierce: true,
			depth: -1,
		})

		let warnShellMissingFromAx = false
		if (docRoot) {
			const r = docRoot as CdpDomNode
			const htmlNode = (r.children ?? []).find(
				(c) => (c.localName ?? c.nodeName ?? "").toLowerCase() === "html",
			) as CdpDomNode | undefined
			const bodyEl = htmlNode
				? findDescendantBody(htmlNode)
				: findDescendantBody(r)

			const flagIfMissing = (el: CdpDomNode | undefined) => {
				if (el?.backendNodeId === undefined) return
				if (!axBackendIds.has(el.backendNodeId)) {
					warnShellMissingFromAx = true
				}
			}
			flagIfMissing(htmlNode)
			flagIfMissing(bodyEl ?? undefined)
		}

		const unwrappedCount = await unwrapElementsNotInAxTree(client, axBackendIds)

		const bodyHtml = await page.evaluate<string>(
			`document.body ? document.body.outerHTML : ''`,
		)

		return {
			bodyHtml,
			axNodeCount: axBackendIds.size,
			unwrappedCount,
			warnShellMissingFromAx,
		}
	} finally {
		await browser.close()
	}
}

function countElementsApprox(html: string): number {
	return [...html.matchAll(/<\s*[a-zA-Z][^\s>/]*/g)].length
}

interface FileReport {
	name: string
	rawLen: number
	prunedLen: number
	compactedLen: number
	rawTokens: number
	prunedTokens: number
	compactedTokens: number
	stats: ReturnType<typeof createDomMap>["stats"]
	axNodeCount: number
	unwrappedCount: number
	elementCountApproxBefore: number
	elementCountApproxAfterPrune: number
	warnShellMissingFromAx: boolean
}

async function main() {
	await loadEnvFromCommonLocations()

	const scriptDir = new URL(".", import.meta.url).pathname
	const domsDir = join(scriptDir, "doms")
	const prunedDir = join(scriptDir, "output", "pruned")
	const compactedDir = join(scriptDir, "output", "compacted")
	const logDir = join(scriptDir, "logs")

	await Deno.mkdir(prunedDir, { recursive: true })
	await Deno.mkdir(compactedDir, { recursive: true })
	await Deno.mkdir(logDir, { recursive: true })

	const chromeResolution = await resolveChromeForPuppeteer()

	const timestamp = new Date().toISOString()
	const logLines: string[] = [
		PLAYGROUND_LOG_MANUAL_NOTE_LINE,
		"",
		"Accessibility-tree pruning + compaction...",
		`common class threshold (03 compaction): count > elements × ${COMMON_CLASS_FREQUENCY_THRESHOLD} (strict >${COMMON_CLASS_FREQUENCY_THRESHOLD * 100}%)`,
		"",
	]

	console.log("Accessibility-tree DOM pruning + 03 compaction\n")
	console.log(`Chrome: ${chromeResolutionLabel(chromeResolution)}\n`)

	const reports: FileReport[] = []

	for await (const entry of Deno.readDir(domsDir)) {
		if (!entry.isFile && !entry.isSymlink) continue
		if (!entry.name.endsWith(".html")) continue

		const inputPath = join(domsDir, entry.name)
		const raw = await Deno.readTextFile(inputPath)

		console.log(`${entry.name} (Chrome AX prune)...`)

		const {
			bodyHtml: pruned,
			axNodeCount,
			unwrappedCount,
			warnShellMissingFromAx,
		} = await axPruneBodyHtml(inputPath, chromeResolution)

		const elementCountApproxBefore = countElementsApprox(raw)
		const elementCountApproxAfterPrune = countElementsApprox(pruned)

		const compacted = createDomMap(pruned)

		await Deno.writeTextFile(join(prunedDir, entry.name), pruned)
		await Deno.writeTextFile(join(compactedDir, entry.name), compacted.html)

		const [rawTokens, prunedTokens, compactedTokens] = await Promise.all([
			countTokens(raw),
			countTokens(pruned),
			countTokens(compacted.html),
		])

		reports.push({
			name: entry.name,
			rawLen: raw.length,
			prunedLen: pruned.length,
			compactedLen: compacted.html.length,
			rawTokens,
			prunedTokens,
			compactedTokens,
			stats: compacted.stats,
			axNodeCount,
			unwrappedCount,
			elementCountApproxBefore,
			elementCountApproxAfterPrune,
			warnShellMissingFromAx,
		})

		const charRedPruned = ((1 - pruned.length / raw.length) * 100).toFixed(1)
		const tokenRedPruned = ((1 - prunedTokens / rawTokens) * 100).toFixed(1)
		const charRedCompact = (
			(1 - compacted.html.length / raw.length) *
			100
		).toFixed(1)
		const tokenRedCompact = ((1 - compactedTokens / rawTokens) * 100).toFixed(1)

		console.log(`  AX backend ids: ${axNodeCount}`)
		console.log(
			`  Unwrapped/removed (CDP): ${unwrappedCount} | ~elements: ${elementCountApproxBefore} -> ${elementCountApproxAfterPrune}`,
		)
		if (warnShellMissingFromAx) {
			console.log(
				"  Note: html or body backend id was not in AX set (shell kept by policy)",
			)
		}
		console.log(
			`  Chars:  ${raw.length.toLocaleString()} -> ${pruned.length.toLocaleString()} (pruned ${charRedPruned}%) -> ${compacted.html.length.toLocaleString()} (final ${charRedCompact}%)`,
		)
		console.log(
			`  Tokens: ${rawTokens.toLocaleString()} -> ${prunedTokens.toLocaleString()} (pruned ${tokenRedPruned}%) -> ${compactedTokens.toLocaleString()} (final ${tokenRedCompact}%)`,
		)
		console.log(
			`  After compact: ${compacted.stats.collapsedWrappers} wrappers, ${compacted.stats.truncatedListItems} siblings, ${compacted.stats.removedClasses} classes`,
		)
		console.log()
	}

	for (const r of reports) {
		const charRedFinal = ((1 - r.compactedLen / r.rawLen) * 100).toFixed(1)
		const tokenRedFinal = ((1 - r.compactedTokens / r.rawTokens) * 100).toFixed(
			1,
		)
		const charRedAx = ((1 - r.prunedLen / r.rawLen) * 100).toFixed(1)
		const tokenRedAx = ((1 - r.prunedTokens / r.rawTokens) * 100).toFixed(1)

		logLines.push(r.name)
		logLines.push(
			`  Chars:  ${r.rawLen.toLocaleString()} -> ${r.compactedLen.toLocaleString()} (${charRedFinal}% reduction)`,
		)
		logLines.push(
			`  Tokens: ${r.rawTokens.toLocaleString()} -> ${r.compactedTokens.toLocaleString()} (${tokenRedFinal}% reduction)`,
		)
		logLines.push(
			`  ${r.stats.collapsedWrappers} wrappers, ${r.stats.truncatedListItems} siblings, ${r.stats.removedClasses} classes`,
		)
		logLines.push(
			`  AX prune -> ${r.prunedLen.toLocaleString()} chars (${charRedAx}%), ${r.prunedTokens.toLocaleString()} tokens (${tokenRedAx}%), ${r.axNodeCount} ids, ${r.unwrappedCount} unwrapped, ~elements ${r.elementCountApproxBefore} -> ${r.elementCountApproxAfterPrune}`,
		)
		if (r.warnShellMissingFromAx) {
			logLines.push(
				"  Note: html/body backend id absent from AX set (shell left intact)",
			)
		}
		logLines.push("")
	}

	logLines.push("")
	logLines.push(`Output: ${compactedDir}`)
	logLines.push(`AX-pruned: ${prunedDir}`)

	const fileTimestamp = timestamp.replace(/[:.]/g, "-")
	const logPath = join(logDir, `${fileTimestamp}-ax-pipeline.log`)
	await Deno.writeTextFile(logPath, logLines.join("\n"))

	console.log(`Log: ${logPath}`)
	console.log(`Pruned output: ${prunedDir}`)
	console.log(`Compacted output: ${compactedDir}`)
}

main()
