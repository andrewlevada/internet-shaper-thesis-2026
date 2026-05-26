#!/usr/bin/env python3
"""Prepare seed samples from dom-compression snapshots via JTBD LLM pipeline.

For each snapshot, runs a 3-turn Gemini session (get_dom with --with-seo, then
jobs → preference pairs → edit requests) and writes 6 seed samples to
seed-samples/our-2/{001,002,...}/ with a unified incrementing counter.

Usage:
  python3 prep-seed-samples.py
  python3 prep-seed-samples.py --sample 001
  python3 prep-seed-samples.py --sample 001 --skip-existing
"""

from __future__ import annotations

import argparse
import csv
import json
import random
import re
import shutil
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
DATA_DIR = SCRIPT_DIR.parent
PIPELINE_DIR = DATA_DIR / "pipeline"
REPO_ROOT = SCRIPT_DIR.parents[3]
SNAPSHOTS_DIR = REPO_ROOT / "experiments/dom-compression-analysis/data/snapshots"
SNAPSHOTS_CSV = SNAPSHOTS_DIR / "data.csv"
SEED_FOLD = DATA_DIR / "seed-samples" / "our-2"
LOGS_DIR = SCRIPT_DIR / "logs"

SNAPSHOTS_NUMBER = 10
SNAPSHOT_GLOB = "[0-9][0-9][0-9]"
SNAPSHOT_ORDER_SEED = 9081436
SEED_MODEL_ID = "google/gemini-3.5-flash"
MAX_TOOL_ROUNDS = 8
PREFERENCE_SIDES = ("a", "b")
PREFERENCE_PAIR_INDICES = (1, 2, 3)
EXPECTED_EDIT_IDS = ("1a", "1b", "2a", "2b", "3a", "3b")
SEED_SAMPLE_WIDTH = 3

EXCLUDE_SNAPSHOTS = [8, 9, 10, 11, 24, 26, 27, 28, 32, 41, 42, 43, 44, 45, 46, 65, 66, 67, 73]
EXCLUDED_SNAPSHOT_IDS = {f"{snapshot_id:03d}" for snapshot_id in EXCLUDE_SNAPSHOTS}

sys.path.insert(0, str(PIPELINE_DIR))

from agent import _cap_tool_output, _run_deno, openai_tool_result_message  # noqa: E402
from agent_vercel import (  # noqa: E402
    AI_GATEWAY_BASE_URL,
    _load_env_files,
    _resolve_api_key,
)

GET_DOM_TOOL = {
    "type": "function",
    "function": {
        "name": "get_dom",
        "description": (
            "Returns the DOM tree of the page (visible viewport snapshot with SEO "
            "head metadata). Can only be called once per session."
        ),
        "parameters": {"type": "object", "properties": {}, "required": []},
    },
}

SYSTEM_PROMPT = (
    "You are a UX researcher analyzing web pages using the Jobs To Be Done (JTBD) "
    "framework. When asked about a page, call get_dom() once to inspect it before "
    "answering. Respond with valid JSON when requested."
)

PROMPT_JOBS = """\
List what jobs (in terms of JTBD) users might want to perform on this page. Jobs To Be Done is a framework that describes the tasks and goals users have — in other words, a reason why they are using the UI. Each job description must start with "I want to".

Example: on an e-commerce product page, primary jobs might be:
1. I want to compare this item with another one I am looking at by its specs
2. I want to read the reviews on this item to make an educated decision on whether to purchase it
3. I want to share this item with a friend

Call get_dom() to inspect the page, then respond with JSON: {"jobs": ["I want to ...", ...]}"""

PROMPT_PREFERENCES = """\
Ok! Now consider what segments of users, in terms of their preferences, might be using this page. Preferences don't describe the job or the current session. They are instead persistent in time, intrinsic to the particular users and will be true across different websites. Come up with them in 3 pairs of opposites.

Example: on an e-commerce product page, user preference profiles might be:
1a. I never read the reviews because there are a lot of fake ones. I only look at the description and photos
1b. I try to read as many reviews as possible, especially negative ones, before purchase
2a. I am loyal to the brands I purchase from, so I always look at the store page before purchasing an item to find more items they may have that I usually like
2b. I don't remember brands and stores — I just purchase what looks good
3a. I think this page is too cluttered with information. It is very hard to focus on just the pictures, description, and reviews. There is too much going on
3b. I like how the page contains everything you need to know; on the other hand, it has too much empty space. I wish it was more condensed

Respond with JSON: {"preference_pairs": [{"a": "...", "b": "..."}, ...]} (exactly 3 pairs)"""

