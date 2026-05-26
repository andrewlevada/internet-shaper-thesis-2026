from __future__ import annotations

import json
import sys
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from lib.logs_streamer import AgentLogWriter

API_REQUEST_TIMEOUT_S = 120.0


def estimate_openai_messages_chars(messages: list[dict[str, Any]]) -> int:
    total = 0
    for message in messages:
        content = message.get("content")
        if isinstance(content, str):
            total += len(content)
        elif content is not None:
            total += len(json.dumps(content, ensure_ascii=False))
        tool_calls = message.get("tool_calls")
        if tool_calls is not None:
            total += len(json.dumps(tool_calls, ensure_ascii=False))
    return total


def estimate_anthropic_messages_chars(
    messages: list[dict[str, Any]],
    *,
    system_prompt: str,
    tools: list[dict[str, Any]],
) -> int:
    total = len(system_prompt)
    total += len(json.dumps(messages, ensure_ascii=False))
    total += len(json.dumps(tools, ensure_ascii=False))
    return total


def log_api_request(
    *,
    pipeline_id: str,
    round_index: int,
    model_id: str,
    message_count: int,
    payload_chars: int,
    log_writer: AgentLogWriter | None,
) -> None:
    line = (
        f"[{pipeline_id} round {round_index}] API request → "
        f"{model_id} ({message_count} msgs, {payload_chars:,} chars)"
    )
    print(line, flush=True)
    if log_writer is not None:
        log_writer.append_api_request(
            round_index=round_index,
            message_count=message_count,
            payload_chars=payload_chars,
            model_id=model_id,
        )


def log_api_response(
    *,
    pipeline_id: str,
    round_index: int,
    elapsed_s: float,
    prompt_tokens: int | None,
    completion_tokens: int | None,
    finish_reason: str | None,
    tool_calls: list[str] | None,
    log_writer: AgentLogWriter | None,
) -> None:
    tools_label = ", ".join(tool_calls) if tool_calls else "none"
    line = (
        f"[{pipeline_id} round {round_index}] API response ← {elapsed_s:.1f}s, "
        f"finish={finish_reason}, tools=[{tools_label}], "
        f"tokens={prompt_tokens}/{completion_tokens}"
    )
    print(line, flush=True)
    if log_writer is not None:
        log_writer.append_api_response(
            round_index=round_index,
            elapsed_s=elapsed_s,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            tool_calls=tool_calls,
            finish_reason=finish_reason,
        )


def log_api_error(
    *,
    pipeline_id: str,
    round_index: int,
    elapsed_s: float,
    error: BaseException,
    log_writer: AgentLogWriter | None,
) -> None:
    line = (
        f"[{pipeline_id} round {round_index}] API error after {elapsed_s:.1f}s: "
        f"{type(error).__name__}: {error}"
    )
    print(line, file=sys.stderr, flush=True)
    if log_writer is not None:
        log_writer.append_api_error(
            round_index=round_index,
            elapsed_s=elapsed_s,
            error=error,
        )
