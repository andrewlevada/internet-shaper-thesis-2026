import { create } from "zustand"
import { buildResultZip } from "../lib/export"
import { assignSampleHexIds, buildComparisonQueue } from "../lib/randomize"
import { bytesEqual } from "../lib/screenshot"
import type {
	ComparisonItem,
	ComparisonVote,
	EvalStatus,
	ParsedSample,
	Rating,
} from "../lib/types"
import { parseSamplesFromZip, revokeSampleUrls } from "../lib/validate"
import { parseZipFile } from "../lib/zip"

interface EvalState {
	seed: number
	samples: ParsedSample[]
	sampleHexById: Record<string, string>
	queue: ComparisonItem[]
	currentIndex: number
	votes: ComparisonVote[]
	acknowledgedSamples: string[]
	status: EvalStatus
	initFromZip: (file: File) => Promise<void>
	acknowledgeSample: (sampleHex: string) => void
	recordVote: (rating: Rating) => void
	downloadResults: () => void
	reset: () => void
}

const initialState = {
	seed: 0,
	samples: [] as ParsedSample[],
	sampleHexById: {} as Record<string, string>,
	queue: [] as ComparisonItem[],
	currentIndex: 0,
	votes: [] as ComparisonVote[],
	acknowledgedSamples: [] as string[],
	status: "idle" as EvalStatus,
}

function isIdenticalPair(item: ComparisonItem): boolean {
	return bytesEqual(item.leftScreenshotBytes, item.rightScreenshotBytes)
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

export const useEvalStore = create<EvalState>((set, get) => ({
	...initialState,

	async initFromZip(file: File) {
		const files = await parseZipFile(file)
		const samples = parseSamplesFromZip(files)
		const seed = Date.now()
		const sampleHexById = assignSampleHexIds(samples, seed)
		const queue = buildComparisonQueue(samples, sampleHexById, seed)

		set({
			seed,
			samples,
			sampleHexById,
			queue,
			currentIndex: 0,
			votes: [],
			acknowledgedSamples: [],
			status: "running",
		})
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

	reset() {
		const { samples } = get()
		revokeSampleUrls(samples)
		set({ ...initialState })
	},
}))
