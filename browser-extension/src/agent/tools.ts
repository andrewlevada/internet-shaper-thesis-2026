import type { Tool } from "@anthropic-ai/sdk/resources/messages";
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

export const toolDefinitions: Tool[] = [
  {
    name: "get_map_of_dom",
    description:
      `Returns a compact, truncated map of the page DOM structure. The map is optimized for understanding the overall page layout:

1. Single-child wrapper chains are collapsed (nested divs with one child become flat)
2. Repeating sibling elements (3+ with same tag/classes) show only the first with a comment indicating count
3. Only semantic attributes are kept: class, id, role, aria-label, label, alt, type, and data-* attributes

Use this first to understand the page structure. Then use show_in_dom() to examine specific elements in full detail.`,
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "show_in_dom",
    description:
      `Returns the full, unprocessed HTML of a specific element from the DOM.

Use this after get_map_of_dom() to examine elements in detail. The element is returned exactly as it appears in the original DOM, with all attributes and children intact.`,
    input_schema: {
      type: "object" as const,
      properties: {
        query_selector: {
          type: "string",
          description:
            "CSS selector for the element to show (e.g., '#main', '.post-container', '[data-testid=\"feed\"]')",
        },
        include_children: {
          type: "boolean",
          description:
            "If true (default), returns the full element with all children. If false, returns just the element's opening/closing tags and a summary of children.",
          default: true,
        },
      },
      required: ["query_selector"],
    },
  },
  {
    name: "set_update_rule",
    description:
      `Sets a persistent update rule that will be applied to all elements matching the CSS selector every time the page loads.

The 'logic' parameter is JavaScript code that executes with 'element' bound to each matching DOM element.
The logic has NO access to window, document, or any global APIs - ONLY the 'element' variable is available.

Common patterns:
- element.remove() - completely remove the element
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
            "Valid JavaScript code with access to 'element' variable only. No window/document/global APIs.",
        },
      },
      required: ["label", "query_selector", "logic"],
    },
  },
];

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
