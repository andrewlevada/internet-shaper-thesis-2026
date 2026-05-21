#!/usr/bin/env -S deno run -A

import {
	applyEditsToFileContent,
	assertEditsHaveNoDomMapPlaceholderComments,
	type Edit,
} from "./lib/edit-diff.ts"
import { parseFlags } from "./lib/parse-flags.ts"

interface EditInput {
	edits?: Edit[]
	oldText?: string
	newText?: string
}

function usage(): never {
	console.error(`Usage:
  deno run -A edit.ts --snapshot <path-to-html> --edits <edits.json> --output <out.html>

edits.json must be a JSON object:
  { "edits": [{ "oldText": string, "newText": string }] }
or a JSON array of edit objects.`)
	Deno.exit(1)
}

function prepareEditInput(input: EditInput): Edit[] {
	const args = { ...input }

	if (typeof args.edits === "string") {
		try {
			const parsed = JSON.parse(args.edits)
			if (Array.isArray(parsed)) {
				args.edits = parsed
			}
		} catch {
			// keep original value; validation below will fail
		}
	}

	if (typeof args.oldText === "string" && typeof args.newText === "string") {
		const edits = Array.isArray(args.edits) ? [...args.edits] : []
		edits.push({ oldText: args.oldText, newText: args.newText })
		args.edits = edits
		delete args.oldText
		delete args.newText
	}

	if (!Array.isArray(args.edits) || args.edits.length === 0) {
		throw new Error(
			"Edit tool input is invalid. edits must contain at least one replacement.",
		)
	}

	for (const [index, edit] of args.edits.entries()) {
		if (
			!edit ||
			typeof edit.oldText !== "string" ||
			typeof edit.newText !== "string"
		) {
			throw new Error(
				`Edit tool input is invalid. edits[${index}] must include oldText and newText strings.`,
			)
		}
	}

	return args.edits
}

function parseEditsFile(path: string): EditInput {
	const raw = Deno.readTextFileSync(path)
	const parsed = JSON.parse(raw)
	if (Array.isArray(parsed)) {
		return { edits: parsed }
	}
	if (parsed && typeof parsed === "object") {
		return parsed as EditInput
	}
	throw new Error("edits file must be a JSON object or array of edit objects")
}

function main(): void {
	const flags = parseFlags(Deno.args)
	const snapshot = flags.get("snapshot")
	const editsPath = flags.get("edits")
	const output = flags.get("output")
	if (!snapshot || !editsPath || !output) {
		usage()
	}

	let editInput: EditInput
	try {
		editInput = parseEditsFile(editsPath)
	} catch (e) {
		console.error(String(e))
		Deno.exit(1)
	}

	let edits: Edit[]
	try {
		edits = prepareEditInput(editInput)
		assertEditsHaveNoDomMapPlaceholderComments(edits)
	} catch (e) {
		console.error(e instanceof Error ? e.message : String(e))
		Deno.exit(1)
	}

	const displayPath = snapshot.split(/[/\\]/).pop() ?? snapshot

	let source: string
	try {
		source = Deno.readTextFileSync(snapshot)
	} catch (e) {
		console.error(String(e))
		Deno.exit(1)
	}

	let updated: string
	try {
		updated = applyEditsToFileContent(source, edits, displayPath)
	} catch (e) {
		console.error(e instanceof Error ? e.message : String(e))
		Deno.exit(1)
	}

	try {
		Deno.writeTextFileSync(output, updated)
	} catch (e) {
		console.error(String(e))
		Deno.exit(1)
	}

	console.log(`Successfully replaced ${edits.length} block(s).`)
}

main()
