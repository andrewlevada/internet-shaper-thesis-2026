import MediaCard from "@/components/media-card"
import type { MediaKind } from "@/lib/media"

export default function ComparisonView({
	leftSrc,
	rightSrc,
	kind,
	loading,
}: Readonly<{
	leftSrc: string | null
	rightSrc: string | null
	kind: MediaKind
	loading?: boolean
}>) {
	return (
		<div className="relative mx-[-140px] w-[calc(100%+280px)] flex flex-row justify-center items-start gap-6 overflow-visible py-4">
			<MediaCard
				src={loading ? null : leftSrc}
				kind={kind}
				alt="Left variant"
				label="Left"
				variant="comparison"
				className="shrink-0 -rotate-2 translate-y-1"
			/>
			<MediaCard
				src={loading ? null : rightSrc}
				kind={kind}
				alt="Right variant"
				label="Right"
				variant="comparison"
				className="shrink-0 rotate-2 translate-y-3"
			/>
		</div>
	)
}
