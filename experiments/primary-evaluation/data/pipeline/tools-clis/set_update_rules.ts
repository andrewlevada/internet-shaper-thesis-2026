#!/usr/bin/env -S deno run -A
/**
 * Offline batch analogue of agent tool `set_update_rule`: apply many rules at once to a snapshot.
 *
 * Rules are applied statically: the DOM is parsed, mutated in-process, then serialized back to HTML.
 * This produces a self-contained file that renders correctly in sandboxed contexts (e.g. file:// MHTML).
 */

import { DOMParser } from "linkedom"
import { parseFlags } from "./lib/parse-flags.ts"

function usage(): never {
	console.error(`Usage:
  deno run -A set_update_rules.ts --snapshot <path-to-html> --rules <rules.json> --output <out.html> [--log <log.txt>]

rules.json must be a JSON array of objects:
  { "label": string, "query_selector": string, "logic": string, "enabled"?: boolean }`)
	Deno.exit(1)
}

interface UpdateRule {
	label: string
	query_selector: string
	logic: string
	enabled?: boolean
}

function activeRules(rules: UpdateRule[]): UpdateRule[] {
	return rules.filter((rule) => rule.enabled !== false)
}

function compileRuleLogic(
	logic: string,
): (element: Element, document: Document) => void {
	// Pass document explicitly so logic matches browser runtime
	// (Function bodies can use globals in the page, but not in Deno/linkedom).
	return new Function("element", "document", `"use strict";\n${logic}`) as (
		element: Element,
		document: Document,
	) => void
}

interface MatchLogEntry {
	elementBefore: string
	elementAfter: string
	documentBodyLengthBefore: number
	documentBodyLengthAfter: number
}

interface RuleLogEntry {
	rule: string
	selector: string
	matches: number
	status: "ok" | "compile_error" | "runtime_error"
	error?: string
	matchDetails?: MatchLogEntry[]
}

function applyRulesToDocument(
	doc: Document,
	rules: UpdateRule[],
	log?: RuleLogEntry[],
): void {
	for (const rule of rules) {
		let fn: (element: Element, document: Document) => void
		try {
			fn = compileRuleLogic(rule.logic)
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e)
			log?.push({
				rule: rule.label,
				selector: rule.query_selector,
				matches: 0,
				status: "compile_error",
				error: msg,
			})
			throw new Error(`Rule "${rule.label}" compile failed: ${msg}`)
		}

		const matches = [...doc.querySelectorAll(rule.query_selector)]
		const entry: RuleLogEntry = {
			rule: rule.label,
			selector: rule.query_selector,
			matches: matches.length,
			status: "ok",
			matchDetails: log ? [] : undefined,
		}

		for (const el of matches) {
			const elBefore = log
				? ((el as unknown as { outerHTML: string }).outerHTML?.slice(0, 300) ??
					"")
				: ""
			const bodyBefore = log ? doc.toString().length : 0
			try {
				fn(el, doc)
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e)
				entry.status = "runtime_error"
				entry.error = msg
				log?.push(entry)
				throw new Error(`Rule "${rule.label}" failed on element: ${msg}`)
			}
			if (log && entry.matchDetails) {
				entry.matchDetails.push({
					elementBefore: elBefore,
					elementAfter:
						(el as unknown as { outerHTML: string }).outerHTML?.slice(0, 300) ??
						"",
					documentBodyLengthBefore: bodyBefore,
					documentBodyLengthAfter: doc.toString().length,
				})
			}
		}

		log?.push(entry)
	}
}

function applyUpdateRulesToHtml(
	html: string,
	rules: UpdateRule[],
	log?: RuleLogEntry[],
): string {
	const rulesToApply = activeRules(rules)
	if (rulesToApply.length === 0) {
		return html
	}

	const doc = new DOMParser().parseFromString(html, "text/html")
	if (!doc.documentElement) throw new Error("Failed to parse HTML")

	applyRulesToDocument(doc, rulesToApply, log)
	return doc.toString()
}

function main(): void {
	const flags = parseFlags(Deno.args)
	const snapshot = flags.get("snapshot")
	const rulesPath = flags.get("rules")
	const output = flags.get("output")
	const logPath = flags.get("log")
	if (!snapshot || !rulesPath || !output) usage()

	let rawHtml: string
	let rulesText: string
	try {
		rawHtml = Deno.readTextFileSync(snapshot)
		rulesText = Deno.readTextFileSync(rulesPath)
	} catch (e) {
		console.error(String(e))
		Deno.exit(1)
	}

	let rules: UpdateRule[]
	try {
		const data = JSON.parse(rulesText) as unknown
		if (!Array.isArray(data)) {
			throw new Error("rules JSON must be an array")
		}
		rules = []
		let i = 0
		for (const item of data) {
			i++
			if (item == null || typeof item !== "object") {
				throw new Error(`rules[${i - 1}] must be an object`)
			}
			const o = item as Record<string, unknown>
			const label = o.label
			const query_selector = o.query_selector
			const logic = o.logic
			if (
				typeof label !== "string" ||
				typeof query_selector !== "string" ||
				typeof logic !== "string"
			) {
				throw new Error(
					`rules[${i - 1}] requires string fields label, query_selector, logic`,
				)
			}
			const enabled = o.enabled
			if (enabled !== undefined && typeof enabled !== "boolean") {
				throw new Error(`rules[${i - 1}].enabled must be boolean if present`)
			}
			rules.push({
				label,
				query_selector,
				logic,
				...(typeof enabled === "boolean" ? { enabled } : {}),
			})
		}
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e)
		console.error(msg)
		Deno.exit(1)
	}

	const logEntries: RuleLogEntry[] = logPath ? [] : undefined!
	let outHtml: string
	try {
		outHtml = applyUpdateRulesToHtml(rawHtml, rules, logEntries)
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e)
		console.error(msg)
		if (logPath && logEntries) {
			Deno.writeTextFileSync(logPath, formatLog(logEntries, { error: msg }))
		}
		Deno.exit(1)
	}

	try {
		Deno.writeTextFileSync(output, outHtml)
	} catch (e) {
		console.error(String(e))
		Deno.exit(1)
	}

	if (logPath && logEntries) {
		Deno.writeTextFileSync(logPath, formatLog(logEntries))
	}
}

function formatLog(entries: RuleLogEntry[], meta?: { error?: string }): string {
	const lines: string[] = [
		`Rules application log — ${new Date().toISOString()}`,
		"=".repeat(60),
		"",
	]
	for (const entry of entries) {
		lines.push(`Rule: ${entry.rule}`)
		lines.push(`  Selector:  ${entry.selector}`)
		lines.push(`  Matches:   ${entry.matches}`)
		lines.push(`  Status:    ${entry.status}`)
		if (entry.error) lines.push(`  Error:     ${entry.error}`)
		if (entry.matchDetails) {
			entry.matchDetails.forEach((m, i) => {
				lines.push(`  Match ${i + 1}:`)
				lines.push(
					`    Doc length before/after: ${m.documentBodyLengthBefore} → ${m.documentBodyLengthAfter} (Δ${m.documentBodyLengthAfter - m.documentBodyLengthBefore})`,
				)
				lines.push(`    Element before: ${m.elementBefore}`)
				lines.push(`    Element after:  ${m.elementAfter}`)
			})
		}
		lines.push("")
	}
	if (meta?.error) {
		lines.push("FATAL ERROR")
		lines.push(meta.error)
	}
	return lines.join("\n")
}

main()
