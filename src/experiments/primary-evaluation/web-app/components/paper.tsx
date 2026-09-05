import Image from "next/image"
import paper from "./paper.png"

export function PaperSheet({
	children,
}: Readonly<{
	children: React.ReactNode
}>): React.ReactNode {
	return (
		<div className="w-[1000px] max-w-full flex flex-col p-[40px] bg-[rgba(240,240,255,0.97)] rounded-[1px] relative overflow-visible">
			<div className="flex flex-col z-1 overflow-visible">{children}</div>

			<Image
				src={paper}
				alt=""
				className="absolute top-0 left-0 right-0 h-auto z-0 rounded-[1px] mix-blend-darken"
				loading="eager"
			/>
		</div>
	)
}
