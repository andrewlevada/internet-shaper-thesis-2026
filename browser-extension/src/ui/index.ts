import { html as litHtml, render } from "lit";
import { computed, signal, withWatch } from "@lit-labs/preact-signals";
import { overlay } from "fiber-extension";
import { applyRules, runAgent, type UpdateRule } from "../agent/index.ts";
import { getApiKey, showApiKeyPrompt } from "../api-key.ts";
import { styles } from "../styles.ts";

// Wrap html tag to auto-watch signals in bindings
const html = withWatch(litHtml);

function getRulesStorageKey(): string {
  return `internet-shaper-rules:${globalThis.location.hostname}`;
}

export function loadRules(): UpdateRule[] {
  const stored = localStorage.getItem(getRulesStorageKey());
  return stored ? JSON.parse(stored) : [];
}

function saveRules(rules: UpdateRule[]): void {
  const existing = loadRules();
  const combined = [...existing, ...rules];
  localStorage.setItem(getRulesStorageKey(), JSON.stringify(combined));
}

function deleteRule(index: number): void {
  const rules = loadRules();
  rules.splice(index, 1);
  localStorage.setItem(getRulesStorageKey(), JSON.stringify(rules));
}

type View = "main" | "rules";

// Reactive state using signals
const isProcessing = signal(false);
const status = signal("");
const view = signal<View>("main");
const inputValue = signal("");

// Computed signals
const buttonText = computed(() => (isProcessing.value ? "..." : "Run"));

async function handleSubmit() {
  console.log("[Shaper] handleSubmit called");

  if (isProcessing.value) {
    console.log("[Shaper] Already processing, ignoring");
    return;
  }

  const apiKey = getApiKey();
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

function showRulesView() {
  view.value = "rules";
}

function showMainView() {
  view.value = "main";
}

function handleDeleteRule(index: number, renderRoot: HTMLElement | ShadowRoot) {
  deleteRule(index);
  render(renderRules(renderRoot), renderRoot);
}

function renderMain(renderRoot: HTMLElement | ShadowRoot) {
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
          @click="${() => {
            showRulesView();
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

function renderRules(renderRoot: HTMLElement | ShadowRoot) {
  const rules = loadRules();
  return html`
    <style>
    ${styles}
    </style>

    <div class="modal-container">
      <div class="modal-header">
        <h2 class="modal-title">Rules for ${globalThis.location.hostname}</h2>
        <button
          class="btn-close-sm"
          @click="${() => {
            showMainView();
            render(renderMain(renderRoot), renderRoot);
          }}"
        >
          x
        </button>
      </div>

      ${rules.length === 0
        ? html`
          <p class="empty-text">No rules yet</p>
        `
        : rules.map(
          (rule, i) =>
            html`
              <div class="rule-card">
                <div class="row-between">
                  <strong class="rule-title">${rule.label}</strong>
                  <button
                    class="btn-delete"
                    @click="${() => handleDeleteRule(i, renderRoot)}"
                  >
                    Delete
                  </button>
                </div>

                <code class="rule-selector">${rule.query_selector}</code>
              </div>
            `,
        )}

      <button
        class="btn-full"
        @click="${() => {
          showMainView();
          render(renderMain(renderRoot), renderRoot);
        }}"
      >
        Back
      </button>
    </div>
  `;
}

export function createOverlayTemplate(renderRoot: HTMLElement | ShadowRoot) {
  return renderMain(renderRoot);
}
