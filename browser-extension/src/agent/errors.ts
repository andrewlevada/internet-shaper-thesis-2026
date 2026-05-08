export type AgentGatewayErrorCode = "payload_too_large" | "gateway_rejected"

/**
 * Thrown when the Vercel AI Gateway or upstream model rejects the request
 * (often oversized tool payloads or context), with a user-readable message.
 */
export class AgentGatewayError extends Error {
	constructor(
		readonly code: AgentGatewayErrorCode,
		message: string,
		options?: { cause?: unknown },
	) {
		super(
			message,
			options?.cause !== undefined ? { cause: options.cause } : undefined,
		)
		this.name = "AgentGatewayError"
	}
}

export function isAgentGatewayError(e: unknown): e is AgentGatewayError {
	return e instanceof AgentGatewayError
}

/**
 * Maps common AI Gateway / upstream errors after truncation to a clearer user error.
 * Returns null when the failure should be surfaced as a generic error.
 */
export function classifyAiGatewayError(
	error: unknown,
): AgentGatewayError | null {
	const message = joinErrorMessages(error)
	const lower = message.toLowerCase()

	const statusCode = getErrorStatusCode(error)

	const entityTooLarge =
		statusCode === 413 ||
		lower.includes("request entity too large") ||
		lower.includes("payload too large")

	const tokenOrContext =
		lower.includes("maximum context") ||
		lower.includes("context length") ||
		lower.includes("too many tokens") ||
		lower.includes("token limit") ||
		lower.includes("maximum number of tokens") ||
		lower.includes("reduce the length")

	// e.g. OpenAI-compat / gateway: "input.2.output: Invalid input" on oversized tool strings
	const toolPayloadRejected =
		/input\.\d+\.output/i.test(message) ||
		(statusCode === 400 &&
			lower.includes("invalid input") &&
			lower.includes(".output"))

	if (entityTooLarge || tokenOrContext || toolPayloadRejected) {
		return new AgentGatewayError(
			"payload_too_large",
			"AI Gateway rejected this request—usually the page or a tool result is still too large. Try a simpler page, or switch to Claude (Sonnet).",
			{ cause: error },
		)
	}

	return null
}

function joinErrorMessages(error: unknown, maxDepth = 5): string {
	const parts: string[] = []
	let e: unknown = error
	for (let i = 0; i < maxDepth && e != null; i++) {
		if (e instanceof Error) {
			parts.push(e.message)
			e = e.cause
		} else {
			parts.push(String(e))
			break
		}
	}
	return parts.join(" | ")
}

function getErrorStatusCode(error: unknown): number | undefined {
	let e: unknown = error
	for (let i = 0; i < 6 && e != null; i++) {
		if (typeof e === "object" && e !== null && "statusCode" in e) {
			const s = (e as { statusCode: unknown }).statusCode
			if (typeof s === "number") return s
		}
		e = e instanceof Error ? e.cause : undefined
	}
	return undefined
}
