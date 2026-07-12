"""Hacker News front page via the official Algolia API.

Replaces the hnrss.org bridge: third-party, 502s often, and its /best feed
trails the live site by a day or more. Algolia is HN's own search backend —
no key needed, and tags=front_page returns the current front page with
points/comments, highest-rated first.
"""

from datetime import datetime, timezone


def _published(hit) -> str | None:
    ts = hit.get("created_at_i")
    if not ts:
        return None
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


async def scrape(client, source) -> list[dict]:
    resp = await client.get(source["url"])
    resp.raise_for_status()
    hits = resp.json().get("hits") or []
    if not hits:
        raise ValueError("no front-page hits (API shape changed?)")
    items = []
    for hit in hits:
        title = hit.get("title")
        if not title:
            continue
        discussion = f"https://news.ycombinator.com/item?id={hit['objectID']}"
        items.append(
            {
                "title": title,
                # Ask/Show HN posts have no external URL; link the discussion.
                "url": hit.get("url") or discussion,
                "published": _published(hit),
                "summary": f"{hit.get('points') or 0} points · {hit.get('num_comments') or 0} comments",
            }
        )
    return items
