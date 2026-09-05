from __future__ import annotations

from typing import Any


class ContextOverflowError(Exception):
    """Raised when the model context is full mid-run; carries partial agent state."""

    def __init__(self, message: str, *, run_result: Any) -> None:
        super().__init__(message)
        self.run_result = run_result


def join_error_messages(error: BaseException, max_depth: int = 5) -> str:
    parts: list[str] = []
    exc: BaseException | None = error
    for _ in range(max_depth):
        if exc is None:
            break
        parts.append(str(exc))
        exc = exc.__cause__ or exc.__context__
    return " | ".join(parts)


def get_error_status_code(error: BaseException) -> int | None:
    seen: set[int] = set()
    exc: BaseException | None = error
    while exc is not None and id(exc) not in seen:
        seen.add(id(exc))
        status = getattr(exc, "status_code", None)
        if isinstance(status, int):
            return status
        response = getattr(exc, "response", None)
        if response is not None:
            response_status = getattr(response, "status_code", None)
            if isinstance(response_status, int):
                return response_status
        exc = exc.__cause__ or exc.__context__
    return None


def is_context_overflow_error(error: BaseException) -> bool:
    message = join_error_messages(error).lower()
    status_code = get_error_status_code(error)

    if status_code == 413:
        return True

    token_or_context = (
        "maximum context" in message
        or "context length" in message
        or "context window" in message
        or "context size" in message
        or "exceed_context" in message
        or "exceeds the available context" in message
        or "too many tokens" in message
        or "token limit" in message
        or "maximum number of tokens" in message
        or "reduce the length" in message
        or "prompt is too long" in message
        or "request entity too large" in message
        or "payload too large" in message
    )

    tool_payload_rejected = (
        "input." in message and ".output" in message and "invalid input" in message
    )

    return token_or_context or tool_payload_rejected
