import { zipSync } from "fflate"
import { buildPairsCsv, buildWinMatrixCsv } from "./scoring"
import type { ComparisonVote } from "./types"

export function formatResultFilename(date = new Date()): string {
	const pad = (value: number) => String(value).padStart(2, "0")
	const year = date.getFullYear()
	const month = pad(date.getMonth() + 1)
	const day = pad(date.getDate())
	const hours = pad(date.getHours())
	const minutes = pad(date.getMinutes())
	const seconds = pad(date.getSeconds())
	return `eval-result-${year}-${month}-${day}T${hours}-${minutes}-${seconds}.zip`
}

export function buildResultZip(
	votes: ComparisonVote[],
	seed: number,
): { filename: string; blob: Blob } {
	const pairsCsv = buildPairsCsv(votes, seed)
	const winMatrixCsv = buildWinMatrixCsv(votes)

	const zipped = zipSync({
		"pairs.csv": new TextEncoder().encode(pairsCsv),
		"win-matrix.csv": new TextEncoder().encode(winMatrixCsv),
	})

	const blob = new Blob([new Uint8Array(zipped)], { type: "application/zip" })
	return { filename: formatResultFilename(), blob }
}

export function downloadBlob(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob)
	const anchor = document.createElement("a")
	anchor.href = url
	anchor.download = filename
	anchor.click()
	URL.revokeObjectURL(url)
}
