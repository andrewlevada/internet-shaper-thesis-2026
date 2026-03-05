#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env --allow-net

import { load } from "https://deno.land/std@0.224.0/dotenv/mod.ts";
import Anthropic from "npm:@anthropic-ai/sdk";
import {
  createTools,
  getCollectedRules,
  getToolCallHistory,
  resetCollectedState,
  type ToolCall,
} from "./tools.ts";
import { join } from "https://deno.land/std@0.224.0/path/mod.ts";
import type { UpdateRule } from "./types.ts";

await load({ export: true });

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

3. set_update_rule(query_selector, logic) - Creates a persistent rule that runs JavaScript on all elements matching the CSS selector.

Workflow:
1. Call get_map_of_dom() to get an overview of the page structure
2. Identify candidate elements for the user's request
3. Use show_in_dom() to examine specific elements if you need more detail
4. Create update rules with specific selectors (prefer class names, data attributes, or tag names over structural paths)

When using set_update_rule:
- query_selector: A CSS selector (e.g., '.ad-slot', '[data-ad]', 'ytd-rich-item-renderer')
- logic: Valid JavaScript with \`element\` bound to each matching element
- The logic has NO access to window, document, or any global APIs - ONLY the \`element\` variable
- Common operations: element.remove(), element.style.display = 'none', element.textContent = ''

Be thorough - if there are multiple variations of elements matching the user's request, create rules for each variation.`;

async function main() {
  const [domName, ...requestParts] = Deno.args;
  const userRequest = requestParts.join(" ");

  if (!domName || !userRequest) {
    console.error("Usage: ./agent.ts <dom-name> <user-request>");
    console.error('Example: ./agent.ts youtube "hide all video suggestions"');
    Deno.exit(1);
  }

  const cliCommand = `./agent.ts ${domName} "${userRequest}"`;

  const scriptDir = new URL(".", import.meta.url).pathname;
  const domPath = join(scriptDir, "doms", `${domName}.html`);

  // Verify DOM file exists
  try {
    await Deno.stat(domPath);
  } catch {
    console.error(`Error: DOM file not found: ${domPath}`);
    console.error("Available DOMs: instagram, substack, youtube");
    Deno.exit(1);
  }

  console.log(`DOM: ${domName}`);
  console.log(`Request: ${userRequest}`);
  console.log("Starting agent...\n");

  resetCollectedState();

  const anthropic = new Anthropic();
  const tools = createTools(domName, scriptDir);

  const runner = anthropic.beta.messages.toolRunner({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    tools,
    messages: [{ role: "user", content: userRequest }],
  });

  let finalMessage: Anthropic.Beta.BetaMessage | undefined;
  for await (const message of runner) {
    finalMessage = message as Anthropic.Beta.BetaMessage;

    for (const block of message.content) {
      if (block.type === "text") {
        console.log("Agent:", block.text);
      } else if (block.type === "tool_use") {
        console.log(`Tool call: ${block.name}`);
        if (block.name === "show_in_dom") {
          console.log(`  selector: ${(block.input as { query_selector?: string }).query_selector}`);
        }
      }
    }
  }

  const rules = getCollectedRules();
  const toolCalls = getToolCallHistory();
  await outputResults(cliCommand, userRequest, rules, toolCalls, finalMessage, scriptDir);
}

async function outputResults(
  cliCommand: string,
  userRequest: string,
  rules: UpdateRule[],
  toolCalls: ToolCall[],
  response: Anthropic.Beta.BetaMessage | undefined,
  scriptDir: string,
): Promise<void> {
  const timestamp = new Date().toISOString();
  const logDir = join(scriptDir, "logs");
  await Deno.mkdir(logDir, { recursive: true });

  // Build text log
  const lines: string[] = [
    `Timestamp: ${timestamp}`,
    `Command: ${cliCommand}`,
    `Model: ${MODEL}`,
    `Tokens: ${response?.usage?.input_tokens ?? 0} in / ${response?.usage?.output_tokens ?? 0} out`,
    "",
    "=== Result ===",
    "",
  ];

  if (rules.length === 0) {
    lines.push("(no rules generated)");
  } else {
    for (const [i, rule] of rules.entries()) {
      lines.push(`[${i + 1}] ${rule.query_selector}`);
      lines.push(`    ${rule.logic}`);
      lines.push("");
    }
  }

  lines.push("");
  lines.push("=== Agent Chat ===");
  lines.push("");
  lines.push("--- USER ---");
  lines.push(userRequest);
  lines.push("");

  // Interleave tool calls with their results
  for (const call of toolCalls) {
    lines.push(`--- TOOL CALL: ${call.name} ---`);
    const inputStr = Object.keys(call.input as object).length > 0
      ? JSON.stringify(call.input, null, 2)
      : "(no input)";
    lines.push(inputStr);
    lines.push("");
    lines.push(`--- TOOL RESULT: ${call.name} ---`);
    lines.push(call.result);
    lines.push("");
  }

  // Final assistant response
  const textBlocks = response?.content.filter((b) => b.type === "text") ?? [];
  if (textBlocks.length > 0) {
    lines.push("--- ASSISTANT ---");
    for (const block of textBlocks) {
      if (block.type === "text") {
        lines.push(block.text);
      }
    }
    lines.push("");
  }

  const logContent = lines.join("\n");
  const fileTimestamp = timestamp.replace(/[:.]/g, "-");
  // Extract dom name from command for filename
  const domMatch = cliCommand.match(/\.\/agent\.ts\s+(\w+)/);
  const domName = domMatch?.[1] ?? "unknown";
  const logPath = join(logDir, `${fileTimestamp}-${domName}.log`);
  await Deno.writeTextFile(logPath, logContent);

  // Console output
  console.log("\n" + "=".repeat(50));
  console.log("Generated Update Rules:");
  console.log("=".repeat(50));

  if (rules.length === 0) {
    console.log("(No rules generated)");
  } else {
    for (const [i, rule] of rules.entries()) {
      console.log(`\n[${i + 1}] ${rule.query_selector}`);
      console.log(`    ${rule.logic}`);
    }
  }

  console.log("\n" + "=".repeat(50));
  console.log(`Log: ${logPath}`);
  if (response?.usage) {
    console.log(
      `Tokens: ${response.usage.input_tokens} in / ${response.usage.output_tokens} out`,
    );
  }
}

main();
