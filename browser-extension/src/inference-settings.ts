export type InferenceMode = "cloud" | "local";

const STORAGE_KEY = "internet-shaper-inference-mode";

export async function getInferenceMode(): Promise<InferenceMode> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const value = result[STORAGE_KEY];
  return value === "local" ? "local" : "cloud";
}

export async function setInferenceMode(mode: InferenceMode): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: mode });
}
