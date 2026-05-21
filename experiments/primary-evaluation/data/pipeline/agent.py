from __future__ import annotations

import json
import re
import shutil
import subprocess
import tempfile
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

from config import (
    GATEWAY_MODEL_ID,
    LOCAL_MODEL_ID,
    MAX_INPUT_TOKENS,
    MAX_NEW_TOKENS,
    MAX_TOOL_OUTPUT_CHARS,
    MAX_TOOL_ROUNDS,
    SHOW_IN_DOM_DEFAULT_DEPTH,
    TRUNCATION_SUFFIX,
    PipelineConfig,
)
from paths import AgentVariantPaths

EXPLORE_TOOLS = frozenset({"get_dom", "get_map_of_dom", "show_in_dom"})
MUTATION_TOOLS = frozenset({"edit"})

AgentBackend = Literal["vercel", "local"]

PIPELINE_DIR = Path(__file__).resolve().parent
TOOLS_DIR = PIPELINE_DIR / "tools-clis"


@dataclass
class ToolCallRecord:
    name: str
    arguments: dict[str, Any]
    result: str


@dataclass
class AgentRunResult:
    rules: list[dict[str, str]] = field(default_factory=list)
    tool_calls: list[ToolCallRecord] = field(default_factory=list)
    final_assistant_text: str = ""
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    model_id: str = GATEWAY_MODEL_ID
    backend: AgentBackend = "vercel"


def _cap_tool_output(text: str) -> str:
    if len(text) <= MAX_TOOL_OUTPUT_CHARS:
        return text
    return text[:MAX_TOOL_OUTPUT_CHARS] + TRUNCATION_SUFFIX


def _run_deno(script: str, args: list[str]) -> tuple[int, str, str]:
    cmd = ["deno", "run", "-A", str(TOOLS_DIR / script), *args]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    return proc.returncode, proc.stdout or "", proc.stderr or ""


def _apply_update_rules(snapshot: Path, rules: list[dict[str, str]], output: Path) -> str:
    rules_payload = json.dumps(rules, ensure_ascii=False)
    with tempfile.NamedTemporaryFile(
        mode="w",
        suffix=".rules.json",
        delete=False,
        encoding="utf-8",
    ) as rf:
        rf.write(rules_payload)
        rules_path = rf.name
    try:
        code, out, err = _run_deno(
            "set_update_rules.ts",
            [
                "--snapshot",
                str(snapshot),
                "--rules",
                rules_path,
                "--output",
                str(output),
            ],
        )
        if code != 0:
            raise RuntimeError(f"set_update_rules failed ({code}): {err or out}")
        return (out or "").strip()
    finally:
        Path(rules_path).unlink(missing_ok=True)


class ToolDispatcher:
    def __init__(self, *, raw_html: Path, visible_html: Path) -> None:
        self.raw_html = raw_html
        self.visible_html = visible_html
        self.rules: list[dict[str, str]] = []

    def _snapshot_for(self, name: str) -> str:
        if name in EXPLORE_TOOLS:
            return str(self.visible_html)
        if name in MUTATION_TOOLS:
            return str(self.raw_html)
        return str(self.raw_html)

    def dispatch(self, name: str, arguments: dict[str, Any]) -> str:
        snapshot = self._snapshot_for(name)

        if name == "get_dom":
            code, out, err = _run_deno("get_dom.ts", ["--snapshot", snapshot])
            if code != 0:
                return f"[exit {code}]\n{err or out}"
            return _cap_tool_output(out)

        if name == "get_map_of_dom":
            code, out, err = _run_deno("get_map_of_dom.ts", ["--snapshot", snapshot])
            if code != 0:
                return f"[exit {code}]\n{err or out}"
            return _cap_tool_output(out)

        if name == "show_in_dom":
            sel = arguments.get("query_selector")
            if not sel:
                return "error: query_selector required"
            args = ["--snapshot", snapshot, "--query-selector", str(sel)]
            depth = arguments.get("depth")
            if depth is not None:
                try:
                    args += ["--depth", str(int(depth))]
                except (TypeError, ValueError):
                    return f"error: invalid depth: {depth!r}"
            code, out, err = _run_deno("show_in_dom.ts", args)
            if code != 0:
                return f"[exit {code}]\n{err or out}"
            return _cap_tool_output(out)

        if name == "edit":
            patch = arguments.get("patch")
            if not patch:
                return "error: edit requires patch"
            with tempfile.NamedTemporaryFile(
                mode="w",
                suffix=".patch.txt",
                delete=False,
                encoding="utf-8",
            ) as pf:
                pf.write(str(patch))
                patch_path = pf.name
            try:
                code, out, err = _run_deno(
                    "edit.ts",
                    [
                        "--snapshot",
                        snapshot,
                        "--patch",
                        patch_path,
                        "--output",
                        snapshot,
                    ],
                )
                msg = (out or err or "").strip()
                if code == 2:
                    return f"partial apply:\n{msg}"
                if code != 0:
                    return f"[exit {code}]\n{msg}"
                return msg or "edit applied"
            finally:
                Path(patch_path).unlink(missing_ok=True)

        if name == "set_update_rule":
            label = arguments.get("label")
            sel = arguments.get("query_selector")
            logic = arguments.get("logic")
            if not label or not sel or logic is None:
                return "error: set_update_rule requires label, query_selector, and logic"
            rule = {
                "label": str(label),
                "query_selector": str(sel),
                "logic": str(logic),
            }
            self.rules.append(rule)
            return (
                f'Rule registered (#{len(self.rules)}): "{rule["label"]}" '
                f'- selector="{rule["query_selector"]}"'
            )

        return f"error: unknown tool {name!r}"


