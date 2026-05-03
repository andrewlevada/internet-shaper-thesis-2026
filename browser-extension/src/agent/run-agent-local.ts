import {
  createToolContext,
  executeTool,
  type ToolContext,
} from "./tools.ts";
import { capturePageDom } from "./dom-processing.ts";
import { AGENT_SHARED_INSTRUCTIONS } from "./agent-spec.ts";
import {
  LOCAL_TOOL_FORMAT_SPEC,
  parseToolCalls,
  renderToolsBlock,
} from "./local-tools-protocol.ts";
import type { UpdateRule } from "./types.ts";

const MAX_TURNS = 8;

/** Lets the browser paint after progress updates before heavy synchronous work. */
async function reportProgress(
  onProgress: ((message: string) => void) | undefined,
  message: string,
): Promise<void> {
  onProgress?.(message);
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

function reportProgressFireAndForget(
  onProgress: ((message: string) => void) | undefined,
  message: string,
): void {
  void reportProgress(onProgress, message);
}

const LANGUAGE_OPTS: LanguageModelCreateCoreOptions = {
  expectedInputs: [{ type: "text", languages: ["en"] }],
  expectedOutputs: [{ type: "text", languages: ["en"] }],
};

export type LocalAvailability = Availability;

export interface LocalAgentResult {
  rules: UpdateRule[];
  context: ToolContext;
  turns: number;
}

export class LocalUnavailableError extends Error {
  constructor(public readonly availability: Availability | "missing") {
    super(
      availability === "missing"
        ? "Chrome built-in LanguageModel API is not exposed in this context. Requires Chrome 138+ on a supported device."
        : `Chrome built-in LanguageModel reports availability="${availability}".`,
    );
    this.name = "LocalUnavailableError";
  }
}

function getLanguageModel(): typeof LanguageModel | undefined {
  return (globalThis as { LanguageModel?: typeof LanguageModel }).LanguageModel;
}

export async function checkLocalAvailability(): Promise<Availability | "missing"> {
  const lm = getLanguageModel();
  if (!lm) return "missing";
  try {
    return await lm.availability(LANGUAGE_OPTS);
  } catch (e) {
    console.error("[Agent:local] availability() threw:", e);
    return "unavailable";
  }
}

function buildSystemPrompt(): string {
  return [
    AGENT_SHARED_INSTRUCTIONS,
    "",
    renderToolsBlock(),
    "",
    LOCAL_TOOL_FORMAT_SPEC,
  ].join("\n");
}

export async function runAgentLocal(
  userRequest: string,
  onProgress?: (message: string) => void,
): Promise<LocalAgentResult> {
  console.log("[Agent:local] runAgent called with request:", userRequest);

  const lm = getLanguageModel();
  if (!lm) throw new LocalUnavailableError("missing");

  const availability = await lm.availability(LANGUAGE_OPTS);
  console.log("[Agent:local] availability:", availability);
  if (availability === "unavailable") throw new LocalUnavailableError("unavailable");

  await reportProgress(onProgress, "Capturing page DOM...");
  const rawHtml = capturePageDom();
  const context = createToolContext(rawHtml);

  await reportProgress(
    onProgress,
    availability === "available"
      ? "Starting on-device model..."
      : `Preparing on-device model (${availability})...`,
  );

  const session = await lm.create({
    ...LANGUAGE_OPTS,
    initialPrompts: [{ role: "system", content: buildSystemPrompt() }],
    monitor(m) {
      m.addEventListener("downloadprogress", (ev) => {
        const e = ev as ProgressEvent;
        const loaded = e.loaded ?? 0;
        const total =
          e.lengthComputable && e.total > 0 ? e.total : 0;
        const pct = total > 0
          ? Math.round((loaded / total) * 100)
          : Math.round(loaded <= 1 ? loaded * 100 : Math.min(100, loaded));
        reportProgressFireAndForget(onProgress, `Downloading model: ${pct}%`);
      });
    },
  });

  let turn = 0;
  let nextPrompt = userRequest;

  try {
    while (turn < MAX_TURNS) {
      turn++;
      await reportProgress(onProgress, `Thinking... (turn ${turn})`);
      console.log(`[Agent:local] turn ${turn}, prompt length=${nextPrompt.length}`);

      const reply = await session.prompt(nextPrompt);
      console.log("[Agent:local] reply:", reply.slice(0, 500));

      const calls = parseToolCalls(reply);
      if (calls.length === 0) {
        console.log("[Agent:local] No tool calls — conversation complete.");
        const preview = reply.trim().slice(0, 80);
        if (preview) await reportProgress(onProgress, preview);
        break;
      }

      const resultLines: string[] = [];
      for (const call of calls) {
        await reportProgress(onProgress, `Using tool: ${call.name}`);
        const result = executeTool(call.name, call.args, context);
        resultLines.push(
          `<is_result name="${call.name}">\n${result}\n</is_result>`,
        );
      }

      nextPrompt =
        `Tool results:\n${resultLines.join("\n\n")}\n\nContinue. Call more tools if needed, or respond with plain text when done.`;
    }
  } finally {
    session.destroy();
  }

  if (turn >= MAX_TURNS) {
    console.warn(`[Agent:local] Hit MAX_TURNS=${MAX_TURNS}`);
    await reportProgress(
      onProgress,
      `Stopped after ${MAX_TURNS} turns. Generated ${context.rules.length} rules.`,
    );
  } else {
    await reportProgress(onProgress, `Done! Generated ${context.rules.length} rules.`);
  }

  return { rules: context.rules, context, turns: turn };
}
