"""Scraper registry: `scrape: <name>` in feeds.yaml → scrapers/<name>.py.

Each scraper module defines:

    async def scrape(client, source) -> list[dict]

returning raw items shaped {"title", "url", "published"?, "summary"?}.
Failures stay isolated to the source (fetch.fetch_source catches them).
"""

import importlib


def get(name: str):
    return importlib.import_module(f"scrapers.{name}").scrape
