import type { UpdateRule } from "./agent/rules-engine.ts"

declare module "fiber-extension" {
	interface FiberStorageLocal {
		"internet-shaper-api-key": string
		"internet-shaper-vercel-api-key": string
		"internet-shaper-selected-model": string
		"internet-shaper-rules-by-host": Record<string, UpdateRule[]>
	}
}
