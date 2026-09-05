export function formatSampleNumber(sampleId: string): string {
	const leaf = sampleId.split("/").pop() ?? sampleId
	return leaf
}
