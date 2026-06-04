import type { MediaKind } from "./media"
import { findOriginalPipeline } from "./screenshot"
import type { ComparisonItem, ParsedSample } from "./types"
import type { ZipArchive } from "./zip-archive"

export interface DisplayMedia {
	left: string
	right: string
	original: string
}

export type DisplayMediaView = "intro" | "comparison"

export function displayMediaCacheKey(
	index: number,
	view: DisplayMediaView,
): string {
	return `${index}:${view}`
}

export async function loadDisplayMedia(
	archive: ZipArchive,
	mediaKind: MediaKind,
	samples: ParsedSample[],
	item: ComparisonItem,
	view: DisplayMediaView,
): Promise<DisplayMedia> {
	const sample = samples.find((entry) => entry.id === item.sampleId)
	if (!sample) {
		throw new Error(`Unknown sample: ${item.sampleId}`)
	}

	if (view === "intro") {
		const originalPipeline = findOriginalPipeline(sample.pipelines)
		const originalVariant = sample.pipelines[originalPipeline]
		if (!originalVariant) {
			throw new Error(
				`Sample ${item.sampleId}: missing original pipeline asset`,
			)
		}

		const original = await archive.createMediaUrl(
			originalVariant.path,
			mediaKind,
		)
		return { left: "", right: "", original }
	}

	const [left, right] = await Promise.all([
		archive.createMediaUrl(item.leftPath, mediaKind),
		archive.createMediaUrl(item.rightPath, mediaKind),
	])

	return { left, right, original: "" }
}
