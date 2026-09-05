import type { Tool } from "@anthropic-ai/sdk/resources/messages"
import { buildDomMapToolText } from "./dom-map-output.ts"
import { extractElement } from "./dom-processing.ts"
import { truncateToolOutputForGateway } from "./gateway-limits.ts"
import type { UpdateRule } from "./rules-engine.ts"

export interface ToolCall {
	name: string
	input: unknown
	result: string
}

export interface ToolContext {
	rawHtml: string
	rules: UpdateRule[]
	toolCalls: ToolCall[]
	maxToolOutputChars?: number
	singleCallExploreUsed: Set<string>
}

const SINGLE_CALL_EXPLORE_TOOLS = new Set(["get_map_of_dom"])

function singleCallExploreMessage(toolName: string): string {
	return (
		`The ${toolName} tool is extremely context-hungry, so it cannot be called again. ` +
		"Refer to the result of the previous call."
	)
}

export function createToolContext(
	rawHtml: string,
	options?: { maxToolOutputChars?: number },
): ToolContext {
	return {
		rawHtml,
		rules: [],
		toolCalls: [],
		singleCallExploreUsed: new Set(),
		...(options?.maxToolOutputChars != null
			? { maxToolOutputChars: options.maxToolOutputChars }
			: {}),
	}
}

function maybeCapToolOutput(
	toolName: string,
	raw: string,
	context: ToolContext,
): string {
	const max = context.maxToolOutputChars
	if (max == null || max <= 0) return raw

	const { text, truncated } = truncateToolOutputForGateway(raw, max)
	if (truncated) {
		console.warn(
			`[Tools] ${toolName} truncated for gateway cap:`,
			raw.length,
			"->",
			text.length,
			"(max chars:",
			max,
			")",
		)
	}
	return text
}

/** Default `depth` for show_in_dom when the model omits it. */
export const SHOW_IN_DOM_DEFAULT_DEPTH = 3

export const toolDefinitions: Tool[] = [
	{
		name: "get_map_of_dom",
		description: `Returns a compact, truncated map of the page DOM structure. The map is optimized for understanding the overall page layout:

1. Single-child wrapper chains are collapsed. Their attributes are merged into a comment indicating count.
2. Repeating sibling elements (3+ with same tag/classes) show only the first with a comment indicating count
3. Only semantic attributes are kept: class, id, role, aria-label, label, alt, type, and data-* attributes

Use this first to understand the page structure. Then use show_in_dom() to examine specific elements in full detail.
Can only be called once per session; later calls return the previous result message.`,
		input_schema: {
			type: "object" as const,
			properties: {},
			required: [],
		},
	},
	{
		name: "show_in_dom",
		description: `Returns HTML for a specific element from the captured DOM.

Depth counts element levels below the matched node: 0 returns only that element (direct text kept; nested elements replaced by <!-- -N children -->). Larger depth includes deeper descendants; default is ${SHOW_IN_DOM_DEFAULT_DEPTH}. Use a higher depth when you need the full subtree.`,
		input_schema: {
			type: "object" as const,
			properties: {
				query_selector: {
					type: "string",
					description:
						"CSS selector for the element to show (e.g., '#main', '.post-container', '[data-testid=\"feed\"]')",
				},
				depth: {
					type: "integer",
					description: `Non-negative number of element descendant levels to include below the matched element. Omitted defaults to ${SHOW_IN_DOM_DEFAULT_DEPTH}.`,
					minimum: 0,
					default: SHOW_IN_DOM_DEFAULT_DEPTH,
				},
			},
			required: ["query_selector"],
		},
	},
	{
		name: "set_update_rule",
		description: `Sets a persistent update rule that will be applied to all elements matching the CSS selector every time the page loads.

The 'logic' parameter is JavaScript code that executes with 'element' bound to each matching DOM element.
The logic has NO access to window, document, or any global APIs - ONLY the 'element' variable is available.

Common patterns:
- element.style.display = 'none' - hide the element
- element.style.opacity = '0.3' - dim the element
- element.classList.add('hidden') - add a class
- element.textContent = '' - clear text content

Prefer specific selectors (class names, data attributes, tag names) over structural paths for robustness.`,
		input_schema: {
			type: "object" as const,
			properties: {
				label: {
					type: "string",
					description:
						"A short label (~3 words) describing what this rule does, for display in the rule management UI (e.g., 'Hide video ads', 'Remove sidebar', 'Dim suggestions')",
				},
				query_selector: {
					type: "string",
					description:
						"A CSS selector matching elements to modify (e.g., '.ad-container', '[data-ad]', 'ytd-ad-slot-renderer')",
				},
				logic: {
					type: "string",
					description:
						"Valid JavaScript code with access to 'element' variable only. No window/document/global APIs. The logic must be idempotent: running it on the same element multiple times must produce the same result as running it once. If the rule reads child content to make a decision, return early (do nothing) when the content is absent — the rule will be automatically re-run once child content populates. Prefer element.style.display = 'none' over element.remove() for conditional hiding.",
				},
			},
			required: ["label", "query_selector", "logic"],
		},
	},
]

