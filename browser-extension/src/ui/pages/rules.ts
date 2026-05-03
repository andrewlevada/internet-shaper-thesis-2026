import { withWatch } from "@lit-labs/preact-signals"
import { html as litHtml, render } from "lit"
import { styles } from "../../styles.ts"
import { renderRuleCard } from "../components/rule-card.ts"
import {
	deleteRule,
	editedLogic,
	elementCounts,
	markReopenRules,
	savedRules,
	setView,
	toggleRule,
	updateRuleLogic,
} from "../store.ts"

const html = withWatch(litHtml)

async function handleDeleteRule(index: number) {
	await deleteRule(index)
	markReopenRules()
	location.reload()
}

async function handleToggleRule(index: number) {
	await toggleRule(index)
	markReopenRules()
	location.reload()
}

function createHandleLogicEdit(rerender: () => void) {
	return (index: number, value: string) => {
		const rules = savedRules.value
		const original = rules[index].logic
		const updated = { ...editedLogic.value }

		if (value === original) {
			delete updated[index]
		} else {
			updated[index] = value
		}
		editedLogic.value = updated
		rerender()
	}
}

async function handleApplyRule(index: number) {
	const newLogic = editedLogic.value[index]
	if (!newLogic) return

	await updateRuleLogic(index, newLogic)
	markReopenRules()
	location.reload()
}

export function renderRules(
	renderRoot: HTMLElement | ShadowRoot,
	renderMain: (root: HTMLElement | ShadowRoot) => unknown,
) {
	const rules = savedRules.value
	const counts = elementCounts.value

	const rerender = () => render(renderRules(renderRoot, renderMain), renderRoot)

	const callbacks = {
		onToggle: handleToggleRule,
		onDelete: handleDeleteRule,
		onLogicEdit: createHandleLogicEdit(rerender),
		onApply: handleApplyRule,
	}

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
						setView("main")
						render(renderMain(renderRoot), renderRoot)
					}}"
        >
          x
        </button>
      </div>

      ${
				rules.length === 0
					? html`
          <p class="empty-text">No rules yet</p>
        `
					: rules.map((rule, i) =>
							renderRuleCard(rule, i, counts[i] ?? 0, editedLogic, callbacks),
						)
			}

      <button
        class="btn-full"
        @click="${() => {
					setView("main")
					render(renderMain(renderRoot), renderRoot)
				}}"
      >
        Back
      </button>
    </div>
  `
}
