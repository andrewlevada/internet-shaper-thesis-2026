"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"
import ComparisonView from "@/components/comparison-view"
import LikertScale from "@/components/likert-scale"
import ProgressBar from "@/components/progress-bar"
import SamplePresenter from "@/components/sample-presenter"
import TaskDescription from "@/components/task-description"
import type { Rating } from "@/lib/types"
import { useEvalStore } from "@/store/eval-store"

export default function Trial() {
	const router = useRouter()
	const status = useEvalStore((state) => state.status)
	const mediaKind = useEvalStore((state) => state.mediaKind)
	const queue = useEvalStore((state) => state.queue)
	const currentIndex = useEvalStore((state) => state.currentIndex)
	const votes = useEvalStore((state) => state.votes)
	const acknowledgedSamples = useEvalStore((state) => state.acknowledgedSamples)
	const displayMedia = useEvalStore((state) => state.displayMedia)
	const mediaLoading = useEvalStore((state) => state.mediaLoading)
	const mediaError = useEvalStore((state) => state.mediaError)
	const recordVote = useEvalStore((state) => state.recordVote)
	const acknowledgeSample = useEvalStore((state) => state.acknowledgeSample)
	const loadDisplayMedia = useEvalStore((state) => state.loadDisplayMedia)

	const current = queue[currentIndex]
	const progressFraction = queue.length > 0 ? votes.length / queue.length : 0

	const needsIntro =
		current !== undefined && !acknowledgedSamples.includes(current.sampleHex)

	useEffect(() => {
		if (status === "idle") {
			router.replace("/")
			return
		}
		if (status === "complete") {
			router.replace("/results")
		}
	}, [status, router])

	useEffect(() => {
		if (status !== "running" || !current) {
			return
		}
		void loadDisplayMedia()
	}, [
		status,
		current,
		currentIndex,
		needsIntro,
		current?.leftPath,
		current?.rightPath,
		loadDisplayMedia,
	])

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

				{mediaError ? (
					<p className="text-sm text-red-700 text-center">{mediaError}</p>
				) : null}

				{needsIntro ? (
					<SamplePresenter
						task={current.task}
						originalSrc={displayMedia?.original ?? null}
						kind={mediaKind}
						loading={mediaLoading}
						onContinue={() => acknowledgeSample(current.sampleHex)}
					/>
				) : (
					<>
						<TaskDescription task={current.task} />
						<ComparisonView
							leftSrc={displayMedia?.left ?? null}
							rightSrc={displayMedia?.right ?? null}
							kind={mediaKind}
							loading={mediaLoading}
						/>
						<LikertScale onSelect={handleSelect} />
					</>
				)}
			</div>
		</div>
	)
}
