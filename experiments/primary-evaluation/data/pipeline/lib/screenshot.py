from __future__ import annotations

import os
import sys
from pathlib import Path

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError, ViewportSize
from playwright.sync_api import sync_playwright

VIEWPORT = ViewportSize(width=1440, height=800)
SET_CONTENT_TIMEOUT_MS = 30_000


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


def capture_screenshot(html: str, output_path: Path) -> None:
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
                page.set_content(
                    html,
                    wait_until="load",
                    timeout=SET_CONTENT_TIMEOUT_MS,
                )
            page.screenshot(path=str(output_path), full_page=False)
            context.close()
        finally:
            browser.close()


def screenshot_variant(
    *,
    html_path: Path,
    output_path: Path,
) -> None:
    html = html_path.read_text(encoding="utf-8", errors="replace").strip()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    capture_screenshot(html, output_path)
