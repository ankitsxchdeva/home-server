"""Reddit RSS client: polls the public Atom feeds — no API credentials needed."""

import asyncio
import html
import os
import re
from dataclasses import dataclass
from datetime import datetime
from xml.etree import ElementTree

import aiohttp

ATOM = "{http://www.w3.org/2005/Atom}"
BASE = "https://www.reddit.com"


class FeedError(Exception):
    """Transient problem fetching a feed (network trouble, 5xx, rate limit)."""


class SubredditGone(Exception):
    """The subreddit is banned, private, renamed, or doesn't exist."""

    def __init__(self, status: int):
        super().__init__(f"feed returned HTTP {status}")
        self.status = status


@dataclass
class Post:
    id: str
    subreddit: str  # lowercase
    title: str
    selftext: str
    url: str
    created_utc: float


class RedditFeed:
    def __init__(self):
        self._session: aiohttp.ClientSession | None = None
        # Reddit rejects generic User-Agents even on RSS; identify the app.
        self._user_agent = os.environ.get(
            "REDDIT_USER_AGENT", "reddit-swap-notifier/1.0 (personal Discord notifier)"
        )

    async def new_posts(self, subreddits: list[str]) -> list[Post]:
        """Newest ~100 posts across the given subreddits, in one request."""
        text = await self._fetch(f"/r/{'+'.join(subreddits)}/new.rss?limit=100")
        try:
            root = ElementTree.fromstring(text)
        except ElementTree.ParseError as e:
            raise FeedError(f"unparseable feed: {e}") from e
        return [p for p in map(_parse_entry, root.iter(f"{ATOM}entry")) if p]

    async def probe(self, subreddit: str) -> None:
        """Raise SubredditGone (or FeedError) if the subreddit isn't fetchable."""
        await self._fetch(f"/r/{subreddit}/new.rss?limit=1")

    async def _fetch(self, path: str) -> str:
        if self._session is None:  # created lazily so it binds the running loop
            self._session = aiohttp.ClientSession(
                headers={"User-Agent": self._user_agent},
                timeout=aiohttp.ClientTimeout(total=30),
            )
        try:
            # A redirect means the subreddit was renamed or doesn't exist —
            # same signal as praw's Redirect error, so don't follow it.
            async with self._session.get(
                f"{BASE}{path}", allow_redirects=False
            ) as resp:
                if resp.status in (403, 404) or 300 <= resp.status < 400:
                    raise SubredditGone(resp.status)
                if resp.status != 200:
                    raise FeedError(f"HTTP {resp.status} for {path}")
                return await resp.text()
        except (aiohttp.ClientError, asyncio.TimeoutError) as e:
            # ClientTimeout expiry raises TimeoutError, not ClientError.
            raise FeedError(f"fetch failed for {path}: {e!r}") from e


def _parse_entry(entry: ElementTree.Element) -> Post | None:
    post_id = entry.findtext(f"{ATOM}id") or ""  # fullname, e.g. "t3_1abcde"
    title = entry.findtext(f"{ATOM}title") or ""
    link = entry.find(f"{ATOM}link")
    url = link.get("href", "") if link is not None else ""
    category = entry.find(f"{ATOM}category")
    subreddit = category.get("term", "") if category is not None else ""
    if not (post_id and title and url and subreddit):
        return None
    published = entry.findtext(f"{ATOM}published") or ""
    try:
        created_utc = datetime.fromisoformat(published).timestamp()
    except ValueError:
        created_utc = 0.0
    return Post(
        id=post_id.removeprefix("t3_"),
        subreddit=subreddit.lower(),
        title=title,
        selftext=_extract_selftext(entry.findtext(f"{ATOM}content") or ""),
        url=url,
        created_utc=created_utc,
    )


def _extract_selftext(content: str) -> str:
    """Pull the post body out of the feed's HTML; link posts have none."""
    m = re.search(r'<div class="md">(.*)</div>', content, re.DOTALL)
    if not m:
        return ""
    return html.unescape(re.sub(r"<[^>]+>", " ", m.group(1))).strip()
