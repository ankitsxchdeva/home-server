"""Story clustering: group items from different feeds that report the same story.

Titles are normalized (site-name suffixes stripped, punctuation and stopwords
removed), then pairs match on token containment + Jaccard or near-identical
string ratio. Matches merge transitively (union-find); one representative per
cluster survives and the rest move into its ``related`` list.
"""

import json
import re
from difflib import SequenceMatcher
from pathlib import Path

BASE = Path(__file__).parent
DATA_FILE = BASE / "data" / "data.json"

# A pair matches when one title's tokens are mostly contained in the other's
# (>= 0.6) AND they share enough overall (Jaccard >= 0.4): containment alone
# would merge a short title into any longer one sharing a couple of words.
CONTAINMENT_THRESHOLD = 0.6
JACCARD_THRESHOLD = 0.4
# Near-identical normalized titles (reordered words, punctuation variants)
# match even when token thresholds fall short.
TITLE_RATIO_THRESHOLD = 0.85

STOPWORDS = {
    "a", "an", "the", "and", "or", "but", "of", "to", "in", "on", "for",
    "with", "at", "by", "from", "as", "is", "are", "was", "were", "be",
    "been", "it", "its", "this", "that", "over", "after", "says", "new",
    "how", "why", "what",
}

# "Story headline | Site Name" / "Story headline — Site Name": the tail after
# the last pipe or dash is almost always the publisher, not the story.
_PIPE_SUFFIX = re.compile(r"\s+[|—–]\s+.+$")
# Hyphen suffixes are riskier (real headlines use " - " too), so only strip a
# short tail of up to 4 words.
_HYPHEN_SUFFIX = re.compile(r"\s+-\s+\S+(?:\s+\S+){0,3}$")
_NON_ALNUM = re.compile(r"[^a-z0-9\s]")
_WHITESPACE = re.compile(r"\s+")


def normalize_title(title: str) -> str:
    """Lowercase, drop the site-name suffix, punctuation, and stopwords."""
    text = (title or "").lower()
    text = _PIPE_SUFFIX.sub("", text)
    text = _HYPHEN_SUFFIX.sub("", text)
    text = _NON_ALNUM.sub(" ", text)
    tokens = [t for t in _WHITESPACE.split(text) if t and t not in STOPWORDS]
    return " ".join(tokens)


def _same_story(a: dict, b: dict) -> bool:
    """Two items are the same story only if they come from different sources."""
    if a["source"] == b["source"]:
        return False
    title_a, title_b = normalize_title(a["title"]), normalize_title(b["title"])
    if not title_a or not title_b:
        return False
    if (
        SequenceMatcher(None, title_a, title_b).ratio() >= TITLE_RATIO_THRESHOLD
    ):
        return True
    tokens_a, tokens_b = set(title_a.split()), set(title_b.split())
    if not tokens_a or not tokens_b:
        return False
    overlap = len(tokens_a & tokens_b)
    containment = overlap / min(len(tokens_a), len(tokens_b))
    jaccard = overlap / len(tokens_a | tokens_b)
    return containment >= CONTAINMENT_THRESHOLD and jaccard >= JACCARD_THRESHOLD


def find_clusters(items: list[dict]) -> list[list[dict]]:
    """Group input items into clusters of size >= 2 (input order preserved)."""
    parent = list(range(len(items)))

    def root(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for i in range(len(items)):
        for j in range(i + 1, len(items)):
            if root(i) != root(j) and _same_story(items[i], items[j]):
                parent[root(j)] = root(i)
    groups: dict[int, list[dict]] = {}
    for i, item in enumerate(items):
        groups.setdefault(root(i), []).append(item)
    clusters = [g for g in groups.values() if len(g) >= 2]
    # Deterministic order: by first appearance in the input.
    clusters.sort(key=lambda g: items.index(g[0]))
    return clusters


def _representative(cluster: list[dict]) -> dict:
    """Longest summary (substance proxy), then newest, then title — stable."""
    return max(
        cluster,
        key=lambda i: (
            len(i.get("summary") or ""),
            i.get("published") or "",
            i.get("title") or "",
        ),
    )


def _related_entry(item: dict) -> dict:
    return {
        "id": item["id"],
        "title": item["title"],
        "url": item["url"],
        "source": item["source"],
        "published": item.get("published"),
    }


def cluster_items(items: list[dict]) -> list[dict]:
    """Return a new list with one representative per cluster.

    Every output item is a shallow copy carrying ``related``: the other
    cluster members as {id, title, url, source, published} dicts (empty for
    singletons). Input items are not mutated.
    """
    rep_by_member: dict[int, dict] = {}
    related_by_rep: dict[int, list[dict]] = {}
    for cluster in find_clusters(items):
        rep = _representative(cluster)
        for member in cluster:
            rep_by_member[id(member)] = rep
        related_by_rep[id(rep)] = [
            _related_entry(m) for m in cluster if m is not rep
        ]
    out = []
    for item in items:
        rep = rep_by_member.get(id(item), item)
        if rep is not item:
            continue  # absorbed into a representative already emitted
        merged = dict(rep)
        merged["related"] = related_by_rep.get(id(rep), [])
        out.append(merged)
    return out


_SAMPLE = [
    {
        "id": "a1",
        "source": "Hacker News",
        "category": "software",
        "title": "Acme raises $10M to build delivery robots",
        "url": "https://acme.example/blog/10m",
        "published": "2026-07-15T10:00:00Z",
        "summary": "Acme's own announcement of the round.",
        "tags": [],
    },
    {
        "id": "a2",
        "source": "TechBlog",
        "category": "software",
        "title": "Acme raises $10M to build delivery robots | TechBlog",
        "url": "https://techblog.example/acme-10m",
        "published": "2026-07-15T11:00:00Z",
        "summary": "Coverage of Acme's $10M round, with context on the robot market and prior funding.",
        "tags": [],
    },
    {
        "id": "b1",
        "source": "FedWatch",
        "category": "finance",
        "title": "Fed holds interest rates steady",
        "url": "https://fedwatch.example/rates",
        "published": "2026-07-15T09:00:00Z",
        "summary": "The Fed kept rates unchanged.",
        "tags": [],
    },
    {
        "id": "b2",
        "source": "MarketWire",
        "category": "finance",
        "title": "Fed holds interest rates steady — MarketWire",
        "url": "https://marketwire.example/fed",
        "published": "2026-07-15T09:30:00Z",
        "summary": "Analysis of the Fed's decision to hold rates steady and what it means for bonds.",
        "tags": [],
    },
    {
        "id": "c1",
        "source": "Hacker News",
        "category": "software",
        "title": "Collection of Digital Clock Designs",
        "url": "https://clocks.example",
        "published": "2026-07-15T08:00:00Z",
        "summary": "A gallery of clocks.",
        "tags": [],
    },
]


def _demo(items: list[dict], label: str) -> None:
    print(f"{label}: {len(items)} items")
    clusters = find_clusters(items)
    clustered = sum(len(c) for c in clusters)
    for cluster in clusters:
        rep = _representative(cluster)
        print(f"\n[{rep['source']}] {rep['title']}")
        for member in cluster:
            if member is not rep:
                print(f"  also: [{member['source']}] {member['title']}")
    if not clusters:
        print("\nNo clusters found.")
    print(f"\n{len(clusters)} clusters, {len(items) - clustered} singletons")


if __name__ == "__main__":
    if DATA_FILE.exists():
        data = json.loads(DATA_FILE.read_text())
        _demo(data.get("items", []), "data/data.json")
    else:
        _demo(_SAMPLE, "embedded sample")
