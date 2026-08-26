"""
Discord bot that detects Google Forms links in a channel,
extracts embedded images, and replies with those images.

Image extraction runs in a `--worker` child process: a wedged Playwright
driver ignores asyncio cancellation, so an in-process wait_for timeout
can't actually stop it (the handler hung forever on 2026-07-20 and again
on 2026-08-26). A child process group can simply be SIGKILLed on timeout.
"""

import asyncio
import io
import json
import math
import os
import shutil
import signal
import sys
import re
import tempfile
import traceback
from typing import NamedTuple

import discord
from PIL import Image
from dotenv import load_dotenv

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

# Hard cap on one form's end-to-end processing, enforced by SIGKILLing the
# worker's whole process group (see fetch_form_images).
HANDLE_FORM_TIMEOUT_S = 120

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


# Collage layout: near-square grid of fixed-width cells. Tiles are
# cover-cropped (scale to fill, crop the overflow) so no background shows.
COLLAGE_CELL_PX = 512
COLLAGE_BG = (30, 30, 30)


def _cover_crop(img: Image.Image, target_w: int, target_h: int) -> Image.Image:
    """Scale img to completely fill target_w x target_h, center-cropping the overflow."""
    scale = max(target_w / img.width, target_h / img.height)
    w = max(target_w, math.ceil(img.width * scale))
    h = max(target_h, math.ceil(img.height * scale))
    img = img.resize((w, h), Image.LANCZOS)
    left = (w - target_w) // 2
    top = (h - target_h) // 2
    return img.crop((left, top, left + target_w, top + target_h))


