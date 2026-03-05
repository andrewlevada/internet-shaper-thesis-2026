#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env --allow-net

/**
 * Cleans HTML files through a series of steps, counting tokens at each stage.
 * Saves intermediate files to output directory.
 *
 * Steps:
 * 1. Remove all head, script, link, style tags
 * 2. Remove elements with display:none in style attribute
 * 3. Remove all tags inside svg tags except for title tags
 * 4. Remove HTML comments
 */

import { load } from "https://deno.land/std@0.224.0/dotenv/mod.ts";
import { DOMParser, Element } from "https://deno.land/x/deno_dom@v0.1.48/deno-dom-wasm.ts";
import { basename, join } from "https://deno.land/std@0.224.0/path/mod.ts";

await load({ export: true });

const INPUT_DIR = "../00-dom-samples";
const OUTPUT_DIR = "./output";
const API_URL = "https://api.anthropic.com/v1/messages/count_tokens";
const MODEL = "claude-opus-4-6";

interface StepResult {
  name: string;
  tokens: number;
  chars: number;
}

async function countTokens(content: string): Promise<number> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is required");
  }

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
    const error = await response.text();
    throw new Error(`API error (${response.status}): ${error}`);
  }

  const data = await response.json();
  return data.input_tokens;
}

function removeElements(html: string, selectors: string[]): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  if (!doc) throw new Error("Failed to parse HTML");

  for (const selector of selectors) {
    const elements = doc.querySelectorAll(selector);
    for (const el of elements) {
      el.remove();
    }
  }

  return doc.documentElement?.outerHTML ?? "";
}

function cleanSvgContents(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  if (!doc) throw new Error("Failed to parse HTML");

  const svgs = doc.querySelectorAll("svg");
  for (const svg of svgs) {
    const svgEl = svg as Element;
    // Keep only title elements, remove everything else
    const children = [...svgEl.children];
    for (const child of children) {
      if (child.tagName.toLowerCase() !== "title") {
        child.remove();
      }
    }
    // Also clear any text nodes (keeping structure but removing inline content)
  }

  return doc.documentElement?.outerHTML ?? "";
}

function removeComments(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, "");
}

function removeHiddenElements(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  if (!doc) throw new Error("Failed to parse HTML");

  const allElements = doc.querySelectorAll("[style]");
  for (const el of allElements) {
    const style = (el as Element).getAttribute("style") ?? "";
    if (style.includes("display:none") || style.includes("display: none")) {
      el.remove();
    }
  }

  return doc.documentElement?.outerHTML ?? "";
}

type CleaningStep = {
  name: string;
  apply: (html: string) => string;
};

const steps: CleaningStep[] = [
  {
    name: "01-remove-head-script-link-style",
    apply: (html) => removeElements(html, ["head", "script", "link", "style"]),
  },
  {
    name: "02-remove-hidden-elements",
    apply: removeHiddenElements,
  },
  {
    name: "03-clean-svg-contents",
    apply: cleanSvgContents,
  },
  {
    name: "04-remove-comments",
    apply: removeComments,
  },
];

async function processFile(filePath: string, outputDir: string): Promise<void> {
  const fileName = basename(filePath, ".html");
  const fileOutputDir = join(outputDir, fileName);
  await Deno.mkdir(fileOutputDir, { recursive: true });

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Processing: ${fileName}`);
  console.log("=".repeat(60));

  let html = await Deno.readTextFile(filePath);
  const results: StepResult[] = [];

  // Save and count original
  const originalPath = join(fileOutputDir, "00-original.html");
  await Deno.writeTextFile(originalPath, html);
  const originalTokens = await countTokens(html);
  results.push({ name: "00-original", tokens: originalTokens, chars: html.length });
  console.log(`  00-original: ${originalTokens.toLocaleString()} tokens, ${html.length.toLocaleString()} chars`);

  // Apply each step
  for (const step of steps) {
    html = step.apply(html);
    const stepPath = join(fileOutputDir, `${step.name}.html`);
    await Deno.writeTextFile(stepPath, html);
    const tokens = await countTokens(html);
    results.push({ name: step.name, tokens, chars: html.length });
    console.log(`  ${step.name}: ${tokens.toLocaleString()} tokens, ${html.length.toLocaleString()} chars`);
  }

  // Print summary
  console.log(`\n  Summary for ${fileName}:`);
  const first = results[0];
  const last = results[results.length - 1];
  const reduction = ((1 - last.tokens / first.tokens) * 100).toFixed(1);
  console.log(`    Token reduction: ${first.tokens.toLocaleString()} → ${last.tokens.toLocaleString()} (${reduction}%)`);
}

async function main() {
  // Resolve paths relative to script location
  const scriptDir = new URL(".", import.meta.url).pathname;
  const inputDir = join(scriptDir, INPUT_DIR);
  const outputDir = join(scriptDir, OUTPUT_DIR);

  await Deno.mkdir(outputDir, { recursive: true });

  console.log(`Input:  ${inputDir}`);
  console.log(`Output: ${outputDir}`);

  const files: string[] = [];
  for await (const entry of Deno.readDir(inputDir)) {
    if (entry.isFile && entry.name.endsWith(".html")) {
      files.push(join(inputDir, entry.name));
    }
  }

  files.sort();

  for (const file of files) {
    await processFile(file, outputDir);
  }

  console.log("\nDone!");
}

main();
