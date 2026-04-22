"""
Discord bot that detects Google Forms links in a channel,
extracts embedded images, and replies with those images.
"""

import asyncio
import io
import os
import re
import sys

import aiohttp
import discord
from dotenv import load_dotenv
from playwright.async_api import async_playwright

load_dotenv()


def _require_token() -> str:
    token = os.getenv("DISCORD_TOKEN")
    if not token:
        sys.exit("Error: DISCORD_TOKEN not set in environment or .env file")
    return token

# Matches short links (forms.gle/...) and full URLs (docs.google.com/forms/...)
FORMS_PATTERN = re.compile(
    r"https?://(?:forms\.gle/\S+|docs\.google\.com/forms/[^\s>\"']+)"
)

# Skip Google branding/logo images
SKIP_HOSTS = ("www.gstatic.com",)


async def extract_form_info(url: str) -> dict:
    """
    Navigate to a Google Form with a headless browser and return:
      - title:     the form's h1 title
      - prices:    dollar amounts found outside shipping-related question groups
      - img_urls:  user-uploaded image URLs (excludes Google branding)
    """
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        page = await browser.new_page()

        try:
            await page.goto(url, wait_until="networkidle", timeout=30_000)
        except Exception:
            await page.wait_for_load_state("domcontentloaded")

        # Form title
        title = ""
        title_el = await page.query_selector("h1")
        if title_el:
            title = (await title_el.inner_text()).strip()

        # Prices — walk all text nodes; skip any that live inside a container
        # whose aria-label mentions shipping (e.g. "Shipping Required question").
        prices: list[str] = await page.evaluate("""
            () => {
                const PRICE_RE = /\\$\\d+(?:\\.\\d{2})?/g;
                const SHIP_RE  = /\\bship/i;

                function isInShippingGroup(el) {
                    let cur = el;
                    while (cur && cur !== document.body) {
                        if (SHIP_RE.test(cur.getAttribute('aria-label') || '')) return true;
                        cur = cur.parentElement;
                    }
                    return false;
                }

                const results = [];
                const seen = new Set();
                const walker = document.createTreeWalker(
                    document.body, NodeFilter.SHOW_TEXT, null
                );
                let node;
                while ((node = walker.nextNode())) {
                    const text = node.nodeValue || '';
                    PRICE_RE.lastIndex = 0;
                    let m;
                    while ((m = PRICE_RE.exec(text)) !== null) {
                        const price = m[0];
                        if (!seen.has(price) && !isInShippingGroup(node.parentElement)) {
                            seen.add(price);
                            results.push(price);
                        }
                    }
                }
                return results;
            }
        """)

        # Images
        img_urls: list[str] = []
        handles = await page.query_selector_all("img[src]")
        for handle in handles:
            src = await handle.get_attribute("src") or ""
            if not src or src.startswith("data:"):
                continue
            if any(skip in src for skip in SKIP_HOSTS):
                continue
            if src not in img_urls:
                img_urls.append(src)

        await browser.close()
        return {"title": title, "prices": prices, "img_urls": img_urls}


async def download_images(
    session: aiohttp.ClientSession, urls: list[str]
) -> list[tuple[bytes, str]]:
    """Download image bytes for each URL. Returns (data, filename) pairs."""
    results: list[tuple[bytes, str]] = []
    for i, url in enumerate(urls):
        try:
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=20)) as resp:
                if resp.status == 200:
                    data = await resp.read()
                    # Guess extension from content-type
                    ct = resp.headers.get("content-type", "image/png")
                    ext = ct.split("/")[-1].split(";")[0].strip()
                    if ext in ("jpeg", "jpg"):
                        ext = "jpg"
                    elif ext not in ("png", "gif", "webp"):
                        ext = "png"
                    results.append((data, f"image_{i + 1}.{ext}"))
        except Exception as exc:
            print(f"[warn] Failed to download {url}: {exc}")
    return results


class FormImageBot(discord.Client):
    def __init__(self):
        intents = discord.Intents.default()
        intents.message_content = True
        super().__init__(intents=intents)
        self._http_session: aiohttp.ClientSession | None = None

    async def setup_hook(self):
        self._http_session = aiohttp.ClientSession()

    async def close(self):
        if self._http_session:
            await self._http_session.close()
        await super().close()

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

    async def _handle_form(self, message: discord.Message, form_url: str):
        async with message.channel.typing():
            try:
                info = await extract_form_info(form_url)
            except Exception as exc:
                print(f"[error] Could not scrape {form_url}: {exc}")
                return

            title = info["title"]
            prices = info["prices"]
            img_urls = info["img_urls"]

            if not title and not prices and not img_urls:
                return  # Nothing found — stay silent

            # Build header: bold title + price line
            lines = []
            if title:
                lines.append(f"**{title}**")
            if prices:
                lines.append(f"Price: {', '.join(prices)}")
            header = "\n".join(lines)

            image_data = await download_images(self._http_session, img_urls) if img_urls else []

            if not image_data:
                if header:
                    await message.reply(header, mention_author=False)
                return

            # Discord allows up to 10 files per message; split into batches
            batch_size = 10
            for i in range(0, len(image_data), batch_size):
                batch = image_data[i : i + batch_size]
                files = [
                    discord.File(io.BytesIO(data), filename=name)
                    for data, name in batch
                ]
                if i == 0:
                    await message.reply(
                        header or f"Found {len(image_data)} image(s):",
                        files=files,
                        mention_author=False,
                    )
                else:
                    await message.channel.send(files=files)


def main():
    token = _require_token()
    bot = FormImageBot()
    bot.run(token)


if __name__ == "__main__":
    main()
