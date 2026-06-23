import { createOpenAI } from "@ai-sdk/openai"
import { generateText, stepCountIs, tool } from "ai"
import { z } from "zod"
import { capturePageDom } from "./dom-processing.ts"
import { classifyAiGatewayError } from "./errors.ts"
import { MOONSHOT_VIA_GATEWAY_MAX_TOOL_OUTPUT_CHARS } from "./gateway-limits.ts"
import { SYSTEM_PROMPT } from "./prompt.ts"
import type { UpdateRule } from "./rules-engine.ts"
import {
	createToolContext,
	executeTool,
	SHOW_IN_DOM_DEFAULT_DEPTH,
	type ToolContext,
} from "./tools.ts"

export interface AgentResult {
	rules: UpdateRule[]
	context: ToolContext
}

const AI_GATEWAY_BASE_URL = "https://ai-gateway.vercel.sh/v1"

/** When captured HTML exceeds this, warn before calling the model (Kimi tool caps still apply). */
const LARGE_CAPTURED_HTML_CHARS = 500_000

export async function runAgentVercel(
	userRequest: string,
	apiKey: string,
	modelId: string,
	onProgress?: (message: string) => void,
): Promise<AgentResult> {
	console.log("[VercelAgent] runAgentVercel called, model:", modelId)

	onProgress?.("Capturing page DOM...")
	const rawHtml = capturePageDom()
	console.log("[VercelAgent] Captured DOM, length:", rawHtml.length)

	if (rawHtml.length >= LARGE_CAPTURED_HTML_CHARS) {
		onProgress?.(
			"Page HTML is very large; DOM tool output will be capped for Kimi (AI Gateway).",
		)
	}

	const context = createToolContext(rawHtml, {
		maxToolOutputChars: MOONSHOT_VIA_GATEWAY_MAX_TOOL_OUTPUT_CHARS,
	})

	const gateway = createOpenAI({
		baseURL: AI_GATEWAY_BASE_URL,
		apiKey,
	})

	onProgress?.("Calling AI Gateway...")
	console.log("[VercelAgent] Starting generateText loop")

	const tools = {
		get_map_of_dom: tool({
			description: `Returns a compact, truncated map of the page DOM structure. The map is optimized for understanding the overall page layout:

1. Single-child wrapper chains are collapsed. Their attributes are merged into a comment indicating count.
2. Repeating sibling elements (3+ with same tag/classes) show only the first with a comment indicating count
3. Only semantic attributes are kept: class, id, role, aria-label, label, alt, type, and data-* attributes

Use this first to understand the page structure. Then use show_in_dom to examine specific elements in full detail.
Can only be called once per session; later calls return the previous result message.`,
			inputSchema: z.object({}),
			execute: async () => {
				console.log("[VercelAgent] Executing get_map_of_dom")
				onProgress?.("Using tool: get_map_of_dom")
				return executeTool("get_map_of_dom", {}, context)
			},
		}),
		show_in_dom: tool({
			description: `Returns HTML for a specific element from the captured DOM.

Depth counts element levels below the matched node: 0 returns only that element (direct text kept; nested elements replaced by <!-- -N children -->). Larger depth includes deeper descendants; default is ${SHOW_IN_DOM_DEFAULT_DEPTH}. Use a higher depth when you need the full subtree.`,
			inputSchema: z.object({
				query_selector: z
					.string()
					.describe(
						"CSS selector for the element to show (e.g., '#main', '.post-container', '[data-testid=\"feed\"]')",
					),
				depth: z
					.number()
					.int()
					.min(0)
					.optional()
					.describe(
						`Non-negative descendant element levels to include below the match (default ${SHOW_IN_DOM_DEFAULT_DEPTH}).`,
					),
			}),
			execute: async ({ query_selector, depth }) => {
				console.log(
					"[VercelAgent] Executing show_in_dom:",
					query_selector,
					depth,
				)
				onProgress?.("Using tool: show_in_dom")
				return executeTool("show_in_dom", { query_selector, depth }, context)
			},
		}),
		set_update_rule: tool({
			description: `Sets a persistent update rule that will be applied to all elements matching the CSS selector every time the page loads.

The 'logic' parameter is JavaScript code that executes with 'element' bound to each matching DOM element.
The logic has NO access to window, document, or any global APIs - ONLY the 'element' variable is available.

Common patterns:
- element.remove() - completely remove the element
- element.style.display = 'none' - hide the element
- element.style.opacity = '0.3' - dim the element
- element.classList.add('hidden') - add a class
- element.textContent = '' - clear text content

Prefer specific selectors (class names, data attributes, tag names) over structural paths for robustness.`,
			inputSchema: z.object({
				label: z
					.string()
					.describe(
						"A short label (~3 words) describing what this rule does, for display in the rule management UI (e.g., 'Hide video ads', 'Remove sidebar', 'Dim suggestions')",
					),
				query_selector: z
					.string()
					.describe(
						"A CSS selector matching elements to modify (e.g., '.ad-container', '[data-ad]', 'ytd-ad-slot-renderer')",
					),
				logic: z
					.string()
					.describe(
						"Valid JavaScript code with access to 'element' variable only. No window/document/global APIs. The logic must be idempotent: running it on the same element multiple times must produce the same result as running it once. If the rule reads child content to make a decision, return early (do nothing) when the content is absent — the rule will be automatically re-run once child content populates. Prefer element.style.display = 'none' over element.remove() for conditional hiding.",
					),
			}),
			execute: async ({ label, query_selector, logic }) => {
				console.log("[VercelAgent] Executing set_update_rule:", label)
				onProgress?.("Using tool: set_update_rule")
				return executeTool(
					"set_update_rule",
					{ label, query_selector, logic },
					context,
				)
			},
		}),
	}

	let text = ""
	try {
		const gen = await generateText({
			model: gateway.chat(modelId),
			system: SYSTEM_PROMPT,
			messages: [{ role: "user", content: userRequest }],
			tools,
			stopWhen: stepCountIs(64),
			onStepFinish: ({ stepNumber, finishReason, toolCalls }) => {
				console.log(
					`[VercelAgent] Step ${stepNumber} finished (${finishReason}), tools: ${toolCalls.length}`,
				)
				if (toolCalls.length > 0) {
					onProgress?.(`Thinking... (step ${stepNumber + 1})`)
				}
			},
		})
		text = gen.text
	} catch (error) {
		console.error("[VercelAgent] generateText failed:", error)
		const gatewayErr = classifyAiGatewayError(error)
		if (gatewayErr) throw gatewayErr
		throw error
	}

	if (text) {
		console.log("[VercelAgent] Final text:", text.slice(0, 200))
	}
	console.log("[VercelAgent] Final rules:", context.rules)
	onProgress?.(`Done! Generated ${context.rules.length} rules.`)

	return { rules: context.rules, context }
}
