const API_KEY_STORAGE_KEY = "internet-shaper-api-key";

export function getApiKey(): string | null {
  return localStorage.getItem(API_KEY_STORAGE_KEY);
}

export function setApiKey(key: string): void {
  localStorage.setItem(API_KEY_STORAGE_KEY, key);
}

export function showApiKeyPrompt(): void {
  const current = getApiKey() || "";
  const key = prompt("Enter your Anthropic API key:", current);
  if (key !== null) {
    setApiKey(key);
  }
}
