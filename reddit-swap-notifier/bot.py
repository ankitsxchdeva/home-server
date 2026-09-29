"""Discord bot: /setup, /show, /remove slash commands + Reddit RSS poller."""

import asyncio
import logging
import os
import re
import sys
from urllib.parse import urlsplit, urlunsplit

import discord
from discord import app_commands
from dotenv import load_dotenv

import db
from poller import Poller
from reddit_feed import FeedError, RedditFeed, SubredditGone
from site_feed import SiteError, SiteFeed, SiteGone

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s"
)
log = logging.getLogger("bot")


class SwapNotifier(discord.Client):
    def __init__(self):
        super().__init__(intents=discord.Intents.default())
        self.tree = app_commands.CommandTree(self)
        self.feed: RedditFeed | None = None
        self.sites: SiteFeed | None = None

    async def setup_hook(self) -> None:
        db.init()
        self.feed = RedditFeed()
        self.sites = SiteFeed()
        interval = int(os.environ.get("POLL_INTERVAL_SECONDS") or "10")
        reddit_interval = int(os.environ.get("REDDIT_INTERVAL_SECONDS") or "60")
        self.poller = Poller(self, self.feed, self.sites, interval, reddit_interval)
        self.poller_task = asyncio.create_task(self.poller.run())

        def log_poller_exit(task: asyncio.Task) -> None:
            if not task.cancelled():
                log.error("Poller task exited", exc_info=task.exception())

        self.poller_task.add_done_callback(log_poller_exit)

        guild_id = os.environ.get("GUILD_ID")
        if guild_id:
            guild = discord.Object(id=int(guild_id))
            self.tree.copy_global_to(guild=guild)
            await self.tree.sync(guild=guild)
        else:
            await self.tree.sync()

    async def on_ready(self) -> None:
        log.info("Logged in as %s", self.user)


client = SwapNotifier()


def normalize_subreddit(name: str) -> str:
    return name.strip().lower().removeprefix("/").removeprefix("r/")


# Discord autocomplete choice values cap at 100 chars, so watched URLs must fit.
MAX_URL_LENGTH = 100


def normalize_url(raw: str) -> str | None:
    """Canonical watch key, or None if it can't be an http(s) page URL."""
    raw = raw.strip()
    if not raw or len(raw) > MAX_URL_LENGTH or any(c.isspace() for c in raw):
        return None
    parts = urlsplit(raw if "://" in raw else f"https://{raw}")
    if parts.scheme not in ("http", "https") or not parts.netloc:
        return None
    # Fragments never reach the server; a bare domain watches its root page.
    return urlunsplit(
        (parts.scheme.lower(), parts.netloc.lower(), parts.path or "/", parts.query, "")
    )


@client.tree.command(description="Watch a subreddit for posts matching your keywords")
@app_commands.describe(
    subreddit="Subreddit to watch, e.g. hardwareswap",
    keywords="Comma-separated keywords, e.g. 3080, keyboard, [H] PayPal",
)
@app_commands.guild_only()
async def setup(interaction: discord.Interaction, subreddit: str, keywords: str):
    await interaction.response.defer(ephemeral=True)
    name = normalize_subreddit(subreddit)
    new_keywords = db.split_keywords(keywords)
    if not name or not new_keywords:
        await interaction.followup.send("Please provide a subreddit and at least one keyword.")
        return
    if not re.fullmatch(r"[a-z0-9_]{2,21}", name):
        await interaction.followup.send(f"`{subreddit}` doesn't look like a valid subreddit name.")
        return
    too_long = [k for k in new_keywords if len(k) > 80]
    if too_long:
        await interaction.followup.send(
            f"Keyword `{too_long[0][:80]}…` is too long — keywords must be 80 characters or fewer."
        )
        return
    existing = next(
        (
            s
            for s in db.list_subscriptions(interaction.guild_id, interaction.user.id)
            if s["subreddit"] == name
        ),
        None,
    )
    merged = db.split_keywords(existing["keywords"]) if existing else []
    merged_lower = {k.lower() for k in merged}
    for k in new_keywords:
        if k.lower() not in merged_lower:
            merged.append(k)
            merged_lower.add(k.lower())  # mirrors db.upsert_subscription's merge
    if len(merged) > 25:
        await interaction.followup.send(
            f"That would make {len(merged)} keywords for r/{name} — the limit is 25."
            " Remove some with `/remove` first."
        )
        return
    perms = interaction.channel.permissions_for(interaction.guild.me)
    if not (perms.send_messages and perms.embed_links):
        await interaction.followup.send(
            "I can't post in this channel (need Send Messages and Embed Links)."
            " Run `/setup` in a channel I can post in."
        )
        return
    try:
        await client.feed.probe(name)
    except SubredditGone as e:
        if e.status == 403:
            await interaction.followup.send(f"r/{name} is private — can't watch it.")
        else:
            await interaction.followup.send(f"r/{name} doesn't seem to exist.")
        return
    except FeedError:
        await interaction.followup.send(
            f"Couldn't reach Reddit to verify r/{name} — try again in a minute."
        )
        return
    # The probe just proved the sub works; un-bench it if the poller had it
    # sidelined so watching resumes now instead of at the next hourly re-check.
    client.poller.broken.pop(name, None)
    all_keywords, previous_channel_id = db.upsert_subscription(
        interaction.guild_id, interaction.user.id, name, new_keywords, interaction.channel_id
    )
    shown = ", ".join(f"`{k}`" for k in all_keywords)
    if len(shown) > 1500:  # keep the whole reply under Discord's 2000-char limit
        shown = shown[:1500] + "…"
    msg = (
        f"Watching **r/{name}** for: {shown}\n"
        f"You'll be pinged in this channel when a post matches."
    )
    if previous_channel_id is not None:
        msg += f"\nThis subscription's pings moved from <#{previous_channel_id}> to this channel."
    await interaction.followup.send(msg)


