"""Feed auto-discovery: bare site URL → its RSS/Atom feed URL."""

import logging
from urllib.parse import urljoin

import httpx
from selectolax.parser import HTMLParser

log = logging.getLogger(__name__)

LINK_TYPES = ("application/rss+xml", "application/atom+xml", "application/feed+json")
COMMON_PATHS = ("/feed", "/rss", "/atom.xml", "/feed.xml", "/index.xml", "/rss.xml")

# source url -> resolved feed url, so discovery runs once per process
_resolved: dict[str, str] = {}


def cached(url: str) -> str | None:
    return _resolved.get(url)


def remember(url: str, feed_url: str) -> None:
    _resolved[url] = feed_url


def is_feed(text: str) -> bool:
    head = text[:1000].lower()
    return "<rss" in head or "<feed" in head or "<rdf:rdf" in head


async def from_page(client: httpx.AsyncClient, page_url: str, html: str) -> str:
    """Find the feed a page advertises, else probe the usual paths."""
    for node in HTMLParser(html).css('link[rel="alternate"]'):
        type_ = (node.attributes.get("type") or "").lower()
        href = node.attributes.get("href")
        if href and type_ in LINK_TYPES:
            found = urljoin(page_url, href)
            log.info("Discovered feed for %s: %s", page_url, found)
            return found
    for path in COMMON_PATHS:
        candidate = urljoin(page_url, path)
        try:
            resp = await client.get(candidate)
        except httpx.HTTPError:
            continue
        if resp.status_code == 200 and is_feed(resp.text):
            log.info("Discovered feed for %s by probing: %s", page_url, candidate)
            return candidate
    raise LookupError(f"no feed found for {page_url}")
