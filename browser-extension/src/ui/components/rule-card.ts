import { html as litHtml } from "lit";
import type { Signal } from "@lit-labs/preact-signals";
import { withWatch } from "@lit-labs/preact-signals";
import type { UpdateRule } from "../../agent/index.ts";

const html = withWatch(litHtml);

export interface RuleCardCallbacks {
  onToggle: (index: number) => void;
  onDelete: (index: number) => void;
  onLogicEdit: (index: number, value: string) => void;
  onApply: (index: number) => void;
}

export function renderRuleCard(
  rule: UpdateRule,
  index: number,
  elementCount: number,
  editedLogic: Signal<Record<number, string>>,
  callbacks: RuleCardCallbacks,
) {
  return html`
    <div class="rule-card">
      <div class="row-between">
        <strong class="rule-title ${rule.enabled === false ? "disabled" : ""}">
          ${rule.label}
        </strong>

        <div class="row">
          <span class="element-count">${elementCount} elements</span>
          <div
            class="switch ${rule.enabled !== false ? "switch-enabled" : ""}"
            @click="${() => callbacks.onToggle(index)}"
          >
          </div>
          <button
            class="btn-delete"
            @click="${() => callbacks.onDelete(index)}"
          >
            Delete
          </button>
        </div>
      </div>

      <code class="rule-selector">${rule.query_selector}</code>
      <textarea
        class="rule-logic"
        .value="${editedLogic.value[index] ?? rule.logic}"
        @input="${(e: Event) =>
          callbacks.onLogicEdit(index, (e.target as HTMLTextAreaElement).value)}"
      ></textarea>
      ${editedLogic.value[index] !== undefined
        ? html`<button class="btn-apply" @click="${() => callbacks.onApply(index)}">Apply</button>`
        : null}
    </div>
  `;
}
