/** Append a reproducibility log line for playground CLI tools. */

const LOG_DIR = new URL("../logs/", import.meta.url)

export interface RunLogPayload {
	tool: string
	config: Record<string, unknown>
	outputChars: number
	outputPreview?: string
	error?: string
}

function ensureLogDir(): void {
	try {
		Deno.mkdirSync(LOG_DIR, { recursive: true })
	} catch {
		// exists
	}
}

export function appendRunLog(payload: RunLogPayload): string {
	ensureLogDir()
	const iso = new Date().toISOString().replace(/[:.]/g, "-")
	const path = new URL(`${payload.tool}-${iso}.log`, LOG_DIR)
	const preview =
		payload.outputPreview != null
			? payload.outputPreview.slice(0, 4000)
			: undefined
	const body = {
		ts: new Date().toISOString(),
		...payload,
		...(preview != null ? { outputPreview: preview } : {}),
	}
	Deno.writeTextFileSync(path, `${JSON.stringify(body, null, 2)}\n`)
	return path.href
}
