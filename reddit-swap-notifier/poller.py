"""Poll loop: fetch new posts and watched pages, match, ping subscribers."""

import asyncio
import logging
import re
import time
from urllib.parse import urlsplit

import aiohttp
import discord

import db
from reddit_feed import FeedError, RedditFeed, SubredditGone
from site_feed import SiteError, SiteFeed, SiteGone

log = logging.getLogger(__name__)


def keyword_pattern(keyword: str) -> re.Pattern:
    # Lookarounds instead of \b so keywords with punctuation ("[H]", "3080ti+") work.
    return re.compile(rf"(?<!\w){re.escape(keyword)}(?!\w)", re.IGNORECASE)


def matching_keywords(keywords: list[str], text: str) -> list[str]:
    return [k for k in keywords if keyword_pattern(k).search(text)]


RECHECK_BROKEN_AFTER = 3600
# A line absent longer than this that shows up again pings as new (restock);
# anything shorter is page flap and stays silent.
REAPPEAR_AFTER = 6 * 3600


def classify_site_lines(
    known: dict[str, int], current: list[str], prev_candidates: set[str], now: int
) -> tuple[set[str], list[str]]:
    """Split current lines into new candidates vs. confirmed new text.

    Real pages flap between variants (session cookies, server-side
    degradation), so unseen text only pings if it survives into the next
    cycle; one-cycle flickers never notify.
    """
    candidates = {
        line
        for line in current
        if line not in known or now - known[line] > REAPPEAR_AFTER
    }
    confirmed = [line for line in dict.fromkeys(current) if line in prev_candidates]
    return candidates, confirmed


