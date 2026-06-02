from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from agent import AgentBackend, AgentRunResult, ToolCallRecord, build_tools
from config import PipelineConfig
from paths import AgentVariantPaths


class AgentLogWriter:
    """Append-only agent.log writer; flushes after each section for live tailing."""

    def __init__(
        self,
        path: Path,
        *,
        sample_id: str,
        pipeline: PipelineConfig,
        user_message: str,
        paths: AgentVariantPaths,
        backend: AgentBackend,
        model_id: str,
    ) -> None:
        self._file = path.open("w", encoding="utf-8")
        timestamp = datetime.now(timezone.utc).isoformat()
        self._write_lines(
            [
                f"Timestamp: {timestamp}",
                f"Sample: {sample_id}",
                f"Pipeline: {pipeline.id} ({pipeline.folder})",
                f"Backend: {backend}",
                f"Model: {model_id}",
                f"Work page: {paths.page_html}",
                f"Tools: {', '.join(pipeline.tools)}",
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
                "--- USER ---",
                user_message,
                "",
            ]
        )

    def _write_lines(self, lines: list[str]) -> None:
        self._file.write("\n".join(lines) + "\n")
        self._file.flush()

    def append_tool_call(self, call: ToolCallRecord) -> None:
        self._write_lines(
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

    def append_api_request(
        self,
        *,
        round_index: int,
        message_count: int,
        payload_chars: int,
        model_id: str,
        cache_mode: str | None = None,
    ) -> None:
        cache_part = f" cache={cache_mode}" if cache_mode else ""
        self._write_lines(
            [
                f"--- API REQUEST round {round_index} ---",
                (
                    f"model={model_id} messages={message_count} "
                    f"payload_chars={payload_chars:,}{cache_part}"
                ),
                "",
            ]
        )

    def append_api_response(
        self,
        *,
        round_index: int,
        elapsed_s: float,
        prompt_tokens: int | None,
        completion_tokens: int | None,
        cached_tokens: int | None = None,
        cache_creation_tokens: int | None = None,
        prompt_tokens_details: dict[str, object] | None = None,
        tool_calls: list[str] | None,
        finish_reason: str | None,
    ) -> None:
        tools = ", ".join(tool_calls) if tool_calls else "(none)"
        cache_parts: list[str] = []
        if cached_tokens is not None:
            cache_parts.append(f"cached_tokens={cached_tokens}")
        if cache_creation_tokens is not None:
            cache_parts.append(f"cache_creation_tokens={cache_creation_tokens}")
        cache_part = f" {' '.join(cache_parts)}" if cache_parts else ""
        details_part = ""
        if prompt_tokens_details:
            details_part = (
                f" prompt_tokens_details="
                f"{json.dumps(prompt_tokens_details, ensure_ascii=False)}"
            )
        self._write_lines(
            [
                f"--- API RESPONSE round {round_index} ---",
                (
                    f"elapsed_s={elapsed_s:.1f} "
                    f"prompt_tokens={prompt_tokens} "
                    f"completion_tokens={completion_tokens}"
                    f"{cache_part}{details_part} "
                    f"finish_reason={finish_reason} tool_calls=[{tools}]"
                ),
                "",
            ]
        )

    def append_api_error(
        self,
        *,
        round_index: int,
        elapsed_s: float,
        error: BaseException,
    ) -> None:
        self._write_lines(
            [
                f"--- API ERROR round {round_index} ---",
                f"elapsed_s={elapsed_s:.1f} {type(error).__name__}: {error}",
                "",
            ]
        )

    def finalize(
        self,
        *,
        run_result: AgentRunResult,
        result_summary: str,
        context_overflow: str | None = None,
    ) -> None:
        lines: list[str] = []
        if context_overflow:
            lines.extend(
                [
                    "=== Context overflow ===",
                    "",
                    context_overflow,
                    "",
                ]
            )
        if run_result.final_assistant_text.strip():
            lines.extend(["--- ASSISTANT ---", run_result.final_assistant_text.strip(), ""])
        if run_result.prompt_tokens is not None:
            lines.append(
                f"Tokens: {run_result.prompt_tokens} prompt / "
                f"{run_result.completion_tokens or 0} completion"
            )
            lines.append("")
        lines.extend(["=== Result ===", "", result_summary, ""])
        self._write_lines(lines)
        self._file.close()

    def close(self) -> None:
        if not self._file.closed:
            self._file.close()


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
    writer = AgentLogWriter(
        path,
        sample_id=sample_id,
        pipeline=pipeline,
        user_message=user_message,
        paths=paths,
        backend=run_result.backend,
        model_id=run_result.model_id,
    )
    for call in run_result.tool_calls:
        writer.append_tool_call(call)
    writer.finalize(run_result=run_result, result_summary=result_summary)
