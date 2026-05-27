"use client"

import { useRouter } from "next/navigation"
import { useEffect, useMemo } from "react"
import Button from "@/components/button"
import ScreenshotCard from "@/components/screenshot-card"
import { formatSampleNumber } from "@/lib/sample-id"
import { useEvalStore } from "@/store/eval-store"

export default function Preview() {
	const router = useRouter()
	const status = useEvalStore((state) => state.status)
	const samples = useEvalStore((state) => state.samples)
	const reset = useEvalStore((state) => state.reset)

	const previewItems = useMemo(() => {
		return [...samples]
			.sort((left, right) => left.id.localeCompare(right.id))
			.flatMap((sample) => {
				const label = formatSampleNumber(sample.id)
				return Object.entries(sample.pipelines)
					.sort(([left], [right]) => left.localeCompare(right))
					.map(([pipeline, variant]) => ({
						key: `${sample.id}/${pipeline}`,
						label,
						screenshotUrl: variant.screenshotUrl,
					}))
			})
	}, [samples])

	useEffect(() => {
		if (status === "idle") {
			router.replace("/")
		}
	}, [status, router])

	const handleOk = () => {
		reset()
		router.push("/")
	}

	if (status === "idle") {
		return null
	}

	return (
		<div className="w-full h-full pt-4 pb-10">
			<div className="flex flex-col gap-8 items-center">
				<h1>Preview screenshots</h1>

				<div className="w-full grid grid-cols-6 gap-4 justify-items-center min-w-[80vw]">
					{previewItems.map((item) => (
						<ScreenshotCard
							key={item.key}
							src={item.screenshotUrl}
							alt={`Sample ${item.label} screenshot`}
							label={item.label}
							className="w-[600px] max-w-full"
						/>
					))}
				</div>

				<Button onClick={handleOk}>OK</Button>
			</div>
		</div>
	)
}
