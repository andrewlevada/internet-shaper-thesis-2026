import { assertEquals, assertThrows } from "jsr:@std/assert"
import {
	applyEditsToNormalizedContent,
	fuzzyFindText,
	normalizeForFuzzyMatch,
} from "./edit-diff.ts"

Deno.test("normalizeForFuzzyMatch removes all whitespace", () => {
	assertEquals(
		normalizeForFuzzyMatch('style="x">\n<div'),
		normalizeForFuzzyMatch('style="x"><div'),
	)
})

Deno.test("fuzzyFindText ignores whitespace differences between tags", () => {
	const content =
		'<div class="ADXRXN BVzdUh" style="height:80px;width:100%"><div class="H2DtUH">'
	const oldText =
		'<div class="ADXRXN BVzdUh" style="height:80px;width:100%">\n<div class="H2DtUH">'

	const result = fuzzyFindText(content, oldText)
	assertEquals(result.found, true)
	assertEquals(result.usedFuzzyMatch, true)
	assertEquals(
		content.slice(result.index, result.index + result.matchLength),
		'<div class="ADXRXN BVzdUh" style="height:80px;width:100%"><div class="H2DtUH">',
	)
})

Deno.test("applyEditsToNormalizedContent applies edits[1] from our-2/066 baseline", () => {
	const content =
		'<style>:root {\n  --x: 1;\n}</style><header><div class="ADXRXN BVzdUh Tjcf3c _xSIdT ecEhnF qJUqe1 sSBu24 zEVE_X" style="height:80px;width:100%"><div class="H2DtUH KwViV7 FE_3R1 KDGhSV Tjcf3c sSBu24">logo</div></div></header>'

	const edits = [
		{
			oldText: "<style>:root {",
			newText:
				"<style>\n/* shrink header */\nheader { font-size: 14px; }\n</style>\n:root {",
		},
		{
			oldText:
				'<div class="ADXRXN BVzdUh Tjcf3c _xSIdT ecEhnF qJUqe1 sSBu24 zEVE_X" style="height:80px;width:100%">\n<div class="H2DtUH KwViV7 FE_3R1 KDGhSV Tjcf3c sSBu24">',
			newText:
				'<div class="ADXRXN BVzdUh Tjcf3c _xSIdT ecEhnF qJUqe1 sSBu24 zEVE_X" style="height:48px;width:100%">\n<div class="H2DtUH KwViV7 FE_3R1 KDGhSV Tjcf3c sSBu24">',
		},
	]

	const { newContent } = applyEditsToNormalizedContent(
		content,
		edits,
		"raw.html",
	)
	assertEquals(newContent.includes("height:48px;width:100%"), true)
	assertEquals(newContent.includes("/* shrink header */"), true)
	assertEquals(newContent.includes("height:80px;width:100%"), false)
})

Deno.test("applyEditsToNormalizedContent still rejects duplicate matches", () => {
	const content = "<div>foo</div><div>foo</div>"
	const edits = [{ oldText: "foo", newText: "bar" }]
	assertThrows(
		() => applyEditsToNormalizedContent(content, edits, "raw.html"),
		Error,
		"Found 2 occurrences",
	)
})
