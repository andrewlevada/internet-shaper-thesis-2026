import type { ParsedSample, Task } from "./types"
import { createBlobUrl, decodeText } from "./zip"

const PIPELINE_FOLDER_PATTERN = /^\d+-[\w-]+$/

function parseTaskJson(raw: string, sampleId: string): Task {
	let parsed: unknown
	try {
		parsed = JSON.parse(raw)
	} catch {
		throw new Error(`Sample ${sampleId}: task.json is not valid JSON`)
	}

	if (typeof parsed !== "object" || parsed === null) {
		throw new Error(`Sample ${sampleId}: task.json must be an object`)
	}

	const task = parsed as Record<string, unknown>
	const requestPrompt = task["request-prompt"]
	const goal = task.goal

	if (typeof requestPrompt !== "string" || !requestPrompt.trim()) {
		throw new Error(
			`Sample ${sampleId}: task.json must include non-empty request-prompt`,
		)
	}

	if (typeof goal !== "string" || !goal.trim()) {
		throw new Error(`Sample ${sampleId}: task.json must include non-empty goal`)
	}

	return {
		"request-prompt": requestPrompt.trim(),
		goal: goal.trim(),
	}
}

function findSampleRoots(paths: string[]): string[] {
	const roots = new Set<string>()
	for (const path of paths) {
		if (path.endsWith("/task.json") || path === "task.json") {
			const root = path.slice(0, -"/task.json".length)
			if (root) {
				roots.add(root)
			}
		}
	}
	return [...roots].sort()
}

function getPipelineFolders(paths: string[], sampleRoot: string): string[] {
	const prefix = `${sampleRoot}/`
	const folders = new Set<string>()

	for (const path of paths) {
		if (!path.startsWith(prefix)) {
			continue
		}
		const rest = path.slice(prefix.length)
		const [folder] = rest.split("/")
		if (folder && PIPELINE_FOLDER_PATTERN.test(folder)) {
			folders.add(folder)
		}
	}

	return [...folders].sort()
}

function hasScreenshot(
	files: Map<string, Uint8Array>,
	sampleRoot: string,
	pipeline: string,
): boolean {
	return files.has(`${sampleRoot}/${pipeline}/screenshot.png`)
}

export function parseSamplesFromZip(
	files: Map<string, Uint8Array>,
): ParsedSample[] {
	const paths = [...files.keys()]
	const sampleRoots = findSampleRoots(paths)

	if (sampleRoots.length === 0) {
		throw new Error("Archive must contain at least one sample with task.json")
	}

	const pipelineSets = sampleRoots.map((root) =>
		getPipelineFolders(paths, root),
	)
	const referencePipelines = pipelineSets[0]

	if (referencePipelines.length === 0) {
		throw new Error(
			`Sample ${sampleRoots[0]}: no pipeline folders found (expected names like 1-original)`,
		)
	}

	for (let i = 1; i < sampleRoots.length; i++) {
		const current = pipelineSets[i]
		const referenceKey = referencePipelines.join(",")
		const currentKey = current.join(",")
		if (referenceKey !== currentKey) {
			throw new Error(
				`Pipeline mismatch: sample ${sampleRoots[0]} has [${referenceKey}], sample ${sampleRoots[i]} has [${currentKey}]`,
			)
		}
	}

	const samples: ParsedSample[] = []

	for (const sampleRoot of sampleRoots) {
		const sampleId = sampleRoot.split("/").pop() ?? sampleRoot
		const taskPath = `${sampleRoot}/task.json`
		const taskData = files.get(taskPath)

		if (!taskData) {
			throw new Error(`Sample ${sampleId}: missing task.json`)
		}

		const task = parseTaskJson(decodeText(taskData), sampleId)
		const pipelines: ParsedSample["pipelines"] = {}

		for (const pipeline of referencePipelines) {
			const screenshotPath = `${sampleRoot}/${pipeline}/screenshot.png`
			const screenshotData = files.get(screenshotPath)

			if (!screenshotData) {
				throw new Error(
					`Sample ${sampleId}: missing ${pipeline}/screenshot.png`,
				)
			}

			pipelines[pipeline] = {
				screenshotUrl: createBlobUrl(screenshotData, "image/png"),
				screenshotBytes: screenshotData,
			}
		}

		samples.push({ id: sampleId, task, pipelines })
	}

	return samples
}

export function revokeSampleUrls(samples: ParsedSample[]): void {
	for (const sample of samples) {
		for (const pipeline of Object.values(sample.pipelines)) {
			URL.revokeObjectURL(pipeline.screenshotUrl)
		}
	}
}
