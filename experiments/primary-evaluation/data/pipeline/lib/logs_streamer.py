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
                f"Work raw: {paths.raw_html}",
                f"Work visible: {paths.visible_html}",
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

    def finalize(
        self,
        *,
        run_result: AgentRunResult,
        result_summary: str,
    ) -> None:
        lines: list[str] = []
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
