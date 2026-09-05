"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"
import Button from "@/components/button"
import { useEvalStore } from "@/store/eval-store"

export default function Results() {
	const router = useRouter()
	const status = useEvalStore((state) => state.status)
	const downloadResults = useEvalStore((state) => state.downloadResults)
	const reset = useEvalStore((state) => state.reset)

	useEffect(() => {
		if (status !== "complete") {
			router.replace("/")
		}
	}, [status, router])

	const handleFinish = () => {
		reset()
		router.push("/")
	}

	if (status !== "complete") {
		return null
	}

	return (
		<div className="w-full h-full pt-10">
			<div className="flex flex-col gap-10 items-center">
				<h1>Evaluation complete</h1>

				<p className="text-center max-w-[480px]">
					Download the result archive with pairwise ratings and aggregated
					scores, then finish to start a new evaluation.
				</p>

				<div className="flex flex-row gap-4">
					<Button onClick={downloadResults}>Download results</Button>
					<Button variant="secondary" onClick={handleFinish}>
						Finish
					</Button>
				</div>
			</div>
		</div>
	)
}
