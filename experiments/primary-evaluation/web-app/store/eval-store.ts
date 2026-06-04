import { create } from "zustand"
import { saveVoteCheckpointIfNeeded } from "../lib/checkpoint"
import {
	type DisplayMedia,
	type DisplayMediaView,
	displayMediaCacheKey,
	loadDisplayMedia as loadDisplayMediaForItem,
} from "../lib/display-media"
import { buildResultZip, downloadBlob } from "../lib/export"
import { entriesIdentical, type MediaKind } from "../lib/media"
import { assignSampleHexIds, buildComparisonQueue } from "../lib/randomize"
import type {
	ComparisonItem,
	ComparisonVote,
	EvalStatus,
	ParsedSample,
	Rating,
} from "../lib/types"
import { MEDIA_REVEAL_DELAY_MS, waitAtLeast } from "../lib/media-transition"
import { parseSamplesFromArchive } from "../lib/validate"
import { ZipArchive } from "../lib/zip-archive"

export type { DisplayMedia }

interface EvalState {
	seed: number
	mediaKind: MediaKind
	archive: ZipArchive | null
	samples: ParsedSample[]
	sampleHexById: Record<string, string>
	queue: ComparisonItem[]
	currentIndex: number
	votes: ComparisonVote[]
	acknowledgedSamples: string[]
	status: EvalStatus
	displayMedia: DisplayMedia | null
	mediaPrefetch: Map<string, DisplayMedia>
	mediaLoading: boolean
	mediaContentVisible: boolean
	mediaError: string | null
	lastCheckpointVoteCount: number
	initFromZip: (file: File) => Promise<void>
	loadDisplayMedia: () => Promise<void>
	acknowledgeSample: (sampleHex: string) => void
	recordVote: (rating: Rating) => void
	downloadResults: () => void
	reset: () => void
}

const initialState = {
	seed: 0,
	mediaKind: "screenshot" as MediaKind,
	archive: null as ZipArchive | null,
	samples: [] as ParsedSample[],
	sampleHexById: {} as Record<string, string>,
	queue: [] as ComparisonItem[],
	currentIndex: 0,
	votes: [] as ComparisonVote[],
	acknowledgedSamples: [] as string[],
	status: "idle" as EvalStatus,
	displayMedia: null as DisplayMedia | null,
	mediaPrefetch: new Map<string, DisplayMedia>(),
	mediaLoading: false,
	mediaContentVisible: true,
	mediaError: null as string | null,
	lastCheckpointVoteCount: 0,
}

function isIdenticalPair(item: ComparisonItem): boolean {
	return entriesIdentical(
		item.leftUncompressedSize,
		item.leftSignature,
		item.rightUncompressedSize,
		item.rightSignature,
	)
}

function skipIdenticalPairs(
	queue: ComparisonItem[],
	startIndex: number,
	votes: ComparisonVote[],
	acknowledgedSamples: string[],
): { votes: ComparisonVote[]; currentIndex: number; status: EvalStatus } {
	let index = startIndex
	let nextVotes = votes

	while (index < queue.length) {
		const item = queue[index]
		if (!acknowledgedSamples.includes(item.sampleHex)) {
			break
		}
		if (!isIdenticalPair(item)) {
			break
		}

		nextVotes = [
			...nextVotes,
			{
				sampleHex: item.sampleHex,
				leftPipeline: item.leftPipeline,
				rightPipeline: item.rightPipeline,
				rating: "similar" as Rating,
			},
		]
		index++
	}

	if (index >= queue.length) {
		return { votes: nextVotes, currentIndex: index, status: "complete" }
	}

	return { votes: nextVotes, currentIndex: index, status: "running" }
}

function prefetchTargets(
	queue: ComparisonItem[],
	currentIndex: number,
	acknowledgedSamples: string[],
): { index: number; view: DisplayMediaView }[] {
	const current = queue[currentIndex]
	if (!current) {
		return []
	}

	const targets: { index: number; view: DisplayMediaView }[] = []
	const onIntro = !acknowledgedSamples.includes(current.sampleHex)

	if (onIntro) {
		targets.push({ index: currentIndex, view: "comparison" })
	}

	const nextIndex = onIntro ? currentIndex : currentIndex + 1
	const nextItem = queue[nextIndex]
	if (!nextItem) {
		return targets
	}

	const nextOnIntro = !acknowledgedSamples.includes(nextItem.sampleHex)
	targets.push({
		index: nextIndex,
		view: nextOnIntro ? "intro" : "comparison",
	})

	return targets
}

