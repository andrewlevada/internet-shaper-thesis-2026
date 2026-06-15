import fs from "node:fs/promises"
import path from "node:path"
import sharp from "sharp"
import type { Plugin } from "vite"

/** Chrome extension icon sizes (toolbar, management page, store listing). */
export const ICON_SIZES = [16, 32, 48, 128] as const

export const ICONS_DIR = "icons"

export function iconManifest(): Record<string, string> {
	return Object.fromEntries(
		ICON_SIZES.map((size) => [String(size), `${ICONS_DIR}/icon-${size}.png`]),
	)
}

export interface ExtensionIconsOptions {
	/** Path to the source icon, relative to the extension root. */
	source?: string
}

async function generateIcons(
	sourcePath: string,
): Promise<Map<(typeof ICON_SIZES)[number], Buffer>> {
	const icons = new Map<(typeof ICON_SIZES)[number], Buffer>()

	for (const size of ICON_SIZES) {
		const buffer = await sharp(sourcePath)
			.resize(size, size, { fit: "cover" })
			.png()
			.toBuffer()
		icons.set(size, buffer)
	}

	return icons
}

async function writeLog(sourcePath: string, icons: Map<number, Buffer>) {
	const logsDir = path.resolve("scripts/logs")
	await fs.mkdir(logsDir, { recursive: true })

	const timestamp = new Date().toISOString().replaceAll(":", "-")
	const logPath = path.join(logsDir, `${timestamp}-generate-icons.log`)
	const lines = [
		`timestamp: ${new Date().toISOString()}`,
		`source: ${sourcePath}`,
		`sizes: ${ICON_SIZES.join(", ")}`,
		...ICON_SIZES.map((size) => {
			const buffer = icons.get(size)
			return `icon-${size}.png: ${buffer?.byteLength ?? 0} bytes`
		}),
	]

	await fs.writeFile(logPath, `${lines.join("\n")}\n`)
}

async function writeIconsToDir(
	icons: Map<(typeof ICON_SIZES)[number], Buffer>,
	outDir: string,
) {
	const iconsDir = path.join(outDir, ICONS_DIR)
	await fs.mkdir(iconsDir, { recursive: true })

	for (const [size, buffer] of icons) {
		await fs.writeFile(path.join(iconsDir, `icon-${size}.png`), buffer)
	}
}

/**
 * Generate Chrome extension icons from a single high-resolution source image.
 *
 * Production: emits assets into dist via Rollup.
 * Dev: copies generated icons into dist for fiber-extension's esbuild output.
 */
export function extensionIcons(options: ExtensionIconsOptions = {}): Plugin {
	const source = options.source ?? "icon.png"
	const absoluteSource = path.resolve(source)

	return {
		name: "extension-icons",

		async buildStart() {
			const icons = await generateIcons(absoluteSource)
			await writeLog(absoluteSource, icons)

			for (const [size, buffer] of icons) {
				this.emitFile({
					type: "asset",
					fileName: `${ICONS_DIR}/icon-${size}.png`,
					source: buffer,
				})
			}
		},

		configureServer(server) {
			const syncIcons = async () => {
				const icons = await generateIcons(absoluteSource)
				await writeLog(absoluteSource, icons)
				await writeIconsToDir(icons, path.resolve(server.config.build.outDir))
			}

			server.httpServer?.once("listening", () => {
				void syncIcons()
			})

			server.watcher.add(absoluteSource)
			server.watcher.on("change", (file) => {
				if (path.resolve(file) === absoluteSource) {
					void syncIcons()
				}
			})
		},
	}
}
