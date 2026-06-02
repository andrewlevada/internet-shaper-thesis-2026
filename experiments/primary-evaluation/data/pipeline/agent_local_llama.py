"""Local Qwen3.6 agent via llama-server (Unsloth GGUF + OpenAI-compatible API)."""

from __future__ import annotations

import json
import os
import time
from pathlib import Path

from config import (
    LOCAL_LLAMA_CHAT_COMPLETION_KWARGS,
    LOCAL_LLAMA_MODEL_ALIAS,
    LOCAL_LLAMA_REQUEST_TIMEOUT_S,
    LOCAL_LLAMA_SERVER_URL,
    MAX_TOOL_ROUNDS,
    PipelineConfig,
)

from agent import (
    AgentRunResult,
    ToolCallRecord,
    ToolDispatcher,
    build_tools,
    openai_system_message,
    openai_tool_result_message,
)
from errors import ContextOverflowError, is_context_overflow_error
from lib.api_round_log import (
    estimate_openai_messages_chars,
    log_api_error,
    log_api_request,
    log_api_response,
)
from lib.env import load_env_files
from lib.logs_streamer import AgentLogWriter
from paths import AgentVariantPaths


def _resolve_api_key() -> str:
    return os.environ.get("LOCAL_LLAMA_API_KEY", "sk-no-key-required")


def run_agent_local_llama(
    pipeline: PipelineConfig,
    *,
    sample_id: str,
    user_message: str,
    paths: AgentVariantPaths,
    model_id: str = LOCAL_LLAMA_MODEL_ALIAS,
    log_writer: AgentLogWriter | None = None,
) -> AgentRunResult:
    del sample_id
    load_env_files()

    from openai import OpenAI

    base_url = os.environ.get("LOCAL_LLAMA_SERVER_URL", LOCAL_LLAMA_SERVER_URL)
    client = OpenAI(
        base_url=base_url,
        api_key=_resolve_api_key(),
        timeout=LOCAL_LLAMA_REQUEST_TIMEOUT_S,
    )
    dispatcher = ToolDispatcher(page_html=paths.page_html)
    tools = build_tools(pipeline)
    messages: list[dict] = [
        openai_system_message(pipeline.system_prompt),
        {"role": "user", "content": user_message},
    ]

    result = AgentRunResult(model_id=model_id, backend="local")
    final_text = ""

    for round_index in range(MAX_TOOL_ROUNDS):
        payload_chars = estimate_openai_messages_chars(messages)
        log_api_request(
            pipeline_id=pipeline.id,
            round_index=round_index,
            model_id=model_id,
            message_count=len(messages),
            payload_chars=payload_chars,
            cache_mode="none",
            log_writer=log_writer,
        )

        started = time.monotonic()
        try:
            response = client.chat.completions.create(
                model=model_id,
                messages=messages,
                tools=tools,
                tool_choice="auto",
                timeout=LOCAL_LLAMA_REQUEST_TIMEOUT_S,
                **LOCAL_LLAMA_CHAT_COMPLETION_KWARGS,
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
            cached_tokens=None,
            cache_creation_tokens=None,
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
        print(f"[{pipeline.id} round {round_index}] {len(message.tool_calls)} tool call(s)")

    result.rules = dispatcher.rules
    result.final_assistant_text = final_text
    return result
