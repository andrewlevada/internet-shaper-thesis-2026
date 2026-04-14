#!/usr/bin/env -S deno run --allow-read --allow-write

/**
 * Converts Markdown to Typst format.
 *
 * Usage: deno run --allow-read --allow-write md-to-typst.ts <input.md> [output.typ]
 * If output path is not provided, writes to <input>.typ
 *
 * Supported conversions:
 * - Headings: # → =, ## → ==, etc.
 * - Bold: **text** → *text*
 * - Italic: *text* or _text_ → _text_
 * - Bold-italic: ***text*** → *_text_*
 * - Inline code: `code` → `code` (unchanged)
 * - Code blocks: ```lang ... ``` → ```lang ... ```  (unchanged)
 * - Unordered lists: - item → - item (unchanged)
 * - Ordered lists: 1. item → + item
 * - Blockquotes: > text → #quote[text]
 * - Links: [text](url) → #link("url")[text]
 * - Images: ![alt](src) → #figure(image("src"), caption: [alt])
 * - Tables: GFM | tables | → #table(...)
 * - Horizontal rules: --- → #line(length: 100%)
 * - Strikethrough: ~~text~~ → #strike[text]
 * - Citations: @key → @key (unchanged — already Typst-native)
 */

const inputPath = Deno.args[0];
if (!inputPath) {
  console.error("Usage: md-to-typst.ts <input.md> [output.typ]");
  Deno.exit(1);
}

const outputPath = Deno.args[1] ?? inputPath.replace(/\.md$/, ".typ");

const input = await Deno.readTextFile(inputPath);
const output = convertMarkdownToTypst(input);
await Deno.writeTextFile(outputPath, output);

console.log(`Converted: ${inputPath} → ${outputPath}`);

// ---------------------------------------------------------------------------

export function convertMarkdownToTypst(md: string): string {
  const lines = md.split("\n");
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code blocks — pass through unchanged
    if (/^```/.test(line)) {
      result.push(line);
      i++;
      while (i < lines.length) {
        result.push(lines[i]);
        if (/^```\s*$/.test(lines[i])) { i++; break; }
        i++;
      }
      continue;
    }

    // Tables
    if (isTableRow(line) && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const tableLines: string[] = [];
      while (i < lines.length && isTableRow(lines[i])) {
        tableLines.push(lines[i]);
        i++;
      }
      result.push(convertTable(tableLines));
      continue;
    }

    // Blockquotes
    if (/^>/.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length && /^>/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      const inner = quoteLines.map(l => convertInline(l)).join("\n");
      result.push(`#quote(block: true)[\n${inner}\n]`);
      continue;
    }

    result.push(convertLine(line));
    i++;
  }

  return result.join("\n");
}

function convertLine(line: string): string {
  // Headings: # is document title (level 0), ## maps to = (level 1), etc.
  const headingMatch = line.match(/^(#{1,6})\s+(.*)/);
  if (headingMatch) {
    const mdLevel = headingMatch[1].length;
    if (mdLevel === 1) {
      // Document title — emit as a plain title call, no label
      return `#align(center)[#text(size: 1.5em)[${convertInline(headingMatch[2])}]]`;
    }
    const typstLevel = "=".repeat(mdLevel - 1);
    const label = slugifyLabel(headingMatch[2]);
    return `${typstLevel} ${convertInline(headingMatch[2])} <${label}>`;
  }

  // Horizontal rule
  if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
    return "#line(length: 100%)";
  }

  // Ordered list items: "1. ", "2. ", etc.
  const orderedMatch = line.match(/^(\s*)\d+\.\s+(.*)/);
  if (orderedMatch) {
    return `${orderedMatch[1]}+ ${convertInline(orderedMatch[2])}`;
  }

  return convertInline(line);
}

function slugifyLabel(heading: string): string {
  return "sec:" + heading
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
}

function convertInline(text: string): string {
  // Bold-italic: ***text***
  text = text.replace(/\*{3}(.+?)\*{3}/g, "*_$1_*");

  // Bold: **text**
  text = text.replace(/\*{2}(.+?)\*{2}/g, "*$1*");

  // Italic: *text* (single asterisk, not already consumed)
  // Only convert when not adjacent to another asterisk
  text = text.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "_$1_");

  // Strikethrough: ~~text~~
  text = text.replace(/~~(.+?)~~/g, "#strike[$1]");

  // Images (before links since syntax overlaps): ![alt](src)
  text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) => {
    const caption = alt ? `, caption: [${alt}]` : "";
    return `#figure(image("${src}")${caption})`;
  });

  // Links: [text](url)
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '#link("$2")[$1]');

  return text;
}

// ---------------------------------------------------------------------------
// Table conversion

function isTableRow(line: string): boolean {
  return /^\|.+\|/.test(line.trim());
}

function isTableSeparator(line: string): boolean {
  return /^\|[\s|:-]+\|/.test(line.trim());
}

function parseTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map(cell => cell.trim());
}

function convertTable(tableLines: string[]): string {
  // First line is header, second is separator, rest are body
  const [headerLine, _sep, ...bodyLines] = tableLines;
  const headers = parseTableRow(headerLine);
  const columnCount = headers.length;

  const headerCells = headers.map(h => `  table.header[${convertInline(h)}],`);
  const bodyCells = bodyLines.flatMap(row =>
    parseTableRow(row).map(cell => `  [${convertInline(cell)}],`)
  );

  return [
    `#table(`,
    `  columns: ${columnCount},`,
    ...headerCells,
    ...bodyCells,
    `)`,
  ].join("\n");
}
