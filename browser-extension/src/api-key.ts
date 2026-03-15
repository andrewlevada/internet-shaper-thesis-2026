const API_KEY_STORAGE_KEY = "internet-shaper-api-key";

export async function getApiKey(): Promise<string | null> {
  const result = await chrome.storage.local.get(API_KEY_STORAGE_KEY);
  return result[API_KEY_STORAGE_KEY] ?? null;
}

export async function setApiKey(key: string): Promise<void> {
  await chrome.storage.local.set({ [API_KEY_STORAGE_KEY]: key });
}

export async function showApiKeyPrompt(): Promise<void> {
  const current = (await getApiKey()) || "";
  const key = prompt("Enter your Anthropic API key:", current);
  if (key !== null) {
    await setApiKey(key);
  }
}
