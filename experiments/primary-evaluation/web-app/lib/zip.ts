import { unzip } from "fflate"

export async function parseZipFile(
	file: File,
): Promise<Map<string, Uint8Array>> {
	const buffer = await file.arrayBuffer()
	const entries = await new Promise<Record<string, Uint8Array>>(
		(resolve, reject) => {
			unzip(new Uint8Array(buffer), (error, data) => {
				if (error) {
					reject(error)
					return
				}
				resolve(data)
			})
		},
	)

	const files = new Map<string, Uint8Array>()
	for (const [path, data] of Object.entries(entries)) {
		const normalized = path.replace(/\\/g, "/").replace(/^\/+/, "")
		if (normalized.endsWith("/")) {
			continue
		}
		files.set(normalized, data)
	}

	return files
}

export function decodeText(data: Uint8Array): string {
	return new TextDecoder().decode(data)
}

export function createBlobUrl(data: Uint8Array, mimeType: string): string {
	const copy = new Uint8Array(data)
	const blob = new Blob([copy], { type: mimeType })
	return URL.createObjectURL(blob)
}
