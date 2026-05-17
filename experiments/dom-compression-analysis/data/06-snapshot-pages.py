#!/usr/bin/env python3

from __future__ import annotations

import argparse
import csv
import shutil
import sys
from pathlib import Path

from browser_utils import accept_cookies, wait_post_load
from playwright.sync_api import Page
from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import ViewportSize
from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
INPUT_CSV = HERE / "05-smapled-pages.csv"
SNAPSHOTS_DIR = HERE / "raw-snapshots"
MANIFEST_CSV = SNAPSHOTS_DIR / "data.csv"

NAV_TIMEOUT_MS = 30_000
POST_LOAD_WAIT_MS = 6_000
VIEWPORT: ViewportSize = {"width": 1440, "height": 800}
FOLDER_WIDTH = 3

MANIFEST_FIELDS = [
    "folder",
    "url",
    "final_url",
    "seed_domain",
]

Row = dict[str, str]


def main() -> None:
    args = parse_args()

    if not INPUT_CSV.is_file():
        print(f"Missing input CSV: {INPUT_CSV}", file=sys.stderr)
        sys.exit(1)

    input_rows = read_input_rows(INPUT_CSV)
    SNAPSHOTS_DIR.mkdir(exist_ok=True)

    manifest_rows = read_manifest_rows()
    manual_patch_folders = parse_manual_patch(args.manual_patch)
    headless = manual_patch_folders is None

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=headless,
            args=["--no-sandbox", "--disable-setuid-sandbox"],
        )
        context = browser.new_context(
            viewport=VIEWPORT,
            user_agent=chromium_user_agent(browser.version, headless=headless),
            locale="en-US",
        )
        tab = context.new_page()

        try:
            if manual_patch_folders is None:
                capture_new_snapshots(tab, input_rows, manifest_rows)
            else:
                patch_snapshots_manually(tab, manifest_rows, manual_patch_folders)
        finally:
            context.close()
            browser.close()

    print("Done")
    print(f"Wrote {MANIFEST_CSV} ({len(manifest_rows)} rows)")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Capture HTML and screenshots for sampled pages.",
    )
    parser.add_argument(
        "--manual-patch",
        metavar="FOLDERS",
        help=(
            "Comma-separated snapshot folders to recapture in headed mode, "
            "for example: --manual-patch 1,5,6,8,30"
        ),
    )
    return parser.parse_args()


def parse_manual_patch(value: str | None) -> list[str] | None:
    if value is None:
        return None

    folders: list[str] = []
    seen: set[str] = set()

    for raw_part in value.split(","):
        part = raw_part.strip()
        if not part:
            print(f"Invalid --manual-patch value: {value}", file=sys.stderr)
            sys.exit(1)
        if not part.isdigit() or int(part) <= 0:
            print(f"Invalid snapshot folder number: {part}", file=sys.stderr)
            sys.exit(1)

        folder_name = format_folder_name(int(part))
        if folder_name not in seen:
            folders.append(folder_name)
            seen.add(folder_name)

    if not folders:
        print("--manual-patch requires at least one folder number", file=sys.stderr)
        sys.exit(1)

    return folders


def capture_new_snapshots(tab: Page, input_rows: list[Row], manifest_rows: list[Row]) -> None:
    next_idx = next_folder_index(manifest_rows)

    for row in input_rows:
        folder_name = format_folder_name(next_idx)
        ok = capture_snapshot(tab, row, folder_name)
        if not ok:
            continue

        manifest_rows.append(
            {
                "folder": folder_name,
                "url": row.get("url", ""),
                "final_url": tab.url,
                "seed_domain": row.get("seed_domain", ""),
            }
        )
        write_manifest_rows(manifest_rows)
        next_idx += 1


def patch_snapshots_manually(
    tab: Page,
    manifest_rows: list[Row],
    folder_names: list[str],
) -> None:
    rows_by_folder = {row.get("folder", ""): row for row in manifest_rows}
    missing = [folder_name for folder_name in folder_names if folder_name not in rows_by_folder]
    if missing:
        print(
            f"Cannot patch folders missing from {MANIFEST_CSV}: {', '.join(missing)}",
            file=sys.stderr,
        )
        sys.exit(1)

    for folder_name in folder_names:
        row = rows_by_folder[folder_name]
        ok = capture_snapshot(
            tab,
            row,
            folder_name,
            replace_existing=True,
            manual=True,
        )
        if not ok:
            continue

        replace_manifest_row(
            manifest_rows,
            folder_name,
            {
                "folder": folder_name,
                "url": row.get("url", ""),
                "final_url": tab.url,
                "seed_domain": row.get("seed_domain", ""),
            },
        )
        write_manifest_rows(manifest_rows)


