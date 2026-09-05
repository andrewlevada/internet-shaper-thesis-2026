from __future__ import annotations

from playwright.sync_api import Page

POST_LOAD_POLL_MS = 200


def wait_post_load(tab: Page, timeout_ms: int, poll_ms: int = POST_LOAD_POLL_MS) -> None:
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
                "then press Enter to continue... "
            )
            return

        chunk = min(poll_ms, remaining_ms)
        tab.wait_for_timeout(chunk)
        remaining_ms -= chunk


def accept_cookies(tab: Page, post_click_wait_ms: int) -> None:
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
            let clicked = false;
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

    # Page might reload, so we wait a bit.
    if clicked:
        print("Cookie click successful, waiting a bit more...")
        tab.wait_for_timeout(post_click_wait_ms)
