from __future__ import annotations

import json
import re
import shutil
import subprocess
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from lib.logs_streamer import AgentLogWriter

from config import (
    ANTHROPIC_MODEL_ID,
    GATEWAY_MODEL_ID,
    LOCAL_MODEL_ID,
    MAX_NEW_TOKENS,
    MAX_TOOL_OUTPUT_CHARS,
    MAX_TOOL_ROUNDS,
    SHOW_IN_DOM_DEFAULT_DEPTH,
    TRUNCATION_SUFFIX,
    AgentProvider,
    PipelineConfig,
)
from paths import AgentVariantPaths

EXPLORE_TOOLS = frozenset({"get_dom", "get_map_of_dom", "show_in_dom"})
MUTATION_TOOLS = frozenset({"edit", "set_update_rule"})
SINGLE_CALL_EXPLORE_TOOLS = frozenset({"get_dom", "get_map_of_dom"})

CACHE_CONTROL_EPHEMERAL: dict[str, str] = {"type": "ephemeral"}


def should_cache_tool_result(name: str) -> bool:
    return name in SINGLE_CALL_EXPLORE_TOOLS


def anthropic_cached_tool_result_content(result: str) -> list[dict[str, Any]]:
    return [
        {
            "type": "text",
            "text": result,
            "cache_control": CACHE_CONTROL_EPHEMERAL,
        }
    ]


def anthropic_tool_result_content(name: str, result: str) -> str | list[dict[str, Any]]:
    if should_cache_tool_result(name):
        return anthropic_cached_tool_result_content(result)
    return result


def openai_tool_result_message(
    *,
    tool_call_id: str,
    name: str,
    content: str,
) -> dict[str, Any]:
    message: dict[str, Any] = {
        "role": "tool",
        "tool_call_id": tool_call_id,
        "content": content,
    }
    if should_cache_tool_result(name):
        message["cache_control"] = CACHE_CONTROL_EPHEMERAL
    return message

AgentBackend = AgentProvider

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


def _single_call_explore_message(tool_name: str) -> str:
    return (
        f"The {tool_name} tool is extremely context-hungry, so it cannot be called again. "
        "Refer to the result of the previous call."
    )


