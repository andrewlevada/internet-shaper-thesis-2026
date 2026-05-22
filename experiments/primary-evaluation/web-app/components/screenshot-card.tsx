export default function ScreenshotCard({
	src,
	alt,
	label,
	className = "",
}: Readonly<{
	src: string
	alt: string
	label?: string
	className?: string
}>) {
	return (
		<div className={`flex flex-col items-center gap-2 ${className}`}>
			{label ? (
				<span className="text-sm font-semibold text-accent/70">{label}</span>
			) : null}
			<div className="w-full rounded-[1px] bg-white p-2 shadow-[0_10px_28px_rgba(0,0,0,0.2)] border border-black/10">
				{/* eslint-disable-next-line @next/next/no-img-element */}
				<img src={src} alt={alt} className="w-full h-auto rounded-[1px]" />
			</div>
		</div>
	)
}
