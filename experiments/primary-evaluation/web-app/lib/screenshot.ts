export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
	if (a.length !== b.length) {
		return false
	}
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) {
			return false
		}
	}
	return true
}

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