class ToolDispatcher:
    def __init__(
        self,
        *,
        raw_html: Path,
        visible_html: Path,
        explore_uses_raw: bool = False,
    ) -> None:
        self.raw_html = raw_html
        self.visible_html = visible_html
        self.explore_uses_raw = explore_uses_raw
        self.rules: list[dict[str, str]] = []
        self._single_call_explore_used: set[str] = set()

    def _snapshot_for(self, name: str) -> str:
        if name in EXPLORE_TOOLS:
            if self.explore_uses_raw:
                return str(self.raw_html)
            return str(self.visible_html)

        if name in MUTATION_TOOLS:
            return str(self.raw_html)
        
        raise ValueError(f"Unknown tool: {name!r}")

    def dispatch(self, name: str, arguments: dict[str, Any]) -> str:
        snapshot = self._snapshot_for(name)

        if name in SINGLE_CALL_EXPLORE_TOOLS:
            if name in self._single_call_explore_used:
                return _single_call_explore_message(name)
            self._single_call_explore_used.add(name)

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
            try:
                prepared = _prepare_edit_arguments(arguments)
            except ValueError as exc:
                return f"error: {exc}"
            edits = prepared.get("edits")
            if not isinstance(edits, list) or not edits:
                return "error: edit requires a non-empty edits array"
            edits_payload = json.dumps({"edits": edits}, ensure_ascii=False)
            with tempfile.NamedTemporaryFile(
                mode="w",
                suffix=".edits.json",
                delete=False,
                encoding="utf-8",
            ) as ef:
                ef.write(edits_payload)
                edits_path = ef.name
            try:
                code, out, err = _run_deno(
                    "edit.ts",
                    [
                        "--snapshot",
                        snapshot,
                        "--edits",
                        edits_path,
                        "--output",
                        snapshot,
                    ],
                )
                msg = (out or err or "").strip()
                if code != 0:
                    return msg or "edit failed"
                return msg or "edit applied"
            finally:
                Path(edits_path).unlink(missing_ok=True)

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
                    "Returns the DOM tree of the page. "
                    "Can only be called once per session; later calls return the previous result message."
                ),
                "parameters": {"type": "object", "properties": {}, "required": []},
            },
        },
        "get_map_of_dom": {
            "type": "function",
            "function": {
                "name": "get_map_of_dom",
                "description": (
                    "Returns a compact, truncated map of the page DOM structure. The map is optimized for understanding the overall page layout: "
                    "1. Single-child wrapper chains are collapsed. Their attributes are merged into a comment indicating count. "
                    "2. Repeating sibling elements show only the first with a comment indicating count. "
                    "3. Only semantic attributes are kept: class, id, role, aria-label, label, alt, type, and data-* attributes. "
                    "Can only be called once per session; later calls return the previous result message."
                ),
                "parameters": {"type": "object", "properties": {}, "required": []},
            },
        },
        "show_in_dom": {
            "type": "function",
            "function": {
                "name": "show_in_dom",
                "description": (
                    "Returns full HTML for the first element matching the query selector."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query_selector": {
                            "type": "string",
                            "description": "CSS selector for the element to show (e.g., '#main', '.post-container', '[data-testid=\"feed\"]')",
                        },
                        "depth": {
                            "type": "integer",
                            "description": (
                                "Non-negative number of element descendant levels to include below the matched elemen. Nested elements replaced by <!-- -N children -->. "
                                "Depth counts element levels below the matched node: 0 returns only that element, 1 only direct children, etc. "
                            ),
                            "minimum": 0,
                            "default": SHOW_IN_DOM_DEFAULT_DEPTH,
                        },
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
                    "Edit the page snapshot using text replacement. "
                    "Whitespace and newlines in oldText do not need to match exactly. "
                    "Every edits[].oldText must still match a unique, non-overlapping region of the original file. "
                    "If two changes affect the same block or nearby lines, merge them into one edit instead of "
                    "emitting overlapping edits. Do not include large unchanged regions just to connect distant changes."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "edits": {
                            "type": "array",
                            "description": (
                                "One or more targeted replacements. Each edit is matched against the original file, "
                                "not incrementally. Do not include overlapping or nested edits. If two changes touch "
                                "the same block or nearby lines, merge them into one edit instead."
                            ),
                            "items": {
                                "type": "object",
                                "properties": {
                                    "oldText": {
                                        "type": "string",
                                        "description": (
                                            "Text to replace. Whitespace and newlines may differ from the snapshot; "
                                            "include enough surrounding HTML to make the match unique and non-overlapping "
                                            "with other edits in the same call."
                                        ),
                                    },
                                    "newText": {
                                        "type": "string",
                                        "description": "Replacement text for this targeted edit.",
                                    },
                                },
                                "required": ["oldText", "newText"],
                                "additionalProperties": False,
                            },
                        },
                    },
                    "required": ["edits"],
                    "additionalProperties": False,
                },
            },
        },
        "set_update_rule": {
            "type": "function",
            "function": {
                "name": "set_update_rule",
                "description": (
                    "Sets a persistent update rule that will be applied to all elements matching the CSS selector every time the page loads. \n\n"
                    "The 'logic' parameter is JavaScript code that executes with 'element' bound to each matching DOM element. \n"
                    "The page's 'document' is also available for DOM construction (e.g. document.createElement). \n"
                    "Global APIs like window are not avaliable. \n\n"

                    "Common patterns: \n"
                    "- element.style.display = 'none' - hide the element \n"
                    "- element.style.opacity = '0.3' - dim the element \n"
                    "- element.classList.add('hidden') - add a class \n"
                    "- element.textContent = '' - clear text content \n\n"

                    "When using set_update_rule:\n"
                    "- The logic must be idempotent: running it on the same element multiple times must produce the same result as running it once. \n"
                    "- If the rule reads child content (e.g. text, badge values) to decide "
                    "whether to hide the element, it will be re-run after child content loads. "
                    "Write logic that handles an empty/missing value gracefully by doing "
                    "nothing (early return).\n"
                    "- Avoid accumulating side effects: do not append to textContent, do not "
                    "toggle classes — always set to an absolute value. \n"
                    "- Never use element.remove() when a condition check is involved; prefer "
                    "element.style.display = 'none' so the rule can still run again if needed."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "label": {
                            "type": "string",
                            "description": "A short label (~3 words) describing what this rule does, for display in the rule management UI (e.g., 'Hide video ads', 'Remove sidebar', 'Dim suggestions')"
                        },
                        "query_selector": {
                            "type": "string",
                            "description": "A CSS selector matching elements to modify (e.g., '.ad-container', '[data-ad]', 'ytd-ad-slot-renderer')"
                        },
                        "logic": {
                            "type": "string",
                            "description": "Valid JavaScript code with access to 'element' variable only."
                        },
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


def _prepare_edit_arguments(arguments: dict[str, Any]) -> dict[str, Any]:
    args = dict(arguments)
    edits = args.get("edits")
    if isinstance(edits, str):
        try:
            parsed = json.loads(edits)
            if isinstance(parsed, list):
                args["edits"] = parsed
        except json.JSONDecodeError:
            pass

    old_text = args.get("oldText")
    new_text = args.get("newText")
    if isinstance(old_text, str) and isinstance(new_text, str):
        merged_edits = list(args["edits"]) if isinstance(args.get("edits"), list) else []
        merged_edits.append({"oldText": old_text, "newText": new_text})
        args["edits"] = merged_edits
        args.pop("oldText", None)
        args.pop("newText", None)

    if not isinstance(args.get("edits"), list) or not args["edits"]:
        raise ValueError("edit requires a non-empty edits array")

    for index, edit in enumerate(args["edits"]):
        if not isinstance(edit, dict):
            raise ValueError(f"edits[{index}] must be an object")
        if not isinstance(edit.get("oldText"), str) or not isinstance(edit.get("newText"), str):
            raise ValueError(f"edits[{index}] must include oldText and newText strings")

    return args


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
    return {"raw": text}


def run_agent_local(
    pipeline: PipelineConfig,
    *,
    sample_id: str,
    user_message: str,
    paths: AgentVariantPaths,
    log_writer: AgentLogWriter | None = None,
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
        print("Using CPU for local Qwen inference (slow).")

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
        explore_uses_raw=pipeline.uses_edit,
    )
    messages: list[dict[str, Any]] = [
        {"role": "system", "content": pipeline.system_prompt},
        {"role": "user", "content": user_message},
    ]

    model_ctx = getattr(model.config, "max_position_embeddings", 262144)

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
            max_length=model_ctx,
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
            record = ToolCallRecord(name=name, arguments=args, result=tool_result)
            result.tool_calls.append(record)
            if log_writer is not None:
                log_writer.append_tool_call(record)
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


def resolve_agent_provider(
    pipeline: PipelineConfig,
    backend: AgentBackend,
) -> AgentProvider:
    return pipeline.provider or backend


def run_agent(
    pipeline: PipelineConfig,
    *,
    sample_id: str,
    user_message: str,
    paths: AgentVariantPaths,
    backend: AgentBackend = "vercel",
    log_writer: AgentLogWriter | None = None,
) -> AgentRunResult:
    provider = resolve_agent_provider(pipeline, backend)

    if provider == "local":
        return run_agent_local(
            pipeline,
            sample_id=sample_id,
            user_message=user_message,
            paths=paths,
            log_writer=log_writer,
        )
    if provider == "anthropic":
        from agent_anthropic import run_agent_anthropic

        return run_agent_anthropic(
            pipeline,
            sample_id=sample_id,
            user_message=user_message,
            paths=paths,
            model_id=pipeline.model or ANTHROPIC_MODEL_ID,
            log_writer=log_writer,
        )
    from agent_vercel import run_agent_vercel

    return run_agent_vercel(
        pipeline,
        sample_id=sample_id,
        user_message=user_message,
        paths=paths,
        model_id=pipeline.model or GATEWAY_MODEL_ID,
        log_writer=log_writer,
    )


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
