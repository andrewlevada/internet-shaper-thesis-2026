import { signal } from "@lit-labs/preact-signals"
import { ext } from "fiber-extension"
import { getElementCounts, type UpdateRule } from "../agent/index.ts"
import { DEFAULT_MODEL, type ModelId } from "../agent/models.ts"

export type View = "main" | "rules"

const OPEN_RULES_FLAG = "internet-shaper-open-rules"
const RULES_BY_HOST_KEY = "internet-shaper-rules-by-host" as const
const SELECTED_MODEL_KEY = "internet-shaper-selected-model" as const

function hostname(): string {
	return globalThis.location.hostname
}

async function readRulesByHost(): Promise<Record<string, UpdateRule[]>> {
	const result = await ext.storage.local.get(RULES_BY_HOST_KEY)
	let record = (result[RULES_BY_HOST_KEY] ?? {}) as Record<string, UpdateRule[]>

	const legacyKey = `internet-shaper-rules:${hostname()}`
	const legacyRaw = globalThis.localStorage?.getItem(legacyKey)
	if (legacyRaw) {
		try {
			const legacyRules = JSON.parse(legacyRaw) as UpdateRule[]
			const current = record[hostname()] ?? []
			if (current.length === 0 && legacyRules.length > 0) {
				record = { ...record, [hostname()]: legacyRules }
				await ext.storage.local.set({ [RULES_BY_HOST_KEY]: record })
			}
		} catch {
			// ignore invalid legacy payload
		}
		globalThis.localStorage?.removeItem(legacyKey)
	}

	return record
}

async function writeRulesByHost(
	record: Record<string, UpdateRule[]>,
): Promise<void> {
	await ext.storage.local.set({ [RULES_BY_HOST_KEY]: record })
}

async function getRulesForCurrentHost(): Promise<UpdateRule[]> {
	const record = await readRulesByHost()
	return record[hostname()] ?? []
}

async function setRulesForCurrentHost(rules: UpdateRule[]): Promise<void> {
	const record = await readRulesByHost()
	record[hostname()] = rules
	await writeRulesByHost(record)
}

// Shared signals
export const view = signal<View>("main")
export const elementCounts = signal<number[]>([])
export const editedLogic = signal<Record<number, string>>({})
/** In-memory rules for the current host; keep in sync with storage via `refreshSavedRules` and mutating helpers. */
export const savedRules = signal<UpdateRule[]>([])
export const selectedModel = signal<ModelId>(DEFAULT_MODEL)

export async function refreshSavedRules(): Promise<void> {
	savedRules.value = await getRulesForCurrentHost()
	const stored = await ext.storage.local.get(SELECTED_MODEL_KEY)
	const storedModel = stored[SELECTED_MODEL_KEY]
	if (storedModel) selectedModel.value = storedModel as ModelId
}

export async function loadRules(): Promise<UpdateRule[]> {
	return getRulesForCurrentHost()
}

export async function saveRules(rules: UpdateRule[]): Promise<void> {
	const existing = await getRulesForCurrentHost()
	const combined = [...existing, ...rules]
	await setRulesForCurrentHost(combined)
	savedRules.value = combined
}

export async function deleteRule(index: number): Promise<void> {
	const rules = await getRulesForCurrentHost()
	rules.splice(index, 1)
	await setRulesForCurrentHost(rules)
	savedRules.value = rules
}

export async function toggleRule(index: number): Promise<void> {
	const rules = await getRulesForCurrentHost()
	const rule = rules[index]
	rule.enabled = rule.enabled === false ? true : false
	await setRulesForCurrentHost(rules)
	savedRules.value = rules
}

export async function updateRuleLogic(
	index: number,
	logic: string,
): Promise<void> {
	const rules = await getRulesForCurrentHost()
	rules[index].logic = logic
	await setRulesForCurrentHost(rules)
	savedRules.value = rules
}

// View helpers
export function setView(v: View): void {
	view.value = v
}

export async function setSelectedModel(id: ModelId): Promise<void> {
	selectedModel.value = id
	await ext.storage.local.set({ [SELECTED_MODEL_KEY]: id })
}

export function shouldOpenRulesOnLoad(): boolean {
	const flag = sessionStorage.getItem(OPEN_RULES_FLAG)
	if (flag) {
		sessionStorage.removeItem(OPEN_RULES_FLAG)
		return true
	}
	return false
}

export function markReopenRules(): void {
	sessionStorage.setItem(OPEN_RULES_FLAG, "true")
}

export async function refreshElementCounts(): Promise<void> {
	elementCounts.value = await getElementCounts()
}
