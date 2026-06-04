export function findOriginalPipeline(
	pipelines: Record<string, unknown>,
): string {
	const original = Object.keys(pipelines).find((name) =>
		name.includes("original"),
	)
	if (original) {
		return original
	}
	return Object.keys(pipelines).sort()[0]
}
