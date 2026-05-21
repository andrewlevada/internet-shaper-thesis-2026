import json
import os
import re
import subprocess
import tempfile
import textwrap
from datetime import datetime, timezone
from pathlib import Path

import torch
from tqdm.auto import tqdm
from transformers import AutoProcessor, AutoModelForImageTextToText
from transformers.generation.stopping_criteria import StoppingCriteria, StoppingCriteriaList

SCRIPT_DIR = Path(__file__).resolve().parent
TOOLS_DIR = SCRIPT_DIR.parent / "internet-shaper-tools"

MAX_INPUT_TOKENS = 2**16
max_new_tokens = 256
max_tool_rounds = 8

SHOW_IN_DOM_DEFAULT_DEPTH = 3

TOOLS: list[dict] = [
	{
		"type": "function",
		"function": {
			"name": "get_map_of_dom",
			"description": """Returns a compact, truncated map of the page DOM structure. The map is optimized for understanding the overall page layout:

1. Single-child wrapper chains are collapsed (nested divs with one child become flat)
2. Repeating sibling elements (3+ with same tag/classes) show only the first with a comment indicating count
3. Only semantic attributes are kept: class, id, role, aria-label, label, alt, type, and data-* attributes

Use this first to understand the page structure. Then use show_in_dom() to examine specific elements in full detail.""",
			"parameters": {"type": "object", "properties": {}, "required": []},
		},
	},
	{
		"type": "function",
		"function": {
			"name": "show_in_dom",
			"description": f"""Returns HTML for a specific element from the captured DOM.

Depth counts element levels below the matched node: 0 returns only that element (direct text kept; nested elements replaced by <!-- -N children -->). Larger depth includes deeper descendants; default is {SHOW_IN_DOM_DEFAULT_DEPTH}. Use a higher depth when you need the full subtree.""",
			"parameters": {
				"type": "object",
				"properties": {
					"query_selector": {
						"type": "string",
						"description": (
							'CSS selector for the element to show (e.g., \'#main\', \'.post-container\', \'[data-testid="feed"]\')'
						),
					},
					"depth": {
						"type": "integer",
						"description": (
							f"Non-negative number of element descendant levels to include below the matched element. "
							f"Omitted defaults to {SHOW_IN_DOM_DEFAULT_DEPTH}."
						),
						"minimum": 0,
						"default": SHOW_IN_DOM_DEFAULT_DEPTH,
					},
				},
				"required": ["query_selector"],
			},
		},
	},
	{
		"type": "function",
		"function": {
			"name": "set_update_rule",
			"description": """Sets a persistent update rule that will be applied to all elements matching the CSS selector every time the page loads.

The 'logic' parameter is JavaScript code that executes with 'element' bound to each matching DOM element.
The logic has NO access to window, document, or any global APIs - ONLY the 'element' variable is available.

Common patterns:
- element.remove() - completely remove the element
- element.style.display = 'none' - hide the element
- element.style.opacity = '0.3' - dim the element
- element.classList.add('hidden') - add a class
- element.textContent = '' - clear text content

Prefer specific selectors (class names, data attributes, tag names) over structural paths for robustness.""",
			"parameters": {
				"type": "object",
				"properties": {
					"label": {
						"type": "string",
						"description": (
							"A short label (~3 words) describing what this rule does, for display in the rule management UI "
							"(e.g., 'Hide video ads', 'Remove sidebar', 'Dim suggestions')"
						),
					},
					"query_selector": {
						"type": "string",
						"description": (
							"A CSS selector matching elements to modify (e.g., '.ad-container', '[data-ad]', 'ytd-ad-slot-renderer')"
						),
					},
					"logic": {
						"type": "string",
						"description": (
							"Valid JavaScript code with access to 'element' variable only. No window/document/global APIs. "
							"The logic must be idempotent: running it on the same element multiple times must produce the same "
							"result as running it once. If the rule reads child content to make a decision, return early "
							"(do nothing) when the content is absent — the rule will be automatically re-run once child content "
							"populates. Prefer element.style.display = 'none' over element.remove() for conditional hiding."
						),
					},
				},
				"required": ["label", "query_selector", "logic"],
			},
		},
	},
]

task_prompt = """
You are a browser extension agent that modifies web pages based on user requests. 

Workflow:
1. Call get_map_of_dom to get an overview of the page structure
2. Identify candidate elements for the user's request
3. Use show_in_dom to examine specific elements if you need more detail
4. Register rules with set_update_rule (one rule per call), using specific selectors when possible

Use the tool-calling format described in the system tools section (native XML tool_call blocks)
""".strip()


