import { betaZodTool } from "npm:@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "npm:zod";
import { join } from "https://deno.land/std@0.224.0/path/mod.ts";
import type { UpdateRule } from "./types.ts";
import { createDomMap, extractElement } from "./dom-processing.ts";

const collectedRules: UpdateRule[] = [];

export interface ToolCall {
  name: string;
  input: unknown;
  result: string;
}

const toolCallHistory: ToolCall[] = [];

export function getCollectedRules(): UpdateRule[] {
  return [...collectedRules];
}

export function getToolCallHistory(): ToolCall[] {
  return [...toolCallHistory];
}

export function resetCollectedState(): void {
  collectedRules.length = 0;
  toolCallHistory.length = 0;
}

export function createTools(domName: string, scriptDir: string) {
  const domPath = join(scriptDir, "doms", `${domName}.html`);

  // Cache for raw DOM content
  let rawDomCache: string | null = null;
  const getRawDom = async () => {
    if (!rawDomCache) {
      rawDomCache = await Deno.readTextFile(domPath);
    }
    return rawDomCache;
  };

  const getMapOfDomTool = betaZodTool({
    name: "get_map_of_dom",
    description: `Returns a compact, truncated map of the page DOM structure. The map is optimized for understanding the overall page layout:

1. Single-child wrapper chains are collapsed (nested divs with one child become flat)
2. Repeating sibling elements (3+ with same tag/classes) show only the first with a comment indicating count
3. Only semantic attributes are kept: class, id, role, aria-label, label, alt, type, and data-* attributes

Use this first to understand the page structure. Then use show_in_dom() to examine specific elements in full detail.`,
    inputSchema: z.object({}),
    run: async () => {
      try {
        const rawHtml = await getRawDom();
        const mapResult = createDomMap(rawHtml);
        const result = `${mapResult.html}\n\n<!-- Stats: ${mapResult.stats.collapsedWrappers} wrappers collapsed, ${mapResult.stats.truncatedListItems} list items truncated -->`;
        toolCallHistory.push({ name: "get_map_of_dom", input: {}, result });
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const result = `Error creating DOM map: ${message}`;
        toolCallHistory.push({ name: "get_map_of_dom", input: {}, result });
        return result;
      }
    },
  });

  const showInDomTool = betaZodTool({
    name: "show_in_dom",
    description: `Returns the full, unprocessed HTML of a specific element from the DOM.

Use this after get_map_of_dom() to examine elements in detail. The element is returned exactly as it appears in the original DOM, with all attributes and children intact.`,
    inputSchema: z.object({
      query_selector: z
        .string()
        .describe(
          "CSS selector for the element to show (e.g., '#main', '.post-container', '[data-testid=\"feed\"]')"
        ),
      include_children: z
        .boolean()
        .default(true)
        .describe(
          "If true (default), returns the full element with all children. If false, returns just the element's opening/closing tags and a summary of children."
        ),
    }),
    run: async (input) => {
      try {
        const rawHtml = await getRawDom();
        const result = extractElement(
          rawHtml,
          input.query_selector,
          input.include_children
        );
        toolCallHistory.push({ name: "show_in_dom", input, result });
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const result = `Error showing element: ${message}`;
        toolCallHistory.push({ name: "show_in_dom", input, result });
        return result;
      }
    },
  });

  const setUpdateRuleTool = betaZodTool({
    name: "set_update_rule",
    description: `Sets a persistent update rule that will be applied to all elements matching the CSS selector every time the page loads.

The 'logic' parameter is JavaScript code that executes with 'element' bound to each matching DOM element.
IMPORTANT: The logic has NO access to window, document, or any global APIs - ONLY the 'element' variable is available.

Common patterns:
- element.remove() - completely remove the element
- element.style.display = 'none' - hide the element
- element.style.opacity = '0.3' - dim the element
- element.classList.add('hidden') - add a class
- element.textContent = '' - clear text content

Prefer specific selectors (class names, data attributes, tag names) over structural paths for robustness.`,
    inputSchema: z.object({
      query_selector: z
        .string()
        .describe(
          "A CSS selector matching elements to modify (e.g., '.ad-container', '[data-ad]', 'ytd-ad-slot-renderer')"
        ),
      logic: z
        .string()
        .describe(
          "Valid JavaScript code with access to 'element' variable only. No window/document/global APIs."
        ),
    }),
    run: async (input) => {
      const rule: UpdateRule = {
        query_selector: input.query_selector,
        logic: input.logic,
      };

      collectedRules.push(rule);

      const result = `Rule registered (#${collectedRules.length}): selector="${input.query_selector}"`;
      toolCallHistory.push({ name: "set_update_rule", input, result });
      return result;
    },
  });

  return [getMapOfDomTool, showInDomTool, setUpdateRuleTool];
}