interface ShowInDomInput {
	query_selector: string
	depth?: number
}

interface SetUpdateRuleInput {
	label: string
	query_selector: string
	logic: string
}

export function executeTool(
	toolName: string,
	toolInput: unknown,
	context: ToolContext,
): string {
	console.log(`[Tools] Executing: ${toolName}`, toolInput)

	try {
		switch (toolName) {
			case "get_map_of_dom": {
				if (
					SINGLE_CALL_EXPLORE_TOOLS.has(toolName) &&
					context.singleCallExploreUsed.has(toolName)
				) {
					const result = singleCallExploreMessage(toolName)
					context.toolCalls.push({ name: toolName, input: {}, result })
					return result
				}
				if (SINGLE_CALL_EXPLORE_TOOLS.has(toolName)) {
					context.singleCallExploreUsed.add(toolName)
				}

				console.log(
					"[Tools] Creating DOM map from HTML of length:",
					context.rawHtml.length,
				)
				const { mapText, stats } = buildDomMapToolText(context.rawHtml)
				console.log("[Tools] DOM map stats:", stats)
				let result = mapText
				result = maybeCapToolOutput("get_map_of_dom", result, context)
				context.toolCalls.push({ name: "get_map_of_dom", input: {}, result })
				console.log("[Tools] DOM map result length:", result.length)
				return result
			}

			case "show_in_dom": {
				const input = toolInput as ShowInDomInput
				const depth = input.depth ?? SHOW_IN_DOM_DEFAULT_DEPTH
				const resolvedInput = { query_selector: input.query_selector, depth }
				console.log("[Tools] Extracting element:", input.query_selector, depth)
				let result = extractElement(
					context.rawHtml,
					input.query_selector,
					depth,
				)
				result = maybeCapToolOutput("show_in_dom", result, context)
				context.toolCalls.push({
					name: "show_in_dom",
					input: resolvedInput,
					result,
				})
				console.log("[Tools] Element result length:", result.length)
				return result
			}

			case "set_update_rule": {
				const input = toolInput as SetUpdateRuleInput
				console.log("[Tools] Setting rule:", input.label, input.query_selector)
				const rule: UpdateRule = {
					label: input.label,
					query_selector: input.query_selector,
					logic: input.logic,
				}
				context.rules.push(rule)
				const result = `Rule registered (#${context.rules.length}): "${input.label}" - selector="${input.query_selector}"`
				context.toolCalls.push({ name: "set_update_rule", input, result })
				console.log("[Tools] Rule registered:", rule)
				return result
			}

			default:
				console.warn("[Tools] Unknown tool:", toolName)
				return `Unknown tool: ${toolName}`
		}
	} catch (error) {
		console.error(`[Tools] Error in ${toolName}:`, error)
		const message = error instanceof Error ? error.message : String(error)
		const result = `Error executing ${toolName}: ${message}`
		context.toolCalls.push({ name: toolName, input: toolInput, result })
		return result
	}
}
