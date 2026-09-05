import Button from "@/components/button"
import type { LikertRating, RatingDimension } from "@/lib/types"

const LIKERT_OPTIONS: { value: LikertRating; label: string }[] = [
	{ value: "left_better", label: "Left better" },
	{ value: "left_slightly", label: "Left slightly better" },
	{ value: "similar", label: "Similar" },
	{ value: "right_slightly", label: "Right slightly better" },
	{ value: "right_better", label: "Right better" },
]

const DIMENSIONS: {
	id: RatingDimension
	title: string
}[] = [
	{
		id: "goal",
		title: "Goal alignment",
	},
	{
		id: "structural",
		title: "Structural cohesion",
	},
	{
		id: "design",
		title: "Design alignment",
	},
]

export default function HierarchicalRating({
	onSelect,
	disabled = false,
}: Readonly<{
	onSelect: (dimension: RatingDimension, value: LikertRating) => void
	disabled?: boolean
}>) {
	return (
		<div className="flex flex-col gap-6 w-full">
			{DIMENSIONS.map((dimension) => (
				<div key={dimension.id} className="flex flex-col gap-2">
					<p className="font-semibold text-center">{dimension.title}</p>
					<div className="flex flex-row flex-wrap justify-center gap-2">
						{LIKERT_OPTIONS.map((option) => (
							<Button
								key={`${dimension.id}-${option.value}`}
								variant="secondary"
								className="text-sm"
								disabled={disabled}
								onClick={() => onSelect(dimension.id, option.value)}
							>
								{option.label}
							</Button>
						))}
					</div>
				</div>
			))}
		</div>
	)
}
