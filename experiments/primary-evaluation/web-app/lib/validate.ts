import { assetNameForKind, detectMediaKind, type MediaKind } from "./media"
import type { ParsedSample, Task } from "./types"
import type { ZipArchive, ZipEntryMeta } from "./zip-archive"

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

function requireEntryMeta(
	meta: Map<string, ZipEntryMeta>,
	path: string,
	sampleId: string,
): ZipEntryMeta {
	const entry = meta.get(path)
	if (!entry) {
		throw new Error(`Sample ${sampleId}: missing ${path}`)
	}
	return entry
}

export async function parseSamplesFromArchive(
	archive: ZipArchive,
	entryMeta: Map<string, ZipEntryMeta>,
): Promise<{ samples: ParsedSample[]; mediaKind: MediaKind }> {
	const paths = [...entryMeta.keys()]
	const mediaKind = detectMediaKind(paths)
	const assetName = assetNameForKind(mediaKind)
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
		const sampleId = sampleRoot
		const taskPath = `${sampleRoot}/task.json`
		const taskRaw = await archive.readText(taskPath)
		const task = parseTaskJson(taskRaw, sampleId)
		const pipelines: ParsedSample["pipelines"] = {}

		for (const pipeline of referencePipelines) {
			const assetPath = `${sampleRoot}/${pipeline}/${assetName}`
			const assetMeta = requireEntryMeta(entryMeta, assetPath, sampleId)

			pipelines[pipeline] = {
				path: assetPath,
				kind: mediaKind,
				signature: assetMeta.signature,
				uncompressedSize: assetMeta.uncompressedSize,
			}
		}

		samples.push({ id: sampleId, task, pipelines })
	}

	return { samples, mediaKind }
}

export function revokeBlobUrls(urls: Iterable<string>): void {
	for (const url of urls) {
		if (url) {
			URL.revokeObjectURL(url)
		}
	}
}
