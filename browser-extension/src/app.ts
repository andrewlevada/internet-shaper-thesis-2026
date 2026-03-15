import { overlay } from "fiber-extension";
import { applyRules } from "./agent/index.ts";
import {
  createOverlayTemplate,
  loadRules,
  refreshElementCounts,
  setView,
  shouldOpenRulesOnLoad,
} from "./ui/index.ts";

async function main() {
  console.log("Internet Shaper loaded");

  const savedRules = loadRules();
  if (savedRules.length > 0) {
    await applyRules(savedRules);
    const enabledCount = savedRules.filter((r) => r.enabled !== false).length;
    console.log(`Applied ${enabledCount} saved rules`);
  }

  const templateFactory = (root: ShadowRoot) => createOverlayTemplate(root);

  // Set up toggle listener
  overlay.showOnAction(templateFactory);

  // Auto-open rules list if returning from delete/toggle
  if (shouldOpenRulesOnLoad()) {
    await refreshElementCounts();
    setView("rules");
    overlay.show(templateFactory);
  }
}

main();
