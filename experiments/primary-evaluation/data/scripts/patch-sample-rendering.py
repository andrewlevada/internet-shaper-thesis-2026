#!/usr/bin/env python3
"""Patch sample HTML so archived pages render again after CDN URL rotation.

Approaches (one per experiment sample):
  base-href              inject <base href> from task.json final-url
  set-content-url        mark task for Playwright route+goto replay at final-url
  refresh-assets-from-live  replace broken asset URLs using a fresh fetch of final-url
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

SCRIPT_DIR = Path(__file__).resolve().parent
DATA_DIR = SCRIPT_DIR.parent
SAMPLES_DIR = DATA_DIR / "samples"
LOGS_DIR = SCRIPT_DIR / "logs"

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36"
)

BASE_TAG_RE = re.compile(r"<base\b[^>]*>", re.IGNORECASE)
HEAD_RE = re.compile(r"(<head\b[^>]*>)", re.IGNORECASE)
PROTOCOL_RELATIVE_ATTR_RE = re.compile(
    r'(?P<prefix>\b(?:href|src|data-original-src)\s*=\s*["\'])//',
    re.IGNORECASE,
)
PLAYER_HASH_RE = re.compile(r"/s/player/([a-f0-9]+)/")
DESKTOP_HASH_RE = re.compile(r"/s/desktop/([a-f0-9]+)/")
YTB_SS_RE = re.compile(r"https://www\.youtube\.com/s/_/ytmainappweb/_/ss/k=[^\"'\s>]+")
YTB_JS_RE = re.compile(r"https://www\.youtube\.com/s/_/ytmainappweb/_/js/k=[^\"'\s>]+")
RESOURCE_URL_RE = re.compile(
    r"""(?P<prefix>\b(?:href|src|data-original-src)\s*=\s*["'])"""
    r"""(?P<url>(?:https?:)?//[^"']+|/[^"']+)"""
    r"""["']""",
    re.IGNORECASE,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Patch sample HTML rendering.")
    parser.add_argument(
        "--sample",
        required=True,
        help="Sample id, e.g. our-2/004",
    )
    parser.add_argument(
        "--approach",
        required=True,
        choices=[
            "base-href",
            "set-content-url",
            "refresh-assets-from-live",
            "set-content-url+refresh-assets-from-live",
        ],
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print planned changes without writing files.",
    )
    return parser.parse_args()


def sample_dir_for(sample_id: str) -> Path:
    path = SAMPLES_DIR / sample_id
    if not path.is_dir():
        print(f"Sample not found: {path}", file=sys.stderr)
        sys.exit(1)
    return path


def read_task(sample_dir: Path) -> dict:
    task_path = sample_dir / "task.json"
    if not task_path.is_file():
        print(f"Missing task.json: {task_path}", file=sys.stderr)
        sys.exit(1)
    return json.loads(task_path.read_text(encoding="utf-8"))


def document_url(task: dict) -> str:
    url = (task.get("final-url") or task.get("url") or "").strip()
    if not url:
        print("task.json has no final-url or url", file=sys.stderr)
        sys.exit(1)
    return url


def iter_variant_html_paths(sample_dir: Path) -> list[Path]:
    paths: list[Path] = []
    for child in sorted(sample_dir.iterdir()):
        if not child.is_dir() or child.name == "work":
            continue
        html_path = child / "index.html"
        if html_path.is_file():
            paths.append(html_path)
    return paths


def normalize_protocol_relative(html: str) -> tuple[str, int]:
    updated, count = PROTOCOL_RELATIVE_ATTR_RE.subn(r"\g<prefix>https://", html)
    return updated, count


def inject_base_href(html: str, base_url: str) -> tuple[str, str]:
    base_tag = f'<base href="{base_url}">'
    if BASE_TAG_RE.search(html):
        html, n = BASE_TAG_RE.subn(base_tag, html, count=1)
        action = "replaced base" if n else "unchanged base"
    elif HEAD_RE.search(html):
        html = HEAD_RE.sub(rf"\1{base_tag}", html, count=1)
        action = "inserted base"
    else:
        html = base_tag + html
        action = "prepended base (no head)"
    html, proto_count = normalize_protocol_relative(html)
    if proto_count:
        action += f", protocol-relative→https×{proto_count}"
    return html, action


def fetch_live_html(url: str) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8", errors="replace")


def head_ok(url: str) -> bool:
    if url.startswith("/"):
        return False
    if url.startswith("//"):
        url = "https:" + url
    request = urllib.request.Request(
        url,
        method="HEAD",
        headers={"User-Agent": USER_AGENT},
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return 200 <= response.status < 400
    except urllib.error.HTTPError as exc:
        return 200 <= exc.code < 400
    except urllib.error.URLError:
        return False


def resolve_url(url: str, origin: str) -> str:
    if url.startswith("//"):
        return "https:" + url
    if url.startswith("/"):
        from urllib.parse import urljoin

        return urljoin(origin, url)
    return url


def extract_resource_urls(html: str, origin: str) -> set[str]:
    urls: set[str] = set()
    for match in RESOURCE_URL_RE.finditer(html):
        raw = match.group("url")
        if raw.startswith("//"):
            urls.add("https:" + raw)
        elif raw.startswith("/"):
            from urllib.parse import urljoin

            urls.add(urljoin(origin, raw))
        elif raw.startswith("http"):
            urls.add(raw)
    return urls


def build_live_replacement_map(live_html: str, origin: str) -> dict[str, str]:
    replacements: dict[str, str] = {}

    live_ss = YTB_SS_RE.search(live_html)
    live_js = YTB_JS_RE.search(live_html)
    if live_ss:
        replacements["__YTB_SS__"] = live_ss.group(0)
    if live_js:
        replacements["__YTB_JS__"] = live_js.group(0)

    live_players = PLAYER_HASH_RE.findall(live_html)
    live_desktops = DESKTOP_HASH_RE.findall(live_html)
    if live_players:
        replacements["__PLAYER_HASH__"] = live_players[0]
    if live_desktops:
        replacements["__DESKTOP_HASH__"] = live_desktops[0]

    live_resources = extract_resource_urls(live_html, origin)
    by_suffix: dict[str, str] = {}
    for url in live_resources:
        suffix = url.split("?", 1)[0].rsplit("/", 1)[-1]
        if suffix:
            by_suffix[suffix] = url

    replacements["__SUFFIX_MAP__"] = by_suffix  # type: ignore[assignment]
    return replacements


def apply_live_replacements(
    html: str,
    replacements: dict[str, str],
    *,
    broken_cache: dict[str, bool] | None = None,
) -> tuple[str, list[str]]:
    notes: list[str] = []

    if "__YTB_SS__" in replacements:
        new_ss = replacements["__YTB_SS__"]
        html, n = YTB_SS_RE.subn(new_ss, html)
        if n:
            notes.append(f"ytmainappweb ss×{n}")

    if "__YTB_JS__" in replacements:
        new_js = replacements["__YTB_JS__"]
        html, n = YTB_JS_RE.subn(new_js, html)
        if n:
            notes.append(f"ytmainappweb js×{n}")

    player_hash = replacements.get("__PLAYER_HASH__")
    if player_hash:
        html, n = PLAYER_HASH_RE.subn(f"/s/player/{player_hash}/", html)
        if n:
            notes.append(f"player hash×{n}")

    desktop_hash = replacements.get("__DESKTOP_HASH__")
    if desktop_hash:
        html, n = DESKTOP_HASH_RE.subn(f"/s/desktop/{desktop_hash}/", html)
        if n:
            notes.append(f"desktop hash×{n}")

    suffix_map: dict[str, str] = replacements.get("__SUFFIX_MAP__", {})  # type: ignore[assignment]
    origin = replacements.get("__ORIGIN__", "")

    if broken_cache is None:
        broken_cache = {}

    broken_urls: set[str] = set()
    for url in extract_resource_urls(html, origin):
        resolved = resolve_url(url, origin) if url.startswith(("/", "//")) else url
        if resolved in broken_cache:
            if not broken_cache[resolved]:
                broken_urls.add(resolved)
            continue
        ok = head_ok(resolved)
        broken_cache[resolved] = ok
        if not ok:
            broken_urls.add(resolved)

    for old_url in sorted(broken_urls, key=len, reverse=True):
        suffix = old_url.split("?", 1)[0].rsplit("/", 1)[-1]
        new_url = suffix_map.get(suffix)
        if not new_url or new_url == old_url:
            continue
        if new_url not in broken_cache:
            broken_cache[new_url] = head_ok(new_url)
        if broken_cache[new_url]:
            html = html.replace(old_url, new_url)
            notes.append(f"{suffix}: live replacement")

    html, proto_count = normalize_protocol_relative(html)
    if proto_count:
        notes.append(f"protocol-relative→https×{proto_count}")

    return html, notes


def patch_base_href(sample_dir: Path, task: dict, *, dry_run: bool) -> list[str]:
    base_url = document_url(task)
    log: list[str] = [f"base href: {base_url}"]
    for html_path in iter_variant_html_paths(sample_dir):
        html = html_path.read_text(encoding="utf-8", errors="replace")
        patched, action = inject_base_href(html, base_url)
        rel = html_path.relative_to(sample_dir)
        log.append(f"  {rel}: {action}")
        if not dry_run and patched != html:
            html_path.write_text(patched, encoding="utf-8")

    task = dict(task)
    task["render-approach"] = "base-href"
    task["render-patched-at"] = int(datetime.now(timezone.utc).timestamp() * 1000)
    log.append("  task.json: render-approach=base-href")
    if not dry_run:
        (sample_dir / "task.json").write_text(
            json.dumps(task, indent="\t", ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
    return log


def patch_set_content_url(sample_dir: Path, task: dict, *, dry_run: bool) -> list[str]:
    url = document_url(task)
    log = [
        "set-content-url: HTML unchanged; screenshot replay uses Playwright route+goto at final-url",
        f"  document url: {url}",
    ]
    task = dict(task)
    task["render-approach"] = "set-content-url"
    task["render-document-url"] = url
    task["render-patched-at"] = int(datetime.now(timezone.utc).timestamp() * 1000)
    log.append("  task.json: render-approach=set-content-url")
    if not dry_run:
        (sample_dir / "task.json").write_text(
            json.dumps(task, indent="\t", ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
    return log


def patch_set_content_url_with_refresh(
    sample_dir: Path, task: dict, *, dry_run: bool
) -> list[str]:
    origin = document_url(task)
    log = [
        "set-content-url+refresh-assets-from-live: refresh HTML assets, replay via route+goto",
        f"  document url: {origin}",
        f"refresh-assets-from-live: fetching {origin}",
    ]
    live_html = fetch_live_html(origin)
    replacements = build_live_replacement_map(live_html, origin)
    replacements["__ORIGIN__"] = origin
    broken_cache: dict[str, bool] = {}

    for html_path in iter_variant_html_paths(sample_dir):
        html = html_path.read_text(encoding="utf-8", errors="replace")
        patched, notes = apply_live_replacements(
            html,
            replacements,
            broken_cache=broken_cache,
        )
        rel = html_path.relative_to(sample_dir)
        summary = ", ".join(notes) if notes else "no changes"
        log.append(f"  {rel}: {summary}")
        if not dry_run and patched != html:
            html_path.write_text(patched, encoding="utf-8")

    task = dict(task)
    task["render-approach"] = "set-content-url+refresh-assets-from-live"
    task["render-document-url"] = origin
    task["render-patched-at"] = int(datetime.now(timezone.utc).timestamp() * 1000)
    log.append("  task.json: render-approach=set-content-url+refresh-assets-from-live")
    if not dry_run:
        (sample_dir / "task.json").write_text(
            json.dumps(task, indent="\t", ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
    return log


def patch_refresh_assets(sample_dir: Path, task: dict, *, dry_run: bool) -> list[str]:
    origin = document_url(task)
    log = [f"refresh-assets-from-live: fetching {origin}"]
    live_html = fetch_live_html(origin)
    replacements = build_live_replacement_map(live_html, origin)
    replacements["__ORIGIN__"] = origin
    broken_cache: dict[str, bool] = {}

    for html_path in iter_variant_html_paths(sample_dir):
        html = html_path.read_text(encoding="utf-8", errors="replace")
        patched, notes = apply_live_replacements(
            html,
            replacements,
            broken_cache=broken_cache,
        )
        rel = html_path.relative_to(sample_dir)
        summary = ", ".join(notes) if notes else "no changes"
        log.append(f"  {rel}: {summary}")
        if not dry_run and patched != html:
            html_path.write_text(patched, encoding="utf-8")

    task = dict(task)
    task["render-approach"] = "refresh-assets-from-live"
    task["render-patched-at"] = int(datetime.now(timezone.utc).timestamp() * 1000)
    log.append("  task.json: render-approach=refresh-assets-from-live")
    if not dry_run:
        (sample_dir / "task.json").write_text(
            json.dumps(task, indent="\t", ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
    return log


def write_log(sample_id: str, approach: str, lines: Iterable[str], *, dry_run: bool) -> Path:
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%S.%f+00-00")
    suffix = "dry-run" if dry_run else "applied"
    path = LOGS_DIR / f"{ts}-patch-sample-rendering-{sample_id.replace('/', '-')}-{approach}-{suffix}.log"
    body = "\n".join(
        [
            "Patch sample rendering",
            f"sample: {sample_id}",
            f"approach: {approach}",
            f"dry-run: {dry_run}",
            "",
            *lines,
            "",
        ]
    )
    path.write_text(body, encoding="utf-8")
    return path


def main() -> None:
    args = parse_args()
    sample_dir = sample_dir_for(args.sample)
    task = read_task(sample_dir)

    if args.approach == "base-href":
        lines = patch_base_href(sample_dir, task, dry_run=args.dry_run)
    elif args.approach == "set-content-url":
        lines = patch_set_content_url(sample_dir, task, dry_run=args.dry_run)
    elif args.approach == "set-content-url+refresh-assets-from-live":
        lines = patch_set_content_url_with_refresh(
            sample_dir, task, dry_run=args.dry_run
        )
    else:
        lines = patch_refresh_assets(sample_dir, task, dry_run=args.dry_run)

    log_path = write_log(args.sample, args.approach, lines, dry_run=args.dry_run)
    print("\n".join(lines))
    print(f"\nLog: {log_path}")


if __name__ == "__main__":
    main()
