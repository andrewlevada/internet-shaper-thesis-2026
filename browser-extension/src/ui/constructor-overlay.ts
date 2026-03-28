import { html as litHtml, render } from "lit";
import { computed, signal, withWatch } from "@lit-labs/preact-signals";
import { overlay } from "fiber-extension";
import { applyRules, getElementCounts, runAgent } from "../agent/index.ts";
import { getApiKey, showApiKeyPrompt } from "../api-key.ts";
import { styles } from "../styles.ts";
import { elementCounts, loadRules, saveRules, setView } from "./store.ts";

const html = withWatch(litHtml);

// Local signals for main overlay
const isProcessing = signal(false);
const status = signal("");
const inputValue = signal("");
const buttonText = computed(() => (isProcessing.value ? "..." : "Run"));

async function handleSubmit() {
  console.log("[Shaper] handleSubmit called");

  if (isProcessing.value) {
    console.log("[Shaper] Already processing, ignoring");
    return;
  }

  const apiKey = await getApiKey();
  console.log("[Shaper] API key present:", !!apiKey);

  if (!apiKey) {
    console.log("[Shaper] No API key");
    status.value = "API key required. Click API Key button.";
    return;
  }

  const request = inputValue.value.trim();
  console.log("[Shaper] Request:", request);

  if (!request) {
    console.log("[Shaper] Empty request");
    status.value = "Enter a request first";
    return;
  }

  isProcessing.value = true;
  status.value = "Capturing page DOM...";

  try {
    console.log("[Shaper] Starting agent...");

    const result = await runAgent(request, apiKey, (msg) => {
      console.log("[Shaper] Progress:", msg);
      status.value = msg;
    });

    console.log("[Shaper] Agent complete. Rules:", result.rules);

    if (result.rules.length > 0) {
      console.log("[Shaper] Applying rules...");
      await applyRules(result.rules);
      saveRules(result.rules);
      console.log("[Shaper] Rules applied and saved");
    }

    status.value = `Done! Applied ${result.rules.length} rules`;
  } catch (e) {
    console.error("[Shaper] Agent error:", e);
    const msg = e instanceof Error ? e.message : String(e);
    status.value = `Error: ${msg}`;
  } finally {
    isProcessing.value = false;
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === "Enter") handleSubmit();
}

function handleInput(e: Event) {
  inputValue.value = (e.target as HTMLInputElement).value;
}

export function renderMain(
  renderRoot: HTMLElement | ShadowRoot,
  renderRules: (root: HTMLElement | ShadowRoot) => unknown,
) {
  const rules = loadRules();

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
          .value="${inputValue}"
          ?disabled="${isProcessing}"
          @input="${handleInput}"
          @keydown="${handleKeydown}"
        />

        <button
          class="btn"
          ?disabled="${isProcessing}"
          @click="${handleSubmit}"
        >
          ${buttonText}
        </button>

        <button class="btn-close" @click="${() => overlay.hide()}">x</button>
      </div>

      <div class="row-between">
        <span class="status">${status}</span>

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

        <button class="btn-sm" @click="${showApiKeyPrompt}">API Key</button>
      </div>
    </div>
  `;
}
