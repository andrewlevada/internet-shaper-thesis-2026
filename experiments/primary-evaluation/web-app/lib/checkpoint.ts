import {
	buildResultZip,
	downloadBlob,
	formatCheckpointFilename,
} from "./export"
import type { ComparisonVote } from "./types"

export const CHECKPOINT_EVERY_VOTES = 50

export function saveVoteCheckpointIfNeeded(
	votes: ComparisonVote[],
	seed: number,
	lastSavedAtVoteCount: number,
): number {
	const count = votes.length
	if (
		count === 0 ||
		count % CHECKPOINT_EVERY_VOTES !== 0 ||
		count <= lastSavedAtVoteCount
	) {
		return lastSavedAtVoteCount
	}

	const { blob } = buildResultZip(votes, seed)
	downloadBlob(blob, formatCheckpointFilename(count))
	return count
}
