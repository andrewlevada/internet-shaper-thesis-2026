#!/usr/bin/env -S deno run --allow-read --allow-env --allow-net

/**
 * Estimates token count of a file's text contents using Anthropic's token counting API.
 * Requires ANTHROPIC_API_KEY in environment or .env file.
 *
 * Usage: deno run --allow-read --allow-env --allow-net token-count-api.ts <file1> [file2] ...
 */

import { load } from "https://deno.land/std@0.224.0/dotenv/mod.ts";

// Load .env file (looks in cwd and parent directories)
await load({ export: true });

const API_URL = "https://api.anthropic.com/v1/messages/count_tokens";
const DEFAULT_MODEL = "claude-opus-4-6";

interface TokenCountResponse {
  input_tokens: number;
}

async function countTokensViaApi(
  content: string,
  model: string = DEFAULT_MODEL,
): Promise<number> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is required (set in environment or .env file)",
    );
  }

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "content-type": "application/json",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content }],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API error (${response.status}): ${error}`);
  }

  const data: TokenCountResponse = await response.json();
  return data.input_tokens;
}

function formatNumber(n: number): string {
  return n.toLocaleString();
}

async function countFileTokens(
  filePath: string,
  model: string,
): Promise<{ path: string; tokens: number; chars: number; lines: number }> {
  const content = await Deno.readTextFile(filePath);
  const tokens = await countTokensViaApi(content, model);
  const chars = content.length;
  const lines = content.split("\n").length;

  return { path: filePath, tokens, chars, lines };
}

function printUsage() {
  console.log(`Usage: deno run --allow-read --allow-env --allow-net token-count-api.ts [options] <file1> [file2] ...

Options:
  --model <model>  Model to use for tokenization (default: ${DEFAULT_MODEL})
  -                Read from stdin

Environment:
  ANTHROPIC_API_KEY  Required. Set via environment or .env file.

Examples:
  token-count-api.ts file.txt
  token-count-api.ts --model claude-sonnet-4-6 *.md
  cat file.txt | token-count-api.ts -`);
}

async function main() {
  const args = [...Deno.args];

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printUsage();
    Deno.exit(args.length === 0 ? 1 : 0);
  }

  // Parse --model option
  let model = DEFAULT_MODEL;
  const modelIndex = args.indexOf("--model");
  if (modelIndex !== -1) {
    if (modelIndex + 1 >= args.length) {
      console.error("Error: --model requires a value");
      Deno.exit(1);
    }
    model = args[modelIndex + 1];
    args.splice(modelIndex, 2);
  }

  // Handle stdin
  if (args.length === 1 && args[0] === "-") {
    const chunks: Uint8Array[] = [];
    for await (const chunk of Deno.stdin.readable) {
      chunks.push(chunk);
    }
    const decoder = new TextDecoder();
    const text = decoder.decode(new Uint8Array(chunks.flatMap((c) => [...c])));

    try {
      const tokens = await countTokensViaApi(text, model);
      console.log(`Model:  ${model}`);
      console.log(`Tokens: ${formatNumber(tokens)}`);
      console.log(`Chars:  ${formatNumber(text.length)}`);
      console.log(`Ratio:  ${(text.length / tokens).toFixed(2)} chars/token`);
    } catch (e) {
      console.error(`Error: ${e instanceof Error ? e.message : e}`);
      Deno.exit(1);
    }
    return;
  }

  // Process files
  console.log(`Model: ${model}\n`);

  const results: {
    path: string;
    tokens: number;
    chars: number;
    lines: number;
  }[] = [];
  const errors: { path: string; error: string }[] = [];

  for (const filePath of args) {
    try {
      const result = await countFileTokens(filePath, model);
      results.push(result);
    } catch (e) {
      errors.push({
        path: filePath,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  if (results.length > 0) {
    const maxPathLen = Math.max(...results.map((r) => r.path.length), 4);

    console.log(
      `${"File".padEnd(maxPathLen)}  ${"Tokens".padStart(10)}  ${"Chars".padStart(10)}  ${"Lines".padStart(8)}  Ratio`,
    );
    console.log("-".repeat(maxPathLen + 50));

    let totalTokens = 0;
    let totalChars = 0;
    let totalLines = 0;

    for (const r of results) {
      const ratio = (r.chars / r.tokens).toFixed(2);
      console.log(
        `${r.path.padEnd(maxPathLen)}  ${formatNumber(r.tokens).padStart(10)}  ${formatNumber(r.chars).padStart(10)}  ${formatNumber(r.lines).padStart(8)}  ${ratio}`,
      );
      totalTokens += r.tokens;
      totalChars += r.chars;
      totalLines += r.lines;
    }

    if (results.length > 1) {
      console.log("-".repeat(maxPathLen + 50));
      const totalRatio = (totalChars / totalTokens).toFixed(2);
      console.log(
        `${"TOTAL".padEnd(maxPathLen)}  ${formatNumber(totalTokens).padStart(10)}  ${formatNumber(totalChars).padStart(10)}  ${formatNumber(totalLines).padStart(8)}  ${totalRatio}`,
      );
    }
  }

  if (errors.length > 0) {
    console.log("\nErrors:");
    for (const e of errors) {
      console.log(`  ${e.path}: ${e.error}`);
    }
    Deno.exit(1);
  }
}

main();
