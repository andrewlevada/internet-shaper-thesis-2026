"use client"

import { useRouter } from "next/navigation"
import { useRef, useState } from "react"
import Button from "@/components/button"
import { useEvalStore } from "@/store/eval-store"

export default function Home() {
	const router = useRouter()
	const fileInputRef = useRef<HTMLInputElement>(null)
	const [selectedFile, setSelectedFile] = useState<File | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [loading, setLoading] = useState(false)
	const initFromZip = useEvalStore((state) => state.initFromZip)

	const handleFileChange = () => {
		const file = fileInputRef.current?.files?.[0] ?? null
		setSelectedFile(file)
		setError(null)
	}

	const handleStart = async () => {
		if (!selectedFile) {
			setError("Please select a zip archive first")
			return
		}

		setLoading(true)
		setError(null)

		try {
			await initFromZip(selectedFile)
			router.push("/trial")
		} catch (cause) {
			const message =
				cause instanceof Error ? cause.message : "Failed to load archive"
			setError(message)
		} finally {
			setLoading(false)
		}
	}

	return (
		<div className="w-full h-full pt-10">
			<div className="flex flex-col gap-10 items-center">
				<h1>~ Internet Shaper Evaluator ~</h1>

				<div className="flex flex-col gap-4 items-center">
					<input
						ref={fileInputRef}
						type="file"
						accept=".zip"
						onChange={handleFileChange}
						className="w-[280px] h-[120px] rounded-[12px] border border-accent text-center p-4"
					/>

					{selectedFile ? (
						<p className="text-sm text-accent/70">{selectedFile.name}</p>
					) : null}

					{error ? (
						<p className="text-sm text-red-700 max-w-[480px] text-center">
							{error}
						</p>
					) : null}

					<Button onClick={handleStart} disabled={loading || !selectedFile}>
						{loading ? "Loading…" : "Start"}
					</Button>
				</div>
			</div>
		</div>
	)
}
