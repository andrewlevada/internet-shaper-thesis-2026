export default function ProgressBar({
	fraction,
}: Readonly<{
	fraction: number
}>) {
	return (
		<div
			className="w-full h-1.5 rounded-full bg-accent/15 overflow-hidden"
			role="progressbar"
			aria-valuenow={Math.round(fraction * 100)}
			aria-valuemin={0}
			aria-valuemax={100}
		>
			<div
				className="h-full bg-accent/40 transition-all duration-300 ease-out"
				style={{ width: `${fraction * 100}%` }}
			/>
		</div>
	)
}