@client.tree.command(description="Show the subreddits, keywords, and pages you're watching")
@app_commands.guild_only()
async def show(interaction: discord.Interaction):
    subs = db.list_subscriptions(interaction.guild_id, interaction.user.id)
    sites = db.list_site_watches(interaction.guild_id, interaction.user.id)
    if not subs and not sites:
        await interaction.response.send_message(
            "You're not watching anything yet. Use `/setup` or `/watch` to start.",
            ephemeral=True,
        )
        return
    fields: list[tuple[str, str]] = []
    for sub in subs:
        keywords = ", ".join(f"`{k}`" for k in db.split_keywords(sub["keywords"]))
        if len(keywords) > 990:  # field value caps at 1024, incl. the line below
            keywords = keywords[:990] + "…"
        fields.append(
            (f"r/{sub['subreddit']}", f"{keywords}\nPings in <#{sub['channel_id']}>")
        )
    for site in sites:
        fields.append((site["url"], f"Pings in <#{site['channel_id']}>"))
    embed = discord.Embed(title="Your watches", color=discord.Color.orange())
    total_chars = len(embed.title)
    for i, (name, value) in enumerate(fields):
        # Embeds cap at 25 fields and 6000 chars total; leave room for the
        # "…and N more" field.
        if len(embed.fields) == 24 or total_chars + len(name) + len(value) > 5800:
            embed.add_field(
                name=f"…and {len(fields) - i} more",
                value="Use `/remove`'s or `/unwatch`'s autocomplete to browse the rest.",
                inline=False,
            )
            break
        embed.add_field(name=name, value=value, inline=False)
        total_chars += len(name) + len(value)
    await interaction.response.send_message(embed=embed, ephemeral=True)


@client.tree.command(description="Stop watching a subreddit, or remove one keyword from it")
@app_commands.describe(
    subreddit="Subreddit to stop watching",
    keyword="If given, remove only this keyword and keep the rest",
)
@app_commands.guild_only()
async def remove(interaction: discord.Interaction, subreddit: str, keyword: str | None = None):
    name = normalize_subreddit(subreddit)
    if keyword:
        remaining = db.remove_keyword(interaction.guild_id, interaction.user.id, name, keyword.strip())
        if remaining is None:
            sub = next(
                (
                    s
                    for s in db.list_subscriptions(interaction.guild_id, interaction.user.id)
                    if s["subreddit"] == name
                ),
                None,
            )
            if sub is None:
                msg = f"You're not watching r/{name} (check `/show`)."
            else:
                have = ", ".join(f"`{k}`" for k in db.split_keywords(sub["keywords"]))
                msg = f"No keyword `{keyword}` on r/{name} — you have: {have}."
        elif remaining:
            msg = f"Removed `{keyword}`. Still watching r/{name} for: " + ", ".join(
                f"`{k}`" for k in remaining
            )
        else:
            msg = f"Removed `{keyword}` — that was the last keyword, so r/{name} is no longer watched."
    else:
        removed = db.remove_subscription(interaction.guild_id, interaction.user.id, name)
        msg = f"Stopped watching r/{name}." if removed else f"You weren't watching r/{name}."
    await interaction.response.send_message(msg, ephemeral=True)