PROMPT_EDIT_REQUESTS = """\
Ok! If these users with their preferences could edit this class of pages to make their jobs easier to complete, what edits would they request? These edits have to be stylistic, stractural or functional. Edits must be refering to elements of the page, as if a user sees this page before them. Edits will be applied to all pages of this class (in our example, to all product item pages across the website). Provide one request for each preference from the list you made.

Example mapping to the example above:
1a. Hide the reviews section
1b. Move the reviews section up above reommendations
2a. Add a button to go to the store page near the Add to cart button
2b. Remove the card with information about the store
3a. The page is too cluttered. I want to see only pictures, description of an item, and reviews — and no other info about the product, store, or recommendations of other items
3b. Make the empty space on the sides of the page less empty. I want the content to fill the whole page

Respond with JSON: {"edit_requests": [{"id": "1a", "request": "..."}, ...]} (exactly 6 entries, ids 1a/1b/2a/2b/3a/3b)"""

PREFERENCE_PAIR_SCHEMA = {
    "type": "object",
    "properties": {
        "a": {"type": "string", "description": "First preference in the opposite pair"},
        "b": {"type": "string", "description": "Second preference in the opposite pair"},
    },
    "required": ["a", "b"],
    "additionalProperties": False,
}

EDIT_REQUEST_ENTRY_SCHEMA = {
    "type": "object",
    "properties": {
        "id": {
            "type": "string",
            "description": "Preference id: one of 1a, 1b, 2a, 2b, 3a, 3b",
        },
        "request": {"type": "string", "description": "Page edit request for this preference"},
    },
    "required": ["id", "request"],
    "additionalProperties": False,
}

JOBS_RESPONSE_FORMAT: dict[str, Any] = {
    "type": "json_schema",
    "json_schema": {
        "name": "jtbd_jobs",
        "description": "Jobs To Be Done that users might perform on the page",
        "schema": {
            "type": "object",
            "properties": {
                "jobs": {
                    "type": "array",
                    "items": {
                        "type": "string",
                        "description": 'Job description starting with "I want to"',
                    },
                    "minItems": 1,
                },
            },
            "required": ["jobs"],
            "additionalProperties": False,
        },
    },
}

PREFERENCES_RESPONSE_FORMAT: dict[str, Any] = {
    "type": "json_schema",
    "json_schema": {
        "name": "user_preference_pairs",
        "description": "Three pairs of opposite user preference profiles",
        "schema": {
            "type": "object",
            "properties": {
                "preference_pairs": {
                    "type": "array",
                    "items": PREFERENCE_PAIR_SCHEMA,
                    "minItems": 3,
                    "maxItems": 3,
                },
            },
            "required": ["preference_pairs"],
            "additionalProperties": False,
        },
    },
}

EDIT_REQUESTS_RESPONSE_FORMAT: dict[str, Any] = {
    "type": "json_schema",
    "json_schema": {
        "name": "preference_edit_requests",
        "description": "One page edit request per user preference profile",
        "schema": {
            "type": "object",
            "properties": {
                "edit_requests": {
                    "type": "array",
                    "items": EDIT_REQUEST_ENTRY_SCHEMA,
                    "minItems": 6,
                    "maxItems": 6,
                },
            },
            "required": ["edit_requests"],
            "additionalProperties": False,
        },
    },
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Prepare seed samples from dom-compression snapshots (JTBD pipeline).",
    )
    parser.add_argument(
        "--sample",
        metavar="ID",
        help="Process one snapshot folder (e.g. 001). Default: all snapshots.",
    )
    parser.add_argument(
        "--skip-existing",
        action="store_true",
        help="Skip snapshots when all 6 seed samples already have task.json.",
    )
    parser.add_argument(
        "--backend",
        choices=["vercel", "anthropic", "local"],
        default="vercel",
        help=(
            "LLM provider. Only vercel is supported for this script "
            "(Vercel AI Gateway + Gemini)."
        ),
    )
    return parser.parse_args()


@dataclass
class SnapshotMeta:
    folder: str
    url: str = ""
    final_url: str = ""


@dataclass
class SessionResult:
    jobs: list[str]
    preference_pairs: list[dict[str, str]]
    edit_requests: dict[str, str]
    messages: list[dict[str, Any]] = field(default_factory=list)
    tool_calls: list[dict[str, Any]] = field(default_factory=list)


