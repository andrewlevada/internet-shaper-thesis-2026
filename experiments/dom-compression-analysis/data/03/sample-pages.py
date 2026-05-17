#!/usr/bin/env python3

from __future__ import annotations

import csv
import random
import sys
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright

SEED = 283798
RNG = random.Random(SEED)

HERE = Path(__file__).resolve().parent
INPUT_CSV = HERE.parent / "02" / "adjusted-search-engines-top-25.csv"
OUTPUT_CSV = HERE / "popular-pages-100.csv"

NAV_TIMEOUT_MS = 30_000
POST_LOAD_WAIT_MS = 6_000
POST_LOAD_POLL_MS = 200


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
                    tab.goto(
                        homepage_url,
                        wait_until="load",
                        timeout=NAV_TIMEOUT_MS,
                    )

                    accept_cookies(tab)
                    wait_post_load(tab, POST_LOAD_WAIT_MS)

                    # Screenshot for debug
                    tab.screenshot(
                        path=f"debug/{homepage.get('country_rank')}-{homepage_path.replace('/', '_')}.png"
                    )

                    hrefs = tab.evaluate(
                        """() => Array.from(document.querySelectorAll('a[href]'))
                            .map(a => a.href)"""
                    )

                    pool = collect_same_host_hrefs(homepage_url, hrefs)
                    samples = pick_sample_urls(pool, homepage_url, k=3)
                    print(f"Found {len(pool)} links")

                    meta = {
                        "seed_domain": homepage_url,
                        "same_host_link_count": str(len(pool)),
                        "sampled_from_homepage": homepage_url,
                    }

                    sampled_pages.append(
                        {
                            "url": homepage_url,
                            "link_kind": "homepage",
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
                    
                    meta = {
                        "seed_domain": homepage_url,
                        "same_host_link_count": "0",
                        "sampled_from_homepage": homepage_url,
                    }
                    sampled_pages.append(
                        {
                            "url": homepage_url,
                            "link_kind": "homepage",
                            **meta,
                        }
                    )

        finally:
            context.close()
            browser.close()

    with OUTPUT_CSV.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=out_fields)
        writer.writeheader()
        writer.writerows(sampled_pages)

    print("Done")
    print(f"Wrote {OUTPUT_CSV} ({len(sampled_pages)} rows)")


def wait_post_load(tab, timeout_ms: int, poll_ms: int = POST_LOAD_POLL_MS) -> None:
    try:
        tab.evaluate(
            """() => {
                window.__more_time_needed_click = false;
                const mark = (e) => {
                    window.__more_time_needed_click = true;
                };
                document.addEventListener("click", mark, { capture: true, passive: true });
            }"""
        )
    except Exception:
        # The page may still be redirecting/reloading after load.
        pass

    remaining_ms = timeout_ms

    while remaining_ms > 0:
        try:
            more_time_needed = tab.evaluate("() => window.__more_time_needed_click")
        except Exception:
            more_time_needed = False

        if more_time_needed:
            input(
                "Click detected (e.g. captcha). Finish in the browser, "
                "then press Enter to continue… "
            )
            return

        chunk = min(poll_ms, remaining_ms)
        tab.wait_for_timeout(chunk)
        remaining_ms -= chunk


def accept_cookies(tab) -> None:
    phrases = (
        "accept",
        "i accept",
        "alles accepteren",
        "accepteren",
        "accept all",
        "accepteer alle cookies",
        "allow all",
    )

    clicked = tab.evaluate(
        """(phrases) => {
            clicked = false;
            for (const btn of document.querySelectorAll("button")) {
                const text = (btn.innerText || "").normalize().toLowerCase();
                for (const p of phrases) {
                    if (text.includes(p)) {
                        btn.click();
                        clicked = true;
                        break;
                    }
                }
            }
            return clicked;
        }""",
        list(phrases),
    )

    # Page might reload, so we wait a bit
    if clicked:
        print("Cookie click successful, waiting a bit more...")
        tab.wait_for_timeout(POST_LOAD_WAIT_MS)



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


def pick_sample_urls(pool: set[str], homepage: str, k: int = 3) -> list[str]:
    homepage_host = normalize_host(urlparse(homepage).hostname)

    candidates = sorted(u for u in pool if normalize_host(urlparse(u).hostname) != homepage_host)
    if len(candidates) <= k:
        return candidates

    return RNG.sample(candidates, k=k)


if __name__ == "__main__":
    main()
