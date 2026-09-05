import { computed, signal, withWatch } from "@lit-labs/preact-signals"
import { overlay } from "fiber-extension"
import { html as litHtml, render } from "lit"
import {
	buildDomMapToolText,
	capturePageDom,
	ensureLiveDomContextPolling,
	formatLiveContextSummary,
	getElementCounts,
	isAgentGatewayError,
	liveDomContext,
	measureLiveDomContext,
	runAgent,
	stopLiveDomContextPolling,
} from "../../agent/index.ts"
import { MODELS } from "../../agent/models.ts"
import { applyRules } from "../../agent/rules-engine.ts"
import { getApiKeyForModel, showApiKeyPromptForModel } from "../../api-key.ts"
import { styles } from "../../styles.ts"
import {
	elementCounts,
	refreshSavedRules,
	savedRules,
	saveRules,
	selectedModel,
	setSelectedModel,
	setView,
} from "../store.ts"

const html = withWatch(litHtml)

// Local signals for main overlay
const isProcessing = signal(false)
const status = signal("")
const inputValue = signal("")
const buttonText = computed(() => (isProcessing.value ? "..." : "Run"))

function createHandleSubmit(rerender: () => void) {
	return async function handleSubmit() {
		console.log("[Shaper] handleSubmit called")

		if (isProcessing.value) {
			console.log("[Shaper] Already processing, ignoring")
			return
		}

		const modelId = selectedModel.value
		const apiKey = await getApiKeyForModel(modelId)
		console.log("[Shaper] API key present:", !!apiKey)

		if (!apiKey) {
			console.log("[Shaper] No API key")
			status.value = "API key required. Click API Key button."
			rerender()
			return
		}

		const request = inputValue.value.trim()
		console.log("[Shaper] Request:", request)

		if (!request) {
			console.log("[Shaper] Empty request")
			status.value = "Enter a request first"
			rerender()
			return
		}

		isProcessing.value = true
		status.value = "Capturing page DOM..."
		rerender()

		try {
			console.log("[Shaper] Starting agent...")

			const result = await runAgent(request, apiKey, modelId, (msg) => {
				console.log("[Shaper] Progress:", msg)
				status.value = msg
				rerender()
			})

			console.log("[Shaper] Agent complete. Rules:", result.rules)

			if (result.rules.length > 0) {
				console.log("[Shaper] Applying rules...")
				await applyRules(result.rules)
				await saveRules(result.rules)
				console.log("[Shaper] Rules applied and saved")
			}

			status.value = `Done! Applied ${result.rules.length} rules`
		} catch (e) {
			console.error("[Shaper] Agent error:", e)
			const msg = e instanceof Error ? e.message : String(e)
			status.value = isAgentGatewayError(e) ? msg : `Error: ${msg}`
		} finally {
			isProcessing.value = false
			rerender()
		}
	}
}

function handleKeydown(handleSubmit: () => void) {
	return (e: KeyboardEvent) => {
		if (e.key === "Enter") handleSubmit()
	}
}

function handleInput(e: Event) {
	inputValue.value = (e.target as HTMLInputElement).value
}

function downloadTextFile(filename: string, content: string, mime: string) {
	const blob = new Blob([content], { type: mime })
	const url = URL.createObjectURL(blob)
	const a = document.createElement("a")
	a.href = url
	a.download = filename
	a.click()
	queueMicrotask(() => URL.revokeObjectURL(url))
}

function saveDomDebugSnapshots(
	rerender: () => void,
	statusRef: { value: string },
) {
	try {
		const rawHtml = capturePageDom()
		const { mapText } = buildDomMapToolText(rawHtml)
		const ts = new Date().toISOString().replaceAll(/[:.]/g, "-")
		const base = `internet-shaper-dom-${ts}`
		downloadTextFile(`${base}-full.html`, rawHtml, "text/html;charset=utf-8")
		downloadTextFile(`${base}-map.html`, mapText, "text/html;charset=utf-8")
		statusRef.value = "Saved DOM snapshots (full + map)"
	} catch (e) {
		console.error("[Shaper] snapshot save failed:", e)
		statusRef.value =
			e instanceof Error ? `Snapshot error: ${e.message}` : "Snapshot error"
	}
	rerender()
}

export function renderMain(
	renderRoot: HTMLElement | ShadowRoot,
	renderRules: (root: HTMLElement | ShadowRoot) => unknown,
) {
	const rerender = () => render(renderMain(renderRoot, renderRules), renderRoot)
	const handleSubmit = createHandleSubmit(rerender)
	ensureLiveDomContextPolling(() => selectedModel.value, rerender)

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
          @input="${handleInput}"
          @keydown="${handleKeydown(handleSubmit)}"
        />

        <button
          class="btn"
          ?disabled="${isProcessing.value}"
          @click="${handleSubmit}"
        >
          ${buttonText}
        </button>

        <button class="btn-close" @click="${() => {
					stopLiveDomContextPolling()
					overlay.hide()
				}}">x</button>
      </div>

      <div
        class="context-row"
        title="Approximate tokens use chars÷4. Refreshes every 3s. Kimi shows gateway map cap when applicable."
      >
        <span class="context-indicator">
          ${
						liveDomContext.value
							? formatLiveContextSummary(liveDomContext.value)
							: "Measuring page context…"
					}
        </span>
        <button
          class="btn-sm"
          type="button"
          ?disabled="${isProcessing.value}"
          @click="${() => saveDomDebugSnapshots(rerender, status)}"
        >
          Save DOM snap
        </button>
      </div>

      <div class="row-between">
        <span class="status">${status}</span>

        <select
          class="select-model"
          .value="${selectedModel.value}"
          ?disabled="${isProcessing.value}"
          @change="${async (e: Event) => {
						await setSelectedModel(
							(e.target as HTMLSelectElement)
								.value as typeof selectedModel.value,
						)
						try {
							liveDomContext.value = measureLiveDomContext(selectedModel.value)
						} catch (err) {
							console.error("[Shaper] context remeasure failed:", err)
						}
						rerender()
					}}"
        >
          ${MODELS.map(
						(m) => html`
            <option value="${m.id}" ?selected="${selectedModel.value === m.id}">
              ${m.label}
            </option>
          `,
					)}
        </select>

        <button
          class="btn-sm"
          @click="${async () => {
						stopLiveDomContextPolling()
						await refreshSavedRules()
						elementCounts.value = await getElementCounts()
						setView("rules")
						render(renderRules(renderRoot), renderRoot)
					}}"
        >
          Rules (${savedRules.value.length})
        </button>

        <button
          class="btn-sm"
          @click="${async () => {
						await showApiKeyPromptForModel(selectedModel.value)
					}}"
        >
          API Key
        </button>
      </div>
    </div>
  `
}
