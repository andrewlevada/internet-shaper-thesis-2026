import MediaCard from "@/components/media-card"
import type { MediaKind } from "@/lib/media"

export default function ComparisonView({
	leftSrc,
	rightSrc,
	kind,
	contentVisible,
	contentKey,
}: Readonly<{
	leftSrc: string | null
	rightSrc: string | null
	kind: MediaKind
	contentVisible: boolean
	contentKey: string
}>) {
	const hideContent = !contentVisible

	return (
		<div className="relative mx-[-140px] w-[calc(100%+280px)] flex flex-row justify-center items-start gap-6 overflow-visible py-4">
			<MediaCard
				src={hideContent ? null : leftSrc}
				kind={kind}
				alt="Left variant"
				label="Left"
				variant="comparison"
				className="shrink-0 -rotate-2 translate-y-1"
				hideContent={hideContent}
				contentKey={contentKey}
			/>
			<MediaCard
				src={hideContent ? null : rightSrc}
				kind={kind}
				alt="Right variant"
				label="Right"
				variant="comparison"
				className="shrink-0 rotate-2 translate-y-3"
				hideContent={hideContent}
				contentKey={contentKey}
			/>
		</div>
	)
}
