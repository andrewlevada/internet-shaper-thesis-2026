from __future__ import annotations

import os
import sys
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError, ViewportSize
from playwright.sync_api import sync_playwright

VIEWPORT = ViewportSize(width=1440, height=800)
SET_CONTENT_TIMEOUT_MS = 20_000
GOTO_TIMEOUT_MS = 60_000
DOCUMENT_URL_CONTENT_SELECTOR = "#contents, ytd-search, ytd-browse"
DOCUMENT_URL_CONTENT_TIMEOUT_MS = 30_000
DOCUMENT_URL_POST_LOAD_WAIT_MS = 15_000
POST_LOAD_WAIT_MS = 5_000


def _default_playwright_browsers_path() -> Path:
    env = os.environ.get("PLAYWRIGHT_BROWSERS_PATH")
    if env:
        return Path(env)
    home = Path.home()
    if sys.platform == "darwin":
        return home / "Library/Caches/ms-playwright"
    return home / ".cache/ms-playwright"


def _ensure_playwright_env() -> None:
    if not os.environ.get("PLAYWRIGHT_BROWSERS_PATH"):
        os.environ["PLAYWRIGHT_BROWSERS_PATH"] = str(_default_playwright_browsers_path())


def resolve_chromium_executable() -> str | None:
    explicit = os.environ.get("CHROME_PATH") or os.environ.get("PUPPETEER_EXECUTABLE_PATH")
    if explicit and Path(explicit).is_file():
        return explicit

    browsers_root = _default_playwright_browsers_path()
    if not browsers_root.is_dir():
        return None

    chromium_dirs = sorted(
        [p for p in browsers_root.glob("chromium-*") if p.is_dir()],
        key=lambda p: p.name,
        reverse=True,
    )
    for chromium_dir in chromium_dirs:
        for candidate in chromium_dir.glob("**/Google Chrome for Testing"):
            if candidate.is_file():
                return str(candidate)
    return None


def _document_url_matches(document_url: str, request_url: str) -> bool:
    doc = urlparse(document_url)
    req = urlparse(request_url)
    if doc.netloc and req.netloc and doc.netloc != req.netloc:
        return False
    if doc.path and req.path and not req.path.startswith(doc.path.rstrip("/")):
        return False
    return True


def _load_html_via_set_content(page, html: str, output_path: Path) -> None:
    try:
        page.set_content(
            html,
            wait_until="networkidle",
            timeout=SET_CONTENT_TIMEOUT_MS,
        )
    except PlaywrightTimeoutError:
        print(
            f"Warning: networkidle timeout for {output_path.name}; falling back to load",
            file=sys.stderr,
        )
        try:
            page.set_content(
                html,
                wait_until="load",
                timeout=SET_CONTENT_TIMEOUT_MS,
            )
        except PlaywrightTimeoutError:
            print(
                f"Warning: load timeout for {output_path.name}; capturing screenshot anyway",
                file=sys.stderr,
            )


def _load_html_via_document_url(page, html: str, document_url: str, output_path: Path) -> None:
    def handle_route(route) -> None:
        if (
            route.request.resource_type == "document"
            and _document_url_matches(document_url, route.request.url)
        ):
            route.fulfill(
                status=200,
                content_type="text/html; charset=utf-8",
                body=html,
            )
            return
        route.continue_()

    page.route("**/*", handle_route)
    try:
        page.goto(document_url, wait_until="networkidle", timeout=GOTO_TIMEOUT_MS)
    except PlaywrightTimeoutError:
        print(
            f"Warning: networkidle timeout for {output_path.name}; falling back to load",
            file=sys.stderr,
        )
        try:
            page.goto(document_url, wait_until="load", timeout=GOTO_TIMEOUT_MS)
        except PlaywrightTimeoutError:
            print(
                f"Warning: load timeout for {output_path.name}; capturing screenshot anyway",
                file=sys.stderr,
            )
    try:
        page.wait_for_selector(
            DOCUMENT_URL_CONTENT_SELECTOR,
            timeout=DOCUMENT_URL_CONTENT_TIMEOUT_MS,
        )
    except PlaywrightTimeoutError:
        print(
            f"Warning: content selector timeout for {output_path.name}; continuing",
            file=sys.stderr,
        )
    page.wait_for_timeout(DOCUMENT_URL_POST_LOAD_WAIT_MS)


def capture_screenshot(
    html: str,
    output_path: Path,
    *,
    document_url: str | None = None,
) -> None:
    _ensure_playwright_env()
    executable = resolve_chromium_executable()
    launch_kwargs: dict = {
        "headless": True,
        "args": ["--no-sandbox", "--disable-setuid-sandbox"],
    }
    if executable:
        launch_kwargs["executable_path"] = executable

    with sync_playwright() as p:
        browser = p.chromium.launch(**launch_kwargs)
        try:
            context = browser.new_context(
                viewport=VIEWPORT,
                user_agent=(
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/131.0.0.0 Safari/537.36"
                ),
            )
            page = context.new_page()
            if document_url:
                _load_html_via_document_url(page, html, document_url, output_path)
            else:
                _load_html_via_set_content(page, html, output_path)
            try:
                page.screenshot(path=str(output_path), full_page=False, timeout=60_000)
            except PlaywrightTimeoutError:
                print(
                    f"Warning: screenshot timeout for {output_path.name}; skipping",
                    file=sys.stderr,
                )
                return
            context.close()
        finally:
            browser.close()


def screenshot_variant(
    *,
    html_path: Path,
    output_path: Path,
    document_url: str | None = None,
) -> None:
    html = html_path.read_text(encoding="utf-8", errors="replace").strip()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    capture_screenshot(html, output_path, document_url=document_url)