class Poller:
    def __init__(
        self,
        bot: discord.Client,
        feed: RedditFeed,
        sites: SiteFeed,
        interval: int,
        reddit_interval: int,
    ):
        self.bot = bot
        self.feed = feed
        self.sites = sites
        self.interval = interval
        # Reddit's public RSS 429s well under 4 req/min, so Reddit polls on
        # its own slower cadence while pages poll every interval.
        self.reddit_interval = reddit_interval
        self._last_reddit_poll = 0.0
        self.broken: dict[str, float] = {}  # subreddit -> when it was found bad
        self.broken_sites: dict[str, float] = {}  # url -> when it 404/410'd
        self.pending_sites: dict[str, set[str]] = {}  # url -> unconfirmed new lines

    async def run(self) -> None:
        await self.bot.wait_until_ready()
        log.info("Poller started (interval=%ss, reddit=%ss)", self.interval, self.reddit_interval)
        while True:
            try:
                await self.poll_once()
            except Exception:
                log.exception("Poll cycle failed")
            await asyncio.sleep(self.interval)

    async def poll_once(self) -> None:
        if time.time() - self._last_reddit_poll >= self.reddit_interval:
            self._last_reddit_poll = time.time()
            await self._poll_reddit()
        await self._poll_sites()

    async def _poll_reddit(self) -> None:
        subreddits = [s for s in db.distinct_subreddits() if self._usable(self.broken, s)]
        if not subreddits:
            return
        subscriptions = db.all_subscriptions()
        try:
            # One request covers every subscribed subreddit: r/a+b+c/new.rss
            posts = await self.feed.new_posts(subreddits)
        except SubredditGone as e:
            # One bad name poisons the whole combined feed; find and bench
            # it so the rest keep working.
            log.warning("Combined feed failed (%r) — probing each subreddit", e)
            await self._find_broken(subreddits)
            return
        except FeedError as e:
            log.warning("Poll cycle skipped: %s", e)
            return
        new_posts = 0
        for post in posts:
            if db.is_seen(post.id):
                continue
            new_posts += 1
            await self.notify_matches(post, subscriptions)
        db.prune_seen()
        log.info(
            "Poll cycle done: %s subreddits, %s new posts", len(subreddits), new_posts
        )

    def _usable(self, bench: dict[str, float], key: str) -> bool:
        benched_at = bench.get(key)
        if benched_at is None:
            return True
        if time.time() - benched_at >= RECHECK_BROKEN_AFTER:
            del bench[key]  # re-try; if still bad it gets re-benched
            return True
        return False

    async def _find_broken(self, subreddits: list[str]) -> None:
        bad = []
        for name in subreddits:
            try:
                await self.feed.probe(name)
            except SubredditGone:
                bad.append(name)
            except FeedError:
                pass  # transient network trouble; don't bench on a blip
        if not bad:
            log.error(
                "Combined feed failed but every subreddit probes fine —"
                " retrying next cycle"
            )
            return
        if len(bad) == len(subreddits) > 1:
            # They can't all have died at once — Reddit itself is having a
            # moment; bench nothing and retry next cycle.
            log.warning(
                "All %s subreddits failed probe — treating as a Reddit-wide error",
                len(bad),
            )
            return
        for name in bad:
            self.broken[name] = time.time()
            log.error(
                "r/%s is banned, private, or gone — excluding it from polling"
                " (re-checking hourly)",
                name,
            )

    async def _poll_sites(self) -> None:
        urls = [u for u in db.distinct_site_urls() if self._usable(self.broken_sites, u)]
        if not urls:
            return
        watches = db.all_site_watches()
        checked = pinged = 0
        now = int(time.time())
        for url in urls:
            try:
                lines = await self.sites.fetch_lines(url)
            except SiteGone as e:
                self.broken_sites[url] = time.time()
                log.error(
                    "%s returned HTTP %s — the page is gone; excluding it from"
                    " polling (re-checking hourly). Re-run /watch to resume now.",
                    url,
                    e.status,
                )
                continue
            except SiteError as e:
                log.warning("Site check skipped for %s: %s", url, e)
                continue
            checked += 1
            known = db.site_line_map(url)
            if not known:
                # No baseline (state lost or first deploy): absorb quietly —
                # twice, so a first-hit/session page variant doesn't become
                # "new text" next cycle.
                self.pending_sites.pop(url, None)
                db.touch_site_lines(url, lines)
                try:
                    await asyncio.sleep(3)
                    db.touch_site_lines(url, await self.sites.fetch_lines(url))
                except (SiteError, SiteGone):
                    pass
                continue
            candidates, confirmed = classify_site_lines(known, lines, self.pending_sites.get(url, set()), now)
            next_pending = set(candidates)
            if confirmed:
                summary = "\n".join(confirmed)
                if len(summary) > 300:  # keep the embed description short
                    summary = summary[:300] + "…"
                # On a transient Discord failure the confirmed lines stay
                # pending, so next cycle re-confirms and re-tries the ping.
                if await self.notify_site_change(url, watches, summary):
                    pinged += 1
                else:
                    next_pending |= set(confirmed)
            self.pending_sites[url] = next_pending
            db.touch_site_lines(url, lines)
        db.prune_site_lines()
        log.info("Site poll done: %s urls checked, %s pinged", checked, pinged)

    async def notify_site_change(self, url: str, watches, summary: str) -> bool:
        # One message per (channel, url): mention every subscriber.
        by_channel: dict[int, list[int]] = {}
        for w in watches:
            if w["url"] == url:
                by_channel.setdefault(w["channel_id"], []).append(w["user_id"])
        all_sent = True
        for channel_id, user_ids in by_channel.items():
            try:
                await self.send_site_notification(channel_id, user_ids, url, summary)
            except (discord.NotFound, discord.Forbidden):
                # Channel deleted or bot blocked — permanent; retrying would
                # re-ping the healthy channels every cycle forever.
                log.error(
                    "Channel %s is gone or blocks the bot; dropping site"
                    " notification for %s (users %s)",
                    channel_id,
                    url,
                    user_ids,
                )
            except (discord.DiscordServerError, aiohttp.ClientError, OSError, asyncio.TimeoutError):
                all_sent = False
                log.exception(
                    "Failed to notify users %s in channel %s", user_ids, channel_id
                )
            except Exception:
                # Anything else (400s, type errors) will fail identically every
                # cycle — dropping beats re-pinging the healthy channels forever.
                log.exception(
                    "Permanent-looking error notifying users %s in channel %s;"
                    " dropping site notification for %s",
                    user_ids,
                    channel_id,
                    url,
                )
        return all_sent

    async def send_site_notification(
        self, channel_id: int, user_ids: list[int], url: str, summary: str
    ) -> None:
        channel = self.bot.get_channel(channel_id)
        if channel is None:
            channel = await self.bot.fetch_channel(channel_id)
        embed = discord.Embed(
            title=f"New content: {urlsplit(url).netloc}",
            url=url,
            description=summary,
            color=discord.Color.green(),
        )
        content = " ".join(f"<@{u}>" for u in user_ids)
        if len(content) > 2000:  # Discord's message-content limit; drop whole mentions
            content = content[: content.rfind(" ", 0, 2000)]
        await channel.send(content=content, embed=embed)
        log.info("Notified users %s: %s has new text", user_ids, url)

    async def notify_matches(self, post, subscriptions) -> None:
        post_subreddit = post.subreddit
        text = f"{post.title}\n{post.selftext}"
        # One message per (channel, post): mention every matched user, union keywords.
        by_channel: dict[int, tuple[list[int], list[str]]] = {}
        for sub in subscriptions:
            if sub["subreddit"] != post_subreddit:
                continue
            # A newly added subreddit's backlog is unseen; don't ping for
            # posts that predate the subscription.
            if post.created_utc <= sub["created_at"]:
                continue
            matched = matching_keywords(db.split_keywords(sub["keywords"]), text)
            if not matched:
                continue
            user_ids, keywords = by_channel.setdefault(sub["channel_id"], ([], []))
            user_ids.append(sub["user_id"])
            keywords += [k for k in matched if k not in keywords]
        all_sent = True
        for channel_id, (user_ids, matched) in by_channel.items():
            try:
                await self.send_notification(channel_id, user_ids, post, matched)
            except (discord.NotFound, discord.Forbidden):
                # Channel deleted or bot blocked — permanent; retrying would
                # re-ping the healthy channels every cycle forever.
                log.error(
                    "Channel %s is gone or blocks the bot; dropping notification"
                    " for post %s (users %s)",
                    channel_id,
                    post.id,
                    user_ids,
                )
            except (discord.DiscordServerError, aiohttp.ClientError, OSError, asyncio.TimeoutError):
                all_sent = False
                log.exception(
                    "Failed to notify users %s in channel %s", user_ids, channel_id
                )
            except Exception:
                # Anything else (400s, type errors) will fail identically every
                # cycle — dropping beats re-pinging the healthy channels forever.
                log.exception(
                    "Permanent-looking error notifying users %s in channel %s;"
                    " dropping notification for post %s",
                    user_ids,
                    channel_id,
                    post.id,
                )
        # Mark seen only after every send succeeded so transient failures retry
        # next cycle.
        if all_sent:
            db.mark_seen(post.id)

    async def send_notification(
        self, channel_id: int, user_ids: list[int], post, matched: list[str]
    ) -> None:
        channel = self.bot.get_channel(channel_id)
        if channel is None:
            channel = await self.bot.fetch_channel(channel_id)
        body = post.selftext
        embed = discord.Embed(
            title=post.title[:256],
            url=post.url,
            description=(body[:200] + "…") if len(body) > 200 else (body or None),
            color=discord.Color.orange(),
        )
        embed.add_field(name="Subreddit", value=f"r/{post.subreddit}")
        matched_str = ", ".join(matched)
        if len(matched_str) > 1024:  # Discord's embed-field limit
            matched_str = matched_str[:1021] + "…"
        embed.add_field(name="Matched", value=matched_str)
        content = " ".join(f"<@{u}>" for u in user_ids)
        if len(content) > 2000:  # Discord's message-content limit; drop whole mentions
            content = content[: content.rfind(" ", 0, 2000)]
        await channel.send(content=content, embed=embed)
        log.info(
            "Notified users %s: r/%s post %s (matched: %s)",
            user_ids,
            post.subreddit,
            post.id,
            ", ".join(matched),
        )
