from __future__ import annotations

import json
import sys
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from lib.logs_streamer import AgentLogWriter

API_REQUEST_TIMEOUT_S = 120.0


@dataclass(frozen=True)
class OpenAICacheUsage:
    cached_tokens: int | None = None
    cache_creation_tokens: int | None = None
    prompt_tokens_details: dict[str, Any] | None = None


def extract_openai_prompt_tokens_details(usage: Any) -> dict[str, Any] | None:
    if usage is None:
        return None

    raw = usage.model_dump() if hasattr(usage, "model_dump") else usage
    if not isinstance(raw, dict):
        return None

    details = raw.get("prompt_tokens_details")
    return details if isinstance(details, dict) else None


def estimate_openai_messages_chars(messages: list[dict[str, Any]]) -> int:
    total = 0
    for message in messages:
        content = message.get("content")
        if isinstance(content, str):
            total += len(content)
        elif isinstance(content, list):
            for block in content:
                if isinstance(block, dict):
                    text = block.get("text")
                    if isinstance(text, str):
                        total += len(text)
                else:
                    total += len(json.dumps(block, ensure_ascii=False))
        elif content is not None:
            total += len(json.dumps(content, ensure_ascii=False))
        tool_calls = message.get("tool_calls")
        if tool_calls is not None:
            total += len(json.dumps(tool_calls, ensure_ascii=False))
    return total


def extract_openai_cache_usage(usage: Any) -> OpenAICacheUsage:
    if usage is None:
        return OpenAICacheUsage()

    raw = usage.model_dump() if hasattr(usage, "model_dump") else usage
    if not isinstance(raw, dict):
        return OpenAICacheUsage()

    details = extract_openai_prompt_tokens_details(usage)
    if details is None:
        details = {}

    cached = (
        details.get("cached_tokens")
        or raw.get("cached_tokens")
        or raw.get("cached_content_token_count")
    )
    created = (
        details.get("cache_creation_input_tokens")
        or details.get("cache_write_tokens")
        or raw.get("cache_creation_input_tokens")
        or raw.get("cache_write_tokens")
    )
    return OpenAICacheUsage(
        cached_tokens=int(cached) if cached is not None else None,
        cache_creation_tokens=int(created) if created is not None else None,
        prompt_tokens_details=details or None,
    )


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
    cache_mode: str | None = None,
    log_writer: AgentLogWriter | None,
) -> None:
    cache_label = f", cache={cache_mode}" if cache_mode else ""
    line = (
        f"[{pipeline_id} round {round_index}] API request → "
        f"{model_id} ({message_count} msgs, {payload_chars:,} chars{cache_label})"
    )
    print(line, flush=True)
    if log_writer is not None:
        log_writer.append_api_request(
            round_index=round_index,
            message_count=message_count,
            payload_chars=payload_chars,
            model_id=model_id,
            cache_mode=cache_mode,
        )


def log_api_response(
    *,
    pipeline_id: str,
    round_index: int,
    elapsed_s: float,
    prompt_tokens: int | None,
    completion_tokens: int | None,
    cached_tokens: int | None = None,
    cache_creation_tokens: int | None = None,
    prompt_tokens_details: dict[str, Any] | None = None,
    finish_reason: str | None,
    tool_calls: list[str] | None,
    log_writer: AgentLogWriter | None,
) -> None:
    tools_label = ", ".join(tool_calls) if tool_calls else "none"
    cache_parts: list[str] = []
    if cached_tokens is not None:
        cache_parts.append(f"cached_tokens={cached_tokens}")
    if cache_creation_tokens is not None:
        cache_parts.append(f"cache_creation_tokens={cache_creation_tokens}")
    cache_label = f", {', '.join(cache_parts)}" if cache_parts else ""
    details_label = ""
    if prompt_tokens_details:
        details_label = (
            f", prompt_tokens_details={json.dumps(prompt_tokens_details, ensure_ascii=False)}"
        )
    line = (
        f"[{pipeline_id} round {round_index}] API response ← {elapsed_s:.1f}s, "
        f"finish={finish_reason}, tools=[{tools_label}], "
        f"tokens={prompt_tokens}/{completion_tokens}{cache_label}{details_label}"
    )
    print(line, flush=True)
    if log_writer is not None:
        log_writer.append_api_response(
            round_index=round_index,
            elapsed_s=elapsed_s,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            cached_tokens=cached_tokens,
            cache_creation_tokens=cache_creation_tokens,
            prompt_tokens_details=prompt_tokens_details,
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
