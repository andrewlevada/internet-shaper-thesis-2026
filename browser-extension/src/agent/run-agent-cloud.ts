import Anthropic from "@anthropic-ai/sdk";
import {
  createToolContext,
  executeTool,
  type ToolContext,
} from "./tools.ts";
import { capturePageDom } from "./dom-processing.ts";
import { AGENT_SHARED_INSTRUCTIONS } from "./agent-spec.ts";
import { anthropicTools } from "./anthropic-tools.ts";
import type { UpdateRule } from "./types.ts";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 16384;

export interface CloudAgentResult {
  rules: UpdateRule[];
  context: ToolContext;
  turns: number;
}

export async function runAgentCloud(
  userRequest: string,
  apiKey: string,
  onProgress?: (message: string) => void,
): Promise<CloudAgentResult> {
  console.log("[Agent:cloud] runAgent called with request:", userRequest);

  onProgress?.("Capturing page DOM...");
  const rawHtml = capturePageDom();
  console.log("[Agent:cloud] Captured DOM, length:", rawHtml.length);

  const context = createToolContext(rawHtml);
  const anthropic = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: userRequest },
  ];

  onProgress?.("Calling Claude API...");

  let iteration = 0;
  while (true) {
    iteration++;
    onProgress?.(`Thinking... (turn ${iteration})`);

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: [
        {
          type: "text",
          text: AGENT_SHARED_INSTRUCTIONS,
          cache_control: { type: "ephemeral" },
        },
      ],
      tools: anthropicTools,
      messages,
    });

    console.log("[Agent:cloud] Response:", {
      stopReason: response.stop_reason,
      contentBlocks: response.content.length,
      usage: response.usage,
    });

    const assistantContent: Anthropic.ContentBlockParam[] = [];

    for (const block of response.content) {
      if (block.type === "text") {
        onProgress?.(
          block.text.slice(0, 80) + (block.text.length > 80 ? "..." : ""),
        );
        assistantContent.push({ type: "text", text: block.text });
      } else if (block.type === "tool_use") {
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

    const toolUseBlocks = response.content.filter(
      (block) => block.type === "tool_use",
    );

    if (toolUseBlocks.length === 0 || response.stop_reason === "end_turn") {
      console.log("[Agent:cloud] Conversation complete");
      break;
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = toolUseBlocks.map(
      (block) => {
        if (block.type !== "tool_use") throw new Error("Expected tool_use");
        const result = executeTool(block.name, block.input, context);

        // Cache the DOM map result (largest payload) so subsequent turns
        // don't re-bill the full structure.
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
          };
        }

        return {
          type: "tool_result" as const,
          tool_use_id: block.id,
          content: result,
        };
      },
    );

    messages.push({ role: "user", content: toolResults });
  }

  onProgress?.(`Done! Generated ${context.rules.length} rules.`);

  return { rules: context.rules, context, turns: iteration };
}
