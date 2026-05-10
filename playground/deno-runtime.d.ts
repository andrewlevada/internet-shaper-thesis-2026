/** Minimal `Deno` typing so editors resolve playground scripts without `@types/deno`. */
declare namespace Deno {
	export interface Env {
		get(key: string): string | undefined
		set(key: string, value: string): void
	}

	export interface MakeTempOptions {
		prefix?: string
		suffix?: string
		dir?: string
	}

	export interface MkdirOptions {
		recursive?: boolean
		mode?: number
	}

	export interface WriteFileOptions {
		create?: boolean
		append?: boolean
		mode?: number
	}

	export interface RemoveOptions {
		recursive?: boolean
	}

	export interface DirEntry {
		name: string
		isFile: boolean
		isDirectory: boolean
		isSymlink: boolean
	}

	export interface FileInfo {
		isFile: boolean
		isDirectory: boolean
		isSymlink: boolean
		size: number
		mtime: Date | null
		atime: Date | null
		birthtime: Date | null
		dev: number | null
		ino: number | null
		mode: number | null
		nlink: number | null
		uid: number | null
		gid: number | null
		rdev: number | null
		blksize: number | null
		blocks: number | null
		isBlockDevice: boolean | null
		isCharDevice: boolean | null
		isFifo: boolean | null
		isSocket: boolean | null
	}

	export namespace errors {
		export class NotFound extends Error {}
	}

	export const env: Env
	export const args: string[]
	export const stdin: {
		readonly readable: ReadableStream<Uint8Array>
	}

	export function exit(code?: number): never
	export function cwd(): string
	export function mkdir(
		path: string | URL,
		options?: MkdirOptions,
	): Promise<void>
	export function readDir(
		path: string | URL,
		options?: object,
	): AsyncIterable<DirEntry>
	export function readTextFile(
		path: string | URL,
		options?: object,
	): Promise<string>
	export function readTextFileSync(path: string | URL, options?: object): string
	export function writeTextFile(
		path: string | URL,
		data: string,
		options?: WriteFileOptions,
	): Promise<void>
	export function stat(path: string | URL): Promise<FileInfo>
	export function remove(
		path: string | URL,
		options?: RemoveOptions,
	): Promise<void>
	export function makeTempFile(options?: MakeTempOptions): Promise<string>
}

/** Deno exposes byte streams as async-iterable (see `token-count-api.ts`). */
interface ReadableStream<R> {
	[Symbol.asyncIterator](): AsyncIterableIterator<R>
}
