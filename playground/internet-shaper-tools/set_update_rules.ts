#!/usr/bin/env -S deno run -A
/**
 * Offline batch analogue of agent tool `set_update_rule`: apply many rules at once to a snapshot.
 */

import { applyUpdateRulesToHtml, type UpdateRule } from "./lib/rules-apply.ts"
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
  deno run -A set_update_rules.ts --snapshot <path-to-html> --rules <rules.json> --output <out.html>

rules.json must be a JSON array of objects:
  { "label": string, "query_selector": string, "logic": string, "enabled"?: boolean }

Rules run in array order on the parsed document (matches extension semantics without MutationObserver retries).`)
	Deno.exit(1)
}

function parseRulesJson(text: string): UpdateRule[] {
	const data = JSON.parse(text) as unknown
	if (!Array.isArray(data)) {
		throw new Error("rules JSON must be an array")
	}
	const rules: UpdateRule[] = []
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
	return rules
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
		rules = parseRulesJson(rulesText)
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e)
		appendRunLog({
			tool: "set_update_rules",
			config: { snapshot, rulesPath, output },
			outputChars: 0,
			error: msg,
		})
		console.error(msg)
		Deno.exit(1)
	}

	let outHtml: string
	try {
		outHtml = applyUpdateRulesToHtml(rawHtml, rules)
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e)
		appendRunLog({
			tool: "set_update_rules",
			config: {
				snapshot,
				rulesPath,
				output,
				ruleLabels: rules.map((r) => r.label),
			},
			outputChars: 0,
			error: msg,
		})
		console.error(msg)
		Deno.exit(1)
	}

	try {
		Deno.writeTextFileSync(output, outHtml)
	} catch (e) {
		console.error(String(e))
		Deno.exit(1)
	}

	console.error(`Wrote ${outHtml.length} chars to ${output}`)

	const logHref = appendRunLog({
		tool: "set_update_rules",
		config: {
			snapshot,
			rulesPath,
			output,
			ruleCount: rules.length,
			ruleLabels: rules.map((r) => r.label),
		},
		outputChars: outHtml.length,
		outputPreview: outHtml,
	})
	console.error(`Run log: ${logHref}`)
}

main()
