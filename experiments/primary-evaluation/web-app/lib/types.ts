import type { MediaKind } from "./media"

export type PipelineId =
	| "original"
	| "baseline"
	| "engine-only"
	| "map-only"
	| "full"
	| "full-sonnet"

export type LikertRating =
	| "left_better"
	| "left_slightly"
	| "similar"
	| "right_slightly"
	| "right_better"

export type ScaleRating = LikertRating | "na"

export type RatingDimension = "goal" | "structural" | "design"

export interface HierarchicalScores {
	goalAlignment: LikertRating
	structuralCohesion: ScaleRating
	designAlignment: ScaleRating
}

export type EvalStatus = "idle" | "running" | "complete"

export interface Task {
	"request-prompt": string
	goal: string
}

export interface PipelineVariant {
	path: string
	kind: MediaKind
	signature: number
	uncompressedSize: number
}

export interface ParsedSample {
	id: string
	task: Task
	pipelines: Record<string, PipelineVariant>
}

export interface ComparisonItem {
	sampleHex: string
	sampleId: string
	task: Task
	leftPipeline: string
	rightPipeline: string
	leftPath: string
	rightPath: string
	leftSignature: number
	rightSignature: number
	leftUncompressedSize: number
	rightUncompressedSize: number
}

export interface ComparisonVote {
	sampleHex: string
	leftPipeline: string
	rightPipeline: string
	primaryDimension: RatingDimension
	scores: HierarchicalScores
}