def _tool_schema(name: str) -> dict[str, Any]:
    schemas: dict[str, dict[str, Any]] = {
        "get_dom": {
            "type": "function",
            "function": {
                "name": "get_dom",
                "description": (
                    "Returns work/visible.html (DOM exploration snapshot). "
                    "Output may be truncated when very large."
                ),
                "parameters": {"type": "object", "properties": {}, "required": []},
            },
        },
        "get_map_of_dom": {
            "type": "function",
            "function": {
                "name": "get_map_of_dom",
                "description": (
                    "Returns a compact, truncated map of work/visible.html DOM structure."
                ),
                "parameters": {"type": "object", "properties": {}, "required": []},
            },
        },
        "show_in_dom": {
            "type": "function",
            "function": {
                "name": "show_in_dom",
                "description": f"Returns HTML for a specific element (default depth {SHOW_IN_DOM_DEFAULT_DEPTH}).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query_selector": {"type": "string"},
                        "depth": {"type": "integer", "minimum": 0},
                    },
                    "required": ["query_selector"],
                },
            },
        },
        "edit": {
            "type": "function",
            "function": {
                "name": "edit",
                "description": (
                    "Apply Aider-style SEARCH/REPLACE blocks to work/raw.html.\n\n"
                    "When using edit():\n"
                    "- Pass one or more Aider-style SEARCH/REPLACE blocks in the `patch` argument.\n"
                    "- Each block must use this exact structure (multiple blocks allowed):\n\n"
                    "<<<<<<< SEARCH\n"
                    "exact text copied from the page HTML\n"
                    "=======\n"
                    "replacement HTML\n"
                    ">>>>>>> REPLACE\n\n"
                    "- SEARCH text must match work/raw.html exactly (including whitespace).\n"
                    "- Prefer small, targeted hunks over rewriting large sections.\n"
                    "- After editing, you may call get_dom() again to verify the result."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {"patch": {"type": "string"}},
                    "required": ["patch"],
                },
            },
        },
        "set_update_rule": {
            "type": "function",
            "function": {
                "name": "set_update_rule",
                "description": (
                    "Register a persistent update rule (one rule per call).\n\n"
                    "When using set_update_rule:\n"
                    "- label: A short (~3 words) description for rule management UI "
                    '(e.g., "Hide video ads", "Remove sidebar")\n'
                    "- query_selector: A CSS selector (e.g., '.ad-slot', '[data-ad]', "
                    "'ytd-rich-item-renderer')\n"
                    "- logic: Valid JavaScript with `element` bound to each matching element\n"
                    "- The logic has NO access to window, document, or any global APIs - "
                    "ONLY the `element` variable\n"
                    "- Common operations: element.remove(), element.style.display = 'none', "
                    "element.textContent = ''\n"
                    "- Running the same logic on the same element multiple times must produce "
                    "the same result as running it once.\n"
                    "- If the rule reads child content (e.g. text, badge values) to decide "
                    "whether to hide the element, it will be re-run after child content loads. "
                    "Write logic that handles an empty/missing value gracefully by doing "
                    "nothing (early return).\n"
                    "- Avoid accumulating side effects: do not append to textContent, do not "
                    "toggle classes — always set to an absolute value.\n"
                    "- Never use element.remove() when a condition check is involved; prefer "
                    "element.style.display = 'none' so the rule can still run again if needed."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "label": {"type": "string"},
                        "query_selector": {"type": "string"},
                        "logic": {"type": "string"},
                    },
                    "required": ["label", "query_selector", "logic"],
                },
            },
        },
    }
    return schemas[name]


