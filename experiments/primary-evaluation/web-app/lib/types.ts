export type Rating =
	| "left_better"
	| "left_slightly"
	| "similar"
	| "right_slightly"
	| "right_better"

export type EvalStatus = "idle" | "running" | "complete"

export interface Task {
	"request-prompt": string
	goal: string
}

export interface PipelineVariant {
	screenshotUrl: string
	screenshotBytes: Uint8Array
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
	leftScreenshotUrl: string
	rightScreenshotUrl: string
	leftScreenshotBytes: Uint8Array
	rightScreenshotBytes: Uint8Array
}

export interface ComparisonVote {
	sampleHex: string
	leftPipeline: string
	rightPipeline: string
	rating: Rating
}
