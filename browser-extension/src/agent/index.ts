import Anthropic from "@anthropic-ai/sdk";
import { ext } from "fiber-extension";
import type { UpdateRule } from "./types.ts";
import { capturePageDom } from "./dom-processing.ts";
import {
  createToolContext,
  executeTool,
  type ToolContext,
  toolDefinitions,
} from "./tools.ts";

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
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
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

        // Cache the DOM map result (largest payload)
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

  console.log("[Agent] Final rules:", context.rules);
  onProgress?.(`Done! Generated ${context.rules.length} rules.`);

  return { rules: context.rules, context };
}

export async function applyRules(rules: UpdateRule[]): Promise<number[]> {
  console.log("[Apply] Applying rules:", rules.length);

  // Execute in page's main world via chrome.scripting API to bypass CSP
  const counts = await ext.scripting.executeInMainWorld(
    (rulesToApply: UpdateRule[]) => {
      // Store rules and processed element sets globally for the observer.
      // Note: WeakSet uses reference equality, so if a framework replaces a DOM node
      // (e.g., React re-render), the new node will be treated as unprocessed and rules
      // will re-apply. This is usually fine since most rules are idempotent.
      const w = window as Window & {
        __internetShaperRules?: UpdateRule[];
        __internetShaperCounts?: number[];
        __internetShaperProcessed?: Map<string, WeakSet<Element>>;
        __internetShaperObserver?: MutationObserver;
      };

      // Merge with existing rules and counts
      const existingRules = w.__internetShaperRules ?? [];
      const existingCounts = w.__internetShaperCounts ?? [];
      w.__internetShaperRules = [...existingRules, ...rulesToApply];
      // Pre-allocate count slots for new rules (will be filled below)
      w.__internetShaperCounts = [
        ...existingCounts,
        ...new Array(rulesToApply.length).fill(0),
      ];
      const countOffset = existingCounts.length;

      // Initialize processed elements map (selector -> WeakSet of processed elements)
      if (!w.__internetShaperProcessed) {
        w.__internetShaperProcessed = new Map();
      }
      const processedMap = w.__internetShaperProcessed;

      // Helper to get or create WeakSet for a selector
      const getProcessedSet = (selector: string): WeakSet<Element> => {
        let set = processedMap.get(selector);
        if (!set) {
          set = new WeakSet();
          processedMap.set(selector, set);
        }
        return set;
      };

      // Helper to apply a single rule to an element
      const applyRuleToElement = (
        rule: UpdateRule,
        el: Element,
        fn: (el: Element) => void,
      ): boolean => {
        const processed = getProcessedSet(rule.query_selector);
        if (processed.has(el)) return false;
        try {
          fn(el);
          processed.add(el);
          return true;
        } catch (e) {
          console.error(`[Apply] Rule "${rule.label}" failed on element:`, e);
          return false;
        }
      };

      // Apply rules to existing elements
      const elementCounts: number[] = [];
      for (let i = 0; i < rulesToApply.length; i++) {
        const rule = rulesToApply[i];
        // Skip disabled rules but keep index alignment
        if (rule.enabled === false) {
          elementCounts.push(0);
          continue;
        }
        try {
          console.log(`[Apply] Rule "${rule.label}": ${rule.query_selector}`);
          const elements = document.querySelectorAll(rule.query_selector);
          const fn = new Function("element", rule.logic) as (
            el: Element,
          ) => void;
          let count = 0;
          for (const el of elements) {
            if (applyRuleToElement(rule, el, fn)) count++;
          }
          console.log(`[Apply] Rule "${rule.label}" applied to ${count} elements`);
          elementCounts.push(count);
          // Update global counts
          w.__internetShaperCounts![countOffset + i] = count;
        } catch (e) {
          console.error(`[Apply] Rule "${rule.label}" failed:`, e);
          elementCounts.push(0);
        }
      }

      // Set up MutationObserver if not already running
      if (!w.__internetShaperObserver) {
        console.log("[Apply] Setting up MutationObserver for dynamic content");

        const observer = new MutationObserver((mutations) => {
          const rules = w.__internetShaperRules ?? [];
          if (rules.length === 0) return;

          // Collect all added nodes
          const addedNodes: Node[] = [];
          for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
              if (node.nodeType === Node.ELEMENT_NODE) {
                addedNodes.push(node);
              }
            }
          }
          if (addedNodes.length === 0) return;

          // Check each rule against added nodes
          for (let ruleIndex = 0; ruleIndex < rules.length; ruleIndex++) {
            const rule = rules[ruleIndex];
            if (rule.enabled === false) continue;
            try {
              const fn = new Function("element", rule.logic) as (
                el: Element,
              ) => void;
              const processed = getProcessedSet(rule.query_selector);

              for (const node of addedNodes) {
                const el = node as Element;
                // Check if the added node itself matches
                if (el.matches?.(rule.query_selector) && !processed.has(el)) {
                  if (applyRuleToElement(rule, el, fn)) {
                    w.__internetShaperCounts![ruleIndex]++;
                  }
                }
                // Check descendants of the added node
                const descendants = el.querySelectorAll?.(rule.query_selector);
                if (descendants) {
                  for (const desc of descendants) {
                    if (!processed.has(desc)) {
                      if (applyRuleToElement(rule, desc, fn)) {
                        w.__internetShaperCounts![ruleIndex]++;
                      }
                    }
                  }
                }
              }
            } catch (e) {
              console.error(
                `[Apply] Observer rule "${rule.label}" failed:`,
                e,
              );
            }
          }
        });

        observer.observe(document.body, {
          childList: true,
          subtree: true,
        });

        w.__internetShaperObserver = observer;
      }

      console.log("[Apply] All rules applied");
      return elementCounts;
    },
    [rules],
  );

  return counts ?? [];
}

export async function getElementCounts(): Promise<number[]> {
  const counts = await ext.scripting.executeInMainWorld(() => {
    const w = window as Window & { __internetShaperCounts?: number[] };
    return w.__internetShaperCounts ?? [];
  }, []);
  return counts ?? [];
}

export type { UpdateRule } from "./types.ts";
