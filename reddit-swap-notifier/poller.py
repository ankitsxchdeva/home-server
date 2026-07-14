"""Reddit poll loop: fetch new posts, match keywords, ping subscribers."""

import asyncio
import logging
import re
import time

import aiohttp
import discord

import db
from reddit_feed import FeedError, RedditFeed, SubredditGone

log = logging.getLogger(__name__)


def keyword_pattern(keyword: str) -> re.Pattern:
    # Lookarounds instead of \b so keywords with punctuation ("[H]", "3080ti+") work.
    return re.compile(rf"(?<!\w){re.escape(keyword)}(?!\w)", re.IGNORECASE)


def matching_keywords(keywords: list[str], text: str) -> list[str]:
    return [k for k in keywords if keyword_pattern(k).search(text)]


RECHECK_BROKEN_AFTER = 3600


class Poller:
    def __init__(self, bot: discord.Client, feed: RedditFeed, interval: int):
        self.bot = bot
        self.feed = feed
        self.interval = interval
        self.broken: dict[str, float] = {}  # subreddit -> when it was found bad

    async def run(self) -> None:
        await self.bot.wait_until_ready()
        log.info("Poller started (interval=%ss)", self.interval)
        while True:
            try:
                await self.poll_once()
            except Exception:
                log.exception("Poll cycle failed")
            await asyncio.sleep(self.interval)

    async def poll_once(self) -> None:
        subreddits = [s for s in db.distinct_subreddits() if self._usable(s)]
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

    def _usable(self, subreddit: str) -> bool:
        benched_at = self.broken.get(subreddit)
        if benched_at is None:
            return True
        if time.time() - benched_at >= RECHECK_BROKEN_AFTER:
            del self.broken[subreddit]  # re-try; if still bad it gets re-benched
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
