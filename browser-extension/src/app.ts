import { overlay } from "fiber-extension";
import { applyRules } from "./agent/index.ts";
import { createOverlayTemplate, loadRules } from "./ui/index.ts";

function main() {
  console.log("Internet Shaper loaded");

  const savedRules = loadRules();
  if (savedRules.length > 0) {
    applyRules(savedRules);
    console.log(`Applied ${savedRules.length} saved rules`);
  }

  // Pass factory function that receives the shadow root for re-rendering
  overlay.showOnAction((root) => createOverlayTemplate(root));
}

main();
