import ScreenshotCard from "@/components/screenshot-card"

export default function ComparisonView({
	leftScreenshotUrl,
	rightScreenshotUrl,
}: Readonly<{
	leftScreenshotUrl: string
	rightScreenshotUrl: string
}>) {
	return (
		<div className="relative -mx-[140px] w-[calc(100%+280px)] flex flex-row justify-center items-start gap-6 overflow-visible py-4">
			<ScreenshotCard
				src={leftScreenshotUrl}
				alt="Left variant screenshot"
				label="Left"
				className="w-[45vw] flex-shrink-0 -rotate-2 translate-y-1"
			/>
			<ScreenshotCard
				src={rightScreenshotUrl}
				alt="Right variant screenshot"
				label="Right"
				className="w-[45vw] flex-shrink-0 rotate-2 translate-y-3"
			/>
		</div>
	)
}
