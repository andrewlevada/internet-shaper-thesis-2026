#!/usr/bin/env python3
"""Prepare primary evaluation samples from seed-samples/{fold}/{id}/."""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

from agent import AgentBackend, apply_changes, resolve_agent_provider, run_agent
from config import (
    AGENT_PIPELINE_IDS,
    ANTHROPIC_MODEL_ID,
    GATEWAY_MODEL_ID,
    LOCAL_MODEL_ID,
    PIPELINES,
    PipelineConfig,
    build_user_message,
)
from errors import ContextOverflowError
from lib.logs_streamer import AgentLogWriter
from lib.screenshot import screenshot_variant
from paths import agent_variant_paths

PIPELINE_DIR = Path(__file__).resolve().parent
DATA_DIR = PIPELINE_DIR.parent
SEED_DIR = DATA_DIR / "seed-samples"
SAMPLES_DIR = DATA_DIR / "samples"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Prepare primary evaluation samples (Trial 1 conditions).",
    )
    parser.add_argument(
        "--sample",
        metavar="ID",
        help="Process fold/id (e.g. our/001) or all samples in a fold (e.g. our). Default: all seeds.",
    )
    parser.add_argument(
        "--pipeline",
        metavar="FOLDER",
        help="Run a single agent pipeline folder (e.g. 2-baseline). Default: all agent pipelines.",
    )
    parser.add_argument(
        "--skip-existing",
        action="store_true",
        help="Skip agent runs when index.html and agent.log already exist.",
    )
    parser.add_argument(
        "--screenshots-only",
        action="store_true",
        help="Only regenerate screenshots for existing variant folders.",
    )
    parser.add_argument(
        "--backend",
        choices=["vercel", "anthropic", "local"],
        default="vercel",
        help=(
            "Default agent provider when a pipeline does not set one: vercel "
            "(Vercel AI Gateway + Kimi K2.6), anthropic (Claude via Anthropic API), "
            "or local (transformers on GPU)."
        ),
    )
    return parser.parse_args()


def is_seed_sample(path: Path) -> bool:
    return path.is_dir() and (path / "task.json").is_file()


def list_samples_in_fold(fold_dir: Path, fold_name: str) -> list[str]:
    return sorted(
        f"{fold_name}/{sample_dir.name}"
        for sample_dir in fold_dir.iterdir()
        if is_seed_sample(sample_dir)
    )


def list_seed_ids(sample_filter: str | None) -> list[str]:
    if sample_filter:
        seed_path = SEED_DIR / sample_filter
        if not seed_path.is_dir():
            print(f"Seed sample not found: {seed_path}", file=sys.stderr)
            sys.exit(1)

        if is_seed_sample(seed_path):
            return [sample_filter]

        ids = list_samples_in_fold(seed_path, sample_filter)
        if not ids:
            print(f"No seed samples under {seed_path}", file=sys.stderr)
            sys.exit(1)
        return ids

    ids: list[str] = []
    for fold_dir in sorted(SEED_DIR.iterdir()):
        if not fold_dir.is_dir():
            continue
        ids.extend(list_samples_in_fold(fold_dir, fold_dir.name))

    if not ids:
        print(f"No seed samples under {SEED_DIR}", file=sys.stderr)
        sys.exit(1)
    return ids


def resolve_model_id(pipeline: PipelineConfig, backend: AgentBackend) -> str:
    if pipeline.model:
        return pipeline.model

    provider = resolve_agent_provider(pipeline, backend)
    if provider == "local":
        return LOCAL_MODEL_ID
    if provider == "anthropic":
        return ANTHROPIC_MODEL_ID
    return GATEWAY_MODEL_ID


def resolve_agent_pipelines(pipeline_filter: str | None) -> list[PipelineConfig]:
    if pipeline_filter:
        match = next((cfg for cfg in PIPELINES.values() if cfg.folder == pipeline_filter), None)
        
        if match is None:
            folders = ", ".join(cfg.folder for cfg in PIPELINES.values())
            print(
                f"Unknown pipeline folder {pipeline_filter!r}. Expected one of: {folders}",
                file=sys.stderr,
            )
            sys.exit(1)

        if not match.run_agent:
            print(f"Pipeline {pipeline_filter} does not run an agent.", file=sys.stderr)
            sys.exit(1)

        return [match]

    return [PIPELINES[pid] for pid in AGENT_PIPELINE_IDS]


def copy_original_variant(sample_dir: Path, seed_dir: Path) -> None:
    original_cfg = PIPELINES["original"]
    src = seed_dir / "original"

    dest = sample_dir / original_cfg.folder
    dest.mkdir(parents=True, exist_ok=True)

    task_src = seed_dir / "task.json"
    task_dest = sample_dir / "task.json"
    if task_src.is_file():
        shutil.copy2(task_src, task_dest)

    original_html = src / "raw.html"
    if original_html.is_file():
        shutil.copy2(original_html, dest / "index.html")


