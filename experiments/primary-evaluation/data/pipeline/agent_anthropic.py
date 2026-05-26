"""Anthropic Messages API agent loop (shared tools live in agent.py)."""

from __future__ import annotations

import copy
import os
from pathlib import Path
from typing import Any

from config import MAX_TOOL_ROUNDS, ANTHROPIC_MODEL_ID, PipelineConfig

from agent import (
    AgentRunResult,
    ToolCallRecord,
    ToolDispatcher,
    anthropic_tool_result_content,
    build_tools,
)
from lib.logs_streamer import AgentLogWriter
from paths import AgentVariantPaths

MAX_RESPONSE_TOKENS = 16384
_PIPELINE_DIR = Path(__file__).resolve().parent


def _load_env_files() -> None:
    for path in (
        _PIPELINE_DIR / ".env",
        _PIPELINE_DIR.parents[3] / ".env",
    ):
        if not path.is_file():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            trimmed = line.strip()
            if not trimmed or trimmed.startswith("#"):
                continue
            if "=" not in trimmed:
                continue
            key, _, value = trimmed.partition("=")
            key = key.strip()
            value = value.strip()
            if (value.startswith('"') and value.endswith('"')) or (
                value.startswith("'") and value.endswith("'")
            ):
                value = value[1:-1]
            if key and key not in os.environ:
                os.environ[key] = value


def _resolve_api_key() -> str:
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        raise RuntimeError("Missing API key. Set ANTHROPIC_API_KEY.")
    return key


def _normalize_schema_for_anthropic(schema: dict[str, Any]) -> None:
    if schema.get("type") == "object":
        schema.setdefault("properties", {})
        schema.setdefault("required", [])
        schema.setdefault("additionalProperties", False)

    properties = schema.get("properties")
    if isinstance(properties, dict):
        for prop in properties.values():
            if isinstance(prop, dict):
                _normalize_schema_for_anthropic(prop)

    items = schema.get("items")
    if isinstance(items, dict):
        _normalize_schema_for_anthropic(items)


def to_anthropic_input_schema(openai_parameters: dict[str, Any]) -> dict[str, Any]:
    schema = copy.deepcopy(openai_parameters)
    schema.setdefault("type", "object")
    schema.setdefault("properties", {})
    schema.setdefault("required", [])
    _normalize_schema_for_anthropic(schema)
    return schema


def build_anthropic_tools(pipeline: PipelineConfig) -> list[dict[str, Any]]:
    tools: list[dict[str, Any]] = []
    for tool in build_tools(pipeline):
        function = tool["function"]
        tools.append(
            {
                "name": function["name"],
                "description": function["description"],
                "input_schema": to_anthropic_input_schema(function["parameters"]),
            }
        )
    return tools


def run_agent_anthropic(
    pipeline: PipelineConfig,
    *,
    sample_id: str,
    user_message: str,
    paths: AgentVariantPaths,
    model_id: str = ANTHROPIC_MODEL_ID,
    log_writer: AgentLogWriter | None = None,
) -> AgentRunResult:
    del sample_id
    _load_env_files()

    from anthropic import Anthropic

    client = Anthropic(api_key=_resolve_api_key())
    dispatcher = ToolDispatcher(
        raw_html=paths.raw_html,
        visible_html=paths.visible_html,
    )
    tools = build_anthropic_tools(pipeline)
    messages: list[dict[str, Any]] = [{"role": "user", "content": user_message}]

    result = AgentRunResult(model_id=model_id, backend="anthropic")
    final_text = ""

    for _round in range(MAX_TOOL_ROUNDS):
        response = client.messages.create(
            model=model_id,
            max_tokens=MAX_RESPONSE_TOKENS,
            system=[
                {
                    "type": "text",
                    "text": pipeline.system_prompt,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            tools=tools,
            messages=messages,
        )

        if response.usage:
            result.prompt_tokens = response.usage.input_tokens
            result.completion_tokens = response.usage.output_tokens

        assistant_content: list[dict[str, Any]] = []
        tool_use_blocks: list[Any] = []

        for block in response.content:
            if block.type == "text":
                final_text = block.text
                assistant_content.append({"type": "text", "text": block.text})
            elif block.type == "tool_use":
                tool_use_blocks.append(block)
                assistant_content.append(
                    {
                        "type": "tool_use",
                        "id": block.id,
                        "name": block.name,
                        "input": block.input,
                    }
                )

        messages.append({"role": "assistant", "content": assistant_content})

        if not tool_use_blocks or response.stop_reason == "end_turn":
            break

        tool_results: list[dict[str, Any]] = []
        for block in tool_use_blocks:
            name = block.name
            tool_input = block.input if isinstance(block.input, dict) else {}
            tool_result = dispatcher.dispatch(name, tool_input)
            record = ToolCallRecord(name=name, arguments=tool_input, result=tool_result)
            result.tool_calls.append(record)
            if log_writer is not None:
                log_writer.append_tool_call(record)
            tool_results.append(
                {
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": anthropic_tool_result_content(name, tool_result),
                }
            )

        messages.append({"role": "user", "content": tool_results})

    result.rules = dispatcher.rules
    result.final_assistant_text = final_text
    return result
