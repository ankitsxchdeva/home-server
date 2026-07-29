"""Shared retry helpers. Kept tiny so future Ollama callers reuse the same policy."""

import asyncio
import logging

log = logging.getLogger(__name__)


async def retry_fib(func, *, tries: int = 3, label: str = ""):
    """Await ``func()``, retrying on any exception with Fibonacci-spaced backoff.

    Sleeps 1s, 1s, 2s, 3s, 5s… between attempts. Returns func()'s result, or
    re-raises the last exception once ``tries`` attempts are exhausted.
    """
    a, b = 1, 1
    for attempt in range(1, tries + 1):
        try:
            return await func()
        except Exception as e:  # noqa: BLE001 — caller decides how to handle
            if attempt == tries:
                raise
            log.debug("%s attempt %d/%d failed (%r); retrying in %ds", label, attempt, tries, e, a)
            await asyncio.sleep(a)
            a, b = b, a + b