def read_input_rows(path: Path) -> list[Row]:
    with path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        if reader.fieldnames is None:
            print("CSV has no header", file=sys.stderr)
            sys.exit(1)
        return list(reader)


def read_manifest_rows() -> list[Row]:
    if not MANIFEST_CSV.is_file():
        return []

    with MANIFEST_CSV.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        if reader.fieldnames is None:
            print(f"Warning: {MANIFEST_CSV} has no header; starting a new manifest", file=sys.stderr)
            return []
        return list(reader)


def next_folder_index(manifest_rows: list[Row]) -> int:
    indexes: list[int] = []

    for row in manifest_rows:
        folder = row.get("folder", "")
        if folder.isdigit():
            indexes.append(int(folder))

    for child in SNAPSHOTS_DIR.iterdir():
        if child.is_dir() and child.name.isdigit():
            indexes.append(int(child.name))

    return max(indexes, default=0) + 1


def format_folder_name(index: int) -> str:
    return str(index).zfill(FOLDER_WIDTH)


def chromium_user_agent(chromium_version: str, *, headless: bool) -> str:
    chrome_product = "HeadlessChrome" if headless else "Chrome"
    return (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        f"AppleWebKit/537.36 (KHTML, like Gecko) {chrome_product}/{chromium_version} "
        "Safari/537.36"
    )


def capture_snapshot(
    tab: Page,
    row: Row,
    folder_name: str,
    *,
    replace_existing: bool = False,
    manual: bool = False,
) -> bool:
    url = row.get("url", "").strip()
    if not url:
        print(f"Warning: skipping row without url: {row}", file=sys.stderr)
        return False

    final_dir = SNAPSHOTS_DIR / folder_name
    temp_dir = SNAPSHOTS_DIR / f".{folder_name}.tmp"
    cleanup_dir(temp_dir)

    try:
        print(f"Capturing {folder_name}: {url}")
        temp_dir.mkdir()

        try:
            tab.goto(url, wait_until="load", timeout=NAV_TIMEOUT_MS)
        except PlaywrightTimeoutError:
            print(
                f"Warning: navigation timed out for {url}; continuing with partially loaded page",
                file=sys.stderr,
            )

        try:
            accept_cookies(tab, post_click_wait_ms=POST_LOAD_WAIT_MS)
        except Exception as e:
            print(f"Warning: cookie click failed for {url}: {e}", file=sys.stderr)

        if manual and not wait_for_manual_continue(folder_name, url):
            cleanup_dir(temp_dir)
            return False

        try:
            wait_post_load(tab, POST_LOAD_WAIT_MS)
        except Exception as e:
            print(f"Warning: post-load wait failed for {url}: {e}", file=sys.stderr)

        raw_html = tab.evaluate("() => document.documentElement.outerHTML")
        visible_html = tab.evaluate(VISIBLE_HTML_CAPTURE_SCRIPT)

        write_text(temp_dir / "raw.html", raw_html)
        write_text(temp_dir / "visible.html", visible_html)
        tab.screenshot(path=temp_dir / "screenshot.png")

        if final_dir.exists():
            if not replace_existing:
                raise RuntimeError(f"snapshot folder already exists: {final_dir}")
            cleanup_dir(final_dir)
        temp_dir.rename(final_dir)
        return True
    except Exception as e:
        print(f"Warning: failed to capture {url}: {e}", file=sys.stderr)
        cleanup_dir(temp_dir)
        return False


def wait_for_manual_continue(folder_name: str, url: str) -> bool:
    print()
    print(f"Manual patch {folder_name}: {url}")
    print("Solve any CAPTCHA or consent flow in the browser, then press Enter to capture.")
    response = input("Press Enter to capture, or type s to skip this folder: ").strip().lower()
    return response not in {"s", "skip"}


def write_text(path: Path, value: str) -> None:
    path.write_text(value, encoding="utf-8")


def cleanup_dir(path: Path) -> None:
    if path.exists():
        shutil.rmtree(path)


def write_manifest_rows(rows: list[Row]) -> None:
    with MANIFEST_CSV.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=MANIFEST_FIELDS, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def replace_manifest_row(rows: list[Row], folder_name: str, replacement: Row) -> None:
    for index, row in enumerate(rows):
        if row.get("folder", "") == folder_name:
            rows[index] = replacement
            return

    raise RuntimeError(f"manifest row not found for folder {folder_name}")


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


if __name__ == "__main__":
    main()
