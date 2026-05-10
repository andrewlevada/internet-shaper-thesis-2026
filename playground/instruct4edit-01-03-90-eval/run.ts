#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env --allow-net

/**
 * Instruct4Edit — in-process 01 → 03 → 90 pipeline eval.
 *
 * Prerequisites: ANTHROPIC_API_KEY (e.g. via .env at repo root or cwd) for token counts.
 *
 * Usage (from this directory):
 *   deno run --allow-read --allow-write --allow-env --allow-net run.ts
 *
 * Writes: data/instruction_tuning_data.json (if missing), data/samples/*.html,
 *         metrics.csv, metrics.json, report.md, report.html, logs/<ts>-instruct4edit-eval.log
 */

import { load } from "https://deno.land/std@0.224.0/dotenv/mod.ts"
import { join } from "https://deno.land/std@0.224.0/path/mod.ts"
import { applyFullCleaning } from "../01-dom-cleaning/cleaning.ts"
import { createDomMap } from "../03-compact-agent/dom-processing.ts"
import { normalizeHtmlWhitespace } from "../90-dom-whitespace-normalization/whitespace-normalize.ts"
import { PLAYGROUND_LOG_MANUAL_NOTE_LINE } from "../log-manual-note.ts"

const SCRIPT_VERSION = "instruct4edit-01-03-90-eval/run/1"
const SAMPLE_COUNT = 100
const RNG_SEED = 42
const TOKEN_MODEL = "claude-opus-4-6"
const API_URL = "https://api.anthropic.com/v1/messages/count_tokens"
const DATASET_REPO = "dangtruong01/Instruct4Edit"
const JSON_REL_PATH = "data/datasets/instruction_tuning_data.json"

interface DatasetEntry {
	id: string
	original_html?: string
}

interface MetricRow {
	id: string
	chars_raw: number
	chars_01: number
	chars_03: number
	chars_90: number
	tokens_raw: number
	tokens_01: number
	tokens_03: number
	tokens_90: number
	pct_char_01: string
	pct_char_03: string
	pct_char_90: string
	pct_token_01: string
	pct_token_03: string
	pct_token_90: string
}

