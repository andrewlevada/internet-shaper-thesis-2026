#!/usr/bin/env -S deno run -A

import { DOMParser } from "linkedom"
import { parseFlags } from "./lib/parse-flags.ts"

const SEO_META_NAMES = new Set([
	"description",
	"keywords",
	"robots",
	"author",
	"googlebot",
	"referrer",
])

function isSeoMeta(el: Element): boolean {
	if (el.tagName.toLowerCase() !== "meta") return false

	const name = el.getAttribute("name")?.toLowerCase()
	if (name) {
		if (SEO_META_NAMES.has(name)) return true
		if (name.startsWith("twitter:")) return true
	}

	const property = el.getAttribute("property")?.toLowerCase()
	if (property) {
		if (
			property.startsWith("og:") ||
			property.startsWith("twitter:") ||
			property.startsWith("article:") ||
			property.startsWith("fb:")
		) {
			return true
		}
	}

	return false
}

function isSeoLink(el: Element): boolean {
	if (el.tagName.toLowerCase() !== "link") return false

	const rel = el.getAttribute("rel")?.toLowerCase() ?? ""
	if (rel.includes("canonical")) return true
	if (rel.includes("alternate") && el.hasAttribute("hreflang")) return true

	return false
}

function isSeoHeadElement(el: Element): boolean {
	const tag = el.tagName.toLowerCase()
	if (tag === "title") return true
	if (isSeoMeta(el)) return true
	if (isSeoLink(el)) return true
	return false
}

function buildHtmlWithSeo(doc: Document): string {
	const seoParts: string[] = []
	for (const child of doc.head?.children ?? []) {
		if (isSeoHeadElement(child)) {
			seoParts.push(child.outerHTML)
		}
	}

	const bodyHtml = doc.body?.outerHTML ?? "<body></body>"
	return `<html><head>${seoParts.join("")}</head>${bodyHtml}</html>`
}

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
	const withSeo = flags.has("with-seo")
	const output = withSeo ? buildHtmlWithSeo(doc) : doc.body.outerHTML
	console.log(output)
}

main()
