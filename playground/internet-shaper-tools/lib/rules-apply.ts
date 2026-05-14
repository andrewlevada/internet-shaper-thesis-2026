import { DOMParser } from "linkedom"

export interface UpdateRule {
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

/** Applies rules in order; returns serialized `<html>...</html>` document. */
export function applyUpdateRulesToHtml(
	html: string,
	rules: UpdateRule[],
): string {
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
