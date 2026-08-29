"""LLM enrichment via a local Ollama service, with graceful fallback.

Only new items hit the model; results are cached in SQLite so an item is
summarized exactly once. Summaries are written from the full article text
(extract.py) when we can get it, else the feed's own (truncated) blurb; items
with neither are skipped. If Ollama is down or slow, or the per-cycle failure
budget trips the breaker, we leave the feed's own summary in place —
the digest is never worse than it was without the LLM.

Ollama runs natively on the Mac Studio (Metal); reached via Caddy at
https://ollama.ankit.casa. Tailnet-only — never on the LAN or the funnel.
"""

import asyncio
import hashlib
import logging
import os
import re

import httpx

import db
import extract
from backoff import retry_fib

log = logging.getLogger(__name__)

OLLAMA_URL = (os.environ.get("OLLAMA_URL") or "http://ollama:11434").rstrip("/")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL") or "qwen3.8:27b"
OLLAMA_TIMEOUT = float(os.environ.get("OLLAMA_TIMEOUT") or 90)
KEEP_ALIVE = os.environ.get("OLLAMA_KEEP_ALIVE") or "10m"
ENABLED = (os.environ.get("SUMMARY_ENABLED") or "1").lower() not in ("0", "false", "no", "")
MAX_PER_CYCLE = int(os.environ.get("SUMMARY_MAX_PER_CYCLE") or 50)
BREAKER_THRESHOLD = int(os.environ.get("SUMMARY_BREAKER_THRESHOLD") or 3)

# Too little source text to improve on — skip the call, keep what we have.
MIN_TEXT = 20
# Article text is capped well below the model's context so the prompt stays cheap.
MAX_ARTICLE_CHARS = 6000
# Extraction runs concurrently; the LLM calls below stay serial (Ollama is).
_extract_sem = asyncio.Semaphore(6)
# How many headlines feed the themes overview.
THEME_TITLES = 40

ITEM_PROMPT = (
    "Summarize this article in 1-2 clear, factual sentences for a news digest. "
    "Write the summary only — no preamble, no 'this article', no quotes.\n\n"
    "Title: {title}\n\nArticle text: {text}\n\nSummary:"
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


async def _article_text(client: httpx.AsyncClient, item: dict) -> str:
    """Full article text for one item, capped for the prompt; "" on failure."""
    url = (item.get("url") or "").strip()
    if not url:
        return ""
    async with _extract_sem:
        text = await extract.extract_text(client, url)
    return text[:MAX_ARTICLE_CHARS]


async def _generate(client: httpx.AsyncClient, prompt: str, num_predict: int) -> str:
    async def call() -> str:
        resp = await client.post(
            f"{OLLAMA_URL}/api/generate",
            json={
                "model": OLLAMA_MODEL,
                "prompt": prompt,
                "stream": False,
                "keep_alive": KEEP_ALIVE,
                # qwen3.8 is a thinking model; thinking would eat the whole
                # num_predict budget and return an empty response.
                "think": False,
                "options": {"temperature": 0.2, "num_predict": num_predict},
            },
            timeout=OLLAMA_TIMEOUT,
        )
        resp.raise_for_status()
        out = (resp.json().get("response") or "").strip()
        # Belt-and-suspenders: if thinking ever leaks through anyway, drop it.
        return re.sub(r"<think>.*?</think>", "", out, flags=re.DOTALL).strip()

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
        pending = []
        for item in items:
            cached = db.get_summary(item["id"], OLLAMA_MODEL)
            if cached:
                item["summary"] = cached
                item["summarized"] = True
            else:
                pending.append(item)
        # Fetch article text for all new items up front, concurrently — Ollama
        # is serial, so extraction is the only stage worth parallelizing. A
        # failure yields "" and falls back to the blurb; it is not an LLM
        # failure and never touches the breaker.
        articles = await asyncio.gather(*(_article_text(client, i) for i in pending))
        for item, article in zip(pending, articles):
            text = article if len(article) >= MIN_TEXT else (item.get("summary") or "").strip()
            if len(text) < MIN_TEXT:
                continue  # no article text and no usable blurb — nothing to improve on
            if self._tripped or self._budget <= 0:
                continue  # keep the truncated fallback already in place
            self._budget -= 1
            try:
                out = await _generate(
                    client,
                    ITEM_PROMPT.format(title=item["title"], text=text),
                    num_predict=160,
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
