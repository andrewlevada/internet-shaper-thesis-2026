"use client"

import type { DisplayMedia } from "@/lib/display-media"
import type { MediaKind } from "@/lib/media"

function urlsFromDisplayMedia(media: DisplayMedia): string[] {
	return [media.left, media.right, media.original].filter(Boolean)
}

export default function MediaPreloader({
	kind,
	displayMedia,
	prefetched,
}: Readonly<{
	kind: MediaKind
	displayMedia: DisplayMedia | null
	prefetched: Iterable<DisplayMedia>
}>) {
	if (kind !== "mhtml") {
		return null
	}

	const urls = new Set<string>()
	for (const media of prefetched) {
		for (const url of urlsFromDisplayMedia(media)) {
			urls.add(url)
		}
	}
	if (displayMedia) {
		for (const url of urlsFromDisplayMedia(displayMedia)) {
			urls.add(url)
		}
	}

	if (urls.size === 0) {
		return null
	}

	return (
		<div
			className="fixed -left-[9999px] -top-[9999px] size-0 overflow-hidden"
			aria-hidden
		>
			{[...urls].map((url) => (
				<iframe key={url} src={url} title="" tabIndex={-1} />
			))}
		</div>
	)
}