@remove.autocomplete("subreddit")
async def remove_subreddit_autocomplete(interaction: discord.Interaction, current: str):
    subs = db.list_subscriptions(interaction.guild_id, interaction.user.id)
    current = normalize_subreddit(current)  # so typing "r/hard" still matches
    return [
        app_commands.Choice(name=f"r/{s['subreddit']}", value=s["subreddit"])
        for s in subs
        if current in s["subreddit"]
    ][:25]


@remove.autocomplete("keyword")
async def remove_keyword_autocomplete(interaction: discord.Interaction, current: str):
    name = normalize_subreddit(interaction.namespace.subreddit or "")
    subs = db.list_subscriptions(interaction.guild_id, interaction.user.id)
    sub = next((s for s in subs if s["subreddit"] == name), None)
    if sub is None:
        return []
    current = current.lower()
    return [
        app_commands.Choice(name=k, value=k)
        for k in db.split_keywords(sub["keywords"])
        if current in k.lower()
    ][:25]


@client.tree.command(description="Watch a webpage; get pinged when its visible text changes")
@app_commands.describe(url="Page to watch, e.g. https://darkdarkpark.com/")
@app_commands.guild_only()
async def watch(interaction: discord.Interaction, url: str):
    await interaction.response.defer(ephemeral=True)
    norm = normalize_url(url)
    if norm is None:
        await interaction.followup.send(
            f"`{url}` doesn't look like a valid page URL (http/https, 100 chars max)."
        )
        return
    perms = interaction.channel.permissions_for(interaction.guild.me)
    if not (perms.send_messages and perms.embed_links):
        await interaction.followup.send(
            "I can't post in this channel (need Send Messages and Embed Links)."
            " Run `/watch` in a channel I can post in."
        )
        return
    try:
        lines = await client.sites.fetch_lines(norm)
    except SiteGone as e:
        await interaction.followup.send(
            f"That page returned HTTP {e.status} — can't watch it."
        )
        return
    except SiteError:
        await interaction.followup.send(
            "Couldn't fetch that page — check the URL or try again in a minute."
        )
        return
    if not lines:
        await interaction.followup.send(
            "That page has no readable text — it's probably JavaScript-rendered,"
            " which I can't watch."
        )
        return
    # The fetch just proved the page works; un-bench it if the poller had it
    # sidelined so watching resumes now instead of at the next hourly re-check.
    client.poller.broken_sites.pop(norm, None)
    client.poller.pending_sites.pop(norm, None)
    previous_channel_id = db.add_site_watch(
        interaction.guild_id, interaction.user.id, norm, interaction.channel_id
    )
    if not db.site_line_map(norm):
        # Silent baseline: two fetches, so a first-hit/session page variant
        # doesn't become "new text" on the next poll.
        db.touch_site_lines(norm, lines)
        try:
            await asyncio.sleep(3)
            db.touch_site_lines(norm, await client.sites.fetch_lines(norm))
        except (SiteError, SiteGone):
            pass
        msg = (
            f"Watching <{norm}> — recorded the current page as the baseline;"
            " you'll be pinged here when new text appears."
        )
    else:
        msg = f"Watching <{norm}> — you'll be pinged here when new text appears."
    if previous_channel_id is not None:
        msg += f"\nThis watch's pings moved from <#{previous_channel_id}> to this channel."
    await interaction.followup.send(msg)


@client.tree.command(description="Stop watching a webpage")
@app_commands.describe(url="Page to stop watching")
@app_commands.guild_only()
async def unwatch(interaction: discord.Interaction, url: str):
    norm = normalize_url(url)
    removed = norm is not None and db.remove_site_watch(
        interaction.guild_id, interaction.user.id, norm
    )
    if removed:
        msg = f"Stopped watching <{norm}>."
    else:
        msg = "You weren't watching that page (check `/show`)."
    await interaction.response.send_message(msg, ephemeral=True)


@unwatch.autocomplete("url")
async def unwatch_url_autocomplete(interaction: discord.Interaction, current: str):
    watches = db.list_site_watches(interaction.guild_id, interaction.user.id)
    current = current.lower()
    return [
        app_commands.Choice(name=w["url"][:100], value=w["url"])
        for w in watches
        if current in w["url"].lower()
    ][:25]


if __name__ == "__main__":
    load_dotenv()
    if not os.environ.get("DISCORD_TOKEN"):
        sys.exit("Missing required environment variable: DISCORD_TOKEN")
    client.run(os.environ["DISCORD_TOKEN"])
