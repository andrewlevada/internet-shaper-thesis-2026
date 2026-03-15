#!/usr/bin/env -S deno run --allow-read --allow-write
/**
 * Redacts sensitive data from DOM sample HTML files.
 *
 * Patterns redacted:
 * - Google API keys (AIzaSy...)
 * - YouTube ID tokens (QUFFLUh...)
 * - Visitor data
 * - Session IDs
 *
 * Usage:
 *   deno run --allow-read --allow-write supplementary/redact-dom-samples.ts
 */

import { walk } from "https://deno.land/std@0.224.0/fs/walk.ts";

const REDACTION_PATTERNS: [RegExp, string][] = [
  // Google API keys
  [/AIzaSy[A-Za-z0-9_-]{33}/g, "REDACTED_GOOGLE_API_KEY"],

  // YouTube ID tokens (used in authentication)
  [/QUFFLUh[A-Za-z0-9_-]{30,}/g, "REDACTED_ID_TOKEN"],

  // Visitor data (base64 encoded tracking data)
  [/("visitorData"\s*:\s*")[A-Za-z0-9%_-]{20,}(")/g, '$1REDACTED_VISITOR_DATA$2'],
  [/(visitor_data=)[A-Za-z0-9%_-]{20,}/g, '$1REDACTED_VISITOR_DATA'],

  // SAPISIDHASH and similar auth hashes
  [/(SAPISIDHASH\s+)[0-9]+_[A-Za-z0-9_-]{30,}/g, '$1REDACTED_SAPISID_HASH'],

  // Session tokens in URLs or JSON
  [/("sessionId"\s*:\s*")[A-Za-z0-9_-]{20,}(")/g, '$1REDACTED_SESSION_ID$2'],

  // Generic long base64-like tokens that look like secrets
  [/("(?:token|Token|key|Key|secret|Secret|auth|Auth)"\s*:\s*")[A-Za-z0-9_-]{40,}(")/g, '$1REDACTED_TOKEN$2'],
];

const TARGET_DIRECTORIES = [
  "playground/00-dom-samples",
  "playground/01-dom-cleaning/output",
  "playground/02-simple-agent/doms",
  "playground/03-compact-agent/doms",
];

async function redactFile(filePath: string): Promise<{ modified: boolean; replacements: number }> {
  let content = await Deno.readTextFile(filePath);
  let totalReplacements = 0;

  for (const [pattern, replacement] of REDACTION_PATTERNS) {
    const matches = content.match(pattern);
    if (matches) {
      totalReplacements += matches.length;
      content = content.replace(pattern, replacement);
    }
  }

  if (totalReplacements > 0) {
    await Deno.writeTextFile(filePath, content);
    return { modified: true, replacements: totalReplacements };
  }

  return { modified: false, replacements: 0 };
}

async function main() {
  const cwd = Deno.cwd();
  let totalFiles = 0;
  let modifiedFiles = 0;
  let totalReplacements = 0;

  console.log("Redacting sensitive data from DOM samples...\n");

  for (const dir of TARGET_DIRECTORIES) {
    const fullPath = `${cwd}/${dir}`;

    try {
      for await (const entry of walk(fullPath, { exts: [".html"] })) {
        if (entry.isFile) {
          totalFiles++;
          const result = await redactFile(entry.path);

          if (result.modified) {
            modifiedFiles++;
            totalReplacements += result.replacements;
            const relativePath = entry.path.replace(cwd + "/", "");
            console.log(`  ${relativePath}: ${result.replacements} redactions`);
          }
        }
      }
    } catch (e) {
      if (!(e instanceof Deno.errors.NotFound)) {
        console.error(`Error processing ${dir}: ${e}`);
      }
    }
  }

  console.log(`\nSummary:`);
  console.log(`  Files scanned: ${totalFiles}`);
  console.log(`  Files modified: ${modifiedFiles}`);
  console.log(`  Total redactions: ${totalReplacements}`);
}

main();
