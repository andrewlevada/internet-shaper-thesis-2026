import Button from "@/components/button"
import MediaCard from "@/components/media-card"
import TaskDescription from "@/components/task-description"
import type { MediaKind } from "@/lib/media"
import type { Task } from "@/lib/types"

export default function SamplePresenter({
	task,
	originalSrc,
	kind,
	loading,
	onContinue,
}: Readonly<{
	task: Task
	originalSrc: string | null
	kind: MediaKind
	loading?: boolean
	onContinue: () => void
}>) {
	return (
		<div className="flex flex-col gap-6 items-center">
			<div className="relative -mx-[80px] w-[calc(100%+160px)] flex justify-center overflow-visible">
				<MediaCard
					src={loading ? null : originalSrc}
					kind={kind}
					alt="Original page"
					variant="intro"
					className="-rotate-1"
				/>
			</div>

			<TaskDescription task={task} />

			<Button onClick={onContinue} disabled={loading || !originalSrc}>
				Got it
			</Button>
		</div>
	)
}
