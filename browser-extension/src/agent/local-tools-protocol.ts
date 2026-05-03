/**
 * XML-style tool-call protocol for the local Prompt API runner.
 *
 * Pattern is inspired by Claude Code's <function_calls>/<invoke>/<parameter>
 * format, but uses an `is_` (Internet Shaper) namespace so it never collides
 * with the model's training distribution for any other vendor's tag set.
 */

import { AGENT_TOOLS, type AgentToolSpec } from "./agent-spec.ts";

const OPEN_CALLS = "<is_calls>";
const CLOSE_CALLS = "</is_calls>";

export const LOCAL_TOOL_FORMAT_SPEC =
  `## Tool-call format

When you want to call one or more tools, output a single block in exactly this XML form:

${OPEN_CALLS}
  <is_invoke name="TOOL_NAME">
    <is_param name="PARAM_NAME">VALUE</is_param>
    <is_param name="ANOTHER_PARAM">VALUE</is_param>
  </is_invoke>
${CLOSE_CALLS}

Rules:
  - Emit ${OPEN_CALLS} ... ${CLOSE_CALLS} only when calling tools. Never wrap plain text in it.
  - One <is_invoke> per tool call. Multiple <is_invoke> blocks may appear inside a single ${OPEN_CALLS} block.
  - Parameter values are read literally from open-tag to close-tag. Do NOT URL-encode or HTML-escape them.
  - If a parameter value contains the literal substring "</is_param>", escape the slash as "<\\/is_param>". Otherwise pass the value verbatim.
  - When you are done (all rules registered, no more tools needed), respond with plain text only — do NOT emit ${OPEN_CALLS}.`;

function renderToolSpec(spec: AgentToolSpec): string {
  const params = spec.parameters
    .map((p) => {
      const flags = [
        p.required ? "required" : "optional",
        p.default !== undefined ? `default=${JSON.stringify(p.default)}` : null,
      ]
        .filter(Boolean)
        .join(", ");
      return `    - ${p.name} (${p.type}, ${flags}): ${p.description}`;
    })
    .join("\n");

  return [
    `<is_function name="${spec.name}">`,
    spec.description,
    params ? `\nParameters:\n${params}` : "\nParameters: none",
    `</is_function>`,
  ].join("\n");
}

export function renderToolsBlock(): string {
  const inner = AGENT_TOOLS.map(renderToolSpec).join("\n\n");
  return `<is_functions>\n${inner}\n</is_functions>`;
}

export interface ParsedToolCall {
  name: string;
  args: Record<string, string | boolean | number>;
  raw: string;
}

const CALLS_BLOCK_RE = /<is_calls>([\s\S]*?)<\/is_calls>/i;
const INVOKE_RE = /<is_invoke\s+name="([^"]+)"\s*>([\s\S]*?)<\/is_invoke>/gi;
const PARAM_RE = /<is_param\s+name="([^"]+)"\s*>([\s\S]*?)<\/is_param>/gi;

function unescapeParamValue(raw: string): string {
  return raw.replace(/<\\\/is_param>/g, "</is_param>");
}

function coerceValue(raw: string, type: AgentToolSpec["parameters"][number]["type"] | undefined): string | boolean | number {
  if (type === "boolean") {
    const v = raw.trim().toLowerCase();
    if (v === "true") return true;
    if (v === "false") return false;
    return raw;
  }
  if (type === "number" || type === "integer") {
    const n = Number(raw.trim());
    if (Number.isFinite(n)) return type === "integer" ? Math.trunc(n) : n;
    return raw;
  }
  return raw;
}

/**
 * Extract all tool calls from an assistant message. Returns [] when no
 * <is_calls> block is present (the model is signaling it's done).
 */
export function parseToolCalls(assistantText: string): ParsedToolCall[] {
  const block = CALLS_BLOCK_RE.exec(assistantText);
  if (!block) return [];
  const inner = block[1];

  const calls: ParsedToolCall[] = [];
  INVOKE_RE.lastIndex = 0;
  let invoke: RegExpExecArray | null;
  while ((invoke = INVOKE_RE.exec(inner)) !== null) {
    const name = invoke[1];
    const body = invoke[2];
    const spec = AGENT_TOOLS.find((t) => t.name === name);

    const args: Record<string, string | boolean | number> = {};
    PARAM_RE.lastIndex = 0;
    let param: RegExpExecArray | null;
    while ((param = PARAM_RE.exec(body)) !== null) {
      const paramName = param[1];
      const rawValue = unescapeParamValue(param[2]);
      const paramSpec = spec?.parameters.find((p) => p.name === paramName);
      args[paramName] = coerceValue(rawValue, paramSpec?.type);
    }

    calls.push({ name, args, raw: invoke[0] });
  }

  return calls;
}