def load_snapshot_metadata() -> dict[str, SnapshotMeta]:
    meta: dict[str, SnapshotMeta] = {}
    if not SNAPSHOTS_CSV.is_file():
        return meta

    with SNAPSHOTS_CSV.open(encoding="utf-8", newline="") as handle:
        for row in csv.DictReader(handle):
            folder = (row.get("folder") or "").strip()
            if not folder:
                continue
            meta[folder] = SnapshotMeta(
                folder=folder,
                url=(row.get("url") or "").strip(),
                final_url=(row.get("final_url") or "").strip(),
            )
    return meta


def list_snapshot_ids(sample_filter: str | None) -> list[str]:
    if sample_filter:
        snapshot_path = SNAPSHOTS_DIR / sample_filter
        if not snapshot_path.is_dir():
            print(f"Snapshot not found: {snapshot_path}", file=sys.stderr)
            sys.exit(1)
        return [sample_filter]

    ids = sorted(
        path.name
        for path in SNAPSHOTS_DIR.glob(SNAPSHOT_GLOB)
        if path.is_dir() and path.name not in EXCLUDED_SNAPSHOT_IDS
    )

    if not ids:
        print(f"No snapshots under {SNAPSHOTS_DIR}", file=sys.stderr)
        sys.exit(1)
    if len(ids) < SNAPSHOTS_NUMBER:
        print(
            f"Only {len(ids)} snapshots available after exclusions "
            f"(need {SNAPSHOTS_NUMBER})",
            file=sys.stderr,
        )
        sys.exit(1)
    random.Random(SNAPSHOT_ORDER_SEED).shuffle(ids)

    return ids[:SNAPSHOTS_NUMBER]


def sample_folder_name(index: int) -> str:
    return f"{index:0{SEED_SAMPLE_WIDTH}d}"


def expected_preference_slots() -> set[tuple[int, str]]:
    return {
        (pair_index, side)
        for pair_index in PREFERENCE_PAIR_INDICES
        for side in PREFERENCE_SIDES
    }


