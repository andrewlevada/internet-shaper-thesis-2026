export const MODELS = [
	{
		id: "claude-sonnet-4-6",
		label: "Claude Sonnet 4.6",
		provider: "anthropic",
		modelId: "claude-sonnet-4-6",
	},
	{
		id: "claude-sonnet-4-5",
		label: "Claude Sonnet 4.5",
		provider: "anthropic",
		modelId: "claude-sonnet-4-5",
	},
	{
		id: "kimi-k2-6",
		label: "Kimi K2.6",
		provider: "vercel",
		modelId: "moonshotai/kimi-k2.6",
	},
] as const

export type ModelId = (typeof MODELS)[number]["id"]
export type ModelProvider = (typeof MODELS)[number]["provider"]

export const DEFAULT_MODEL: ModelId = "claude-sonnet-4-6"

export function getModel(id: ModelId) {
	const model = MODELS.find((m) => m.id === id)
	if (!model) throw new Error(`Unknown model: ${id}`)
	return model
}
