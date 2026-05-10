import Anthropic from "@anthropic-ai/sdk"
import { ext } from "fiber-extension"
import { capturePageDom } from "./dom-processing.ts"
import { getModel, type ModelId } from "./models.ts"
import { SYSTEM_PROMPT } from "./prompt.ts"
import type { UpdateRule } from "./rules-engine.ts"
import {
	createToolContext,
	executeTool,
	type ToolContext,
	toolDefinitions,
} from "./tools.ts"
import { runAgentVercel } from "./vercel-agent.ts"

const MAX_RESPONSE_TOKENS = 16384

export interface AgentResult {
	rules: UpdateRule[]
	context: ToolContext
}

export async function runAgent(
	userRequest: string,
	apiKey: string,
	modelId: ModelId,
	onProgress?: (message: string) => void,
): Promise<AgentResult> {
	const model = getModel(modelId)
	if (model.provider === "vercel") {
		return runAgentVercel(userRequest, apiKey, model.modelId, onProgress)
	}
	return runAgentAnthropic(userRequest, apiKey, model.modelId, onProgress)
}

async function runAgentAnthropic(
	userRequest: string,
	apiKey: string,
	modelId: string,
	onProgress?: (message: string) => void,
): Promise<AgentResult> {
	console.log("[Agent] runAgentAnthropic called, model:", modelId)

	onProgress?.("Capturing page DOM...")
	const rawHtml = capturePageDom()
	console.log("[Agent] Captured DOM, length:", rawHtml.length)

	const context = createToolContext(rawHtml)

	console.log("[Agent] Creating Anthropic client...")
	const anthropic = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })

	const messages: Anthropic.MessageParam[] = [
		{ role: "user", content: userRequest },
	]

	onProgress?.("Calling Claude API...")
	console.log("[Agent] Starting conversation loop")

	let iteration = 0
	while (true) {
		iteration++
		console.log(`[Agent] Iteration ${iteration}, sending request...`)
		onProgress?.(`Thinking... (turn ${iteration})`)

		const response = await anthropic.messages.create({
			model: modelId,
			max_tokens: MAX_RESPONSE_TOKENS,
			system: [
				{
					type: "text",
					text: SYSTEM_PROMPT,
					cache_control: { type: "ephemeral" },
				},
			],
			tools: toolDefinitions,
			messages,
		})

		console.log("[Agent] Response received:", {
			stopReason: response.stop_reason,
			contentBlocks: response.content.length,
			usage: response.usage,
		})

		const assistantContent: Anthropic.ContentBlockParam[] = []

		for (const block of response.content) {
			if (block.type === "text") {
				console.log("[Agent] Text block:", block.text.slice(0, 1000) + "...")
				onProgress?.(
					block.text.slice(0, 80) + (block.text.length > 80 ? "..." : ""),
				)
				assistantContent.push({ type: "text", text: block.text })
			} else if (block.type === "tool_use") {
				console.log("[Agent] Tool use:", block.name, block.input)
				onProgress?.(`Using tool: ${block.name}`)
				assistantContent.push({
					type: "tool_use",
					id: block.id,
					name: block.name,
					input: block.input,
				})
			}
		}

		messages.push({ role: "assistant", content: assistantContent })

		const toolUseBlocks = response.content.filter(
			(block) => block.type === "tool_use",
		)

		console.log(
			"[Agent] Tool use blocks:",
			toolUseBlocks.length,
			"Stop reason:",
			response.stop_reason,
		)

		if (toolUseBlocks.length === 0 || response.stop_reason === "end_turn") {
			console.log("[Agent] Conversation complete")
			break
		}

		console.log("[Agent] Executing tools...")
		const toolResults: Anthropic.ToolResultBlockParam[] = toolUseBlocks.map(
			(block) => {
				if (block.type !== "tool_use") throw new Error("Expected tool_use")
				console.log(`[Agent] Executing tool: ${block.name}`)
				const result = executeTool(block.name, block.input, context)
				console.log(`[Agent] Tool result length: ${result.length}`)

				if (block.name === "get_map_of_dom") {
					return {
						type: "tool_result" as const,
						tool_use_id: block.id,
						content: [
							{
								type: "text" as const,
								text: result,
								cache_control: { type: "ephemeral" as const },
							},
						],
					}
				}

				return {
					type: "tool_result" as const,
					tool_use_id: block.id,
					content: result,
				}
			},
		)

		messages.push({ role: "user", content: toolResults })
	}

	console.log("[Agent] Final rules:", context.rules)
	onProgress?.(`Done! Generated ${context.rules.length} rules.`)

	return { rules: context.rules, context }
}

export async function getElementCounts(): Promise<number[]> {
	const counts = await ext.scripting.executeInMainWorld(() => {
		const w = window as Window & { __internetShaperCounts?: number[] }
		return w.__internetShaperCounts ?? []
	}, [])
	return counts ?? []
}

export { buildDomMapToolText } from "./dom-map-output.ts"
export { capturePageDom } from "./dom-processing.ts"
export { AgentGatewayError, isAgentGatewayError } from "./errors.ts"
export {
	ensureLiveDomContextPolling,
	formatLiveContextSummary,
	type LiveDomContext,
	liveDomContext,
	measureLiveDomContext,
	stopLiveDomContextPolling,
} from "./live-context.ts"

export type { UpdateRule } from "./rules-engine.ts"
