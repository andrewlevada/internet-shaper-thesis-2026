#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env --allow-net

import { load } from "https://deno.land/std@0.224.0/dotenv/mod.ts";
import { join } from "https://deno.land/std@0.224.0/path/mod.ts";
import { createDomMap } from "./dom-processing.ts";

await load({ export: true });

const API_URL = "https://api.anthropic.com/v1/messages/count_tokens";
const MODEL = "claude-sonnet-4-6";

async function countTokens(content: string): Promise<number> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY required");

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "content-type": "application/json",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content }],
    }),
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  const data = await response.json();
  return data.input_tokens;
}

const scriptDir = new URL(".", import.meta.url).pathname;
const domsDir = join(scriptDir, "doms");
const outputDir = join(domsDir, "compacted");

await Deno.mkdir(outputDir, { recursive: true });

console.log("Compacting DOMs...\n");

for await (const entry of Deno.readDir(domsDir)) {
  if (!entry.isFile && !entry.isSymlink) continue;
  if (!entry.name.endsWith(".html")) continue;

  const inputPath = join(domsDir, entry.name);
  const outputPath = join(outputDir, entry.name);

  const raw = await Deno.readTextFile(inputPath);
  const result = createDomMap(raw);

  await Deno.writeTextFile(outputPath, result.html);

  const [rawTokens, compactedTokens] = await Promise.all([
    countTokens(raw),
    countTokens(result.html),
  ]);

  const charReduction = ((1 - result.html.length / raw.length) * 100).toFixed(1);
  const tokenReduction = ((1 - compactedTokens / rawTokens) * 100).toFixed(1);

  console.log(`${entry.name}`);
  console.log(`  Chars:  ${raw.length.toLocaleString()} -> ${result.html.length.toLocaleString()} (${charReduction}% reduction)`);
  console.log(`  Tokens: ${rawTokens.toLocaleString()} -> ${compactedTokens.toLocaleString()} (${tokenReduction}% reduction)`);
  console.log(`  ${result.stats.collapsedWrappers} wrappers, ${result.stats.truncatedListItems} siblings, ${result.stats.removedClasses} classes`);
  console.log();
}

console.log(`Output: ${outputDir}`);
