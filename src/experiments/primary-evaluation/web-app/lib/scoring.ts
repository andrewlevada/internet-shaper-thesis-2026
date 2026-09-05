import {
	inferHierarchicalScores,
	likertToPairScores,
	scaleRatingToPairScores,
} from "./hierarchical-rating"
import { createPrng, shuffle } from "./randomize"
import type { ComparisonVote, LikertRating, RatingDimension } from "./types"

export { inferHierarchicalScores, likertToPairScores }

export function recordVoteFromSelection(
	dimension: RatingDimension,
	value: LikertRating,
): Pick<ComparisonVote, "primaryDimension" | "scores"> {
	return {
		primaryDimension: dimension,
		scores: inferHierarchicalScores(dimension, value),
	}
}

function escapeCsv(value: string): string {
	if (value.includes(",") || value.includes('"') || value.includes("\n")) {
		return `"${value.replace(/"/g, '""')}"`
	}
	return value
}

function scoreColumns(rating: LikertRating | "na"): [string, string] {
	if (rating === "na") {
		return ["", ""]
	}
	const { left, right } = likertToPairScores(rating)
	return [String(left), String(right)]
}

export function buildPairsCsv(votes: ComparisonVote[], seed: number): string {
	const header = [
		"sample_hex",
		"left_pipeline",
		"right_pipeline",
		"primary_dimension",
		"goal_alignment",
		"structural_cohesion",
		"design_alignment",
		"goal_left_score",
		"goal_right_score",
		"structural_left_score",
		"structural_right_score",
		"design_left_score",
		"design_right_score",
	].join(",")

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
			const { scores } = vote
			const [goalLeft, goalRight] = scoreColumns(scores.goalAlignment)
			const [structuralLeft, structuralRight] = scoreColumns(
				scores.structuralCohesion,
			)
			const [designLeft, designRight] = scoreColumns(scores.designAlignment)

			rows.push(
				[
					escapeCsv(vote.sampleHex),
					escapeCsv(vote.leftPipeline),
					escapeCsv(vote.rightPipeline),
					escapeCsv(vote.primaryDimension),
					escapeCsv(scores.goalAlignment),
					escapeCsv(scores.structuralCohesion),
					escapeCsv(scores.designAlignment),
					goalLeft,
					goalRight,
					structuralLeft,
					structuralRight,
					designLeft,
					designRight,
				].join(","),
			)
		}
	}

	return rows.join("\n")
}

export function buildWinMatrixCsv(
	votes: ComparisonVote[],
	dimension: RatingDimension = "goal",
): string {
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
		const rating =
			dimension === "goal"
				? vote.scores.goalAlignment
				: dimension === "structural"
					? vote.scores.structuralCohesion
					: vote.scores.designAlignment

		const pairScores = scaleRatingToPairScores(rating)
		if (!pairScores) {
			continue
		}

		const { left, right } = pairScores
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