def build_tools(pipeline: PipelineConfig) -> list[dict[str, Any]]:
    return [_tool_schema(name) for name in pipeline.tools]


def extract_tool_call_info(text: str) -> list[dict[str, Any]]:
    section_patterns = [
        r"<\|redacted_tool_calls_section_begin\|>(.*?)<\|redacted_tool_calls_section_end\|>",
        r"<\|tool_calls_section_begin\|>(.*?)<\|tool_calls_section_end\|>",
    ]
    section_text = None
    for pattern in section_patterns:
        match = re.search(pattern, text, re.DOTALL)
        if match:
            section_text = match.group(1)
            break
    if section_text is None:
        return []

    call_patterns = [
        r"<\|redacted_tool_call_begin_kimi\|>\s*(?P<id>[\w\.]+:\d+)\s*<\|redacted_tool_call_argument_begin\|>\s*(?P<args>.*?)\s*<\|redacted_tool_call_end_kimi\|>",
        r"<\|tool_call_begin\|>\s*(?P<id>[\w\.]+:\d+)\s*<\|tool_call_argument_begin\|>\s*(?P<args>.*?)\s*<\|tool_call_end\|>",
    ]

    calls: list[dict[str, Any]] = []
    for pattern in call_patterns:
        for match in re.finditer(pattern, section_text, re.DOTALL):
            function_id = match.group("id").strip()
            function_args = match.group("args").strip()
            function_name = function_id.split(".")[1].split(":")[0]
            calls.append(
                {
                    "id": function_id,
                    "type": "function",
                    "function": {"name": function_name, "arguments": function_args},
                }
            )
        if calls:
            break
    return calls


def _parse_tool_arguments(raw: str) -> dict[str, Any]:
    text = raw.strip()
    if not text:
        return {}
    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass
    return {"patch": text} if text.startswith("<<<<<<< SEARCH") else {"raw": text}


def run_agent_local(
    pipeline: PipelineConfig,
    *,
    sample_id: str,
    user_message: str,
    paths: AgentVariantPaths,
) -> AgentRunResult:
    del sample_id
    import torch
    from transformers import AutoModel, AutoTokenizer

    if torch.backends.mps.is_available():
        device = torch.device("mps")
    elif torch.cuda.is_available():
        device = torch.device("cuda")
    else:
        device = torch.device("cpu")
        print("Using CPU for local Kimi inference (slow).")

    dtype = torch.float16 if device.type in ("mps", "cuda") else torch.float32
    print(f"Loading {LOCAL_MODEL_ID} on {device}…")
    tokenizer = AutoTokenizer.from_pretrained(LOCAL_MODEL_ID, trust_remote_code=True)
    model = AutoModel.from_pretrained(
        LOCAL_MODEL_ID,
        trust_remote_code=True,
        dtype=dtype,
    )
    model.to(device)
    model.eval()

    tools = build_tools(pipeline)
    dispatcher = ToolDispatcher(
        raw_html=paths.raw_html,
        visible_html=paths.visible_html,
    )
    messages: list[dict[str, Any]] = [
        {"role": "system", "content": pipeline.system_prompt},
        {"role": "user", "content": user_message},
    ]

    model_ctx = getattr(model.config, "max_position_embeddings", MAX_INPUT_TOKENS + MAX_NEW_TOKENS)
    prompt_token_budget = min(
        MAX_INPUT_TOKENS,
        max(model_ctx - MAX_NEW_TOKENS - 128, 512),
    )

    result = AgentRunResult(model_id=LOCAL_MODEL_ID, backend="local")
    assistant_text = ""

    for round_i in range(MAX_TOOL_ROUNDS):
        prompt_text = tokenizer.apply_chat_template(
            messages,
            tools=tools,
            tokenize=False,
            add_generation_prompt=True,
        )
        inputs = tokenizer(
            prompt_text,
            return_tensors="pt",
            truncation=True,
            max_length=prompt_token_budget,
        )
        inputs = {k: v.to(device) for k, v in inputs.items()}
        prompt_len = int(inputs["input_ids"].shape[-1])

        if device.type == "mps":
            torch.mps.empty_cache()

        with torch.no_grad():
            outputs = model.generate(
                **inputs,
                max_new_tokens=MAX_NEW_TOKENS,
                do_sample=False,
            )

        new_tokens = outputs[0][prompt_len:]
        assistant_text = tokenizer.decode(new_tokens, skip_special_tokens=False)
        result.prompt_tokens = prompt_len
        result.completion_tokens = int(new_tokens.shape[-1])
        messages.append({"role": "assistant", "content": assistant_text})

        calls = extract_tool_call_info(assistant_text)
        if not calls:
            break

        for call in calls:
            name = call["function"]["name"]
            args = _parse_tool_arguments(call["function"]["arguments"])
            tool_result = dispatcher.dispatch(name, args)
            result.tool_calls.append(
                ToolCallRecord(name=name, arguments=args, result=tool_result)
            )
            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": call["id"],
                    "name": name,
                    "content": tool_result,
                }
            )
        print(f"[{pipeline.id} round {round_i}] {len(calls)} tool call(s)")

    result.rules = dispatcher.rules
    result.final_assistant_text = assistant_text
    return result


