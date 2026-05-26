#!/usr/bin/env -S deno run -A
/**
 * Offline batch analogue of agent tool `set_update_rule`: apply many rules at once to a snapshot.
 *
 * Rules are validated against a parsed DOM, then applied at view time via an injected script.
 * The snapshot HTML is not re-serialized (linkedom outerHTML breaks Google SERP snapshots).
 */

import { DOMParser } from "linkedom"
import { parseFlags } from "./lib/parse-flags.ts"

const EVAL_RULES_SCRIPT_ID = "internet-shaper-eval-rules"

function usage(): never {
	console.error(`Usage:
  deno run -A set_update_rules.ts --snapshot <path-to-html> --rules <rules.json> --output <out.html>

rules.json must be a JSON array of objects:
  { "label": string, "query_selector": string, "logic": string, "enabled"?: boolean }

Rules run in array order when the page loads (matches extension semantics without MutationObserver retries).`)
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
	// Pass document explicitly so offline validation matches browser runtime
	// (Function bodies can use globals in the page, but not in Deno/linkedom).
	return new Function("element", "document", `"use strict";\n${logic}`) as (
		element: Element,
		document: Document,
	) => void
}

function validateRulesOnDocument(doc: Document, rules: UpdateRule[]): void {
	for (const rule of rules) {
		let fn: (element: Element, document: Document) => void
		try {
			fn = compileRuleLogic(rule.logic)
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e)
			throw new Error(`Rule "${rule.label}" compile failed: ${msg}`)
		}

		const matches = [...doc.querySelectorAll(rule.query_selector)]
		for (const el of matches) {
			try {
				fn(el, doc)
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e)
				throw new Error(`Rule "${rule.label}" failed on element: ${msg}`)
			}
		}
	}
}

function buildRulesScript(rules: UpdateRule[]): string {
	const payload = JSON.stringify(rules)
	return `<script id="${EVAL_RULES_SCRIPT_ID}">(function(){const rules=${payload};function apply(){for(const rule of rules){const fn=new Function("element","document",'"use strict";\\n'+rule.logic);for(const el of document.querySelectorAll(rule.query_selector)){fn(el,document);}}}if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",apply);}else{apply();}})();</script>`
}

function stripExistingRulesScript(html: string): string {
	return html.replace(
		new RegExp(
			`<script\\s+id="${EVAL_RULES_SCRIPT_ID}"[^>]*>[\\s\\S]*?<\\/script>\\s*`,
			"i",
		),
		"",
	)
}

function injectRulesScript(html: string, rules: UpdateRule[]): string {
	const script = buildRulesScript(rules)
	const base = stripExistingRulesScript(html)
	const closeBody = /<\/body>/i
	if (closeBody.test(base)) {
		return base.replace(closeBody, `${script}\n</body>`)
	}
	return `${base}\n${script}`
}

function applyUpdateRulesToHtml(html: string, rules: UpdateRule[]): string {
	const rulesToApply = activeRules(rules)
	if (rulesToApply.length === 0) {
		return stripExistingRulesScript(html)
	}

	const doc = new DOMParser().parseFromString(html, "text/html")
	if (!doc.documentElement) throw new Error("Failed to parse HTML")

	validateRulesOnDocument(doc, rulesToApply)
	return injectRulesScript(html, rulesToApply)
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
