import Button from "@/components/button"
import type { Rating } from "@/lib/types"

const OPTIONS: { value: Rating; label: string }[] = [
	{ value: "left_better", label: "Left better" },
	{ value: "left_slightly", label: "Left slightly better" },
	{ value: "similar", label: "Similar" },
	{ value: "right_slightly", label: "Right slightly better" },
	{ value: "right_better", label: "Right better" },
]

export default function LikertScale({
	onSelect,
	disabled = false,
}: Readonly<{
	onSelect: (rating: Rating) => void
	disabled?: boolean
}>) {
	return (
		<div className="flex flex-row flex-wrap justify-center gap-2 w-full">
			{OPTIONS.map((option) => (
				<Button
					key={option.value}
					variant="secondary"
					className="text-sm"
					disabled={disabled}
					onClick={() => onSelect(option.value)}
				>
					{option.label}
				</Button>
			))}
		</div>
	)
}
