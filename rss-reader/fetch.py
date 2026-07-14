"""Per-source fetch: resolve the feed (or scraper), parse, normalize to items."""

import asyncio
import hashlib
import logging
import os
import re
from datetime import datetime, timezone

import feedparser
import httpx
from dateutil import parser as dateparser
from selectolax.parser import HTMLParser

import discover
import scrapers

log = logging.getLogger(__name__)

SUMMARY_CHARS = 280
SOURCE_TIMEOUT = 60  # hard cap per source; covers discovery's extra requests


def item_id(url: str) -> str:
    return hashlib.sha1(url.encode()).hexdigest()


def strip_html(text: str) -> str:
    if not text:
        return ""
    return re.sub(r"\s+", " ", HTMLParser(text).text(separator=" ")).strip()


def summarize(text: str) -> str:
    text = strip_html(text)
    if len(text) > SUMMARY_CHARS:
        text = text[:SUMMARY_CHARS].rsplit(" ", 1)[0] + "…"
    return text


def to_utc_iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def entry_published(entry) -> str | None:
    for key in ("published_parsed", "updated_parsed"):
        parsed = entry.get(key)
        if parsed:
            return to_utc_iso(datetime(*parsed[:6], tzinfo=timezone.utc))
    for key in ("published", "updated"):
        raw = entry.get(key)
        if raw:
            try:
                return to_utc_iso(dateparser.parse(raw))
            except (ValueError, OverflowError):
                pass
    return None


def normalize(source: dict, raw: dict) -> dict | None:
    """Shape one raw {title, url, published?, summary?} into a digest item."""
    url = (raw.get("url") or "").strip()
    if not url:
        return None
    return {
        "id": item_id(url),
        "source": source["name"],
        "category": source.get("category") or "software",
        "title": strip_html(raw.get("title") or "") or "(untitled)",
        "url": url,
        "published": raw.get("published"),
        "summary": summarize(raw.get("summary") or ""),
        "tags": source.get("tags") or [],
    }


def entry_to_raw(entry) -> dict:
    summary = entry.get("summary") or ""
    if not summary and entry.get("content"):
        summary = entry["content"][0].get("value", "")
    return {
        "title": entry.get("title"),
        "url": entry.get("link"),
        "published": entry_published(entry),
        "summary": summary,
    }


async def _get(client: httpx.AsyncClient, url: str, source: dict) -> httpx.Response:
    proxy = os.environ.get("PAYWALL_PROXY")
    if source.get("paywall") and proxy:
        proxy = proxy.rstrip("/")
        # discover.remember() may have cached an already-proxied URL; don't
        # wrap it a second time.
        if not url.startswith(f"{proxy}/"):
            url = f"{proxy}/{url}"
    resp = await client.get(url)
    resp.raise_for_status()
    return resp


async def _fetch_feed(client: httpx.AsyncClient, source: dict) -> list[dict]:
    url = source["url"]
    feed_url = discover.cached(url)
    resp = await _get(client, feed_url or url, source)
    if feed_url is None:
        if not discover.is_feed(resp.text):
            feed_url = await discover.from_page(client, str(resp.url), resp.text)
            resp = await _get(client, feed_url, source)
        discover.remember(url, str(resp.url))
    parsed = await asyncio.to_thread(feedparser.parse, resp.content)
    if parsed.bozo and not parsed.entries:
        raise ValueError(f"unparseable feed at {resp.url}: {parsed.bozo_exception}")
    return [entry_to_raw(e) for e in parsed.entries]


async def _fetch(client: httpx.AsyncClient, source: dict) -> list[dict]:
    if source.get("scrape"):
        raw_items = await scrapers.get(source["scrape"])(client, source)
    else:
        raw_items = await _fetch_feed(client, source)
    return [i for i in (normalize(source, r) for r in raw_items) if i]


async def fetch_source(client: httpx.AsyncClient, source: dict) -> dict:
    """Never raises: a failing source reports ok=False and no items."""
    name = source.get("name") or source.get("url", "?")
    for attempt in (1, 2):  # one retry smooths transient 5xx blips (hnrss...)
        try:
            items = await asyncio.wait_for(_fetch(client, source), SOURCE_TIMEOUT)
            limit = source.get("limit")
            if limit:
                items = items[: int(limit)]
            return {"name": name, "ok": True, "error": None, "items": items}
        except Exception as e:  # noqa: BLE001 — one bad source must never kill the build
            if attempt == 1:
                await asyncio.sleep(3)
                continue
            log.warning("Source %s failed: %r", name, e)
            return {"name": name, "ok": False, "error": f"{type(e).__name__}: {e}", "items": []}
