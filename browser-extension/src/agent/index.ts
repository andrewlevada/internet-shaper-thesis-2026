import Anthropic from "@anthropic-ai/sdk";
import { ext } from "fiber-extension";
import type { UpdateRule } from "./types";
import { capturePageDom } from "./dom-processing";
import {
  createToolContext,
  executeTool,
  type ToolContext,
  toolDefinitions,
} from "./tools";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 16384;

const SYSTEM_PROMPT =
  `You are a browser extension agent that modifies web pages based on user requests.

You have access to three tools:

1. get_map_of_dom() - Returns a compact, truncated view of the page structure. Use this first to understand the DOM layout. The map:
   - Collapses single-child wrapper chains for readability
   - Shows only the first element when there are 3+ similar siblings
   - Keeps only semantic attributes (class, id, role, aria-label, etc.)

2. show_in_dom(query_selector, include_children) - Returns the full, unprocessed HTML of a specific element. Use this to examine elements in detail after identifying them in the map.

3. set_update_rule(label, query_selector, logic) - Creates a persistent rule that runs JavaScript on all elements matching the CSS selector.

Workflow:
1. Call get_map_of_dom() to get an overview of the page structure
2. Identify candidate elements for the user's request
3. Use show_in_dom() to examine specific elements if you need more detail
4. Create update rules with specific selectors (prefer class names, data attributes, or tag names over structural paths)

When using set_update_rule:
- label: A short (~3 words) description for rule management UI (e.g., "Hide video ads", "Remove sidebar")
- query_selector: A CSS selector (e.g., '.ad-slot', '[data-ad]', 'ytd-rich-item-renderer')
- logic: Valid JavaScript with \`element\` bound to each matching element
- The logic has NO access to window, document, or any global APIs - ONLY the \`element\` variable
- Common operations: element.remove(), element.style.display = 'none', element.textContent = ''

Be thorough - if there are multiple variations of elements matching the user's request, create rules for each variation.`;

export interface AgentResult {
  rules: UpdateRule[];
  context: ToolContext;
}

export async function runAgent(
  userRequest: string,
  apiKey: string,
  onProgress?: (message: string) => void,
): Promise<AgentResult> {
  console.log("[Agent] runAgent called with request:", userRequest);

  onProgress?.("Capturing page DOM...");
  const rawHtml = capturePageDom();
  console.log("[Agent] Captured DOM, length:", rawHtml.length);

  const context = createToolContext(rawHtml);

  console.log("[Agent] Creating Anthropic client...");
  const anthropic = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: userRequest },
  ];

  onProgress?.("Calling Claude API...");
  console.log("[Agent] Starting conversation loop");

  let iteration = 0;
  while (true) {
    iteration++;
    console.log(`[Agent] Iteration ${iteration}, sending request...`);
    onProgress?.(`Thinking... (turn ${iteration})`);

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      tools: toolDefinitions,
      messages,
    });

    console.log("[Agent] Response received:", {
      stopReason: response.stop_reason,
      contentBlocks: response.content.length,
      usage: response.usage,
    });

    // Process response content
    const assistantContent: Anthropic.ContentBlockParam[] = [];

    for (const block of response.content) {
      if (block.type === "text") {
        console.log("[Agent] Text block:", block.text.slice(0, 1000) + "...");
        onProgress?.(
          block.text.slice(0, 80) + (block.text.length > 80 ? "..." : ""),
        );
        assistantContent.push({ type: "text", text: block.text });
      } else if (block.type === "tool_use") {
        console.log("[Agent] Tool use:", block.name, block.input);
        onProgress?.(`Using tool: ${block.name}`);
        assistantContent.push({
          type: "tool_use",
          id: block.id,
          name: block.name,
          input: block.input,
        });
      }
    }

    messages.push({ role: "assistant", content: assistantContent });

    // Check if we need to handle tool calls
    const toolUseBlocks = response.content.filter(
      (block) => block.type === "tool_use",
    );

    console.log(
      "[Agent] Tool use blocks:",
      toolUseBlocks.length,
      "Stop reason:",
      response.stop_reason,
    );

    if (toolUseBlocks.length === 0 || response.stop_reason === "end_turn") {
      console.log("[Agent] Conversation complete");
      break;
    }

    // Execute tools and add results
    console.log("[Agent] Executing tools...");
    const toolResults: Anthropic.ToolResultBlockParam[] = toolUseBlocks.map(
      (block) => {
        if (block.type !== "tool_use") throw new Error("Expected tool_use");
        console.log(`[Agent] Executing tool: ${block.name}`);
        const result = executeTool(block.name, block.input, context);
        console.log(`[Agent] Tool result length: ${result.length}`);
        return {
          type: "tool_result" as const,
          tool_use_id: block.id,
          content: result,
        };
      },
    );

    messages.push({ role: "user", content: toolResults });
  }

  console.log("[Agent] Final rules:", context.rules);
  onProgress?.(`Done! Generated ${context.rules.length} rules.`);

  return { rules: context.rules, context };
}

export async function applyRules(rules: UpdateRule[]): Promise<void> {
  console.log("[Apply] Applying rules:", rules.length);

  // Execute in page's main world via chrome.scripting API to bypass CSP
  await ext.scripting.executeInMainWorld(
    (rulesToApply: UpdateRule[]) => {
      for (const rule of rulesToApply) {
        try {
          console.log(`[Apply] Rule "${rule.label}": ${rule.query_selector}`);
          const elements = document.querySelectorAll(rule.query_selector);
          console.log(`[Apply] Found ${elements.length} elements`);
          const fn = new Function("element", rule.logic);
          for (const el of elements) {
            try {
              fn(el);
            } catch (e) {
              console.error(
                `[Apply] Rule "${rule.label}" failed on element:`,
                e,
              );
            }
          }
          console.log(
            `[Apply] Rule "${rule.label}" applied to ${elements.length} elements`,
          );
        } catch (e) {
          console.error(`[Apply] Rule "${rule.label}" failed:`, e);
        }
      }
      console.log("[Apply] All rules applied");
    },
    [rules],
  );
}

export type { UpdateRule } from "./types";
