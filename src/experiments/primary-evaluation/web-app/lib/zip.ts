export function createBlobUrl(data: Uint8Array, mimeType: string): string {
	const copy = new Uint8Array(data)
	const blob = new Blob([copy], { type: mimeType })
	return URL.createObjectURL(blob)
}
