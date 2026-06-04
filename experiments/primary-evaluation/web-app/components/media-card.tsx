"use client"

import { useEffect, useRef, useState } from "react"
import {
	COMPARISON_ZOOM,
	type MediaKind,
	PREVIEW_VIEWPORT_HEIGHT_PX,
	PREVIEW_VIEWPORT_WIDTH_PX,
} from "@/lib/media"
import type { ZipArchive } from "@/lib/zip-archive"

function PreviewViewport({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	return (
		<div
			className="overflow-auto rounded-[1px]"
			style={{
				width: PREVIEW_VIEWPORT_WIDTH_PX,
				height: PREVIEW_VIEWPORT_HEIGHT_PX,
			}}
		>
			{children}
		</div>
	)
}

function MhtmlFrame({
	src,
	title,
	fixedViewport,
}: Readonly<{
	src: string
	title: string
	fixedViewport: boolean
}>) {
	if (fixedViewport) {
		return (
			<PreviewViewport>
				<iframe
					src={src}
					title={title}
					className="block h-full w-full border-0"
				/>
			</PreviewViewport>
		)
	}

	return (
		<div className="h-[80vh] max-h-[900px] w-[1440px] overflow-auto rounded-[1px]">
			<iframe src={src} title={title} className="min-h-full w-full border-0" />
		</div>
	)
}

export default function MediaCard({
	src,
	kind,
	alt,
	label,
	className = "",
	variant = "default",
}: Readonly<{
	src: string | null
	kind: MediaKind
	alt: string
	label?: string
	className?: string
	variant?: "default" | "comparison" | "intro"
}>) {
	const fixedViewport = variant === "comparison" || variant === "intro"
	const zoom = variant === "comparison" ? COMPARISON_ZOOM : 1

	const paper = (
		<div className="w-fit rounded-[1px] bg-white p-2 shadow-[0_10px_28px_rgba(0,0,0,0.2)] border border-black/10">
			{!src ? (
				fixedViewport ? (
					<PreviewViewport>
						<div className="flex h-full items-center justify-center text-sm text-accent/50">
							Loading…
						</div>
					</PreviewViewport>
				) : (
					<div className="flex h-[80vh] max-h-[900px] items-center justify-center text-sm text-accent/50">
						Loading…
					</div>
				)
			) : kind === "screenshot" ? (
				fixedViewport ? (
					<PreviewViewport>
						{/* biome-ignore lint/performance/noImgElement: dynamically loaded content */}
						<img
							src={src}
							alt={alt}
							className="block max-h-full max-w-full h-auto w-auto rounded-[1px]"
						/>
					</PreviewViewport>
				) : (
					// biome-ignore lint/performance/noImgElement: dynamically loaded content
					<img src={src} alt={alt} className="w-full h-auto rounded-[1px]" />
				)
			) : (
				<MhtmlFrame src={src} title={alt} fixedViewport={fixedViewport} />
			)}
		</div>
	)

	const content =
		fixedViewport && zoom !== 1 ? (
			<div className="origin-top" style={{ zoom }}>
				{paper}
			</div>
		) : (
			paper
		)

	return (
		<div className={`flex flex-col items-center gap-2 ${className}`}>
			{label ? (
				<span className="text-sm font-semibold text-accent/70">{label}</span>
			) : null}
			{content}
		</div>
	)
}

export function LazyMediaCard({
	archive,
	path,
	kind,
	alt,
	label,
	className = "",
}: Readonly<{
	archive: ZipArchive
	path: string
	kind: MediaKind
	alt: string
	label?: string
	className?: string
}>) {
	const rootRef = useRef<HTMLDivElement>(null)
	const [src, setSrc] = useState<string | null>(null)

	useEffect(() => {
		const root = rootRef.current
		if (!root) {
			return
		}

		let cancelled = false
		let blobUrl = ""

		const load = async () => {
			try {
				blobUrl = await archive.createMediaUrl(path, kind)
				if (!cancelled) {
					setSrc(blobUrl)
				} else {
					URL.revokeObjectURL(blobUrl)
				}
			} catch {
				if (!cancelled) {
					setSrc(null)
				}
			}
		}

		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry.isIntersecting) {
					observer.disconnect()
					void load()
				}
			},
			{ rootMargin: "200px" },
		)

		observer.observe(root)

		return () => {
			cancelled = true
			observer.disconnect()
			if (blobUrl) {
				URL.revokeObjectURL(blobUrl)
			}
		}
	}, [archive, path, kind])

	return (
		<div ref={rootRef}>
			<MediaCard
				src={src}
				kind={kind}
				alt={alt}
				label={label}
				className={className}
			/>
		</div>
	)
}