def run_agent(
    pipeline: PipelineConfig,
    *,
    sample_id: str,
    user_message: str,
    paths: AgentVariantPaths,
    backend: AgentBackend = "vercel",
) -> AgentRunResult:
    if backend == "local":
        return run_agent_local(
            pipeline,
            sample_id=sample_id,
            user_message=user_message,
            paths=paths,
        )
    from agent_vercel import run_agent_vercel

    return run_agent_vercel(
        pipeline,
        sample_id=sample_id,
        user_message=user_message,
        paths=paths,
    )


def write_agent_log(
    path: Path,
    *,
    sample_id: str,
    pipeline: PipelineConfig,
    user_message: str,
    paths: AgentVariantPaths,
    run_result: AgentRunResult,
    result_summary: str,
) -> None:
    timestamp = datetime.now(timezone.utc).isoformat()
    lines = [
        f"Timestamp: {timestamp}",
        f"Sample: {sample_id}",
        f"Pipeline: {pipeline.id} ({pipeline.folder})",
        f"Backend: {run_result.backend}",
        f"Model: {run_result.model_id}",
        f"Work raw: {paths.raw_html}",
        f"Work visible: {paths.visible_html}",
        f"Tools: {', '.join(pipeline.tools)}",
    ]
    if run_result.prompt_tokens is not None:
        lines.append(
            f"Tokens: {run_result.prompt_tokens} prompt / "
            f"{run_result.completion_tokens or 0} completion"
        )
    lines.extend(
        [
            "",
            "=== Model Request ===",
            "",
            "--- System prompt ---",
            pipeline.system_prompt,
            "",
            "--- Tool definitions ---",
            json.dumps(build_tools(pipeline), ensure_ascii=False, indent=2),
            "",
            "=== Agent Chat ===",
            "",
        ]
    )
    lines.extend(["--- USER ---", user_message, ""])

    for call in run_result.tool_calls:
        lines.extend(
            [
                f"--- TOOL CALL: {call.name} ---",
                json.dumps(call.arguments, ensure_ascii=False, indent=2)
                if call.arguments
                else "(no input)",
                "",
                f"--- TOOL RESULT: {call.name} ---",
                call.result,
                "",
            ]
        )

    if run_result.final_assistant_text.strip():
        lines.extend(["--- ASSISTANT ---", run_result.final_assistant_text.strip(), ""])

    lines.extend(
        [
            "=== Result ===",
            "",
            result_summary,
            "",
        ]
    )

    path.write_text("\n".join(lines), encoding="utf-8")


def copy_over_the_final(paths: AgentVariantPaths) -> None:
    shutil.copy2(paths.raw_html, paths.index_html)


def apply_changes(
    pipeline: PipelineConfig,
    *,
    paths: AgentVariantPaths,
    run_result: AgentRunResult,
) -> str:
    if pipeline.uses_rules:
        paths.rules_json.write_text(
            json.dumps(run_result.rules, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

        if run_result.rules:
            msg = _apply_update_rules(
                paths.raw_html,
                run_result.rules,
                paths.raw_html,
            )
            summary_lines = [msg, "", f"{len(run_result.rules)} rule(s):"]

            for i, rule in enumerate(run_result.rules, start=1):
                summary_lines.append(f"[{i}] {rule['label']} — {rule['query_selector']}")
                summary_lines.append(f"    {rule['logic']}")

            copy_over_the_final(paths)
            return "\n".join(summary_lines)

        copy_over_the_final(paths)
        return "(no rules generated; index is unchanged raw.html)"

    copy_over_the_final(paths)
    if pipeline.uses_edit:
        return "(edited raw.html → index.html)"
    return "(unchanged raw.html → index.html)"