export const useEvalStore = create<EvalState>((set, get) => ({
	...initialState,

	async initFromZip(file: File) {
		const previous = get()
		if (previous.archive) {
			await previous.archive.close()
		}

		const archive = await ZipArchive.open(file)
		const entryMeta = await archive.index()
		const { samples, mediaKind } = await parseSamplesFromArchive(
			archive,
			entryMeta,
		)
		const seed = Date.now()
		const sampleHexById = assignSampleHexIds(samples, seed)
		const queue = buildComparisonQueue(samples, sampleHexById, seed)

		set({
			seed,
			mediaKind,
			archive,
			samples,
			sampleHexById,
			queue,
			currentIndex: 0,
			votes: [],
			acknowledgedSamples: [],
			status: "running",
			displayMedia: null,
			mediaPrefetch: new Map(),
			mediaLoading: false,
			mediaContentVisible: true,
			mediaError: null,
			lastCheckpointVoteCount: 0,
		})
	},

	async loadDisplayMedia() {
		const {
			archive,
			mediaKind,
			queue,
			currentIndex,
			acknowledgedSamples,
			samples,
			status,
			mediaPrefetch,
		} = get()

		if (status !== "running" || !archive) {
			return
		}

		const current = queue[currentIndex]
		if (!current) {
			return
		}

		const view: DisplayMediaView = acknowledgedSamples.includes(
			current.sampleHex,
		)
			? "comparison"
			: "intro"
		const isComparison = view === "comparison"
		const cacheKey = displayMediaCacheKey(currentIndex, view)
		const cached = mediaPrefetch.get(cacheKey)
		const startedAt = Date.now()

		if (isComparison) {
			set({
				displayMedia: null,
				mediaLoading: true,
				mediaContentVisible: false,
				mediaError: null,
			})
		} else {
			set({ displayMedia: null, mediaLoading: true, mediaError: null })
		}

		try {
			const displayMedia =
				cached ??
				(await loadDisplayMediaForItem(
					archive,
					mediaKind,
					samples,
					current,
					view,
				))

			if (cached) {
				const nextPrefetch = new Map(mediaPrefetch)
				nextPrefetch.delete(cacheKey)
				set({ mediaPrefetch: nextPrefetch })
			}

			if (isComparison) {
				await waitAtLeast(MEDIA_REVEAL_DELAY_MS, startedAt)
				set({
					displayMedia,
					mediaLoading: false,
					mediaContentVisible: true,
					mediaError: null,
				})
			} else {
				set({
					displayMedia,
					mediaLoading: false,
					mediaContentVisible: true,
					mediaError: null,
				})
			}

			void prefetchUpcomingMedia(get, set)
		} catch (cause) {
			const message =
				cause instanceof Error ? cause.message : "Failed to load media"
			set({
				mediaLoading: false,
				mediaContentVisible: !isComparison,
				mediaError: message,
			})
		}
	},

	acknowledgeSample(sampleHex: string) {
		const { queue, currentIndex, votes, acknowledgedSamples, status, seed } =
			get()
		if (status !== "running" || acknowledgedSamples.includes(sampleHex)) {
			return
		}

		const nextAcknowledged = [...acknowledgedSamples, sampleHex]
		const advanced = skipIdenticalPairs(
			queue,
			currentIndex,
			votes,
			nextAcknowledged,
		)

		const lastCheckpointVoteCount = saveVoteCheckpointIfNeeded(
			advanced.votes,
			seed,
			get().lastCheckpointVoteCount,
		)

		set({
			acknowledgedSamples: nextAcknowledged,
			...advanced,
			lastCheckpointVoteCount,
		})
	},

	recordVote(rating: Rating) {
		const { queue, currentIndex, votes, acknowledgedSamples, status, seed } =
			get()
		if (status !== "running") {
			return
		}

		const current = queue[currentIndex]
		if (!current) {
			return
		}

		const nextVotes: ComparisonVote[] = [
			...votes,
			{
				sampleHex: current.sampleHex,
				leftPipeline: current.leftPipeline,
				rightPipeline: current.rightPipeline,
				rating,
			},
		]

		const advanced = skipIdenticalPairs(
			queue,
			currentIndex + 1,
			nextVotes,
			acknowledgedSamples,
		)

		const lastCheckpointVoteCount = saveVoteCheckpointIfNeeded(
			advanced.votes,
			seed,
			get().lastCheckpointVoteCount,
		)

		set({
			displayMedia: null,
			mediaLoading: true,
			mediaContentVisible: false,
			...advanced,
			lastCheckpointVoteCount,
		})
	},

	downloadResults() {
		const { votes, seed, status } = get()
		if (status !== "complete" || votes.length === 0) {
			return
		}

		const { filename, blob } = buildResultZip(votes, seed)
		downloadBlob(blob, filename)
	},

	async reset() {
		const { archive } = get()
		if (archive) {
			await archive.close()
		}
		set({ ...initialState, mediaPrefetch: new Map() })
	},
}))

async function prefetchUpcomingMedia(
	get: () => EvalState,
	set: (partial: Partial<EvalState>) => void,
): Promise<void> {
	const {
		archive,
		mediaKind,
		queue,
		currentIndex,
		acknowledgedSamples,
		samples,
		status,
		mediaPrefetch,
	} = get()

	if (status !== "running" || !archive) {
		return
	}

	const targets = prefetchTargets(queue, currentIndex, acknowledgedSamples)
	if (targets.length === 0) {
		return
	}

	const nextPrefetch = new Map(mediaPrefetch)
	let changed = false

	await Promise.all(
		targets.map(async ({ index, view }) => {
			const key = displayMediaCacheKey(index, view)
			if (nextPrefetch.has(key)) {
				return
			}

			const item = queue[index]
			if (!item) {
				return
			}

			try {
				const media = await loadDisplayMediaForItem(
					archive,
					mediaKind,
					samples,
					item,
					view,
				)
				nextPrefetch.set(key, media)
				changed = true
			} catch {
				// Prefetch is best-effort.
			}
		}),
	)

	if (changed) {
		set({ mediaPrefetch: nextPrefetch })
	}
}
