import type { InferenceMode } from "./inference-settings.ts";

const STORAGE_KEY = "internet-shaper-run-log";
const MAX_ENTRIES = 200;

export interface RunLogEntry {
  ts: string;
  mode: InferenceMode;
  host: string;
  userRequest: string;
  turns: number;
  rulesGenerated: number;
  durationMs: number;
  error?: string;
}

/**
 * Append a single run entry to a ring-buffered log in chrome.storage.local.
 *
 * Project rule (CLAUDE.md): "Log all script results with input configuration
 * in .log files for reproducibility." A content script can't write to disk,
 * so we use chrome.storage as the persistence layer; entries can be exported
 * as JSONL via chrome://extensions service-worker console if needed.
 */
export async function logRun(
  entry: Omit<RunLogEntry, "ts" | "host">,
): Promise<void> {
  const full: RunLogEntry = {
    ts: new Date().toISOString(),
    host: globalThis.location?.hostname ?? "unknown",
    ...entry,
  };

  console.log("[run-log]", JSON.stringify(full));

  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    const existing: RunLogEntry[] = stored[STORAGE_KEY] ?? [];
    const next = [...existing, full].slice(-MAX_ENTRIES);
    await chrome.storage.local.set({ [STORAGE_KEY]: next });
  } catch (e) {
    console.warn("[run-log] failed to persist:", e);
  }
}

export async function readRunLog(): Promise<RunLogEntry[]> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  return stored[STORAGE_KEY] ?? [];
}
