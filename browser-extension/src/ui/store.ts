import { signal } from "@lit-labs/preact-signals";
import { getElementCounts, type UpdateRule } from "../agent/index.ts";

export type View = "main" | "rules";

const OPEN_RULES_FLAG = "internet-shaper-open-rules";

function getRulesStorageKey(): string {
  return `internet-shaper-rules:${globalThis.location.hostname}`;
}

// Shared signals
export const view = signal<View>("main");
export const elementCounts = signal<number[]>([]);
export const editedLogic = signal<Record<number, string>>({});

// Storage functions
export function loadRules(): UpdateRule[] {
  const stored = localStorage.getItem(getRulesStorageKey());
  return stored ? JSON.parse(stored) : [];
}

export function saveRules(rules: UpdateRule[]): void {
  const existing = loadRules();
  const combined = [...existing, ...rules];
  localStorage.setItem(getRulesStorageKey(), JSON.stringify(combined));
}

export function deleteRule(index: number): void {
  const rules = loadRules();
  rules.splice(index, 1);
  localStorage.setItem(getRulesStorageKey(), JSON.stringify(rules));
}

export function toggleRule(index: number): void {
  const rules = loadRules();
  const rule = rules[index];
  rule.enabled = rule.enabled === false ? true : false;
  localStorage.setItem(getRulesStorageKey(), JSON.stringify(rules));
}

export function updateRuleLogic(index: number, logic: string): void {
  const rules = loadRules();
  rules[index].logic = logic;
  localStorage.setItem(getRulesStorageKey(), JSON.stringify(rules));
}

// View helpers
export function setView(v: View): void {
  view.value = v;
}

export function shouldOpenRulesOnLoad(): boolean {
  const flag = sessionStorage.getItem(OPEN_RULES_FLAG);
  if (flag) {
    sessionStorage.removeItem(OPEN_RULES_FLAG);
    return true;
  }
  return false;
}

export function markReopenRules(): void {
  sessionStorage.setItem(OPEN_RULES_FLAG, "true");
}

export async function refreshElementCounts(): Promise<void> {
  elementCounts.value = await getElementCounts();
}
