"""Shared Playwright snapshot capture helpers."""

from __future__ import annotations

import email
import quopri
import shutil
from pathlib import Path

from browser_utils import accept_cookies, wait_post_load
from playwright.sync_api import Page
from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import ViewportSize

NAV_TIMEOUT_MS = 30_000
POST_LOAD_WAIT_MS = 6_000
MANUAL_CAPTURE_WAIT_MS = 45_000
VIEWPORT: ViewportSize = {"width": 1440, "height": 800}

VISIBLE_HTML_CAPTURE_SCRIPT = r"""
() => {
    function computedStyle(el) {
        const view = el.ownerDocument.defaultView;
        if (!view) throw new Error("Element has no defaultView for getComputedStyle");
        return view.getComputedStyle(el);
    }

    function computedOpacityIsZero(cs) {
        const raw = cs.opacity?.trim() ?? "";
        if (raw === "") return false;
        const n = Number.parseFloat(raw);
        return Number.isFinite(n) && n === 0;
    }

    function childNodePathFromRoot(root, node) {
        const path = [];
        let current = node;

        while (current && current !== root) {
            const parent = current.parentNode;
            if (!parent) return null;
            path.push([...parent.childNodes].indexOf(current));
            current = parent;
        }

        if (current !== root) return null;
        return path.reverse();
    }

    function nodeAtChildNodePath(root, path) {
        let current = root;

        for (const index of path) {
            current = current.childNodes[index];
            if (!current) return null;
        }

        return current;
    }

    function hiddenStripRootPaths(body) {
        const paths = [];

        function visit(el, inDisplayNoneSubtree) {
            const cs = computedStyle(el);
            const inDisplayNone = inDisplayNoneSubtree || cs.display === "none";
            const strip =
                inDisplayNone || cs.visibility === "hidden" || computedOpacityIsZero(cs);

            if (strip) {
                const path = childNodePathFromRoot(document.documentElement, el);
                if (path) paths.push(path);
                return;
            }

            for (const child of el.children) {
                visit(child, inDisplayNone);
            }
        }

        for (const child of body.children) {
            visit(child, false);
        }

        return paths;
    }

    const htmlEl = document.documentElement;
    if (!htmlEl) return "";
    if (!document.body) return htmlEl.outerHTML;

    const clone = htmlEl.cloneNode(true);
    const stripNodes = hiddenStripRootPaths(document.body)
        .map((path) => nodeAtChildNodePath(clone, path))
        .filter(Boolean);

    for (const node of stripNodes) {
        node.remove();
    }

    return clone.outerHTML;
}
"""


def chromium_user_agent(chromium_version: str, *, headless: bool) -> str:
    chrome_product = "HeadlessChrome" if headless else "Chrome"
    return (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        f"AppleWebKit/537.36 (KHTML, like Gecko) {chrome_product}/{chromium_version} "
        "Safari/537.36"
    )


def wait_for_manual_continue(
    tab: Page,
    folder_name: str,
    url: str,
    *,
    wait_ms: int = MANUAL_CAPTURE_WAIT_MS,
) -> None:
    wait_s = wait_ms // 1000
    print()
    print(f"Manual capture {folder_name}: {url}")
    print(
        f"Interact with the browser if needed (CAPTCHA, consent); "
        f"capturing in {wait_s} seconds...",
        flush=True,
    )
    tab.wait_for_timeout(wait_ms)


def cleanup_dir(path: Path) -> None:
    if path.exists():
        shutil.rmtree(path)


def _extract_page_html(mhtml_path: Path) -> str:
    """Return the QP-decoded HTML of the first text/html part in an MHTML file."""
    raw = mhtml_path.read_bytes()
    msg = email.message_from_bytes(raw)
    for part in msg.walk():
        if part.get_content_type() == "text/html":
            payload = part.get_payload(decode=False)
            if isinstance(payload, bytes):
                return payload.decode(part.get_content_charset() or "utf-8", errors="replace")
            if isinstance(payload, str):
                encoding = part.get("Content-Transfer-Encoding", "").lower()
                if encoding == "quoted-printable":
                    decoded = quopri.decodestring(payload.encode("ascii", errors="replace"))
                    return decoded.decode(part.get_content_charset() or "utf-8", errors="replace")
                return payload
    raise ValueError(f"No text/html part found in {mhtml_path}")


def recapture_snapshot(
    tab: Page,
    url: str,
    dest_dir: Path,
    *,
    replace_existing: bool = True,
    manual: bool = False,
    label: str | None = None,
) -> tuple[bool, str]:
    """Navigate to url and write raw.html, visible.html, screenshot.png into dest_dir.

    Returns (success, final_url).
    """
    url = url.strip()
    if not url:
        print(f"Warning: skipping capture without url (dest={dest_dir})", flush=True)
        return False, ""

    display_label = label or dest_dir.name
    parent_dir = dest_dir.parent
    temp_dir = parent_dir / f".{dest_dir.name}.tmp"
    cleanup_dir(temp_dir)

    try:
        print(f"Capturing {display_label}: {url}", flush=True)
        temp_dir.mkdir(parents=True)

        try:
            tab.goto(url, wait_until="load", timeout=NAV_TIMEOUT_MS)
        except PlaywrightTimeoutError:
            print(
                f"Warning: navigation timed out for {url}; continuing with partially loaded page",
                flush=True,
            )

        try:
            accept_cookies(tab, post_click_wait_ms=POST_LOAD_WAIT_MS)
        except Exception as exc:
            print(f"Warning: cookie click failed for {url}: {exc}", flush=True)

        if manual:
            wait_for_manual_continue(tab, display_label, url)

        try:
            wait_post_load(tab, POST_LOAD_WAIT_MS)
        except Exception as exc:
            print(f"Warning: post-load wait failed for {url}: {exc}", flush=True)

        raw_html = tab.evaluate("() => document.documentElement.outerHTML")
        visible_html = tab.evaluate(VISIBLE_HTML_CAPTURE_SCRIPT)

        cdp = tab.context.new_cdp_session(tab)
        try:
            mhtml_result = cdp.send("Page.captureSnapshot", {"format": "mhtml"})
            mhtml_content = mhtml_result["data"]
        finally:
            cdp.detach()

        (temp_dir / "raw.html").write_text(raw_html, encoding="utf-8")
        (temp_dir / "visible.html").write_text(visible_html, encoding="utf-8")
        mhtml_path = temp_dir / "raw.mhtml"
        mhtml_path.write_text(mhtml_content, encoding="utf-8")
        (temp_dir / "page.html").write_text(_extract_page_html(mhtml_path), encoding="utf-8")
        tab.screenshot(path=temp_dir / "screenshot.png")

        if dest_dir.exists():
            if not replace_existing:
                raise RuntimeError(f"snapshot folder already exists: {dest_dir}")
            cleanup_dir(dest_dir)
        temp_dir.rename(dest_dir)
        return True, tab.url
    except Exception as exc:
        print(f"Warning: failed to capture {url}: {exc}", flush=True)
        cleanup_dir(temp_dir)
        return False, tab.url
