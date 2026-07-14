"""
Discord bot that detects Google Forms links in a channel,
extracts embedded images, and replies with those images.
"""

import asyncio
import io
import os
import sys
import re
from typing import NamedTuple

import discord
from dotenv import load_dotenv
from playwright.async_api import (
    async_playwright,
    TimeoutError as PlaywrightTimeoutError,
)

load_dotenv()


def _require_token() -> str:
    token = os.getenv("DISCORD_TOKEN")
    if not token:
        sys.exit("Error: DISCORD_TOKEN not set in environment or .env file")
    return token


# Matches short links (forms.gle/...) and full URLs (docs.google.com/forms/...)
FORMS_PATTERN = re.compile(
    r"https?://(?:forms\.gle/[^\s>\"']+|docs\.google\.com/forms/[^\s>\"']+)"
)

# Skip Google branding/logo images
SKIP_HOSTS = ("gstatic.com",)

# Collect every image URL on the page: <img src> plus CSS background-image,
# which is how Google Forms renders some uploaded images.
_COLLECT_IMAGE_URLS_JS = r"""() => {
    const out = [];
    document.querySelectorAll('img[src]').forEach(i => out.push(i.src));
    document.querySelectorAll('*').forEach(el => {
        const bg = getComputedStyle(el).backgroundImage;
        const m = bg && bg.match(/url\(["']?(.*?)["']?\)/);
        if (m && m[1]) out.push(m[1]);
    });
    return out;
}"""


def _extension_for(content_type: str) -> str:
    ext = content_type.split("/")[-1].split(";")[0].strip().lower()
    if ext in ("jpeg", "jpg"):
        return ".jpg"
    if ext in ("png", "gif", "webp"):
        return f".{ext}"
    return ".png"


class FormResult(NamedTuple):
    images: list[tuple[bytes, str]]  # (data, filename) pairs that downloaded OK
    candidates: int                  # how many non-skipped image URLs were found


async def fetch_form_images(url: str) -> FormResult:
    """
    Open the Google Form in a headless browser and return its embedded
    user-uploaded images as (data, filename) pairs.

    Images are fetched *through the browser context* (page.request) so that
    Google's session-scoped image URLs (docs.google.com/forms-images-rt/...)
    resolve correctly — fetching them with a cookie-less HTTP client returns
    HTTP 400 and the image is lost.

    Raises on genuine navigation failures (bad domain, unreachable form) so
    the caller can surface an error to the user.
    """
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        try:
            page = await browser.new_page()
            try:
                await page.goto(url, wait_until="networkidle", timeout=30_000)
            except PlaywrightTimeoutError:
                # networkidle can hang on Forms' long-poll; DOM-ready is enough.
                await page.wait_for_load_state("domcontentloaded")

            raw_urls = await page.evaluate(_COLLECT_IMAGE_URLS_JS)

            seen: set[str] = set()
            images: list[tuple[bytes, str]] = []
            candidates = 0
            for src in raw_urls:
                if not src or src.startswith("data:"):
                    continue
                if any(host in src for host in SKIP_HOSTS):
                    continue
                if src in seen:
                    continue
                seen.add(src)
                candidates += 1

                try:
                    resp = await page.request.get(src, timeout=20_000)
                except Exception as exc:
                    print(f"[warn] request error for {src[:90]}: {exc}", file=sys.stderr)
                    continue
                if not resp.ok:
                    print(f"[warn] HTTP {resp.status} for {src[:90]}", file=sys.stderr)
                    continue

                data = await resp.body()
                if not data:
                    continue
                ct = resp.headers.get("content-type", "image/png")
                images.append((data, f"image_{len(images) + 1}{_extension_for(ct)}"))

            return FormResult(images=images, candidates=candidates)
        finally:
            await browser.close()


class FormImageBot(discord.Client):
    def __init__(self):
        intents = discord.Intents.default()
        intents.message_content = True
        super().__init__(intents=intents)

    async def on_ready(self):
        print(f"Logged in as {self.user} ({self.user.id})")

    async def on_message(self, message: discord.Message):
        # Ignore own messages
        if message.author == self.user:
            return

        # Collect text to search: direct content + any forwarded message snapshots
        texts = [message.content or ""]
        for snapshot in getattr(message, "message_snapshots", []):
            texts.append(snapshot.content or "")

        seen: set[str] = set()
        unique_urls: list[str] = []
        for text in texts:
            for url in FORMS_PATTERN.findall(text):
                if url not in seen:
                    seen.add(url)
                    unique_urls.append(url)

        if not unique_urls:
            return

        for form_url in unique_urls:
            await self._handle_form(message, form_url)

    async def _safe_reply(self, message: discord.Message, text: str):
        """Reply without letting a Discord error crash message handling."""
        try:
            await message.reply(text, mention_author=False)
        except discord.HTTPException as exc:
            print(f"[error] Could not send reply: {exc}", file=sys.stderr)

    async def _handle_form(self, message: discord.Message, form_url: str):
        print(
            f"[info] Processing {form_url} from {message.author} "
            f"in #{message.channel}",
            file=sys.stderr,
        )
        async with message.channel.typing():
            try:
                result = await fetch_form_images(form_url)
            except Exception as exc:
                print(f"[error] Failed to process {form_url}: {exc}", file=sys.stderr)
                await self._safe_reply(
                    message,
                    "⚠️ Couldn't open that Google Form — it may be private, "
                    "deleted, or unreachable.",
                )
                return

            if not result.images:
                if result.candidates:
                    # Found images but every download failed — that's a real error.
                    print(
                        f"[error] Found {result.candidates} image(s) but none "
                        f"downloaded for {form_url}",
                        file=sys.stderr,
                    )
                    await self._safe_reply(
                        message,
                        f"⚠️ Found {result.candidates} image(s) in that form but "
                        "couldn't download them.",
                    )
                else:
                    # Form genuinely has no images — stay silent, just log.
                    print(f"[info] No images found for {form_url}", file=sys.stderr)
                return

            # Discord allows up to 10 files per message; split into batches
            batch_size = 10
            for i in range(0, len(result.images), batch_size):
                batch = result.images[i : i + batch_size]
                files = [
                    discord.File(io.BytesIO(data), filename=name)
                    for data, name in batch
                ]
                try:
                    if i == 0:
                        await message.reply(files=files, mention_author=False)
                    else:
                        await message.channel.send(files=files)
                except discord.HTTPException as exc:
                    print(f"[error] Discord upload failed: {exc}", file=sys.stderr)
                    await self._safe_reply(
                        message,
                        "⚠️ Found images but Discord rejected the upload "
                        "(they may be too large).",
                    )
                    return


def main():
    token = _require_token()
    bot = FormImageBot()
    bot.run(token)


if __name__ == "__main__":
    main()
