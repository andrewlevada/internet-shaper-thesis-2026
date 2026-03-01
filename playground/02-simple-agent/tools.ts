import { betaZodTool } from "npm:@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "npm:zod";
import { join } from "https://deno.land/std@0.224.0/path/mod.ts";
import type { UpdateRule } from "./types.ts";

const collectedRules: UpdateRule[] = [];

export function getCollectedRules(): UpdateRule[] {
  return [...collectedRules];
}

export function resetCollectedRules(): void {
  collectedRules.length = 0;
}

export function createTools(domName: string, scriptDir: string) {
  const domPath = join(scriptDir, "doms", `${domName}.html`);

  const readDomTool = betaZodTool({
    name: "read_dom",
    description:
      "Returns the full HTML contents of the current page DOM. Use this first to understand the page structure before creating update rules. The HTML has been cleaned (no scripts, styles, or comments) to focus on semantic structure.",
    inputSchema: z.object({}),
    run: async () => {
      try {
        const content = await Deno.readTextFile(domPath);
        return content;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return `Error reading DOM: ${message}`;
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

      return `Rule registered (#${collectedRules.length}): selector="${input.query_selector}"`;
    },
  });

  return [readDomTool, setUpdateRuleTool];
}
