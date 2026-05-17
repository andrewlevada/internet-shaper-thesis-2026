#!/usr/bin/env python3

from __future__ import annotations

import csv
import random
import sys
from pathlib import Path
from urllib.parse import urlparse

from browser_utils import accept_cookies, wait_post_load
from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright

SEED = 283798
RNG = random.Random(SEED)

HERE = Path(__file__).resolve().parent
INPUT_CSV = HERE / "02-adjusted-top-25.csv"
SAMPLED_OUTPUT_CSV = HERE / "03-popular-pages-sample.csv"
UNSAMPLED_OUTPUT_CSV = HERE / "03-popular-pages-unsampled.csv"
DEBUG_DIR = HERE / "debug"

NAV_TIMEOUT_MS = 30_000
POST_LOAD_WAIT_MS = 6_000


def main() -> None:
    if not INPUT_CSV.is_file():
        print(f"hey hey, there's no input: {INPUT_CSV}", file=sys.stderr)
        sys.exit(1)

    homepages: list[dict[str, str]] = []
    with INPUT_CSV.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        if fieldnames is None:
            print("CSV has no header", file=sys.stderr)
            sys.exit(1)
        for homepage in reader:
            homepages.append(homepage)

    sampled_pages: list[dict[str, str]] = []
    unsampled_pages: list[dict[str, str]] = []

    out_fields = [
        "url",
        "link_kind",
        "seed_domain",
        "country_rank",
        "sector",
        "industry",
        "same_host_link_count",
        "sampled_from_homepage",
    ]

    DEBUG_DIR.mkdir(exist_ok=True)

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
                homepage_path: str | None = homepage.get("domain") # the column is called domain but it may have domane + path
                if homepage_path is None:
                    continue

                homepage_url = f"https://{homepage_path}"
                print(f"🔬 {homepage_url}")

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
                    samples = pick_sample_urls(pool, homepage_url, k=3)
                    print(f"Found {len(pool)} links")

                    meta = make_output_meta(homepage, homepage_url, same_host_link_count=len(pool))

                    homepage_row = {
                        "url": homepage_url,
                        "link_kind": "homepage",
                        **meta,
                    }
                    sampled_pages.append(homepage_row)
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

                    for u in samples:
                        sampled_pages.append(
                            {
                                "url": u,
                                "link_kind": "sampled_internal",
                                **meta,
                            }
                        )
                except Exception as e:
                    print(f"Error: {e}")

                    meta = make_output_meta(homepage, homepage_url, same_host_link_count=0)
                    homepage_row = {
                        "url": homepage_url,
                        "link_kind": "homepage",
                        **meta,
                    }
                    sampled_pages.append(homepage_row)
                    unsampled_pages.append(homepage_row)

        finally:
            context.close()
            browser.close()

    with SAMPLED_OUTPUT_CSV.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=out_fields)
        writer.writeheader()
        writer.writerows(sampled_pages)

    with UNSAMPLED_OUTPUT_CSV.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=out_fields)
        writer.writeheader()
        writer.writerows(unsampled_pages)

    print("Done")
    print(f"Wrote {SAMPLED_OUTPUT_CSV} ({len(sampled_pages)} rows)")
    print(f"Wrote {UNSAMPLED_OUTPUT_CSV} ({len(unsampled_pages)} rows)")


def make_output_meta(
    homepage: dict[str, str], homepage_url: str, same_host_link_count: int
) -> dict[str, str]:
    return {
        "seed_domain": homepage_url,
        "country_rank": homepage.get("country_rank", ""),
        "sector": homepage.get("sector", ""),
        "industry": homepage.get("industry", ""),
        "same_host_link_count": str(same_host_link_count),
        "sampled_from_homepage": homepage_url,
    }


def collect_same_host_hrefs(page_url: str, hrefs: list[str]) -> set[str]:
    page_host = normalize_host(urlparse(page_url).hostname)

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

        if normalize_host(parsed.hostname) != page_host:
            continue

        out.add(parsed.geturl().rstrip("/") or parsed.geturl())

    return out


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


def pick_sample_urls(pool: set[str], homepage: str, k: int = 3) -> list[str]:
    homepage_url = normalize_url(homepage)

    candidates = sorted(u for u in pool if normalize_url(u) != homepage_url)
    if len(candidates) <= k:
        return candidates

    return RNG.sample(candidates, k=k)


if __name__ == "__main__":
    main()
