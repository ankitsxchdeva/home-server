"""Yahoo Finance topic stream (no RSS on topic pages).

The page is server-rendered: each story is a <section class="story-item">
with a titled link, an <h3> headline, and a byline like "Reuters • 17m ago".
"""

import re
from datetime import datetime, timedelta, timezone

from selectolax.parser import HTMLParser

# Yahoo serves bot user agents a consent/blank shell; look like a browser.
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
        " (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
    )
}

RELATIVE_TIME = re.compile(r"(\d+)\s*(m|h|d)\b")


def _published(byline: str) -> str | None:
    """'17m ago' / '2h ago' / '3d ago' → absolute UTC time (best effort)."""
    match = RELATIVE_TIME.search(byline or "")
    if not match:
        return None
    value, unit = int(match.group(1)), match.group(2)
    delta = {"m": timedelta(minutes=value), "h": timedelta(hours=value), "d": timedelta(days=value)}[unit]
    return (datetime.now(timezone.utc) - delta).strftime("%Y-%m-%dT%H:%M:%SZ")


async def scrape(client, source) -> list[dict]:
    resp = await client.get(source["url"], headers=HEADERS)
    resp.raise_for_status()
    items = []
    for story in HTMLParser(resp.text).css("section.story-item"):
        # Headliners lead the stream with artwork; "no-img" rows are filler.
        if "no-img" in (story.attributes.get("class") or ""):
            continue
        link = story.css_first("a[href][title]") or story.css_first("a[href]")
        headline = story.css_first("h3")
        if link is None or headline is None:
            continue
        byline = story.css_first(".byline")
        publisher = story.css_first(".publisher")
        items.append(
            {
                "title": headline.text(strip=True),
                "url": link.attributes["href"],
                "published": _published(byline.text() if byline else ""),
                "summary": publisher.text(strip=True) if publisher else "",
            }
        )
    if not items:
        raise ValueError("no story items found (page layout changed?)")
    return items
