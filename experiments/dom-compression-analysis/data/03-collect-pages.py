#!/usr/bin/env python3

from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path
from urllib.parse import urlparse
import tldextract

from browser_utils import accept_cookies, wait_post_load
from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
INPUT_CSV = HERE / "02-adjusted-top-25.csv"
UNSAMPLED_OUTPUT_CSV = HERE / "03-pages.csv"
DEBUG_DIR = HERE / "debug"

NAV_TIMEOUT_MS = 30_000
POST_LOAD_WAIT_MS = 6_000
DOMAIN_EXTRACTOR = tldextract.TLDExtract(suffix_list_urls=(), cache_dir=None)

OUT_FIELDS = [
    "url",
    "link_kind",
    "seed_domain",
]


def main() -> None:
    args = parse_args()

    if not INPUT_CSV.is_file():
        print(f"hey hey, there's no input: {INPUT_CSV}", file=sys.stderr)
        sys.exit(1)

    homepages = read_input_homepages()

    if args.patch:
        homepages = [find_patch_homepage(homepages, args.patch)]

    DEBUG_DIR.mkdir(exist_ok=True)

    unsampled_pages: list[dict[str, str]] = []

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=False,
            args=["--no-sandbox", "--disable-setuid-sandbox"],
        )
        context = browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            ),
            locale="en-US",
        )
        tab = context.new_page()

        try:
            for homepage in homepages:
                new_unsampled_pages = sample_homepage(tab, homepage)
                unsampled_pages.extend(new_unsampled_pages)

        finally:
            context.close()
            browser.close()

    if args.patch:
        unsampled_pages = patch_existing_outputs(
            homepages[0], unsampled_pages
        )
    else:
        write_rows(UNSAMPLED_OUTPUT_CSV, OUT_FIELDS, unsampled_pages)

    print("Done")
    print(f"Wrote {UNSAMPLED_OUTPUT_CSV} ({len(unsampled_pages)} rows)")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Collect same-host links and sample popular pages."
    )
    parser.add_argument(
        "--patch",
        metavar="DOMAIN",
        help=(
            "only re-process one input website and preserve all existing output rows "
            "for other websites"
        ),
    )
    return parser.parse_args()


def read_input_homepages() -> list[dict[str, str]]:
    homepages: list[dict[str, str]] = []
    with INPUT_CSV.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        if fieldnames is None:
            print("CSV has no header", file=sys.stderr)
            sys.exit(1)
        for homepage in reader:
            homepages.append(homepage)
    return homepages


def find_patch_homepage(
    homepages: list[dict[str, str]], patch_target: str
) -> dict[str, str]:
    matches = [
        homepage
        for homepage in homepages
        if homepage_matches_patch_target(homepage, patch_target)
    ]

    if not matches:
        print(f"No input website matched --patch {patch_target!r}", file=sys.stderr)
        sys.exit(1)

    if len(matches) > 1:
        domains = ", ".join(homepage.get("domain", "") for homepage in matches)
        print(
            f"--patch {patch_target!r} matched multiple input websites: {domains}",
            file=sys.stderr,
        )
        sys.exit(1)

    return matches[0]


def homepage_matches_patch_target(
    homepage: dict[str, str], patch_target: str
) -> bool:
    homepage_path = homepage.get("domain", "")
    if not homepage_path:
        return False

    normalized_target = normalize_patch_target(patch_target)
    normalized_homepage = normalize_patch_target(homepage_path)

    return (
        normalized_target == normalized_homepage
        or same_domain(
            urlparse(normalized_target).hostname,
            urlparse(normalized_homepage).hostname,
        )
    )


def normalize_patch_target(target: str) -> str:
    if "://" not in target:
        target = f"https://{target}"
    return normalize_url(target)


def sample_homepage(
    tab, homepage: dict[str, str]
) -> list[dict[str, str]]:
    homepage_path: str | None = homepage.get("domain")  # the column is called domain but it may have domain + path
    if homepage_path is None:
        return []

    homepage_url = f"https://{homepage_path}"
    print(f"🔬 {homepage_url}")

    unsampled_pages: list[dict[str, str]] = []

    try:
        try:
            tab.goto(
                homepage_url,
                wait_until="load",
                timeout=NAV_TIMEOUT_MS,
            )
        except PlaywrightTimeoutError:
            print("Navigation timed out; continuing with partially loaded page")

        try:
            accept_cookies(tab, post_click_wait_ms=POST_LOAD_WAIT_MS)
        except Exception as e:
            print(f"Cookie click failed: {e}")

        try:
            wait_post_load(tab, POST_LOAD_WAIT_MS)
        except Exception as e:
            print(f"Post-load wait failed: {e}")

        try:
            # Screenshot for debug
            tab.screenshot(
                path=DEBUG_DIR / f"{homepage.get('country_rank')}-{homepage_path.replace('/', '_')}.png"
            )
        except Exception as e:
            print(f"Screenshot failed: {e}")

        hrefs: list[str] = []
        try:
            hrefs = tab.evaluate(
                """() => Array.from(document.querySelectorAll('a[href]'))
                    .map(a => a.href)"""
            )
        except Exception as e:
            print(f"Link collection failed: {e}")

        pool = collect_same_host_hrefs(homepage_url, hrefs)
        print(f"Found {len(pool)} links")

        meta = make_output_meta(homepage_url)

        homepage_row = {
            "url": homepage_url,
            "link_kind": "homepage",
            **meta,
        }
        unsampled_pages.append(homepage_row)

        for u in sorted(pool):
            if normalize_url(u) == normalize_url(homepage_url):
                continue
            unsampled_pages.append(
                {
                    "url": u,
                    "link_kind": "internal_pool",
                    **meta,
                }
            )

    except Exception as e:
        print(f"Error: {e}")

        meta = make_output_meta(homepage_url)
        homepage_row = {
            "url": homepage_url,
            "link_kind": "homepage",
            **meta,
        }
        unsampled_pages.append(homepage_row)

    return unsampled_pages


