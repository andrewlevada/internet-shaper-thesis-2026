import type {
	HierarchicalScores,
	LikertRating,
	RatingDimension,
	ScaleRating,
} from "./types"

export function inferHierarchicalScores(
	dimension: RatingDimension,
	value: LikertRating,
): HierarchicalScores {
	switch (dimension) {
		case "goal":
			if (value === "similar") {
				return {
					goalAlignment: "similar",
					structuralCohesion: "similar",
					designAlignment: "similar",
				}
			}
			return {
				goalAlignment: value,
				structuralCohesion: "na",
				designAlignment: "na",
			}
		case "structural":
			return {
				goalAlignment: "similar",
				structuralCohesion: value,
				designAlignment: "na",
			}
		case "design":
			return {
				goalAlignment: "similar",
				structuralCohesion: "similar",
				designAlignment: value,
			}
	}
}

export function likertToPairScores(rating: LikertRating): {
	left: number
	right: number
} {
	switch (rating) {
		case "left_better":
		case "left_slightly":
			return { left: 1, right: 0 }
		case "similar":
			return { left: 0, right: 0 }
		case "right_slightly":
		case "right_better":
			return { left: 0, right: 1 }
	}
}

export function scaleRatingToPairScores(rating: ScaleRating): {
	left: number
	right: number
} | null {
	if (rating === "na") {
		return null
	}
	return likertToPairScores(rating)
}
