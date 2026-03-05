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

You have access to two tools:
1. read_dom() - Returns the full HTML of the current page. Always use this first to understand the DOM structure.
2. set_update_rule(query_selector, logic) - Creates a persistent rule that runs JavaScript on all elements matching the CSS selector.

When using set_update_rule:
- query_selector: A CSS selector (e.g., '.ad-slot', '[data-ad]', 'ytd-rich-item-renderer')
- logic: Valid JavaScript that executes with \`element\` bound to each matching element
- The logic has NO access to window, document, or any global APIs - ONLY the \`element\` variable
- Common operations: element.remove(), element.style.display = 'none', element.textContent = ''

Process:
1. First, call read_dom() to examine the page structure
2. Identify elements matching the user's intent using class names, data attributes, or tag names
3. Create targeted update rules with specific selectors
4. Prefer class-based or attribute-based selectors over structural paths (more robust across page updates)

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
    // Log intermediate tool usage
    for (const block of message.content) {
      if (block.type === "text") {
        console.log("Agent:", block.text);
      } else if (block.type === "tool_use") {
        console.log(`Tool call: ${block.name}`);
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