def patch_existing_outputs(
    homepage: dict[str, str],
    unsampled_pages: list[dict[str, str]],
) -> list[dict[str, str]]:
    if not UNSAMPLED_OUTPUT_CSV.is_file():
        print(
            "--patch needs existing 03 output CSVs to preserve other rows",
            file=sys.stderr,
        )
        sys.exit(1)

    homepage_url = f"https://{homepage.get('domain', '')}"

    unsampled_fields, existing_unsampled_pages = read_output_rows(UNSAMPLED_OUTPUT_CSV)

    patched_unsampled_pages = replace_homepage_rows(
        existing_unsampled_pages, unsampled_pages, homepage_url
    )

    write_rows(UNSAMPLED_OUTPUT_CSV, unsampled_fields, patched_unsampled_pages)

    print(
        f"Patched {homepage_url}: "
        f"{len(unsampled_pages)} rows"
    )

    return patched_unsampled_pages


def read_output_rows(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    with path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        if fieldnames is None:
            print(f"{path} has no header", file=sys.stderr)
            sys.exit(1)
        return list(fieldnames), list(reader)


def replace_homepage_rows(
    existing_rows: list[dict[str, str]],
    replacement_rows: list[dict[str, str]],
    homepage_url: str,
) -> list[dict[str, str]]:
    first_match_idx: int | None = None
    preserved_rows: list[dict[str, str]] = []

    for row in existing_rows:
        if row_belongs_to_homepage(row, homepage_url):
            if first_match_idx is None:
                first_match_idx = len(preserved_rows)
            continue
        preserved_rows.append(row)

    insert_idx = first_match_idx if first_match_idx is not None else len(preserved_rows)
    return (
        preserved_rows[:insert_idx]
        + replacement_rows
        + preserved_rows[insert_idx:]
    )


def row_belongs_to_homepage(row: dict[str, str], homepage_url: str) -> bool:
    row_homepage = (
        row.get("sampled_from_homepage")
        or row.get("seed_domain")
        or (row.get("url") if row.get("link_kind") == "homepage" else "")
    )
    if not row_homepage:
        return False
    return normalize_url(row_homepage) == normalize_url(homepage_url)


def write_rows(path: Path, fieldnames: list[str], rows: list[dict[str, str]]) -> None:
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def make_output_meta(
    homepage_url: str
) -> dict[str, str]:
    return {
        "seed_domain": homepage_url,
    }


def collect_same_host_hrefs(page_url: str, hrefs: list[str]) -> set[str]:
    page_host = urlparse(page_url).hostname

    out: set[str] = set()
    for raw in hrefs:
        if not raw or raw.startswith(("javascript:", "mailto:", "tel:", "#")):
            continue

        try:
            parsed = urlparse(raw)
            parsed = urlparse(f"{parsed.scheme}://{parsed.hostname}{parsed.path}")
        except ValueError:
            continue

        scheme = (parsed.scheme or "").lower()
        if scheme not in ("http", "https"):
            continue

        if not same_domain(parsed.hostname, page_host):
            continue

        out.add(parsed.geturl().rstrip("/") or parsed.geturl())

    return out


def same_domain(host_a: str | None, host_b: str | None) -> bool:
    return registrable_domain(host_a) == registrable_domain(host_b)


def registrable_domain(host: str | None) -> str:
    normalized = normalize_host(host).rstrip(".")
    if not normalized:
        return ""

    parsed = DOMAIN_EXTRACTOR(normalized)
    if parsed.domain and parsed.suffix:
        return f"{parsed.domain}.{parsed.suffix}"

    return normalized


def normalize_host(host: str | None) -> str:
    if not host:
        return ""

    h = host.lower()
    if h.startswith("www."):
        return h[4:]

    return h


def normalize_url(url: str) -> str:
    parsed = urlparse(url)
    path = parsed.path.rstrip("/")
    query = f"?{parsed.query}" if parsed.query else ""
    return f"{parsed.scheme.lower()}://{normalize_host(parsed.hostname)}{path}{query}"


if __name__ == "__main__":
    main()
