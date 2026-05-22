"use client"

import { useRouter } from "next/navigation"
import { useEffect, useMemo } from "react"
import ComparisonView from "@/components/comparison-view"
import LikertScale from "@/components/likert-scale"
import ProgressBar from "@/components/progress-bar"
import SamplePresenter from "@/components/sample-presenter"
import TaskDescription from "@/components/task-description"
import { findOriginalPipeline } from "@/lib/screenshot"
import type { Rating } from "@/lib/types"
import { useEvalStore } from "@/store/eval-store"

export default function Trial() {
	const router = useRouter()
	const status = useEvalStore((state) => state.status)
	const queue = useEvalStore((state) => state.queue)
	const samples = useEvalStore((state) => state.samples)
	const currentIndex = useEvalStore((state) => state.currentIndex)
	const votes = useEvalStore((state) => state.votes)
	const acknowledgedSamples = useEvalStore((state) => state.acknowledgedSamples)
	const recordVote = useEvalStore((state) => state.recordVote)
	const acknowledgeSample = useEvalStore((state) => state.acknowledgeSample)

	const current = queue[currentIndex]
	const progressFraction = queue.length > 0 ? votes.length / queue.length : 0

	const needsIntro =
		current !== undefined && !acknowledgedSamples.includes(current.sampleHex)

	const originalScreenshotUrl = useMemo(() => {
		if (!current) {
			return ""
		}
		const sample = samples.find((entry) => entry.id === current.sampleId)
		if (!sample) {
			return ""
		}
		const pipeline = findOriginalPipeline(sample.pipelines)
		return sample.pipelines[pipeline]?.screenshotUrl ?? ""
	}, [current, samples])

	useEffect(() => {
		if (status === "idle") {
			router.replace("/")
			return
		}
		if (status === "complete") {
			router.replace("/results")
		}
	}, [status, router])

	const handleSelect = (rating: Rating) => {
		recordVote(rating)
	}

	if (status !== "running" || !current) {
		return null
	}

	return (
		<div className="w-full h-full pt-4">
			<div className="flex flex-col gap-6">
				<ProgressBar fraction={progressFraction} />

				{needsIntro ? (
					<SamplePresenter
						task={current.task}
						originalScreenshotUrl={originalScreenshotUrl}
						onContinue={() => acknowledgeSample(current.sampleHex)}
					/>
				) : (
					<>
						<TaskDescription task={current.task} />
						<ComparisonView
							leftScreenshotUrl={current.leftScreenshotUrl}
							rightScreenshotUrl={current.rightScreenshotUrl}
						/>
						<LikertScale onSelect={handleSelect} />
					</>
				)}
			</div>
		</div>
	)
}
