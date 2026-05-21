#!/usr/bin/env -S deno run -A

import { DOMParser } from "linkedom"
import { parseFlags } from "./lib/parse-flags.ts"

function main(): void {
	const flags = parseFlags(Deno.args)
	const snapshot = flags.get("snapshot")
	if (!snapshot) return

	let rawHtml: string
	try {
		rawHtml = Deno.readTextFileSync(snapshot)
	} catch (e) {
		console.error(String(e))
		Deno.exit(1)
	}

	const doc = new DOMParser().parseFromString(rawHtml, "text/html")
	const body = doc.body.outerHTML
	console.log(body)
}

main()
