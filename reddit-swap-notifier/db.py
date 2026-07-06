"""SQLite storage for subscriptions and seen posts."""

import sqlite3
import time
from pathlib import Path

DB_PATH = Path(__file__).parent / "data" / "bot.db"

_conn: sqlite3.Connection | None = None


def init() -> None:
    global _conn
    DB_PATH.parent.mkdir(exist_ok=True)
    _conn = sqlite3.connect(DB_PATH)
    _conn.row_factory = sqlite3.Row
    _conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS subscriptions (
            guild_id   INTEGER NOT NULL,
            user_id    INTEGER NOT NULL,
            subreddit  TEXT    NOT NULL,
            keywords   TEXT    NOT NULL,
            channel_id INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            PRIMARY KEY (guild_id, user_id, subreddit)
        );
        CREATE TABLE IF NOT EXISTS seen_posts (
            post_id TEXT PRIMARY KEY,
            seen_at INTEGER NOT NULL
        );
        """
    )
    _conn.commit()


def split_keywords(raw: str) -> list[str]:
    return [k for k in (part.strip() for part in raw.split(",")) if k]


def upsert_subscription(
    guild_id: int, user_id: int, subreddit: str, new_keywords: list[str], channel_id: int
) -> tuple[list[str], int | None]:
    """Merge keywords into an existing subscription (or create one).

    Returns (full keyword list after the merge, previous channel id if the
    subscription already existed in a different channel, else None).
    """
    row = _conn.execute(
        "SELECT keywords, channel_id FROM subscriptions WHERE guild_id=? AND user_id=? AND subreddit=?",
        (guild_id, user_id, subreddit),
    ).fetchone()
    keywords = split_keywords(row["keywords"]) if row else []
    existing_lower = {k.lower() for k in keywords}
    for k in new_keywords:
        if k.lower() not in existing_lower:
            keywords.append(k)
            existing_lower.add(k.lower())  # also dedupes within new_keywords
    previous_channel_id = (
        row["channel_id"] if row and row["channel_id"] != channel_id else None
    )
    # created_at is only set on first insert; a merge keeps the original, so
    # posts older than the subscription never trigger pings (see poller).
    _conn.execute(
        "INSERT INTO subscriptions (guild_id, user_id, subreddit, keywords, channel_id, created_at)"
        " VALUES (?, ?, ?, ?, ?, ?)"
        " ON CONFLICT (guild_id, user_id, subreddit)"
        " DO UPDATE SET keywords=excluded.keywords, channel_id=excluded.channel_id",
        (guild_id, user_id, subreddit, ",".join(keywords), channel_id, int(time.time())),
    )
    _conn.commit()
    return keywords, previous_channel_id


def remove_subscription(guild_id: int, user_id: int, subreddit: str) -> bool:
    cur = _conn.execute(
        "DELETE FROM subscriptions WHERE guild_id=? AND user_id=? AND subreddit=?",
        (guild_id, user_id, subreddit),
    )
    _conn.commit()
    return cur.rowcount > 0


def remove_keyword(
    guild_id: int, user_id: int, subreddit: str, keyword: str
) -> list[str] | None:
    """Remove one keyword. Returns the remaining keywords, or None if no such
    subscription/keyword. Deletes the subscription if its last keyword is removed."""
    row = _conn.execute(
        "SELECT keywords FROM subscriptions WHERE guild_id=? AND user_id=? AND subreddit=?",
        (guild_id, user_id, subreddit),
    ).fetchone()
    if row is None:
        return None
    keywords = split_keywords(row["keywords"])
    remaining = [k for k in keywords if k.lower() != keyword.lower()]
    if len(remaining) == len(keywords):
        return None
    if remaining:
        _conn.execute(
            "UPDATE subscriptions SET keywords=? WHERE guild_id=? AND user_id=? AND subreddit=?",
            (",".join(remaining), guild_id, user_id, subreddit),
        )
    else:
        _conn.execute(
            "DELETE FROM subscriptions WHERE guild_id=? AND user_id=? AND subreddit=?",
            (guild_id, user_id, subreddit),
        )
    _conn.commit()
    return remaining


def list_subscriptions(guild_id: int, user_id: int) -> list[sqlite3.Row]:
    return _conn.execute(
        "SELECT subreddit, keywords, channel_id FROM subscriptions"
        " WHERE guild_id=? AND user_id=? ORDER BY subreddit",
        (guild_id, user_id),
    ).fetchall()


def all_subscriptions() -> list[sqlite3.Row]:
    return _conn.execute(
        "SELECT guild_id, user_id, subreddit, keywords, channel_id, created_at"
        " FROM subscriptions"
    ).fetchall()


def distinct_subreddits() -> list[str]:
    rows = _conn.execute("SELECT DISTINCT subreddit FROM subscriptions").fetchall()
    return [r["subreddit"] for r in rows]


def is_seen(post_id: str) -> bool:
    return (
        _conn.execute("SELECT 1 FROM seen_posts WHERE post_id=?", (post_id,)).fetchone()
        is not None
    )


def mark_seen(post_id: str) -> None:
    _conn.execute(
        "INSERT OR IGNORE INTO seen_posts (post_id, seen_at) VALUES (?, ?)",
        (post_id, int(time.time())),
    )
    _conn.commit()


def prune_seen(keep: int = 1000) -> None:
    # Keep the newest N rows rather than pruning by age: a post still in the
    # 100-post /new listing is always among the newest ~100 seen, so it can
    # never be pruned and re-ping — no matter how slow the subreddits are.
    _conn.execute(
        "DELETE FROM seen_posts WHERE post_id NOT IN"
        " (SELECT post_id FROM seen_posts ORDER BY seen_at DESC LIMIT ?)",
        (keep,),
    )
    _conn.commit()