def read_task_json(task_path: Path) -> dict[str, Any] | None:
    try:
        task = json.loads(task_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return task if isinstance(task, dict) else None


def seed_samples_for_snapshot(snapshot_id: str) -> list[Path]:
    if not SEED_FOLD.is_dir():
        return []

    sample_dirs: list[Path] = []
    for sample_dir in SEED_FOLD.iterdir():
        if not sample_dir.is_dir():
            continue
        task = read_task_json(sample_dir / "task.json")
        if task and task.get("source-snapshot") == snapshot_id:
            sample_dirs.append(sample_dir)
    return sorted(sample_dirs, key=lambda path: path.name)


def snapshot_complete(snapshot_id: str) -> bool:
    found: set[tuple[int, str]] = set()
    for sample_dir in seed_samples_for_snapshot(snapshot_id):
        task = read_task_json(sample_dir / "task.json")
        if not task:
            continue
        pair_index = task.get("preference-pair-index")
        side = task.get("preference-side")
        if isinstance(pair_index, int) and side in PREFERENCE_SIDES:
            found.add((pair_index, side))
    return found == expected_preference_slots()


def next_seed_sample_index() -> int:
    if not SEED_FOLD.is_dir():
        return 1

    indices = [
        int(path.name)
        for path in SEED_FOLD.iterdir()
        if path.is_dir() and path.name.isdigit()
    ]
    return max(indices, default=0) + 1


def remove_seed_samples_for_snapshot(snapshot_id: str) -> None:
    for sample_dir in seed_samples_for_snapshot(snapshot_id):
        shutil.rmtree(sample_dir)


def parse_json_response(text: str) -> dict[str, Any]:
    trimmed = text.strip()
    fence_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", trimmed)
    if fence_match:
        trimmed = fence_match.group(1).strip()
    try:
        parsed = json.loads(trimmed)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Model response is not valid JSON: {exc}\n{text[:500]}") from exc
    if not isinstance(parsed, dict):
        raise ValueError(f"Expected JSON object, got {type(parsed).__name__}")
    return parsed


def run_get_dom_with_seo(visible_html: Path) -> str:
    code, out, err = _run_deno(
        "get_dom.ts",
        ["--snapshot", str(visible_html), "--with-seo"],
    )
    if code != 0:
        raise RuntimeError(f"get_dom failed ({code}): {err or out}")
    return _cap_tool_output(out)


def chat_completion(
    client: Any,
    *,
    messages: list[dict[str, Any]],
    tools: list[dict[str, Any]] | None = None,
    tool_choice: str | None = "auto",
    response_format: dict[str, Any] | None = None,
) -> Any:
    kwargs: dict[str, Any] = {
        "model": SEED_MODEL_ID,
        "messages": messages,
    }
    if tools:
        kwargs["tools"] = tools
        kwargs["tool_choice"] = tool_choice
    if response_format:
        kwargs["response_format"] = response_format
    return client.chat.completions.create(**kwargs)


def run_jobs_turn(
    client: Any,
    visible_html: Path,
    messages: list[dict[str, Any]],
    session_log: list[str],
) -> list[str]:
    messages.append({"role": "user", "content": PROMPT_JOBS})
    session_log.extend(["--- USER (jobs) ---", PROMPT_JOBS, ""])

    get_dom_used = False
    final_text = ""

    for _round in range(MAX_TOOL_ROUNDS):
        response = chat_completion(
            client,
            messages=messages,
            tools=[GET_DOM_TOOL],
            tool_choice="auto",
        )
        message = response.choices[0].message

        if message.content:
            final_text = message.content
            session_log.extend(["--- ASSISTANT ---", message.content, ""])

        assistant_message: dict[str, Any] = {
            "role": "assistant",
            "content": message.content or "",
        }
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
            session_log.extend([f"--- TOOL CALL: {name} ---", ""])
            if name == "get_dom":
                if get_dom_used:
                    tool_result = (
                        "The get_dom tool is extremely context-hungry, so it cannot be "
                        "called again. Refer to the result of the previous call."
                    )
                else:
                    tool_result = run_get_dom_with_seo(visible_html)
                    get_dom_used = True
            else:
                tool_result = f"error: unknown tool {name!r}"

            session_log.extend([f"--- TOOL RESULT: {name} ---", tool_result[:2000], ""])
            messages.append(
                openai_tool_result_message(
                    tool_call_id=tc.id,
                    name=name,
                    content=tool_result,
                )
            )

    if not get_dom_used:
        raise ValueError("Model did not call get_dom before returning jobs")

    payload: dict[str, Any] | None = None
    if final_text.strip():
        try:
            payload = parse_json_response(final_text)
        except ValueError:
            payload = None

    if payload is None:
        response = chat_completion(
            client,
            messages=messages,
            response_format=JOBS_RESPONSE_FORMAT,
        )
        message = response.choices[0].message
        content = message.content or ""
        session_log.extend(["--- ASSISTANT (structured jobs) ---", content, ""])
        messages.append({"role": "assistant", "content": content})
        payload = parse_json_response(content)

    jobs = payload.get("jobs")
    if not isinstance(jobs, list) or not jobs:
        raise ValueError(f"Expected non-empty jobs array, got: {payload!r}")
    normalized = [str(job).strip() for job in jobs if str(job).strip()]
    if not normalized:
        raise ValueError("All job entries were empty")
    return normalized


def run_json_turn(
    client: Any,
    messages: list[dict[str, Any]],
    prompt: str,
    label: str,
    session_log: list[str],
    response_format: dict[str, Any],
) -> dict[str, Any]:
    messages.append({"role": "user", "content": prompt})
    session_log.extend([f"--- USER ({label}) ---", prompt, ""])

    response = chat_completion(
        client,
        messages=messages,
        response_format=response_format,
    )
    message = response.choices[0].message
    content = message.content or ""
    session_log.extend(["--- ASSISTANT ---", content, ""])
    messages.append({"role": "assistant", "content": content})
    return parse_json_response(content)


def validate_preference_pairs(pairs: Any) -> list[dict[str, str]]:
    if not isinstance(pairs, list) or len(pairs) != 3:
        raise ValueError(f"Expected exactly 3 preference pairs, got: {pairs!r}")

    normalized: list[dict[str, str]] = []
    for index, pair in enumerate(pairs, start=1):
        if not isinstance(pair, dict):
            raise ValueError(f"Pair {index} is not an object: {pair!r}")
        side_a = str(pair.get("a", "")).strip()
        side_b = str(pair.get("b", "")).strip()
        if not side_a or not side_b:
            raise ValueError(f"Pair {index} missing a or b text: {pair!r}")
        normalized.append({"a": side_a, "b": side_b})
    return normalized


def validate_edit_requests(requests: Any) -> dict[str, str]:
    if not isinstance(requests, list) or len(requests) != 6:
        raise ValueError(f"Expected exactly 6 edit requests, got: {requests!r}")

    by_id: dict[str, str] = {}
    for entry in requests:
        if not isinstance(entry, dict):
            raise ValueError(f"Edit request entry is not an object: {entry!r}")
        entry_id = str(entry.get("id", "")).strip().lower()
        request_text = str(entry.get("request", "")).strip()
        if not entry_id or not request_text:
            raise ValueError(f"Edit request missing id or request: {entry!r}")
        by_id[entry_id] = request_text

    missing = [entry_id for entry_id in EXPECTED_EDIT_IDS if entry_id not in by_id]
    if missing:
        raise ValueError(f"Missing edit request ids: {', '.join(missing)}")
    return {entry_id: by_id[entry_id] for entry_id in EXPECTED_EDIT_IDS}


def run_session(snapshot_dir: Path, session_log: list[str]) -> SessionResult:
    visible_html = snapshot_dir / "visible.html"
    if not visible_html.is_file():
        raise FileNotFoundError(f"Missing visible.html: {visible_html}")

    _load_env_files()
    from openai import OpenAI

    client = OpenAI(base_url=AI_GATEWAY_BASE_URL, api_key=_resolve_api_key())
    messages: list[dict[str, Any]] = [
        {"role": "system", "content": SYSTEM_PROMPT},
    ]
    session_log.extend(["=== Session ===", f"Model: {SEED_MODEL_ID}", ""])

    jobs = run_jobs_turn(client, visible_html, messages, session_log)
    prefs_payload = run_json_turn(
        client,
        messages,
        PROMPT_PREFERENCES,
        "preferences",
        session_log,
        PREFERENCES_RESPONSE_FORMAT,
    )
    preference_pairs = validate_preference_pairs(prefs_payload.get("preference_pairs"))

    edits_payload = run_json_turn(
        client,
        messages,
        PROMPT_EDIT_REQUESTS,
        "edit_requests",
        session_log,
        EDIT_REQUESTS_RESPONSE_FORMAT,
    )
    edit_requests = validate_edit_requests(edits_payload.get("edit_requests"))

    return SessionResult(
        jobs=jobs,
        preference_pairs=preference_pairs,
        edit_requests=edit_requests,
        messages=messages,
    )


def copy_snapshot_assets(snapshot_dir: Path, original_dir: Path) -> None:
    original_dir.mkdir(parents=True, exist_ok=True)
    for name in ("raw.html", "visible.html", "screenshot.png"):
        src = snapshot_dir / name
        if src.is_file():
            shutil.copy2(src, original_dir / name)


def build_task_json(
    *,
    request_prompt: str,
    goal: str,
    jobs: list[str],
    preference_pairs: list[dict[str, str]],
    pair_index: int,
    side: str,
    preference: str,
    snapshot_id: str,
    meta: SnapshotMeta | None,
) -> dict[str, Any]:
    task: dict[str, Any] = {
        "request-prompt": request_prompt,
        "goal": goal,
        "jobs": jobs,
        "preference-pairs": preference_pairs,
        "preference-pair-index": pair_index,
        "preference-side": side,
        "preference": preference,
        "source-snapshot": snapshot_id,
        "model": SEED_MODEL_ID,
    }
    if meta:
        if meta.url:
            task["url"] = meta.url
        if meta.final_url:
            task["final-url"] = meta.final_url
    return task


def write_seed_samples(
    snapshot_id: str,
    snapshot_dir: Path,
    session: SessionResult,
    meta: SnapshotMeta | None,
    log_lines: list[str],
    *,
    start_index: int,
) -> int:
    SEED_FOLD.mkdir(parents=True, exist_ok=True)

    index = start_index
    for pair_index, pair in enumerate(session.preference_pairs, start=1):
        for side in PREFERENCE_SIDES:
            sample_id = sample_folder_name(index)
            sample_dir = SEED_FOLD / sample_id
            original_dir = sample_dir / "original"
            sample_dir.mkdir(parents=True, exist_ok=True)

            edit_id = f"{pair_index}{side}"
            request_prompt = session.edit_requests[edit_id]
            preference = pair[side]

            task = build_task_json(
                request_prompt=request_prompt,
                goal=preference,
                jobs=session.jobs,
                preference_pairs=session.preference_pairs,
                pair_index=pair_index,
                side=side,
                preference=preference,
                snapshot_id=snapshot_id,
                meta=meta,
            )
            (sample_dir / "task.json").write_text(
                json.dumps(task, indent="\t", ensure_ascii=False) + "\n",
                encoding="utf-8",
            )
            copy_snapshot_assets(snapshot_dir, original_dir)
            log_lines.append(f"  OK our-2/{sample_id}")
            index += 1

    return index


def process_snapshot(
    snapshot_id: str,
    meta_by_folder: dict[str, SnapshotMeta],
    *,
    skip_existing: bool,
    session_log_path: Path,
    log_lines: list[str],
) -> None:
    snapshot_dir = SNAPSHOTS_DIR / snapshot_id
    raw_html = snapshot_dir / "raw.html"
    visible_html = snapshot_dir / "visible.html"

    if not raw_html.is_file() or not visible_html.is_file():
        raise FileNotFoundError(f"Snapshot {snapshot_id} missing raw.html or visible.html")

    if skip_existing and snapshot_complete(snapshot_id):
        log_lines.append(f"[{snapshot_id}] skip (all 6 seed samples exist)")
        return

    remove_seed_samples_for_snapshot(snapshot_id)
    start_index = next_seed_sample_index()

    log_lines.append(f"[{snapshot_id}] running JTBD session")
    session_log: list[str] = [
        f"Timestamp: {datetime.now(timezone.utc).isoformat()}",
        f"Snapshot: {snapshot_id}",
        f"Model: {SEED_MODEL_ID}",
        "",
    ]

    session = run_session(snapshot_dir, session_log)
    meta = meta_by_folder.get(snapshot_id)
    first_sample_id = sample_folder_name(start_index)
    end_index = write_seed_samples(
        snapshot_id,
        snapshot_dir,
        session,
        meta,
        log_lines,
        start_index=start_index,
    )
    last_sample_id = sample_folder_name(end_index - 1)
    log_lines.append(
        f"[{snapshot_id}] wrote seed samples our-2/{first_sample_id}..{last_sample_id}",
    )

    session_log_path.write_text("\n".join(session_log) + "\n", encoding="utf-8")
    log_lines.append(f"[{snapshot_id}] session log: {session_log_path}")


def main() -> None:
    args = parse_args()

    if args.backend != "vercel":
        print(
            f"Backend {args.backend!r} is not supported. Use --backend vercel.",
            file=sys.stderr,
        )
        sys.exit(1)

    snapshot_ids = list_snapshot_ids(args.sample)
    meta_by_folder = load_snapshot_metadata()
    timestamp = datetime.now(timezone.utc).isoformat()
    file_ts = timestamp.replace(":", "-")
    run_log_path = LOGS_DIR / f"{file_ts}-prep-seed-samples.log"
    LOGS_DIR.mkdir(parents=True, exist_ok=True)

    log_lines = [
        "Prep seed samples from dom-compression snapshots",
        "---"
        f"timestamp (UTC): {timestamp}",
        f"script: {Path(__file__).name}",
        f"model: {SEED_MODEL_ID}",
        f"backend: {args.backend}",
        f"snapshots dir: {SNAPSHOTS_DIR}",
        f"output fold: {SEED_FOLD}",
        f"snapshot filter: {args.sample or '(all)'}",
        f"skip existing: {args.skip_existing}",
        f"snapshot order seed: {SNAPSHOT_ORDER_SEED if not args.sample else '(single sample)'}",
        f"excluded snapshots: {', '.join(sorted(EXCLUDED_SNAPSHOT_IDS)) if not args.sample else '(single sample)'}",
        f"snapshots to process: {', '.join(snapshot_ids)}",
        f"next seed sample index: {sample_folder_name(next_seed_sample_index())}",
        "",
    ]

    failures: list[str] = []
    for snapshot_id in snapshot_ids:
        session_log_path = LOGS_DIR / f"{file_ts}-{snapshot_id}-session.log"
        try:
            process_snapshot(
                snapshot_id,
                meta_by_folder,
                skip_existing=args.skip_existing,
                session_log_path=session_log_path,
                log_lines=log_lines,
            )
        except Exception as exc:  # noqa: BLE001 — collect per-snapshot failures
            message = f"[{snapshot_id}] FAIL: {exc}"
            failures.append(message)
            log_lines.append(message)

    log_lines.append("")
    if failures:
        log_lines.append(f"failures: {len(failures)}")
    log_lines.append(f"log file: {run_log_path}")

    run_log_path.write_text("\n".join(log_lines) + "\n", encoding="utf-8")
    print("\n".join(log_lines))
    print(f"\nLog: {run_log_path}")

    if failures:
        sys.exit(1)


if __name__ == "__main__":
    main()
