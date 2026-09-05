import { ext } from "fiber-extension"
import { getModel, type ModelId } from "./agent/models.ts"

const ANTHROPIC_KEY = "internet-shaper-api-key"
const VERCEL_KEY = "internet-shaper-vercel-api-key"

export async function getApiKey(): Promise<string | null> {
	const result = await ext.storage.local.get(ANTHROPIC_KEY)
	return result[ANTHROPIC_KEY] ?? null
}

export async function setApiKey(key: string): Promise<void> {
	await ext.storage.local.set({ [ANTHROPIC_KEY]: key })
}

export async function getVercelApiKey(): Promise<string | null> {
	const result = await ext.storage.local.get(VERCEL_KEY)
	return result[VERCEL_KEY] ?? null
}

export async function setVercelApiKey(key: string): Promise<void> {
	await ext.storage.local.set({ [VERCEL_KEY]: key })
}

export async function getApiKeyForModel(
	modelId: ModelId,
): Promise<string | null> {
	const model = getModel(modelId)
	return model.provider === "vercel" ? getVercelApiKey() : getApiKey()
}

export async function showApiKeyPromptForModel(
	modelId: ModelId,
): Promise<void> {
	const model = getModel(modelId)
	if (model.provider === "vercel") {
		const current = (await getVercelApiKey()) || ""
		const key = prompt("Enter your Vercel AI Gateway API key:", current)
		if (key !== null) await setVercelApiKey(key)
	} else {
		const current = (await getApiKey()) || ""
		const key = prompt("Enter your Anthropic API key:", current)
		if (key !== null) await setApiKey(key)
	}
}
