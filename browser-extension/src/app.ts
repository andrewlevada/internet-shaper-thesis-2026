import { overlay } from "fiber-extension";
import { applyRules } from "./agent/index.ts";
import {
  createOverlayTemplate,
  loadRules,
  setView,
  shouldOpenRulesOnLoad,
} from "./ui/index.ts";

async function main() {
  console.log("Internet Shaper loaded");

  const savedRules = loadRules();
  const enabledRules = savedRules.filter((r) => r.enabled !== false);
  if (enabledRules.length > 0) {
    await applyRules(enabledRules);
    console.log(`Applied ${enabledRules.length} saved rules`);
  }

  const templateFactory = (root: ShadowRoot) => createOverlayTemplate(root);

  // Set up toggle listener
  overlay.showOnAction(templateFactory);

  // Auto-open rules list if returning from delete/toggle
  if (shouldOpenRulesOnLoad()) {
    setView("rules");
    overlay.show(templateFactory);
  }
}

main();