class RunLogWriter:
	"""Stream JSON log to disk as events happen (flush per event); footer closes the document on close()."""

	def __init__(self, config: dict) -> None:
		self.path = SCRIPT_DIR / f"script-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}.log"
		self._f = self.path.open("w", encoding="utf-8", newline="\n")
		self._first_event = True
		self._closed = False
		pretty_cfg = json.dumps(config, indent=2, ensure_ascii=False)
		self._f.write('{\n  "config":\n')
		self._f.write(textwrap.indent(pretty_cfg, "  "))
		self._f.write(',\n  "events": [\n')
		self._f.flush()
		print(f"Logging to: {self.path} (live)")

	def append_event(self, line: str) -> None:
		if self._closed:
			raise RuntimeError("RunLogWriter is closed")
		if self._first_event:
			self._f.write("    ")
			self._first_event = False
		else:
			self._f.write(",\n    ")
		self._f.write(json.dumps(line, ensure_ascii=False))
		self._f.flush()

	def close(self) -> None:
		if self._closed:
			return
		self._f.write("\n  ]\n}\n")
		self._f.flush()
		self._f.close()
		self._closed = True
		print(f"Finished log: {self.path}")


def _run_deno(script: str, args: list[str]) -> tuple[int, str, str]:
	cmd = ["deno", "run", "-A", str(TOOLS_DIR / script), *args]
	proc = subprocess.run(
		cmd,
		capture_output=True,
		text=True,
		timeout=120,
	)
	out = proc.stdout or ""
	err = proc.stderr or ""
	return proc.returncode, out, err


def tool_get_map_of_dom(snapshot: str) -> str:
	code, out, err = _run_deno("get_map_of_dom.ts", ["--snapshot", snapshot])
	if code != 0:
		return f"[exit {code}]\n{err or out}"
	return out


def tool_show_in_dom(snapshot: str, query_selector: str, depth: int | None = None) -> str:
	args = ["--snapshot", snapshot, "--query-selector", query_selector]
	if depth is not None:
		args += ["--depth", str(int(depth))]
	code, out, err = _run_deno("show_in_dom.ts", args)
	if code != 0:
		return f"[exit {code}]\n{err or out}"
	return out


def tool_set_update_rule(snapshot: str, rule: dict) -> str:
	return tool_set_update_rules(snapshot, [rule])


def tool_set_update_rules(snapshot: str, rules: object) -> str:
	rules_payload = json.dumps(rules, ensure_ascii=False)
	with tempfile.NamedTemporaryFile(
		mode="w",
		suffix=".rules.json",
		delete=False,
		encoding="utf-8",
	) as rf:
		rf.write(rules_payload)
		rules_path = rf.name
	out_path = Path(tempfile.mkstemp(suffix=".html", prefix="set_update_rules_")[1])
	try:
		code, out, err = _run_deno(
			"set_update_rules.ts",
			["--snapshot", snapshot, "--rules", rules_path, "--output", str(out_path)],
		)
		body = ""
		if out_path.exists():
			body = out_path.read_text(encoding="utf-8", errors="replace")
			if len(body) > 24_000:
				body = body[:24_000] + "\n… [truncated]"
		if code != 0:
			return f"[exit {code}]\n{err or out}"
		msg = (out or "").strip()
		return f"{msg}\n--- rendered html ({out_path}) ---\n{body}"
	finally:
		Path(rules_path).unlink(missing_ok=True)
		out_path.unlink(missing_ok=True)


def dispatch_tool(name: str, arguments: dict, eval_snapshot_path: str) -> str:
	"""eval_snapshot_path comes from the environment (eval harness); models must not rely on paths."""
	if name == "get_map_of_dom":
		return tool_get_map_of_dom(eval_snapshot_path)
	if name == "show_in_dom":
		sel = arguments.get("query_selector")
		if not sel:
			return "error: query_selector required"
		depth = arguments.get("depth")
		depth_int: int | None = None
		if depth is not None:
			try:
				depth_int = int(depth)
			except (TypeError, ValueError):
				return f"error: invalid depth: {depth!r}"
		return tool_show_in_dom(eval_snapshot_path, str(sel), depth_int)
	if name == "set_update_rule":
		label = arguments.get("label")
		sel = arguments.get("query_selector")
		logic = arguments.get("logic")
		if not label or not sel or logic is None:
			return "error: set_update_rule requires label, query_selector, and logic"
		return tool_set_update_rule(
			eval_snapshot_path,
			{
				"label": str(label),
				"query_selector": str(sel),
				"logic": str(logic),
			},
		)
	return f"error: unknown tool {name!r}"


def _parse_parameter_value(raw: str) -> object:
	text = raw.strip()
	if not text:
		return ""
	try:
		return json.loads(text)
	except json.JSONDecodeError:
		return text


