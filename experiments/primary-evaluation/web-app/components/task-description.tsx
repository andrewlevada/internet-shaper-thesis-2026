import type { Task } from "@/lib/types"

export default function TaskDescription({
	task,
}: Readonly<{
	task: Task
}>) {
	return (
		<div className="flex flex-col gap-2 w-full p-4 rounded-[12px] border border-accent/30 bg-white/60">
			<p>
				<span className="font-semibold">Task:</span> {task["request-prompt"]}
			</p>

			<p>
				<span className="font-semibold">Goal:</span> {task.goal}
			</p>
		</div>
	)
}
