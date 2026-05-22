import Button from "@/components/button"
import ScreenshotCard from "@/components/screenshot-card"
import TaskDescription from "@/components/task-description"
import type { Task } from "@/lib/types"

export default function SamplePresenter({
	task,
	originalScreenshotUrl,
	onContinue,
}: Readonly<{
	task: Task
	originalScreenshotUrl: string
	onContinue: () => void
}>) {
	return (
		<div className="flex flex-col gap-6 items-center">
			<div className="relative -mx-[80px] w-[calc(100%+160px)] flex justify-center overflow-visible">
				<ScreenshotCard
					src={originalScreenshotUrl}
					alt="Original page screenshot"
					className="w-[70vw] -rotate-1"
				/>
			</div>

			<TaskDescription task={task} />

			<Button onClick={onContinue}>Got it</Button>
		</div>
	)
}
