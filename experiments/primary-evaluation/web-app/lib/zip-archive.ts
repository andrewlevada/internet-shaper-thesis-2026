import {
	BlobReader,
	type FileEntry,
	TextWriter,
	Uint8ArrayWriter,
	ZipReader,
} from "@zip.js/zip.js"
import type { MediaKind } from "./media"
import { mimeTypeForKind } from "./media"
import { mhtmlBytesToPreviewUrl } from "./mhtml-preview"
import { createBlobUrl } from "./zip"

export interface ZipEntryMeta {
	signature: number
	uncompressedSize: number
}

function normalizePath(filename: string): string {
	return filename.replace(/\\/g, "/").replace(/^\/+/, "")
}

export class ZipArchive {
	private reader: ZipReader<BlobReader>
	private entries = new Map<string, FileEntry>()

	private constructor(reader: ZipReader<BlobReader>) {
		this.reader = reader
	}

	static async open(file: File): Promise<ZipArchive> {
		const reader = new ZipReader(new BlobReader(file))
		return new ZipArchive(reader)
	}

	async index(): Promise<Map<string, ZipEntryMeta>> {
		const meta = new Map<string, ZipEntryMeta>()

		for await (const entry of this.reader.getEntriesGenerator()) {
			if (entry.directory) {
				continue
			}

			const path = normalizePath(entry.filename)
			this.entries.set(path, entry)
			meta.set(path, {
				signature: entry.signature,
				uncompressedSize: entry.uncompressedSize,
			})
		}

		return meta
	}

	getEntry(path: string): FileEntry | undefined {
		return this.entries.get(path)
	}

	async readBytes(path: string): Promise<Uint8Array> {
		const entry = this.entries.get(path)
		if (!entry) {
			throw new Error(`Missing archive entry: ${path}`)
		}

		return entry.getData(new Uint8ArrayWriter())
	}

	async readText(path: string): Promise<string> {
		const entry = this.entries.get(path)
		if (!entry) {
			throw new Error(`Missing archive entry: ${path}`)
		}

		return entry.getData(new TextWriter())
	}

	async createMediaUrl(path: string, kind: MediaKind): Promise<string> {
		const bytes = await this.readBytes(path)
		if (kind === "mhtml") {
			return mhtmlBytesToPreviewUrl(bytes)
		}
		return createBlobUrl(bytes, mimeTypeForKind(kind))
	}

	async close(): Promise<void> {
		await this.reader.close()
		this.entries.clear()
	}
}