def parse_native_tool_calls(assistant_text: str) -> list[dict]:
	"""Parse Qwen chat_template tool XML: <tool_call><function=name>...</function></tool_call>."""
	calls: list[dict] = []
	block_re = re.compile(
		r"<tool_call>\s*<function=([^>]+)>(.*?)</function>\s*</tool_call>",
		re.DOTALL | re.IGNORECASE,
	)
	param_re = re.compile(
		r"<parameter=([^>]+)>\s*(.*?)\s*</parameter>",
		re.DOTALL | re.IGNORECASE,
	)
	for block in block_re.finditer(assistant_text):
		name = block.group(1).strip()
		inner = block.group(2)
		args: dict[str, object] = {}
		for pm in param_re.finditer(inner):
			key = pm.group(1).strip()
			args[key] = _parse_parameter_value(pm.group(2))
		calls.append({"name": name, "arguments": args})
	return calls


def build_messages(dom_snapshot: str) -> list[dict]:
	return [
		{"role": "system", "content": task_prompt},
		{"role": "user", "content": [{"type": "text", "text": dom_snapshot}]},
	]


if torch.backends.mps.is_available():
    device = torch.device("mps")
elif torch.cuda.is_available():
    device = torch.device("cuda")
else:
    device = torch.device("cpu")
    print("Using CPU :(")

dtype = torch.float16 if device.type in ("mps", "cuda") else torch.float32

EVAL_SNAPSHOT_PATH = "snapshot.html"
print(f"EVAL_SNAPSHOT={EVAL_SNAPSHOT_PATH}")
dom_snapshot = open(EVAL_SNAPSHOT_PATH).read()

model_name = "Qwen/Qwen3.5-0.8B-Base"

processor = AutoProcessor.from_pretrained(model_name)
model = AutoModelForImageTextToText.from_pretrained(
	model_name,
	dtype=dtype,
).to(device)

model.eval()

model_ctx = getattr(model.config, "max_position_embeddings", MAX_INPUT_TOKENS + max_new_tokens)
prompt_token_budget = min(MAX_INPUT_TOKENS, model_ctx - max_new_tokens)

messages = build_messages(dom_snapshot)

config_snapshot = {
	"model": model_name,
	"tools": TOOLS,
	"tools_dir": str(TOOLS_DIR),
	"eval_snapshot": str(EVAL_SNAPSHOT_PATH),
	"max_new_tokens": max_new_tokens,
	"prompt_token_budget": prompt_token_budget,
}

run_log = RunLogWriter(config_snapshot)


class GenerationStepProgressBar(StoppingCriteria):
	def __init__(self, total: int, desc: str = "Generating") -> None:
		self._pbar = tqdm(total=total, desc=desc, unit="tok", dynamic_ncols=True)

	def __call__(self, input_ids: torch.LongTensor, scores: torch.FloatTensor, **kwargs) -> torch.Tensor:
		self._pbar.update(1)
		return torch.zeros(input_ids.shape[0], dtype=torch.bool, device=input_ids.device)

	def close(self) -> None:
		self._pbar.close()

final_reply: str | None = None
finished_with_answer = False

try:
	for round_i in range(max_tool_rounds):
		inputs = processor.apply_chat_template(
			messages,
			tools=TOOLS,
			chat_template=processor.tokenizer.chat_template,
			add_generation_prompt=True,
			tokenize=True,
			return_dict=True,
			return_tensors="pt",
			truncation=True,
			max_length=prompt_token_budget,
		).to(device)

		prompt_len = inputs["input_ids"].shape[-1]
		print(f"[round {round_i}] Prompt tokens (after truncation): {prompt_len} / budget {prompt_token_budget}")

		if device.type == "mps":
			torch.mps.empty_cache()

		progress = GenerationStepProgressBar(max_new_tokens)
		try:
			outputs = model.generate(
				**inputs,
				max_new_tokens=max_new_tokens,
				stopping_criteria=StoppingCriteriaList([progress]),
			)
		finally:
			progress.close()

		new_tokens = outputs[0][inputs["input_ids"].shape[-1] :]
		assistant_text = processor.tokenizer.decode(new_tokens, skip_special_tokens=True)
		messages.append(
			{
				"role": "assistant",
				"content": [{"type": "text", "text": assistant_text}],
			}
		)
		run_log.append_event(f"assistant[{round_i}]: {assistant_text[:2000]}")

		calls = parse_native_tool_calls(assistant_text)
		if not calls:
			final_reply = assistant_text
			finished_with_answer = True
			break

		for call in calls:
			result = dispatch_tool(call["name"], call["arguments"], str(EVAL_SNAPSHOT_PATH))
			run_log.append_event(f"tool[{call['name']}]: {result[:4000]}")
			messages.append({"role": "tool", "content": result})

	if not finished_with_answer:
		print("Stopped: max_tool_rounds reached (last generation may still be a tool request).")
		final_reply = assistant_text

finally:
	run_log.close()

if final_reply is not None:
	print(final_reply)
