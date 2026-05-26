/**
 * Shared diff computation utilities for the edit tool.
 * Ported from pi packages/coding-agent/src/core/tools/edit-diff.ts
 */

export function detectLineEnding(content: string): "\r\n" | "\n" {
	const crlfIdx = content.indexOf("\r\n")
	const lfIdx = content.indexOf("\n")
	if (lfIdx === -1) return "\n"
	if (crlfIdx === -1) return "\n"
	return crlfIdx < lfIdx ? "\r\n" : "\n"
}

export function normalizeToLF(text: string): string {
	return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
}

export function restoreLineEndings(
	text: string,
	ending: "\r\n" | "\n",
): string {
	return ending === "\r\n" ? text.replace(/\n/g, "\r\n") : text
}

export function normalizeForFuzzyMatch(text: string): string {
	return text
		.normalize("NFKC")
		.replace(/[\u2018\u2019\u201A\u201B]/g, "'")
		.replace(/[\u201C\u201D\u201E\u201F]/g, '"')
		.replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, "-")
		.replace(/[\u00A0\u2002-\u200A\u202F\u205F\u3000]/g, " ")
		.replace(/\s+/g, " ")
}

export interface FuzzyMatchResult {
	found: boolean
	index: number
	matchLength: number
	usedFuzzyMatch: boolean
	contentForReplacement: string
}

export interface Edit {
	oldText: string
	newText: string
}

/** Placeholder comments emitted by get_map_of_dom / show_in_dom — not present in raw HTML. */
const DOM_MAP_PLACEHOLDER_COMMENT_PATTERNS = [
	/<!--\s*-\d+\s+children\s*-->/,
	/<!--\s*-\d+\s+siblings\s*-->/,
	/<!--\s*-\d+\s+wrappers\b[\s\S]*?-->/,
] as const

export function findDomMapPlaceholderComment(text: string): string | null {
	for (const pattern of DOM_MAP_PLACEHOLDER_COMMENT_PATTERNS) {
		const match = text.match(pattern)
		if (match) return match[0]
	}
	return null
}

function getDomMapPlaceholderCommentError(
	editIndex: number,
	totalEdits: number,
	comment: string,
): Error {
	const guidance =
		"Use show_in_dom() with a higher depth until no placeholder comments of this type remain, " +
		"and/or focus on a lower-level element. " +
		"Do not copy text from get_map_of_dom or shallow show_in_dom output."
	const snippet = comment.trim()
	if (totalEdits === 1) {
		return new Error(
			`oldText contains a DOM map placeholder comment (${snippet}). ${guidance}`,
		)
	}
	return new Error(
		`edits[${editIndex}].oldText contains a DOM map placeholder comment (${snippet}). ${guidance}`,
	)
}

export function assertEditsHaveNoDomMapPlaceholderComments(
	edits: Edit[],
): void {
	for (let i = 0; i < edits.length; i++) {
		const comment = findDomMapPlaceholderComment(edits[i].oldText)
		if (comment) {
			throw getDomMapPlaceholderCommentError(i, edits.length, comment)
		}
	}
}

interface MatchedEdit {
	editIndex: number
	matchIndex: number
	matchLength: number
	newText: string
}

export interface AppliedEditsResult {
	baseContent: string
	newContent: string
}

export function fuzzyFindText(
	content: string,
	oldText: string,
): FuzzyMatchResult {
	const exactIndex = content.indexOf(oldText)
	if (exactIndex !== -1) {
		return {
			found: true,
			index: exactIndex,
			matchLength: oldText.length,
			usedFuzzyMatch: false,
			contentForReplacement: content,
		}
	}

	const fuzzyContent = normalizeForFuzzyMatch(content)
	const fuzzyOldText = normalizeForFuzzyMatch(oldText)
	const fuzzyIndex = fuzzyContent.indexOf(fuzzyOldText)

	if (fuzzyIndex === -1) {
		return {
			found: false,
			index: -1,
			matchLength: 0,
			usedFuzzyMatch: false,
			contentForReplacement: content,
		}
	}

	return {
		found: true,
		index: fuzzyIndex,
		matchLength: fuzzyOldText.length,
		usedFuzzyMatch: true,
		contentForReplacement: fuzzyContent,
	}
}

export function stripBom(content: string): { bom: string; text: string } {
	return content.startsWith("\uFEFF")
		? { bom: "\uFEFF", text: content.slice(1) }
		: { bom: "", text: content }
}

