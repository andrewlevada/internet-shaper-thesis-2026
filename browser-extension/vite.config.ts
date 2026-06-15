import { fiberExtension } from "fiber-extension/vite"
import { defineConfig, type PluginOption } from "vite"
import { extensionIcons, iconManifest } from "./vite.icons.ts"

const icons = iconManifest()

export default defineConfig({
	plugins: [
		extensionIcons(),
		fiberExtension({
			manifest: {
				name: "Internet Shaper",
				version: "0.1.0",
				description: "Shape your internet experience",
				host_permissions: ["<all_urls>"],
				permissions: ["storage", "scripting", "declarativeNetRequest"],
				icons,
				action: {
					default_icon: icons,
				},
			},
		}) as PluginOption,
	],
})
