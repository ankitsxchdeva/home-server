"""Webpage watcher: fetch pages and pull out their visible text."""

import asyncio
import os
from html.parser import HTMLParser

import aiohttp


class SiteError(Exception):
    """Transient problem fetching a page (network trouble, 5xx, rate limit)."""


class SiteGone(Exception):
    """The page is permanently gone (404/410)."""

    def __init__(self, status: int):
        super().__init__(f"page returned HTTP {status}")
        self.status = status


# Tags whose contents are never visible text.
_SKIP_TAGS = {"script", "style", "noscript", "template", "svg"}

# Generous ceiling for a real page; caps a runaway response without rejecting it.
_MAX_BYTES = 2_000_000


class _TextExtractor(HTMLParser):
    """Visible text, one entry per text node, skipping script/style/etc."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self._skip_depth = 0
        self.parts: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag in _SKIP_TAGS:
            self._skip_depth += 1

    def handle_endtag(self, tag):
        if tag in _SKIP_TAGS and self._skip_depth > 0:
            self._skip_depth -= 1

    def handle_data(self, data):
        if self._skip_depth == 0:
            line = " ".join(data.split())
            if line:
                self.parts.append(line)


def extract_lines(html_text: str) -> list[str]:
    p = _TextExtractor()
    p.feed(html_text)
    p.close()
    return p.parts


def plain_lines(text: str) -> list[str]:
    return [line.strip() for line in text.splitlines() if line.strip()]


class SiteFeed:
    def __init__(self):
        self._session: aiohttp.ClientSession | None = None
        # Identify the app; some hosts reject generic User-Agents.
        self._user_agent = os.environ.get(
            "SITE_USER_AGENT", "reddit-swap-notifier/1.0 (personal Discord notifier)"
        )

    async def fetch_lines(self, url: str) -> list[str]:
        """The page's current visible-text lines. Raises SiteGone/SiteError."""
        if self._session is None:  # created lazily so it binds the running loop
            self._session = aiohttp.ClientSession(
                headers={"User-Agent": self._user_agent},
                timeout=aiohttp.ClientTimeout(total=30),
            )
        try:
            async with self._session.get(url) as resp:
                if resp.status in (404, 410):
                    raise SiteGone(resp.status)
                if resp.status != 200:
                    raise SiteError(f"HTTP {resp.status} for {url}")
                content_type = resp.headers.get("Content-Type", "").lower()
                raw = await resp.content.read(_MAX_BYTES)
                encoding = resp.get_encoding()
        except (aiohttp.ClientError, asyncio.TimeoutError) as e:
            # ClientTimeout expiry raises TimeoutError, not ClientError.
            raise SiteError(f"fetch failed for {url}: {e!r}") from e
        text = raw.decode(encoding, errors="replace")
        if "html" in content_type:
            return extract_lines(text)
        # JSON, plain text, anything else: watch the raw body line by line.
        return plain_lines(text)
