import { fiberExtension } from "fiber-extension/vite"
import { defineConfig, type PluginOption } from "vite"

export default defineConfig({
	plugins: [
		fiberExtension({
			manifest: {
				name: "Internet Shaper",
				version: "0.1.0",
				description: "Shape your internet experience",
				host_permissions: ["<all_urls>"],
				permissions: ["storage", "scripting", "declarativeNetRequest"],
				action: {},
			},
		}) as PluginOption,
	],
})