function mulberry32(initialSeed: number) {
	let a = initialSeed
	return (): number => {
		a += 0x6d2b79f5
		let t = a
		t = Math.imul(t ^ (t >>> 15), t | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

function shuffle<T>(arr: T[], seed: number): T[] {
	const out = [...arr]
	const rand = mulberry32(seed)
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(rand() * (i + 1))
		;[out[i], out[j]] = [out[j], out[i]]
	}
	return out
}

function sanitizeId(id: string): string {
	return id.replace(/[^a-zA-Z0-9._-]/g, "_")
}

function pctSmaller(after: number, raw: number): string {
	if (raw === 0) return "0.0"
	return ((1 - after / raw) * 100).toFixed(1)
}

function pctTokenVsRaw(tokensAfter: number, tokensRaw: number): string {
	if (tokensRaw < 0 || tokensAfter < 0) return "n/a"
	if (tokensRaw === 0) return "0.0"
	return ((1 - tokensAfter / tokensRaw) * 100).toFixed(1)
}

async function countTokens(content: string): Promise<number> {
	const apiKey = Deno.env.get("ANTHROPIC_API_KEY")
	if (!apiKey) return -1

	const response = await fetch(API_URL, {
		method: "POST",
		headers: {
			"x-api-key": apiKey,
			"content-type": "application/json",
			"anthropic-version": "2023-06-01",
		},
		body: JSON.stringify({
			model: TOKEN_MODEL,
			messages: [{ role: "user", content }],
		}),
	})

	if (!response.ok) {
		const err = await response.text()
		throw new Error(`token API ${response.status}: ${err}`)
	}

	const data = await response.json()
	return data.input_tokens as number
}

async function resolveDatasetCommit(): Promise<string | null> {
	try {
		const r = await fetch(
			`https://api.github.com/repos/${DATASET_REPO}/commits/main`,
		)
		if (!r.ok) return null
		const j = await r.json()
		return typeof j.sha === "string" ? j.sha : null
	} catch {
		return null
	}
}

async function ensureDatasetJson(
	dataDir: string,
	logLines: string[],
): Promise<{ path: string; commitSha: string | null }> {
	const path = join(dataDir, "instruction_tuning_data.json")
	try {
		await Deno.stat(path)
		logLines.push(`dataset file: existing ${path}`)
		return { path, commitSha: null }
	} catch {
		await Deno.mkdir(dataDir, { recursive: true })
		const sha = await resolveDatasetCommit()
		const url = sha
			? `https://raw.githubusercontent.com/${DATASET_REPO}/${sha}/${JSON_REL_PATH}`
			: `https://raw.githubusercontent.com/${DATASET_REPO}/main/${JSON_REL_PATH}`
		logLines.push(`dataset fetch: ${url}`)
		if (sha) logLines.push(`github main resolved sha: ${sha}`)
		const res = await fetch(url)
		if (!res.ok) {
			throw new Error(
				`failed to fetch dataset: ${res.status} ${await res.text()}`,
			)
		}
		await Deno.writeTextFile(path, await res.text())
		await Deno.writeTextFile(
			join(dataDir, "dataset-source.txt"),
			`fetched_url: ${url}\ncommit_sha: ${sha ?? "unknown"}\n`,
		)
		return { path, commitSha: sha }
	}
}

function mean(nums: number[]): number {
	if (nums.length === 0) return 0
	return nums.reduce((a, b) => a + b, 0) / nums.length
}

function median(nums: number[]): number {
	if (nums.length === 0) return 0
	const s = [...nums].sort((a, b) => a - b)
	const m = Math.floor(s.length / 2)
	return s.length % 2 === 1 ? s[m] : (s[m - 1] + s[m]) / 2
}

function csvEscape(s: string): string {
	if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
	return s
}

function buildReportHtml(metrics: MetricRow[]): string {
	const data = JSON.stringify(metrics)
	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>Instruct4Edit 01→03→90 reduction</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 1.5rem; max-width: 1200px; }
    h1 { font-size: 1.25rem; }
    #chart { margin-top: 1rem; }
    .bar-row { display: flex; align-items: center; margin: 4px 0; gap: 8px; }
    .label { width: 100px; font-size: 12px; flex-shrink: 0; }
    .track { flex: 1; height: 14px; background: #eee; border-radius: 3px; overflow: hidden; display: flex; }
    .c01 { background: #5b8cff; height: 100%; }
    .c03 { background: #7c3aed; height: 100%; }
    .c90 { background: #059669; height: 100%; }
    .legend { margin-top: 1rem; font-size: 13px; }
    .legend span { margin-right: 1rem; }
  </style>
</head>
<body>
  <h1>Character reduction vs raw (stacked to final)</h1>
  <p>Each row: blue = after 01, purple = additional after 03, green = additional after 90 (of remaining).</p>
  <div id="chart"></div>
  <div class="legend">
    <span><span class="c01" style="display:inline-block;width:12px;height:12px;vertical-align:middle"></span> stage 01</span>
    <span><span class="c03" style="display:inline-block;width:12px;height:12px;vertical-align:middle"></span> stage 03</span>
    <span><span class="c90" style="display:inline-block;width:12px;height:12px;vertical-align:middle"></span> stage 90</span>
  </div>
  <script type="application/json" id="m">${data}</script>
  <script>
    const metrics = JSON.parse(document.getElementById('m').textContent);
    const el = document.getElementById('chart');
    for (const r of metrics) {
      const raw = r.chars_raw || 1;
      const w01 = (100 * (r.chars_raw - r.chars_01) / raw);
      const w03 = (100 * (r.chars_01 - r.chars_03) / raw);
      const w90 = (100 * (r.chars_03 - r.chars_90) / raw);
      const row = document.createElement('div');
      row.className = 'bar-row';
      row.innerHTML =
        '<div class="label">' + r.id.replace(/_/g, '') + '</div>' +
        '<div class="track">' +
        '<div class="c01" style="width:' + w01 + '%"></div>' +
        '<div class="c03" style="width:' + w03 + '%"></div>' +
        '<div class="c90" style="width:' + w90 + '%"></div>' +
        '</div>';
      el.appendChild(row);
    }
  </script>
</body>
</html>`
}

const scriptDir = new URL(".", import.meta.url).pathname
for (const envPath of [
	join(scriptDir, "..", "..", ".env"),
	join(scriptDir, ".env"),
]) {
	try {
		await Deno.stat(envPath)
		await load({ export: true, envPath })
	} catch {
		/* not found */
	}
}
const baseDir = scriptDir
const dataDir = join(baseDir, "data")
const samplesDir = join(dataDir, "samples")
const logsDir = join(baseDir, "logs")
const timestamp = new Date().toISOString()
const fileTs = timestamp.replace(/[:.]/g, "-")
const logPath = join(logsDir, `${fileTs}-instruct4edit-eval.log`)
const logLines: string[] = []

logLines.push(PLAYGROUND_LOG_MANUAL_NOTE_LINE)
logLines.push("")
logLines.push("Instruct4Edit in-process 01 → 03 → 90 evaluation")
logLines.push("-".repeat(48))
logLines.push(`timestamp (UTC): ${timestamp}`)
logLines.push(`script: ${SCRIPT_VERSION}`)
logLines.push(`sample count: ${SAMPLE_COUNT}`)
logLines.push(`rng seed (mulberry32): ${RNG_SEED}`)
logLines.push(`token model (all stages): ${TOKEN_MODEL}`)
logLines.push("")
if (!Deno.env.get("ANTHROPIC_API_KEY")) {
	logLines.push(
		"note: ANTHROPIC_API_KEY not set; token counts are -1 in CSV (character metrics still computed)",
	)
	logLines.push("")
}

await Deno.mkdir(logsDir, { recursive: true })
await Deno.mkdir(samplesDir, { recursive: true })

const { path: datasetPath, commitSha: fetchedCommitSha } =
	await ensureDatasetJson(dataDir, logLines)
let commitSha = fetchedCommitSha
if (!commitSha) {
	try {
		const provenance = await Deno.readTextFile(
			join(dataDir, "dataset-source.txt"),
		)
		const m = provenance.match(/commit_sha: ([^\s]+)/)
		if (m && m[1] !== "unknown") commitSha = m[1]
	} catch {
		/* no sidecar */
	}
}
if (commitSha)
	logLines.push(`dataset snapshot sha used for fetch: ${commitSha}`)
logLines.push("")

const rawJson = await Deno.readTextFile(datasetPath)
const allEntries = JSON.parse(rawJson) as DatasetEntry[]
const eligible = allEntries.filter(
	(e) =>
		e &&
		typeof e.id === "string" &&
		typeof e.original_html === "string" &&
		e.original_html.length > 0,
)
logLines.push(`eligible entries: ${eligible.length}`)

const shuffled = shuffle(eligible, RNG_SEED)
const picked = shuffled.slice(0, SAMPLE_COUNT)
logLines.push(`picked ids: ${picked.map((p) => p.id).join(", ")}`)
logLines.push("")

const metrics: MetricRow[] = []
const failures: string[] = []

for (const entry of picked) {
	const id = entry.id
	const raw = entry.original_html
	if (typeof raw !== "string" || raw.length === 0) {
		failures.push(`${id}: missing original_html`)
		logLines.push(`FAIL ${id}: missing original_html`)
		continue
	}
	try {
		await Deno.writeTextFile(join(samplesDir, `${sanitizeId(id)}.html`), raw)

		const after01 = applyFullCleaning(raw)
		const after03 = createDomMap(after01).html
		const after90 = normalizeHtmlWhitespace(after03)

		const [tokens_raw, tokens_01, tokens_03, tokens_90] = await Promise.all([
			countTokens(raw),
			countTokens(after01),
			countTokens(after03),
			countTokens(after90),
		])

		const chars_raw = raw.length
		const chars_01 = after01.length
		const chars_03 = after03.length
		const chars_90 = after90.length

		metrics.push({
			id,
			chars_raw,
			chars_01,
			chars_03,
			chars_90,
			tokens_raw,
			tokens_01,
			tokens_03,
			tokens_90,
			pct_char_01: pctSmaller(chars_01, chars_raw),
			pct_char_03: pctSmaller(chars_03, chars_raw),
			pct_char_90: pctSmaller(chars_90, chars_raw),
			pct_token_01: pctTokenVsRaw(tokens_01, tokens_raw),
			pct_token_03: pctTokenVsRaw(tokens_03, tokens_raw),
			pct_token_90: pctTokenVsRaw(tokens_90, tokens_raw),
		})
		logLines.push(
			`OK ${id}: chars ${chars_raw}→${chars_01}→${chars_03}→${chars_90}`,
		)
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e)
		failures.push(`${id}: ${msg}`)
		logLines.push(`FAIL ${id}: ${msg}`)
	}
}

logLines.push("")

// Summary stats
const char90 = metrics.map((m) =>
	m.chars_raw === 0 ? 0 : (1 - m.chars_90 / m.chars_raw) * 100,
)
const tok90 = metrics.map((m) =>
	m.tokens_raw <= 0 || m.tokens_90 < 0
		? NaN
		: (1 - m.tokens_90 / m.tokens_raw) * 100,
)
const tok90Vals = tok90.filter((x) => !Number.isNaN(x))

logLines.push("summary (successful samples)")
logLines.push(`n: ${metrics.length}`)
logLines.push(
	`char reduction % vs raw @90: mean ${mean(char90).toFixed(1)}, median ${median(char90).toFixed(1)}`,
)
logLines.push(
	`token reduction % vs raw @90: mean ${tok90Vals.length ? mean(tok90Vals).toFixed(1) : "n/a"}, median ${tok90Vals.length ? median(tok90Vals).toFixed(1) : "n/a"}`,
)
if (failures.length) {
	logLines.push("")
	logLines.push("failures:")
	for (const f of failures) logLines.push(`  ${f}`)
}
logLines.push("")
logLines.push(`log file: ${logPath}`)

// metrics.csv
const header =
	"id,chars_raw,chars_01,chars_03,chars_90,tokens_raw,tokens_01,tokens_03,tokens_90,pct_char_01,pct_char_03,pct_char_90,pct_token_01,pct_token_03,pct_token_90"
const csvBody = metrics
	.map((r) =>
		[
			csvEscape(r.id),
			r.chars_raw,
			r.chars_01,
			r.chars_03,
			r.chars_90,
			r.tokens_raw,
			r.tokens_01,
			r.tokens_03,
			r.tokens_90,
			r.pct_char_01,
			r.pct_char_03,
			r.pct_char_90,
			r.pct_token_01,
			r.pct_token_03,
			r.pct_token_90,
		].join(","),
	)
	.join("\n")

const csvPath = join(baseDir, "metrics.csv")
await Deno.writeTextFile(csvPath, `${header}\n${csvBody}\n`)

const jsonPath = join(baseDir, "metrics.json")
await Deno.writeTextFile(
	jsonPath,
	JSON.stringify(
		{
			meta: {
				timestamp,
				script: SCRIPT_VERSION,
				sampleCount: SAMPLE_COUNT,
				rngSeed: RNG_SEED,
				tokenModel: TOKEN_MODEL,
				datasetCommitAtFetch: commitSha,
				successCount: metrics.length,
				failureCount: failures.length,
			},
			rows: metrics,
		},
		null,
		2,
	),
)

function fmtTok(n: number): string {
	return n < 0 ? "—" : String(n)
}

// report.md
const tableRows = metrics
	.map(
		(r) =>
			`| ${r.id} | ${r.chars_raw} | ${r.chars_01} | ${r.chars_03} | ${r.chars_90} | ${r.pct_char_90}% | ${fmtTok(r.tokens_raw)} | ${fmtTok(r.tokens_01)} | ${fmtTok(r.tokens_03)} | ${fmtTok(r.tokens_90)} | ${r.pct_token_90}% |`,
	)
	.join("\n")

const reportMd = `# Instruct4Edit: 01 → 03 → 90 size reduction

- Run: \`${timestamp}\` (UTC)
- Script: \`${SCRIPT_VERSION}\`
- Samples: **${metrics.length}** successful of ${SAMPLE_COUNT} chosen (seed \`${RNG_SEED}\`)
- Token model (all stages): \`${TOKEN_MODEL}\`
- Dataset: [\`${DATASET_REPO}\`](https://github.com/${DATASET_REPO}) \`${JSON_REL_PATH}\`${commitSha ? ` @ \`${commitSha.slice(0, 7)}\`` : ""}

## Per-sample metrics

| id | chars raw | 01 | 03 | 90 | char ↓% | tokens raw | 01 | 03 | 90 | token ↓% |
|----|----------:|---:|---:|---:|--------:|-----------:|---:|---:|---:|---------:|
${tableRows}

## Aggregate (successful rows)

| metric | mean | median |
|--------|-----:|-------:|
| Char reduction % vs raw (after 90) | ${mean(char90).toFixed(1)} | ${median(char90).toFixed(1)} |
| Token reduction % vs raw (after 90) | ${tok90Vals.length ? mean(tok90Vals).toFixed(1) : "n/a"} | ${tok90Vals.length ? median(tok90Vals).toFixed(1) : "n/a"} |

Also see \`metrics.csv\`, \`metrics.json\`, and \`report.html\`.
`

const reportPath = join(baseDir, "report.md")
await Deno.writeTextFile(reportPath, reportMd)

const htmlPath = join(baseDir, "report.html")
await Deno.writeTextFile(htmlPath, buildReportHtml(metrics))

await Deno.writeTextFile(logPath, logLines.join("\n"))

console.log(`Wrote ${metrics.length} rows; ${failures.length} failures`)
console.log(`Log: ${logPath}`)
console.log(`Report: ${reportPath}`)
