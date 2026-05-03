import type { UpdateRule } from "./types.ts";
import { createDomMap, extractElement } from "./dom-processing.ts";

export interface ToolCall {
  name: string;
  input: unknown;
  result: string;
}

export interface ToolContext {
  rawHtml: string;
  rules: UpdateRule[];
  toolCalls: ToolCall[];
}

export function createToolContext(rawHtml: string): ToolContext {
  return {
    rawHtml,
    rules: [],
    toolCalls: [],
  };
}

interface ShowInDomInput {
  query_selector: string;
  include_children?: boolean;
}

interface SetUpdateRuleInput {
  label: string;
  query_selector: string;
  logic: string;
}

export function executeTool(
  toolName: string,
  toolInput: unknown,
  context: ToolContext,
): string {
  console.log(`[Tools] Executing: ${toolName}`, toolInput);

  try {
    switch (toolName) {
      case "get_map_of_dom": {
        console.log(
          "[Tools] Creating DOM map from HTML of length:",
          context.rawHtml.length,
        );
        const mapResult = createDomMap(context.rawHtml);
        console.log("[Tools] DOM map stats:", mapResult.stats);
        const result =
          `${mapResult.html}\n\n<!-- Stats: ${mapResult.stats.collapsedWrappers} wrappers collapsed, ${mapResult.stats.truncatedListItems} list items truncated -->`;
        context.toolCalls.push({ name: "get_map_of_dom", input: {}, result });
        console.log("[Tools] DOM map result length:", result.length);
        return result;
      }

      case "show_in_dom": {
        const input = toolInput as ShowInDomInput;
        console.log("[Tools] Extracting element:", input.query_selector);
        const result = extractElement(
          context.rawHtml,
          input.query_selector,
          input.include_children ?? true,
        );
        context.toolCalls.push({ name: "show_in_dom", input, result });
        console.log("[Tools] Element result length:", result.length);
        return result;
      }

      case "set_update_rule": {
        const input = toolInput as SetUpdateRuleInput;
        console.log("[Tools] Setting rule:", input.label, input.query_selector);
        const rule: UpdateRule = {
          label: input.label,
          query_selector: input.query_selector,
          logic: input.logic,
        };
        context.rules.push(rule);
        const result =
          `Rule registered (#${context.rules.length}): "${input.label}" - selector="${input.query_selector}"`;
        context.toolCalls.push({ name: "set_update_rule", input, result });
        console.log("[Tools] Rule registered:", rule);
        return result;
      }

      default:
        console.warn("[Tools] Unknown tool:", toolName);
        return `Unknown tool: ${toolName}`;
    }
  } catch (error) {
    console.error(`[Tools] Error in ${toolName}:`, error);
    const message = error instanceof Error ? error.message : String(error);
    const result = `Error executing ${toolName}: ${message}`;
    context.toolCalls.push({ name: toolName, input: toolInput, result });
    return result;
  }
}