def build_collage(images: list[tuple[bytes, str]]) -> bytes | None:
    """
    Stitch images into a single grid collage, returned as JPEG bytes.
    Every cell is filled by its image (cover-crop) and the last row is
    stretched to span the full width, so no empty background shows.
    Undecodable images are skipped; returns None if nothing usable remains.
    """
    tiles: list[Image.Image] = []
    for data, name in images:
        try:
            img = Image.open(io.BytesIO(data))
            img.load()
        except Exception as exc:
            print(f"[warn] skipping undecodable image {name}: {exc}", file=sys.stderr)
            continue
        if img.mode != "RGB":
            # Flatten alpha/palette onto the background color
            rgba = img.convert("RGBA")
            flat = Image.new("RGB", rgba.size, COLLAGE_BG)
            flat.paste(rgba, mask=rgba.split()[-1])
            img = flat
        tiles.append(img)

    if not tiles:
        return None

    n = len(tiles)
    # Cell aspect follows the median tile (clamped near-square) so
    # cover-crops lose as little of the typical image as possible.
    aspects = sorted(t.width / t.height for t in tiles)
    aspect = min(max(aspects[n // 2], 0.75), 1.33)
    cell_w = COLLAGE_CELL_PX
    cell_h = round(cell_w / aspect)

    cols = math.ceil(math.sqrt(n))
    rows = math.ceil(n / cols)
    width, height = cols * cell_w, rows * cell_h
    collage = Image.new("RGB", (width, height), COLLAGE_BG)

    last_row = rows - 1
    last_row_tiles = n - cols * last_row
    for idx, img in enumerate(tiles):
        r, c = divmod(idx, cols)
        if r == last_row:
            # Stretch the short last row across the full collage width
            cw = width // last_row_tiles
            x = c * cw
            w = width - x if c == last_row_tiles - 1 else cw
        else:
            x, w = c * cell_w, cell_w
        collage.paste(_cover_crop(img, w, cell_h), (x, r * cell_h))

    buf = io.BytesIO()
    collage.save(buf, format="JPEG", quality=88)
    return buf.getvalue()


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


def _worker_fetch(url: str, outdir: str) -> None:
    """
    Child-process entry point (`python bot.py --worker <url> <outdir>`).

    Opens the form in headless Chromium (sync Playwright API), downloads
    every embedded user image into outdir, and prints a JSON summary as the
    LAST stdout line — {"candidates": N, "files": [...]} on success or
    {"fatal": "..."} on navigation-level failure. The parent only trusts
    files listed in that final line (it is printed after all writes).

    Images are fetched *through the browser context* (page.request) so that
    Google's session-scoped image URLs (docs.google.com/forms-images-rt/...)
    resolve correctly — fetching them with a cookie-less HTTP client returns
    HTTP 400 and the image is lost.
    """
    from playwright.sync_api import (
        sync_playwright,
        TimeoutError as PlaywrightTimeoutError,
    )

    files: list[str] = []
    candidates = 0
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True)
            try:
                page = browser.new_page()
                try:
                    page.goto(url, wait_until="networkidle", timeout=30_000)
                except PlaywrightTimeoutError:
                    # networkidle can hang on Forms' long-poll; DOM-ready is enough.
                    page.wait_for_load_state("domcontentloaded")

                raw_urls = page.evaluate(_COLLECT_IMAGE_URLS_JS)

                seen: set[str] = set()
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
                        resp = page.request.get(src, timeout=20_000)
                    except Exception as exc:
                        print(f"[warn] request error for {src[:90]}: {exc}", file=sys.stderr)
                        continue
                    if not resp.ok:
                        print(f"[warn] HTTP {resp.status} for {src[:90]}", file=sys.stderr)
                        continue

                    data = resp.body()
                    if not data:
                        continue
                    ct = resp.headers.get("content-type", "image/png")
                    name = f"image_{len(files) + 1}{_extension_for(ct)}"
                    with open(os.path.join(outdir, name), "wb") as fh:
                        fh.write(data)
                    files.append(name)
            finally:
                browser.close()
    except Exception as exc:
        traceback.print_exc()  # stderr → inherited → docker logs
        print(json.dumps({"fatal": f"{type(exc).__name__}: {exc}"}))
        return
    print(json.dumps({"candidates": candidates, "files": files}))


async def fetch_form_images(url: str) -> FormResult:
    """
    Fetch a form's embedded images via a `--worker` child process.

    A wedged Playwright driver ignores asyncio cancellation, so the fetch
    runs out-of-process: on timeout the whole process group (python + node
    driver + chromium) is SIGKILLed, which needs no cooperation from the
    wedged driver.

    Raises TimeoutError on timeout and RuntimeError on worker failure, so
    the caller can surface the right error to the user.
    """
    outdir = tempfile.mkdtemp(prefix="gform-")
    try:
        proc = await asyncio.create_subprocess_exec(
            sys.executable, "-u", os.path.abspath(__file__), "--worker", url, outdir,
            stdout=asyncio.subprocess.PIPE,
            # stderr is inherited: worker [warn]/traceback lines land in
            # docker logs directly.
            start_new_session=True,  # process-group leader, so killpg works
        )
        try:
            stdout, _ = await asyncio.wait_for(
                proc.communicate(), timeout=HANDLE_FORM_TIMEOUT_S
            )
        except TimeoutError:
            try:
                os.killpg(proc.pid, signal.SIGKILL)  # proc.pid == pgid
            except ProcessLookupError:
                pass  # exited in the race window
            await proc.wait()  # reap
            raise

        lines = stdout.decode(errors="replace").strip().splitlines()
        summary = None
        if lines:
            try:
                summary = json.loads(lines[-1])
            except json.JSONDecodeError:
                summary = None
        if summary is None or "fatal" in summary:
            detail = summary["fatal"] if summary else f"exit code {proc.returncode}"
            raise RuntimeError(f"worker failed: {detail}")

        images: list[tuple[bytes, str]] = []
        for name in summary["files"]:
            with open(os.path.join(outdir, name), "rb") as fh:
                images.append((fh.read(), name))
        return FormResult(images=images, candidates=summary["candidates"])
    finally:
        shutil.rmtree(outdir, ignore_errors=True)


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
        for attempt in (1, 2):
            try:
                await message.reply(text, mention_author=False)
                return
            except discord.HTTPException as exc:
                print(
                    f"[error] Could not send reply (attempt {attempt}): {exc}",
                    file=sys.stderr,
                )
                # One retry, for transient server-side errors only
                if attempt == 1 and exc.status >= 500:
                    await asyncio.sleep(2)
                else:
                    return

    async def _handle_form(self, message: discord.Message, form_url: str):
        print(
            f"[info] Processing {form_url} from {message.author} "
            f"in #{message.channel}",
            file=sys.stderr,
        )
        try:
            async with message.channel.typing():
                result = await fetch_form_images(form_url)
        except TimeoutError:
            print(
                f"[error] Timed out after {HANDLE_FORM_TIMEOUT_S}s on {form_url}",
                file=sys.stderr,
            )
            await self._safe_reply(
                message,
                "⚠️ Timed out extracting images from that form — "
                "try posting it again.",
            )
            return
        except discord.HTTPException as exc:
            # Even the typing indicator can fail on a Discord blip (503 seen
            # 2026-07-21); make it a visible reply instead of a silent log line.
            print(
                f"[error] Discord API error while processing {form_url}: {exc}",
                file=sys.stderr,
            )
            await self._safe_reply(
                message,
                "⚠️ Discord hiccuped while I was reading that form — "
                "try posting it again.",
            )
            return
        except Exception as exc:
            print(f"[error] Failed to process {form_url}: {exc}", file=sys.stderr)
            await self._safe_reply(
                message,
                "⚠️ Couldn't open that Google Form — it may be private, "
                "deleted, or unreachable.",
            )
            return

        print(
            f"[info] Fetched {len(result.images)} image(s) "
            f"({result.candidates} candidates) from {form_url}",
            file=sys.stderr,
        )

        if not result.images:
            if result.candidates:
                # Found images but every download failed — that's a real error.
                await self._safe_reply(
                    message,
                    f"⚠️ Found {result.candidates} image(s) in that form but "
                    "couldn't download them.",
                )
            # Form with no images at all: stay silent.
            return

        # Discord allows up to 10 files per message. Beyond 10 images, put
        # the first 9 up as-is and make the 10th a collage of the rest, so
        # everything stays in a single reply. If the collage fails, fall
        # back to batched follow-up messages.
        images = result.images
        if len(images) > 10:
            collage = build_collage(images[9:])
            if collage is not None:
                images = images[:9] + [(collage, "collage.jpg")]
                print(
                    f"[info] Built collage of {len(result.images) - 9} image(s) "
                    f"({len(collage) // 1024}KB) for {form_url}",
                    file=sys.stderr,
                )
            else:
                print(
                    f"[warn] Collage failed for {form_url}; "
                    "falling back to batched posts",
                    file=sys.stderr,
                )

        batch_size = 10
        for i in range(0, len(images), batch_size):
            batch = images[i : i + batch_size]
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
            print(
                f"[info] Posted {len(files)} attachment(s) "
                f"({'reply' if i == 0 else 'follow-up'}) for {form_url}",
                file=sys.stderr,
            )


def main():
    if len(sys.argv) == 4 and sys.argv[1] == "--worker":
        _worker_fetch(sys.argv[2], sys.argv[3])
        return
    token = _require_token()
    bot = FormImageBot()
    bot.run(token)


if __name__ == "__main__":
    main()
