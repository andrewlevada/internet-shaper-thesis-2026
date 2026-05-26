import { createPrng, shuffle } from "./randomize"
import type { ComparisonVote, Rating } from "./types"

export function ratingToScores(rating: Rating): {
	left: number
	right: number
} {
	switch (rating) {
		case "left_better":
			return { left: 1, right: 0 }
		case "left_slightly":
			return { left: 1, right: 0 }
		case "similar":
			return { left: 0, right: 0 }
		case "right_slightly":
			return { left: 0, right: 1 }
		case "right_better":
			return { left: 0, right: 1 }
	}
}

function escapeCsv(value: string): string {
	if (value.includes(",") || value.includes('"') || value.includes("\n")) {
		return `"${value.replace(/"/g, '""')}"`
	}
	return value
}

export function buildPairsCsv(votes: ComparisonVote[], seed: number): string {
	const header =
		"sample_hex,left_pipeline,right_pipeline,rating,left_score,right_score"
	const random = createPrng(seed)

	const bySample = new Map<string, ComparisonVote[]>()
	for (const vote of votes) {
		const group = bySample.get(vote.sampleHex) ?? []
		group.push(vote)
		bySample.set(vote.sampleHex, group)
	}

	const sampleHexes = shuffle([...bySample.keys()], random)
	const rows: string[] = [header]

	for (const sampleHex of sampleHexes) {
		const group = bySample.get(sampleHex) ?? []
		for (const vote of group) {
			const { left, right } = ratingToScores(vote.rating)
			rows.push(
				[
					escapeCsv(vote.sampleHex),
					escapeCsv(vote.leftPipeline),
					escapeCsv(vote.rightPipeline),
					escapeCsv(vote.rating),
					String(left),
					String(right),
				].join(","),
			)
		}
	}

	return rows.join("\n")
}

export function buildWinMatrixCsv(votes: ComparisonVote[]): string {
	const pipelines = [
		...new Set(
			votes.flatMap((vote) => [vote.leftPipeline, vote.rightPipeline]),
		),
	].sort()

	const matrix = new Map<string, Map<string, number>>()
	for (const pipeline of pipelines) {
		matrix.set(pipeline, new Map())
	}

	for (const vote of votes) {
		const { left, right } = ratingToScores(vote.rating)
		const leftRow = matrix.get(vote.leftPipeline)
		const rightRow = matrix.get(vote.rightPipeline)
		if (!leftRow || !rightRow) {
			continue
		}

		leftRow.set(
			vote.rightPipeline,
			(leftRow.get(vote.rightPipeline) ?? 0) + left,
		)
		rightRow.set(
			vote.leftPipeline,
			(rightRow.get(vote.leftPipeline) ?? 0) + right,
		)
	}

	const header = ["", ...pipelines.map(escapeCsv)].join(",")
	const rows = pipelines.map((rowPipeline) => {
		const row = matrix.get(rowPipeline)
		const cells = pipelines.map((colPipeline) => {
			if (rowPipeline === colPipeline) {
				return "0"
			}
			return String(row?.get(colPipeline) ?? 0)
		})
		return [escapeCsv(rowPipeline), ...cells].join(",")
	})

	return [header, ...rows].join("\n")
}
