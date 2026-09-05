/**
 * Limits for models served through Vercel AI Gateway (`https://ai-gateway.vercel.sh/v1`).
 *
 * **kimi-k2.6 context (tokens):** Moonshot documents up to 256k tokens total context for
 * `kimi-k2.6`, `kimi-k2.5`, etc. See:
 * https://platform.kimi.ai/docs/guide/faq ("support up to 256k Tokens").
 *
 * **Single tool `content`:** Chat Completions sends tool results as message strings. In
 * practice, gateway or upstream validation can reject very large tool payloads (observed
 * failures around ~250k characters for `get_map_of_dom`) even when total context is below
 * the nominal token cap. We therefore cap each tool result string conservatively and
 * truncate with a marker so the model can fall back to `show_in_dom`.
 */

/** Published max context for Kimi K2.x family (tokens). */
export const MOONSHOT_KIMI_K2_MAX_CONTEXT_TOKENS = 256 * 1024

/**
 * Max characters per tool result when calling `moonshotai/*` through AI Gateway.
 * Conservative default under empirically failing ~250k-char DOM maps.
 */
export const MOONSHOT_VIA_GATEWAY_MAX_TOOL_OUTPUT_CHARS = 96_000

const TRUNCATION_SUFFIX =
	"\n\n<!-- truncated: tool output capped for AI Gateway; use show_in_dom for full detail -->"

export function truncateToolOutputForGateway(
	text: string,
	maxChars: number,
): { text: string; truncated: boolean } {
	if (text.length <= maxChars) {
		return { text, truncated: false }
	}

	return {
		text: text.slice(0, maxChars) + TRUNCATION_SUFFIX,
		truncated: true,
	}
}
