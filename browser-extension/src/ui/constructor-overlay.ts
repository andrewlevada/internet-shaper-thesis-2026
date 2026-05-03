import { html as litHtml, render } from "lit";
import { computed, signal, withWatch } from "@lit-labs/preact-signals";
import { overlay } from "fiber-extension";
import {
  applyRules,
  checkLocalAvailability,
  getElementCounts,
  type LocalAvailability,
  runAgent,
} from "../agent/index.ts";
import { getApiKey, showApiKeyPrompt } from "../api-key.ts";
import {
  getInferenceMode,
  type InferenceMode,
  setInferenceMode,
} from "../inference-settings.ts";
import { logRun } from "../run-log.ts";
import { styles } from "../styles.ts";
import { elementCounts, loadRules, saveRules, setView } from "./store.ts";

const html = withWatch(litHtml);

const isProcessing = signal(false);
const status = signal("");
const inputValue = signal("");
const inferenceMode = signal<InferenceMode>("cloud");
const localAvailability = signal<LocalAvailability | "missing" | "unknown">(
  "unknown",
);
const buttonText = computed(() => (isProcessing.value ? "..." : "Run"));

let modeInitialized = false;
async function ensureModeLoaded(rerender: () => void) {
  if (modeInitialized) return;
  modeInitialized = true;
  inferenceMode.value = await getInferenceMode();
  if (inferenceMode.value === "local") {
    localAvailability.value = await checkLocalAvailability();
  }
  rerender();
}

async function refreshLocalAvailability(rerender: () => void) {
  localAvailability.value = "unknown";
  rerender();
  localAvailability.value = await checkLocalAvailability();
  rerender();
}

async function changeMode(next: InferenceMode, rerender: () => void) {
  if (inferenceMode.value === next) return;
  inferenceMode.value = next;
  await setInferenceMode(next);
  rerender();
  if (next === "local") {
    await refreshLocalAvailability(rerender);
  }
}

async function handleSubmit(rerender: () => void) {
  if (isProcessing.value) return;

  const request = inputValue.value.trim();
  if (!request) {
    status.value = "Enter a request first";
    rerender();
    return;
  }

  const mode = inferenceMode.value;
  let apiKey: string | null = null;

  if (mode === "cloud") {
    apiKey = await getApiKey();
    if (!apiKey) {
      status.value = "API key required. Click API Key button.";
      rerender();
      return;
    }
  }

  isProcessing.value = true;
  status.value = "Starting...";
  rerender();
  const startedAt = Date.now();

  try {
    const result = await runAgent(
      request,
      mode === "cloud" ? { mode: "cloud", apiKey: apiKey! } : { mode: "local" },
      (msg) => {
        status.value = msg;
        rerender();
      },
    );

    if (result.rules.length > 0) {
      await applyRules(result.rules);
      saveRules(result.rules);
    }

    status.value = `Done! Applied ${result.rules.length} rules`;
    logRun({
      mode: result.mode,
      userRequest: request,
      turns: result.turns,
      rulesGenerated: result.rules.length,
      durationMs: Date.now() - startedAt,
    });
  } catch (e) {
    console.error("[Shaper] Agent error:", e);
    const msg = e instanceof Error ? e.message : String(e);
    status.value = `Error: ${msg}`;
    logRun({
      mode,
      userRequest: request,
      turns: 0,
      rulesGenerated: 0,
      durationMs: Date.now() - startedAt,
      error: msg,
    });
  } finally {
    isProcessing.value = false;
    rerender();
  }
}

function handleKeydown(e: KeyboardEvent, rerender: () => void) {
  if (e.key === "Enter") void handleSubmit(rerender);
}

function handleInput(e: Event, rerender: () => void) {
  inputValue.value = (e.target as HTMLInputElement).value;
  rerender();
}

function localStatusLabel(a: LocalAvailability | "missing" | "unknown"): string {
  switch (a) {
    case "available": return "Local model ready";
    case "downloadable": return "Local model: will download on first run";
    case "downloading": return "Local model downloading...";
    case "unavailable": return "Local model unavailable on this device";
    case "missing": return "Prompt API not exposed (need Chrome 138+)";
    case "unknown": return "Checking local availability...";
  }
}

export function renderMain(
  renderRoot: HTMLElement | ShadowRoot,
  renderRules: (root: HTMLElement | ShadowRoot) => unknown,
) {
  const rules = loadRules();
  const rerender = () => render(renderMain(renderRoot, renderRules), renderRoot);
  ensureModeLoaded(rerender);

  return html`
    <style>
    ${styles}
    </style>

    <div class="overlay-container">
      <div class="row">
        <input
          class="input"
          type="text"
          placeholder="What do you want to change about this page?"
          .value="${inputValue.value}"
          ?disabled="${isProcessing.value}"
          @input="${(e: Event) => handleInput(e, rerender)}"
          @keydown="${(e: KeyboardEvent) => handleKeydown(e, rerender)}"
        />

        <button
          class="btn"
          ?disabled="${isProcessing.value}"
          @click="${() => void handleSubmit(rerender)}"
        >
          ${buttonText.value}
        </button>

        <button class="btn-close" @click="${() => overlay.hide()}">x</button>
      </div>

      <div class="row-between">
        <span class="status">
          ${isProcessing.value
            ? status.value || "Working…"
            : status.value ||
              (inferenceMode.value === "local"
                ? localStatusLabel(localAvailability.value)
                : "")}
        </span>

        <div class="row" style="gap: 4px;">
          <div class="mode-toggle" role="group" aria-label="Inference mode">
            <button
              class="${"mode-btn" +
              (inferenceMode.value === "cloud" ? " mode-btn-active" : "")}"
              ?disabled="${isProcessing.value}"
              @click="${() => void changeMode("cloud", rerender)}"
            >
              Cloud
            </button>
            <button
              class="${"mode-btn" +
              (inferenceMode.value === "local" ? " mode-btn-active" : "")}"
              ?disabled="${isProcessing.value}"
              @click="${() => void changeMode("local", rerender)}"
            >
              Local
            </button>
          </div>

          <button
            class="btn-sm"
            @click="${async () => {
              elementCounts.value = await getElementCounts();
              setView("rules");
              render(renderRules(renderRoot), renderRoot);
            }}"
          >
            Rules (${rules.length})
          </button>

          ${inferenceMode.value === "cloud"
            ? html`<button class="btn-sm" @click="${showApiKeyPrompt}">API Key</button>`
            : null}
        </div>
      </div>
    </div>
  `;
}