def agent_variant_complete(variant_dir: Path, pipeline: PipelineConfig) -> bool:
    paths = agent_variant_paths(variant_dir)
    if not paths.index_html.is_file() or not paths.agent_log.is_file():
        return False
    if pipeline.uses_rules and not paths.rules_json.is_file():
        return False
    return True


def run_agent_pipeline(
    sample_id: str,
    sample_dir: Path,
    seed_dir: Path,
    pipeline: PipelineConfig,
    *,
    skip_existing: bool,
    backend: AgentBackend,
) -> None:
    variant_dir = sample_dir / pipeline.folder
    variant_dir.mkdir(parents=True, exist_ok=True)

    if skip_existing and agent_variant_complete(variant_dir, pipeline):
        print(f"[{sample_id}] skip {pipeline.folder} (already complete)")
        return

    task_path = sample_dir / "task.json"
    if not task_path.is_file():
        task_path = seed_dir / "task.json"
    task = json.loads(task_path.read_text(encoding="utf-8"))
    user_message = build_user_message(task)

    paths = agent_variant_paths(variant_dir)
    paths.work_dir.mkdir(parents=True, exist_ok=True)
    seed_original = seed_dir / "original"
    shutil.copy2(seed_original / "raw.html", paths.raw_html)
    shutil.copy2(seed_original / "visible.html", paths.visible_html)

    print(f"[{sample_id}] running {pipeline.id} → {pipeline.folder}")

    provider = resolve_agent_provider(pipeline, backend)
    model_id = resolve_model_id(pipeline, backend)
    log_writer = AgentLogWriter(
        paths.agent_log,
        sample_id=sample_id,
        pipeline=pipeline,
        user_message=user_message,
        paths=paths,
        backend=provider,
        model_id=model_id,
    )
    try:
        run_result = run_agent(
            pipeline,
            sample_id=sample_id,
            user_message=user_message,
            paths=paths,
            backend=backend,
            log_writer=log_writer,
        )

        summary = apply_changes(
            pipeline,
            paths=paths,
            run_result=run_result,
        )

        log_writer.finalize(run_result=run_result, result_summary=summary)
    except ContextOverflowError as exc:
        run_result = exc.run_result
        summary = apply_changes(
            pipeline,
            paths=paths,
            run_result=run_result,
        )
        overflow_note = (
            "Context overflow: model context was full; pipeline stopped early. "
            "Saved the latest edit snapshot as index.html."
        )
        print(
            f"[{sample_id}] context overflow in {pipeline.folder}; "
            "saved latest edit snapshot"
        )
        log_writer.finalize(
            run_result=run_result,
            result_summary=f"{overflow_note}\n\n{summary}",
            context_overflow=str(exc),
        )
    except Exception:
        log_writer.close()
        raise


def screenshot_sample(
    sample_id: str,
    sample_dir: Path,
    pipelines: list[PipelineConfig],
) -> None:
    for cfg in pipelines:
        variant_dir = sample_dir / cfg.folder
        html_path = agent_variant_paths(variant_dir).index_html

        if not html_path.is_file():
            print(f"[{sample_id}] skip screenshot for {cfg.folder} (no index.html)")
            continue
        
        output_path = variant_dir / "screenshot.png"
        print(f"[{sample_id}] screenshot {cfg.folder}")
        screenshot_variant(
            html_path=html_path,
            output_path=output_path,
        )


def process_sample(
    sample_id: str,
    agent_pipelines: list[PipelineConfig],
    screenshot_pipelines: list[PipelineConfig],
    *,
    skip_existing: bool,
    screenshots_only: bool,
    backend: AgentBackend,
) -> None:
    seed_dir = SEED_DIR / sample_id
    sample_dir = SAMPLES_DIR / sample_id

    if not seed_dir.is_dir():
        print(f"Missing seed dir: {seed_dir}", file=sys.stderr)
        return

    copy_original_variant(sample_dir, seed_dir)

    if not screenshots_only:
        for pipeline in agent_pipelines:
            run_agent_pipeline(
                sample_id,
                sample_dir,
                seed_dir,
                pipeline,
                skip_existing=skip_existing,
                backend=backend,
            )

    screenshot_sample(sample_id, sample_dir, screenshot_pipelines)


def main() -> None:
    args = parse_args()
    seed_ids = list_seed_ids(args.sample)
    agent_pipelines = resolve_agent_pipelines(args.pipeline)
    screenshot_pipelines = (
        agent_pipelines if args.pipeline else list(PIPELINES.values())
    )

    for sample_id in seed_ids:
        process_sample(
            sample_id,
            agent_pipelines,
            screenshot_pipelines,
            skip_existing=args.skip_existing,
            screenshots_only=args.screenshots_only,
            backend=args.backend,
        )

    print("Done.")


if __name__ == "__main__":
    main()
