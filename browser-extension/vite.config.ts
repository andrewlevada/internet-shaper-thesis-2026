import { defineConfig } from "vite";
import { fiberExtension } from "fiber-extension/vite";

export default defineConfig({
  plugins: [
    fiberExtension({
      manifest: {
        name: "Internet Shaper",
        version: "0.1.0",
        description: "Shape your internet experience",
        host_permissions: ["<all_urls>"],
        permissions: ["storage"],
        action: {},
      },
    }),
  ],
});
