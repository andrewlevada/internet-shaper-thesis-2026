#!/usr/bin/env -S deno run -A
/**
 * Offline batch analogue of agent tool `set_update_rule`: apply many rules at once to a snapshot.
 */

import { DOMParser } from "linkedom"
import { parseFlags } from "./lib/parse-flags.ts"

function usage(): never {
	console.error(`Usage:
  deno run -A set_update_rules.ts --snapshot <path-to-html> --rules <rules.json> --output <out.html>

rules.json must be a JSON array of objects:
  { "label": string, "query_selector": string, "logic": string, "enabled"?: boolean }

Rules run in array order on the parsed document (matches extension semantics without MutationObserver retries).`)
	Deno.exit(1)
}

interface UpdateRule {
	label: string
	query_selector: string
	logic: string
	enabled?: boolean
}

function compileRuleLogic(logic: string): (element: Element) => void {
	return new Function("element", `"use strict";\n${logic}`) as (
		element: Element,
	) => void
}

function applyUpdateRulesToHtml(html: string, rules: UpdateRule[]): string {
	const doc = new DOMParser().parseFromString(html, "text/html")
	const root = doc.documentElement
	if (!root) throw new Error("Failed to parse HTML")

	for (const rule of rules) {
		if (rule.enabled === false) continue

		let fn: (element: Element) => void
		try {
			fn = compileRuleLogic(rule.logic)
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e)
			throw new Error(`Rule "${rule.label}" compile failed: ${msg}`)
		}

		const matches = [...doc.querySelectorAll(rule.query_selector)]
		for (const el of matches) {
			try {
				fn(el)
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e)
				throw new Error(`Rule "${rule.label}" failed on element: ${msg}`)
			}
		}
	}

	return root.outerHTML
}

function main(): void {
	const flags = parseFlags(Deno.args)
	const snapshot = flags.get("snapshot")
	const rulesPath = flags.get("rules")
	const output = flags.get("output")
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

	let outHtml: string
	try {
		outHtml = applyUpdateRulesToHtml(rawHtml, rules)
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e)
		console.error(msg)
		Deno.exit(1)
	}

	try {
		Deno.writeTextFileSync(output, outHtml)
	} catch (e) {
		console.error(String(e))
		Deno.exit(1)
	}
}

main()
