"""LLM enrichment via a local Ollama service, with graceful fallback.

Only new items hit the model; results are cached in SQLite so an item is
summarized exactly once. If Ollama is down or slow, or the per-cycle failure
budget trips the breaker, we leave the feed's own (truncated) summary in place —
the digest is never worse than it was without the LLM.

Ollama runs natively on the Mac Studio (Metal); reached via Caddy at
https://ollama.ankit.casa. Tailnet-only — never on the LAN or the funnel.
"""

import hashlib
import logging
import os

import httpx

import db
from backoff import retry_fib

log = logging.getLogger(__name__)

OLLAMA_URL = (os.environ.get("OLLAMA_URL") or "http://ollama:11434").rstrip("/")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL") or "qwen2.5:3b"
OLLAMA_TIMEOUT = float(os.environ.get("OLLAMA_TIMEOUT") or 90)
KEEP_ALIVE = os.environ.get("OLLAMA_KEEP_ALIVE") or "10m"
ENABLED = (os.environ.get("SUMMARY_ENABLED") or "1").lower() not in ("0", "false", "no", "")
MAX_PER_CYCLE = int(os.environ.get("SUMMARY_MAX_PER_CYCLE") or 50)
BREAKER_THRESHOLD = int(os.environ.get("SUMMARY_BREAKER_THRESHOLD") or 3)

# Too little source text to improve on — skip the call, keep what we have.
MIN_TEXT = 20
# How many headlines feed the themes overview.
THEME_TITLES = 40

ITEM_PROMPT = (
    "Summarize this article in 1-2 clear, factual sentences for a news digest. "
    "Write the summary only — no preamble, no 'this article', no quotes.\n\n"
    "Title: {title}\n\nText: {text}\n\nSummary:"
)

# A small model will happily restate every headline as a list unless told not
# to, in strong terms — this phrasing was validated on the Pi's local qwen2.5.
THEME_PROMPT = (
    "You are writing the one-paragraph intro to a daily tech-news digest. Do "
    "NOT list, number, or restate the individual headlines. In 2-3 flowing "
    "sentences, name the big-picture themes connecting today's stories — which "
    "topics dominate and any pattern worth noticing.\n\nHeadlines:\n{titles}\n\n"
    "Paragraph (2-3 sentences, prose, no lists):"
)


async def _generate(client: httpx.AsyncClient, prompt: str, num_predict: int) -> str:
    async def call() -> str:
        resp = await client.post(
            f"{OLLAMA_URL}/api/generate",
            json={
                "model": OLLAMA_MODEL,
                "prompt": prompt,
                "stream": False,
                "keep_alive": KEEP_ALIVE,
                "options": {"temperature": 0.2, "num_predict": num_predict},
            },
            timeout=OLLAMA_TIMEOUT,
        )
        resp.raise_for_status()
        return (resp.json().get("response") or "").strip()

    return await retry_fib(call, tries=3, label="ollama")


class Summarizer:
    """One instance for the app; failure state resets at the start of each cycle."""

    def __init__(self) -> None:
        self._fails = 0
        self._budget = 0

    @property
    def _tripped(self) -> bool:
        return self._fails >= BREAKER_THRESHOLD

    async def summarize_items(self, client: httpx.AsyncClient, items: list[dict]) -> None:
        """Replace each item's summary with an LLM rewrite (cached, new items only)."""
        if not ENABLED:
            return
        self._fails = 0
        self._budget = MAX_PER_CYCLE
        for item in items:
            cached = db.get_summary(item["id"], OLLAMA_MODEL)
            if cached:
                item["summary"] = cached
                item["summarized"] = True
                continue
            text = (item.get("summary") or "").strip()
            if len(text) < MIN_TEXT:
                continue  # link-only item (e.g. HN) — nothing to improve on
            if self._tripped or self._budget <= 0:
                continue  # keep the truncated fallback already in place
            self._budget -= 1
            try:
                out = await _generate(
                    client,
                    ITEM_PROMPT.format(title=item["title"], text=text),
                    num_predict=120,
                )
                self._fails = 0
                if out:
                    db.save_summary(item["id"], OLLAMA_MODEL, out)
                    item["summary"] = out
                    item["summarized"] = True
            except Exception as e:  # noqa: BLE001 — fallback summary stays in place
                self._fails += 1
                log.warning("summarize failed for %s (%r); using fallback", item["id"], e)
        if self._tripped:
            log.warning("summary breaker tripped after %d failures; rest of cycle used fallback", self._fails)

    async def themes(self, client: httpx.AsyncClient, items: list[dict]) -> str | None:
        """A short 'today's themes' overview over the top headlines (cached by title set)."""
        if not ENABLED or self._tripped or not items:
            return None
        titles = "\n".join(f"- {i['title']}" for i in items[:THEME_TITLES])
        key = hashlib.sha1(titles.encode()).hexdigest()
        cached = db.get_theme(key)
        if cached is not None:
            return cached
        try:
            out = await _generate(client, THEME_PROMPT.format(titles=titles), num_predict=200)
        except Exception as e:  # noqa: BLE001 — no overview is fine
            log.warning("themes generation failed (%r)", e)
            return None
        if out:
            db.save_theme(key, out)
        return out or None
