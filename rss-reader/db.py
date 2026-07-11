"""SQLite store for saved (read-later) items. Lives on the data volume."""

import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent / "data" / "saved.db"
_conn: sqlite3.Connection | None = None


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


def list_items() -> list[dict]:
    rows = _conn.execute("SELECT * FROM saved ORDER BY saved_at DESC").fetchall()
    return [dict(r) for r in rows]
