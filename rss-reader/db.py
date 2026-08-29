"""SQLite store for saved (read-later) items and the LLM summary cache.

Lives on the data volume.
"""

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

DB_PATH = Path(__file__).parent / "data" / "saved.db"
_conn: sqlite3.Connection | None = None


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def init() -> None:
    global _conn
    DB_PATH.parent.mkdir(exist_ok=True)
    _conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    _conn.row_factory = sqlite3.Row
    _conn.execute(
        """CREATE TABLE IF NOT EXISTS saved (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            url TEXT NOT NULL,
            source TEXT DEFAULT '',
            category TEXT DEFAULT '',
            published TEXT DEFAULT '',
            saved_at TEXT NOT NULL
        )"""
    )
    # LLM summary cache: an item is summarized once per model, then reused.
    _conn.execute(
        """CREATE TABLE IF NOT EXISTS summaries (
            id TEXT NOT NULL,
            model TEXT NOT NULL,
            summary TEXT NOT NULL,
            created_at TEXT NOT NULL,
            PRIMARY KEY (id, model)
        )"""
    )
    # Themes overview cache, keyed by a hash of the day's top headlines.
    _conn.execute(
        """CREATE TABLE IF NOT EXISTS themes (
            key TEXT PRIMARY KEY,
            text TEXT NOT NULL,
            created_at TEXT NOT NULL
        )"""
    )
    # Persistent archive of every digest item; first_seen survives re-upserts.
    _conn.execute(
        """CREATE TABLE IF NOT EXISTS items (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            url TEXT NOT NULL,
            source TEXT DEFAULT '',
            category TEXT DEFAULT '',
            published TEXT DEFAULT '',
            summary TEXT DEFAULT '',
            tags TEXT DEFAULT '[]',
            first_seen TEXT NOT NULL,
            last_seen TEXT NOT NULL
        )"""
    )
    _conn.commit()


def save_item(item: dict, saved_at: str) -> None:
    _conn.execute(
        "INSERT OR REPLACE INTO saved"
        " (id, title, url, source, category, published, saved_at)"
        " VALUES (?, ?, ?, ?, ?, ?, ?)",
        (
            item["id"],
            item["title"],
            item["url"],
            item.get("source", ""),
            item.get("category", ""),
            item.get("published", ""),
            saved_at,
        ),
    )
    _conn.commit()


def remove_item(item_id: str) -> bool:
    cur = _conn.execute("DELETE FROM saved WHERE id = ?", (item_id,))
    _conn.commit()
    return cur.rowcount > 0


def upsert_items(items: list[dict]) -> None:
    """Archive digest items; re-upserts refresh everything but first_seen."""
    now = _now()
    _conn.executemany(
        """INSERT INTO items
            (id, title, url, source, category, published, summary, tags,
             first_seen, last_seen)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
            title = excluded.title,
            url = excluded.url,
            source = excluded.source,
            category = excluded.category,
            published = excluded.published,
            summary = excluded.summary,
            tags = excluded.tags,
            last_seen = excluded.last_seen""",
        [
            (
                item["id"],
                item["title"],
                item["url"],
                item.get("source", ""),
                item.get("category", ""),
                item.get("published", ""),
                item.get("summary", ""),
                json.dumps(item.get("tags") or []),
                now,
                now,
            )
            for item in items
        ],
    )
    _conn.commit()


def items_since(since_iso: str) -> list[dict]:
    """Archive rows published at/after since_iso, newest first, undated last."""
    rows = _conn.execute(
        """SELECT * FROM items
           WHERE published = '' OR published >= ?
           ORDER BY CASE WHEN published = '' THEN 1 ELSE 0 END, published DESC""",
        (since_iso,),
    ).fetchall()
    items = []
    for row in rows:
        item = dict(row)
        try:
            item["tags"] = json.loads(item["tags"] or "[]")
        except ValueError:
            item["tags"] = []
        items.append(item)
    return items


def list_items() -> list[dict]:
    rows = _conn.execute("SELECT * FROM saved ORDER BY saved_at DESC").fetchall()
    return [dict(r) for r in rows]


def get_summary(item_id: str, model: str) -> str | None:
    row = _conn.execute(
        "SELECT summary FROM summaries WHERE id = ? AND model = ?", (item_id, model)
    ).fetchone()
    return row["summary"] if row else None


def save_summary(item_id: str, model: str, summary: str) -> None:
    _conn.execute(
        "INSERT OR REPLACE INTO summaries (id, model, summary, created_at)"
        " VALUES (?, ?, ?, ?)",
        (item_id, model, summary, _now()),
    )
    _conn.commit()


def get_theme(key: str) -> str | None:
    row = _conn.execute("SELECT text FROM themes WHERE key = ?", (key,)).fetchone()
    return row["text"] if row else None


def save_theme(key: str, text: str) -> None:
    _conn.execute(
        "INSERT OR REPLACE INTO themes (key, text, created_at) VALUES (?, ?, ?)",
        (key, text, _now()),
    )
    # Keep the table tiny: the digest only ever needs the most recent overviews.
    _conn.execute(
        "DELETE FROM themes WHERE key NOT IN"
        " (SELECT key FROM themes ORDER BY created_at DESC LIMIT 5)"
    )
    _conn.commit()
