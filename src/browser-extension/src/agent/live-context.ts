import { signal } from "@lit-labs/preact-signals"
import { buildDomMapToolText } from "./dom-map-output.ts"
import { capturePageDom } from "./dom-processing.ts"
import { MOONSHOT_VIA_GATEWAY_MAX_TOOL_OUTPUT_CHARS } from "./gateway-limits.ts"
import { getModel, type ModelId } from "./models.ts"
import { SYSTEM_PROMPT } from "./prompt.ts"

const CHARS_PER_TOKEN_EST = 4

export type LiveDomContext = {
	rawHtmlChars: number
	rawHtmlEstTokens: number
	cleanedChars: number
	mapChars: number
	mapEstTokens: number
	systemEstTokens: number
	gatewayMaxToolChars: number | null
	mapWouldTruncate: boolean
}

function estTokens(chars: number): number {
	return Math.ceil(chars / CHARS_PER_TOKEN_EST)
}

export const liveDomContext = signal<LiveDomContext | null>(null)

let pollId: number | undefined
let pollingStarted = false

export function measureLiveDomContext(modelId: ModelId): LiveDomContext {
	const rawHtml = capturePageDom()
	const { mapText, cleanedCharCount } = buildDomMapToolText(rawHtml)
	const model = getModel(modelId)
	const gatewayMax =
		model.provider === "vercel"
			? MOONSHOT_VIA_GATEWAY_MAX_TOOL_OUTPUT_CHARS
			: null
	const mapWouldTruncate = gatewayMax != null && mapText.length > gatewayMax

	return {
		rawHtmlChars: rawHtml.length,
		rawHtmlEstTokens: estTokens(rawHtml.length),
		cleanedChars: cleanedCharCount,
		mapChars: mapText.length,
		mapEstTokens: estTokens(mapText.length),
		systemEstTokens: estTokens(SYSTEM_PROMPT.length),
		gatewayMaxToolChars: gatewayMax,
		mapWouldTruncate,
	}
}

export function formatCompactNumber(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
	if (n >= 1_000) return `${Math.round(n / 1_000)}k`
	return String(n)
}

export function formatLiveContextSummary(ctx: LiveDomContext): string {
	const parts = [
		`HTML ${formatCompactNumber(ctx.rawHtmlChars)} chars (~${formatCompactNumber(ctx.rawHtmlEstTokens)} tok)`,
		`map ${formatCompactNumber(ctx.mapChars)} chars (~${formatCompactNumber(ctx.mapEstTokens)} tok)`,
	]
	if (ctx.mapWouldTruncate && ctx.gatewayMaxToolChars !== null) {
		parts.push(
			`gateway caps map at ${formatCompactNumber(ctx.gatewayMaxToolChars)} chars`,
		)
	}
	return parts.join(" · ")
}

export function ensureLiveDomContextPolling(
	modelId: () => ModelId,
	rerender: () => void,
): void {
	if (pollingStarted) return
	pollingStarted = true

	const tick = () => {
		try {
			liveDomContext.value = measureLiveDomContext(modelId())
		} catch (e) {
			console.error("[LiveContext] measure failed:", e)
			liveDomContext.value = null
		}
		rerender()
	}

	tick()
	pollId = globalThis.setInterval(tick, 3000)
}

export function stopLiveDomContextPolling(): void {
	pollingStarted = false
	if (pollId !== undefined) {
		globalThis.clearInterval(pollId)
		pollId = undefined
	}
	liveDomContext.value = null
}
