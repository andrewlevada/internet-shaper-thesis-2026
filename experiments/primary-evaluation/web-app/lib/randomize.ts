import type { ComparisonItem, ParsedSample } from "./types"

export function createPrng(seed: number): () => number {
	let state = seed >>> 0
	return () => {
		state = (state + 0x6d2b79f5) >>> 0
		let t = Math.imul(state ^ (state >>> 15), 1 | state)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

export function shuffle<T>(array: T[], random: () => number): T[] {
	const result = [...array]
	for (let i = result.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1))
		;[result[i], result[j]] = [result[j], result[i]]
	}
	return result
}

export function allPairs<T>(items: T[]): [T, T][] {
	const pairs: [T, T][] = []
	for (let i = 0; i < items.length; i++) {
		for (let j = i + 1; j < items.length; j++) {
			pairs.push([items[i], items[j]])
		}
	}
	return pairs
}

export function randomHex(length: number, random: () => number): string {
	const bytes = new Uint8Array(length)
	for (let i = 0; i < length; i++) {
		bytes[i] = Math.floor(random() * 256)
	}
	return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")
}

export function assignSampleHexIds(
	samples: ParsedSample[],
	seed: number,
): Record<string, string> {
	const random = createPrng(seed)
	const mapping: Record<string, string> = {}
	for (const sample of samples) {
		mapping[sample.id] = randomHex(4, random)
	}
	return mapping
}

export function buildComparisonQueue(
	samples: ParsedSample[],
	sampleHexById: Record<string, string>,
	seed: number,
): ComparisonItem[] {
	const random = createPrng(seed)
	const orderedSamples = shuffle(samples, random)
	const items: ComparisonItem[] = []

	for (const sample of orderedSamples) {
		const pipelineNames = Object.keys(sample.pipelines).sort()
		const pairs = shuffle(allPairs(pipelineNames), random)

		for (const [a, b] of pairs) {
			const swap = random() < 0.5
			const leftPipeline = swap ? b : a
			const rightPipeline = swap ? a : b

			items.push({
				sampleHex: sampleHexById[sample.id],
				sampleId: sample.id,
				task: sample.task,
				leftPipeline,
				rightPipeline,
				leftScreenshotUrl: sample.pipelines[leftPipeline].screenshotUrl,
				rightScreenshotUrl: sample.pipelines[rightPipeline].screenshotUrl,
				leftScreenshotBytes: sample.pipelines[leftPipeline].screenshotBytes,
				rightScreenshotBytes: sample.pipelines[rightPipeline].screenshotBytes,
			})
		}
	}

	return items
}
