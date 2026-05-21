export default function Button({
	children,
}: Readonly<{
	children: React.ReactNode
}>) {
	return (
		<button
			type="button"
			className="w-fit flex flex-row gap-1 px-5 py-2 rounded-[12px] bg-accent text-white font-semibold"
		>
			{children}
		</button>
	)
}
