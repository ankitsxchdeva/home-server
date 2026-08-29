"""Full-article text extraction for the LLM summarizer.

RSS blurbs are truncated teasers (and HN items carry no text at all), so we
fetch the article page and extract the body with trafilatura. Any failure —
network error, paywall, empty extraction — returns "" and the caller falls
back to the feed's own summary. Nothing here ever raises.

PAYWALL_PROXY, when set, is a reader-style service base URL: a direct fetch
that is refused (401/403) or yields almost nothing is retried once through
f"{PAYWALL_PROXY}/{url}".
"""

import asyncio
import logging
import os

import httpx
import trafilatura

log = logging.getLogger(__name__)

FETCH_TIMEOUT = 20
# Below this, extraction counts as a miss worth one proxy retry.
MIN_EXTRACT = 200


async def _try_fetch(client: httpx.AsyncClient, url: str) -> tuple[int, str]:
    """(status, extracted text); raises on transport errors and hard failures."""
    resp = await client.get(url, timeout=FETCH_TIMEOUT)
    if resp.status_code in (401, 403):
        return resp.status_code, ""
    resp.raise_for_status()
    # trafilatura is blocking CPU work — keep it off the event loop.
    text = await asyncio.to_thread(trafilatura.extract, resp.text)
    return resp.status_code, (text or "").strip()


async def extract_text(client: httpx.AsyncClient, url: str) -> str:
    """Article body text for url; "" on any failure. Never raises."""
    proxy = (os.environ.get("PAYWALL_PROXY") or "").rstrip("/")
    status, text = 0, ""
    try:
        status, text = await _try_fetch(client, url)
    except Exception as e:  # noqa: BLE001 — caller falls back to the RSS blurb
        log.info("article fetch failed for %s (%r)", url, e)
        return ""
    if proxy and (status in (401, 403) or len(text) < MIN_EXTRACT):
        try:
            _, proxied = await _try_fetch(client, f"{proxy}/{url}")
            text = proxied or text  # never worse than the direct attempt
        except Exception as e:  # noqa: BLE001
            log.info("proxy fetch failed for %s (%r)", url, e)
    return text