function countOccurrences(content: string, oldText: string): number {
	const fuzzyContent = normalizeForFuzzyMatch(content)
	const fuzzyOldText = normalizeForFuzzyMatch(oldText)
	return fuzzyContent.split(fuzzyOldText).length - 1
}

function getNotFoundError(
	_: string,
	editIndex: number,
	totalEdits: number,
): Error {
	if (totalEdits === 1) {
		return new Error(
			`Could not find the text. Make sure the oldText is exactly matches the target text`,
		)
	}
	return new Error(
		`Could not find edits[${editIndex}]. Make sure the oldText is exactly matches the target text`,
	)
}

function getDuplicateError(
	_: string,
	editIndex: number,
	totalEdits: number,
	occurrences: number,
): Error {
	if (totalEdits === 1) {
		return new Error(
			`Found ${occurrences} occurrences of the text. Provide enough surrounding HTML to make oldText unique.`,
		)
	}
	return new Error(
		`Found ${occurrences} occurrences of edits[${editIndex}]. Provide enough surrounding HTML to make oldText unique.`,
	)
}

function getEmptyOldTextError(
	_: string,
	editIndex: number,
	totalEdits: number,
): Error {
	if (totalEdits === 1) {
		return new Error(`oldText must not be empty.`)
	}
	return new Error(`edits[${editIndex}].oldText must not be empty.`)
}

function getNoChangeError(_: string, totalEdits: number): Error {
	if (totalEdits === 1) {
		return new Error(
			`No changes made. The replacement produced identical content. This might indicate an issue with special characters or the text not existing as expected.`,
		)
	}
	return new Error(
		`No changes made. The replacements produced identical content.`,
	)
}

export function applyEditsToNormalizedContent(
	normalizedContent: string,
	edits: Edit[],
	path: string,
): AppliedEditsResult {
	const normalizedEdits = edits.map((edit) => ({
		oldText: normalizeToLF(edit.oldText),
		newText: normalizeToLF(edit.newText),
	}))

	for (let i = 0; i < normalizedEdits.length; i++) {
		if (normalizedEdits[i].oldText.length === 0) {
			throw getEmptyOldTextError(path, i, normalizedEdits.length)
		}
	}

	const initialMatches = normalizedEdits.map((edit) =>
		fuzzyFindText(normalizedContent, edit.oldText),
	)
	const baseContent = initialMatches.some((match) => match.usedFuzzyMatch)
		? normalizeForFuzzyMatch(normalizedContent)
		: normalizedContent

	const matchedEdits: MatchedEdit[] = []
	for (let i = 0; i < normalizedEdits.length; i++) {
		const edit = normalizedEdits[i]
		const matchResult = fuzzyFindText(baseContent, edit.oldText)
		if (!matchResult.found) {
			throw getNotFoundError(path, i, normalizedEdits.length)
		}

		const occurrences = countOccurrences(baseContent, edit.oldText)
		if (occurrences > 1) {
			throw getDuplicateError(path, i, normalizedEdits.length, occurrences)
		}

		matchedEdits.push({
			editIndex: i,
			matchIndex: matchResult.index,
			matchLength: matchResult.matchLength,
			newText: edit.newText,
		})
	}

	matchedEdits.sort((a, b) => a.matchIndex - b.matchIndex)
	for (let i = 1; i < matchedEdits.length; i++) {
		const previous = matchedEdits[i - 1]
		const current = matchedEdits[i]
		if (previous.matchIndex + previous.matchLength > current.matchIndex) {
			throw new Error(
				`edits[${previous.editIndex}] and edits[${current.editIndex}] overlap. Merge them into one edit or target disjoint regions.`,
			)
		}
	}

	let newContent = baseContent
	for (let i = matchedEdits.length - 1; i >= 0; i--) {
		const edit = matchedEdits[i]
		newContent =
			newContent.substring(0, edit.matchIndex) +
			edit.newText +
			newContent.substring(edit.matchIndex + edit.matchLength)
	}

	if (baseContent === newContent) {
		throw getNoChangeError(path, normalizedEdits.length)
	}

	return { baseContent, newContent }
}

export function applyEditsToFileContent(
	rawContent: string,
	edits: Edit[],
	path: string,
): string {
	const { bom, text: content } = stripBom(rawContent)
	const originalEnding = detectLineEnding(content)
	const normalizedContent = normalizeToLF(content)
	const { newContent } = applyEditsToNormalizedContent(
		normalizedContent,
		edits,
		path,
	)
	return bom + restoreLineEndings(newContent, originalEnding)
}
