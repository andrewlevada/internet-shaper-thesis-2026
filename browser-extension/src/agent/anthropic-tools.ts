import type { Tool } from "@anthropic-ai/sdk/resources/messages";
import { AGENT_TOOLS, type AgentToolSpec } from "./agent-spec.ts";

function toAnthropicTool(spec: AgentToolSpec): Tool {
  const properties: Record<string, { type: string; description: string; default?: unknown }> = {};
  const required: string[] = [];

  for (const param of spec.parameters) {
    properties[param.name] = {
      type: param.type,
      description: param.description,
    };
    if (param.default !== undefined) {
      properties[param.name].default = param.default;
    }
    if (param.required) required.push(param.name);
  }

  return {
    name: spec.name,
    description: spec.description,
    input_schema: {
      type: "object" as const,
      properties,
      required,
    },
  };
}

export const anthropicTools: Tool[] = AGENT_TOOLS.map(toAnthropicTool);
