"""Thin Vercel AI Gateway agent loop (shared tools live in agent.py)."""

from __future__ import annotations

import json
import os
import time
from pathlib import Path

from config import (
    GATEWAY_CHAT_COMPLETION_KWARGS,
    GATEWAY_MODEL_ID,
    MAX_TOOL_ROUNDS,
    PipelineConfig,
)

from agent import AgentRunResult, ToolCallRecord, ToolDispatcher, build_tools, openai_tool_result_message
from errors import ContextOverflowError, is_context_overflow_error
from lib.api_round_log import (
    API_REQUEST_TIMEOUT_S,
    estimate_openai_messages_chars,
    log_api_error,
    log_api_request,
    log_api_response,
)
from lib.logs_streamer import AgentLogWriter
from paths import AgentVariantPaths

AI_GATEWAY_BASE_URL = "https://ai-gateway.vercel.sh/v1"
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
    key = (
        os.environ.get("AI_GATEWAY_API_KEY")
        or os.environ.get("VERCEL_AI_GATEWAY_API_KEY")
        or os.environ.get("OPENAI_API_KEY")
    )
    if not key:
        raise RuntimeError(
            "Missing API key. Set AI_GATEWAY_API_KEY, VERCEL_AI_GATEWAY_API_KEY, or OPENAI_API_KEY."
        )
    return key


def run_agent_vercel(
    pipeline: PipelineConfig,
    *,
    sample_id: str,
    user_message: str,
    paths: AgentVariantPaths,
    model_id: str = GATEWAY_MODEL_ID,
    log_writer: AgentLogWriter | None = None,
) -> AgentRunResult:
    del sample_id
    _load_env_files()

    from openai import OpenAI

    client = OpenAI(
        base_url=AI_GATEWAY_BASE_URL,
        api_key=_resolve_api_key(),
        timeout=API_REQUEST_TIMEOUT_S,
    )
    dispatcher = ToolDispatcher(
        raw_html=paths.raw_html,
        visible_html=paths.visible_html,
        explore_uses_raw=pipeline.uses_edit,
    )
    tools = build_tools(pipeline)
    messages: list[dict] = [
        {"role": "system", "content": pipeline.system_prompt},
        {"role": "user", "content": user_message},
    ]

    result = AgentRunResult(model_id=model_id, backend="vercel")
    final_text = ""

    for round_index in range(MAX_TOOL_ROUNDS):
        payload_chars = estimate_openai_messages_chars(messages)
        log_api_request(
            pipeline_id=pipeline.id,
            round_index=round_index,
            model_id=model_id,
            message_count=len(messages),
            payload_chars=payload_chars,
            log_writer=log_writer,
        )

        started = time.monotonic()
        try:
            response = client.chat.completions.create(
                model=model_id,
                messages=messages,
                tools=tools,
                tool_choice="auto",
                timeout=API_REQUEST_TIMEOUT_S,
                **GATEWAY_CHAT_COMPLETION_KWARGS,
            )
        except Exception as exc:
            elapsed = time.monotonic() - started
            log_api_error(
                pipeline_id=pipeline.id,
                round_index=round_index,
                elapsed_s=elapsed,
                error=exc,
                log_writer=log_writer,
            )
            if is_context_overflow_error(exc):
                result.rules = dispatcher.rules
                result.final_assistant_text = final_text
                raise ContextOverflowError(str(exc), run_result=result) from exc
            raise

        elapsed = time.monotonic() - started
        choice = response.choices[0]
        message = choice.message
        tool_names = [tc.function.name for tc in (message.tool_calls or [])]

        log_api_response(
            pipeline_id=pipeline.id,
            round_index=round_index,
            elapsed_s=elapsed,
            prompt_tokens=response.usage.prompt_tokens if response.usage else None,
            completion_tokens=response.usage.completion_tokens if response.usage else None,
            finish_reason=choice.finish_reason,
            tool_calls=tool_names or None,
            log_writer=log_writer,
        )

        if response.usage:
            result.prompt_tokens = response.usage.prompt_tokens
            result.completion_tokens = response.usage.completion_tokens

        if message.content:
            final_text = message.content

        assistant_message: dict = {"role": "assistant", "content": message.content or ""}
        if message.tool_calls:
            assistant_message["tool_calls"] = [
                {
                    "id": tc.id,
                    "type": "function",
                    "function": {
                        "name": tc.function.name,
                        "arguments": tc.function.arguments or "{}",
                    },
                }
                for tc in message.tool_calls
            ]
        messages.append(assistant_message)

        if not message.tool_calls:
            break

        for tc in message.tool_calls:
            name = tc.function.name
            try:
                args = json.loads(tc.function.arguments or "{}")
            except json.JSONDecodeError:
                args = {}
            if not isinstance(args, dict):
                args = {"raw": args}
            tool_result = dispatcher.dispatch(name, args)
            record = ToolCallRecord(name=name, arguments=args, result=tool_result)
            result.tool_calls.append(record)
            if log_writer is not None:
                log_writer.append_tool_call(record)
            messages.append(
                openai_tool_result_message(
                    tool_call_id=tc.id,
                    name=name,
                    content=tool_result,
                )
            )

    result.rules = dispatcher.rules
    result.final_assistant_text = final_text
    return result
