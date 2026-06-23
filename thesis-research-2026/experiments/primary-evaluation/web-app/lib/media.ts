export type MediaKind = "screenshot" | "mhtml"

export const SCREENSHOT_ASSET = "screenshot.png"
export const MHTML_ASSET = "index.mhtml"

/** Fixed preview viewport for trial intro and comparison cards. */
export const PREVIEW_VIEWPORT_WIDTH_PX = 1440
export const PREVIEW_VIEWPORT_HEIGHT_PX = 900

/** Comparison cards render the viewport at this zoom (intro uses 1). */
export const COMPARISON_ZOOM = 0.6

export function mimeTypeForKind(kind: MediaKind): string {
	if (kind !== "screenshot") {
		throw new Error(
			"MHTML is converted to HTML before preview; use createMediaUrl",
		)
	}
	return "image/png"
}

export function detectMediaKind(paths: Iterable<string>): MediaKind {
	let hasScreenshot = false
	let hasMhtml = false

	for (const path of paths) {
		if (path.endsWith(`/${SCREENSHOT_ASSET}`)) {
			hasScreenshot = true
		}
		if (path.endsWith(`/${MHTML_ASSET}`)) {
			hasMhtml = true
		}
	}

	if (hasScreenshot && hasMhtml) {
		throw new Error(
			"Archive mixes screenshot.png and index.mhtml; use one format per zip",
		)
	}

	if (hasMhtml) {
		return "mhtml"
	}

	if (hasScreenshot) {
		return "screenshot"
	}

	throw new Error(
		`Archive must include pipeline assets (${SCREENSHOT_ASSET} or ${MHTML_ASSET})`,
	)
}

export function assetNameForKind(kind: MediaKind): string {
	return kind === "screenshot" ? SCREENSHOT_ASSET : MHTML_ASSET
}

export function entriesIdentical(
	leftSize: number,
	leftSignature: number,
	rightSize: number,
	rightSignature: number,
): boolean {
	return (
		leftSize === rightSize && leftSignature === rightSignature && leftSize > 0
	)
}
