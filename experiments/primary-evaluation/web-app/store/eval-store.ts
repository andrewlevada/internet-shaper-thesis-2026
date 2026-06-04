import { create } from "zustand"
import { buildResultZip } from "../lib/export"
import { entriesIdentical, type MediaKind } from "../lib/media"
import { assignSampleHexIds, buildComparisonQueue } from "../lib/randomize"
import { findOriginalPipeline } from "../lib/screenshot"
import type {
	ComparisonItem,
	ComparisonVote,
	EvalStatus,
	ParsedSample,
	Rating,
} from "../lib/types"
import { parseSamplesFromArchive, revokeBlobUrls } from "../lib/validate"
import { ZipArchive } from "../lib/zip-archive"

export interface DisplayMedia {
	left: string
	right: string
	original: string
}

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
	mediaLoading: boolean
	mediaError: string | null
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
	mediaLoading: false,
	mediaError: null as string | null,
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

function revokeDisplayMedia(displayMedia: DisplayMedia | null): void {
	if (!displayMedia) {
		return
	}
	revokeBlobUrls([displayMedia.left, displayMedia.right, displayMedia.original])
}

export const useEvalStore = create<EvalState>((set, get) => ({
	...initialState,

	async initFromZip(file: File) {
		const previous = get()
		revokeDisplayMedia(previous.displayMedia)
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
			mediaLoading: false,
			mediaError: null,
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
		} = get()

		if (status !== "running" || !archive) {
			return
		}

		const current = queue[currentIndex]
		if (!current) {
			return
		}

		const sample = samples.find((entry) => entry.id === current.sampleId)
		if (!sample) {
			return
		}

		const originalPipeline = findOriginalPipeline(sample.pipelines)
		const originalVariant = sample.pipelines[originalPipeline]
		if (!originalVariant) {
			return
		}

		const needsIntro = !acknowledgedSamples.includes(current.sampleHex)
		revokeDisplayMedia(get().displayMedia)
		set({ displayMedia: null, mediaLoading: true, mediaError: null })

		try {
			if (needsIntro) {
				const original = await archive.createMediaUrl(
					originalVariant.path,
					mediaKind,
				)
				set({
					displayMedia: { left: "", right: "", original },
					mediaLoading: false,
				})
				return
			}

			const [left, right] = await Promise.all([
				archive.createMediaUrl(current.leftPath, mediaKind),
				archive.createMediaUrl(current.rightPath, mediaKind),
			])

			set({
				displayMedia: { left, right, original: "" },
				mediaLoading: false,
			})
		} catch (cause) {
			const message =
				cause instanceof Error ? cause.message : "Failed to load media"
			set({ mediaLoading: false, mediaError: message })
		}
	},

	acknowledgeSample(sampleHex: string) {
		const { queue, currentIndex, votes, acknowledgedSamples, status } = get()
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

		set({
			acknowledgedSamples: nextAcknowledged,
			...advanced,
		})
	},

	recordVote(rating: Rating) {
		const { queue, currentIndex, votes, acknowledgedSamples, status } = get()
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

		set(advanced)
	},

	downloadResults() {
		const { votes, seed, status } = get()
		if (status !== "complete" || votes.length === 0) {
			return
		}

		const { filename, blob } = buildResultZip(votes, seed)
		const url = URL.createObjectURL(blob)
		const anchor = document.createElement("a")
		anchor.href = url
		anchor.download = filename
		anchor.click()
		URL.revokeObjectURL(url)
	},

	async reset() {
		const { archive, displayMedia } = get()
		revokeDisplayMedia(displayMedia)
		if (archive) {
			await archive.close()
		}
		set({ ...initialState })
	},
}))
