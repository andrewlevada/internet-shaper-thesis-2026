export const MEDIA_REVEAL_DELAY_MS = 1000

export function waitAtLeast(ms: number, startedAt: number): Promise<void> {
	const remaining = ms - (Date.now() - startedAt)
	if (remaining <= 0) {
		return Promise.resolve()
	}
	return new Promise((resolve) => {
		setTimeout(resolve, remaining)
	})
}
