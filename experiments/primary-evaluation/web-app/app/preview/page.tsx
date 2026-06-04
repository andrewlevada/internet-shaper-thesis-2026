"use client"

import { useRouter } from "next/navigation"
import { useEffect, useMemo } from "react"
import Button from "@/components/button"
import { LazyMediaCard } from "@/components/media-card"
import { formatSampleNumber } from "@/lib/sample-id"
import { useEvalStore } from "@/store/eval-store"

export default function Preview() {
	const router = useRouter()
	const status = useEvalStore((state) => state.status)
	const mediaKind = useEvalStore((state) => state.mediaKind)
	const archive = useEvalStore((state) => state.archive)
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
						pipeline: pipeline,
						label,
						path: variant.path,
						kind: variant.kind,
					}))
			})
	}, [samples])

	useEffect(() => {
		if (status === "idle") {
			router.replace("/")
		}
		console.log(previewItems.map((i) => i.pipeline).join(" "))
	}, [status, router])

	const handleOk = () => {
		void reset()
		router.push("/")
	}

	if (status === "idle" || !archive) {
		return null
	}

	const previewLabel =
		mediaKind === "mhtml" ? "Preview captured pages" : "Preview screenshots"

	return (
		<div className="w-full h-full pt-4 pb-10">
			<div className="flex flex-col gap-8 items-center">
				<h1>{previewLabel}</h1>

				<div className="w-full grid grid-cols-2 gap-4 justify-items-center min-w-[80vw]">
					{previewItems
						.filter((i) => i.pipeline === "1-original")
						.map((item) => (
							<LazyMediaCard
								key={item.key}
								archive={archive}
								path={item.path}
								kind={item.kind}
								alt={`Sample ${item.label}`}
								label={item.label}
								className="zoom-50 max-w-full"
							/>
						))}
				</div>

				<Button onClick={handleOk}>OK</Button>
			</div>
		</div>
	)
}
