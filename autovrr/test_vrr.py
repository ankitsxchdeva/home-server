"""Local test harness for the VRR registration flow in bot.py.

Usage (from the autovrr/ dir, venv active):
    python test_vrr.py discover "Matador"        # list apartment dropdown matches
    APARTMENT_NAME="Matador Apartments" UNIT_NUMBER=340 \
    RESIDENT_NAME="Ankit Sachdeva" \
    VISITOR_NAME="Sivani Mallikarjuna" VISITOR_PHONE="301-732-9635" \
    VISITOR_EMAIL="sivani.mallikarjuna0@gmail.com" \
    python test_vrr.py register MDC8873 Honda CR-V   # REAL submission

Screenshots land in ./test-shots/ (bot.py's /app/*.png writes fail silently on macOS).
"""

import asyncio
import os
import sys


async def discover(query: str):
    from playwright.async_api import async_playwright

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await (await browser.new_context()).new_page()
        await page.goto("https://app.vrrparking.com/visitors", wait_until="networkidle", timeout=30000)
        apt = page.locator('input[placeholder="Enter Apartment Name"]')
        await apt.wait_for(state="visible", timeout=10000)
        await apt.fill(query)
        await page.wait_for_timeout(2500)
        options = page.locator('.property-item, [role="option"], .p-autocomplete-item')
        count = await options.count()
        print(f"{count} dropdown option(s) for {query!r}:")
        for i in range(count):
            print(" -", (await options.nth(i).inner_text()).strip())
        if count == 0:
            print("page text (first 1500 chars):")
            print((await page.inner_text("body"))[:1500])
        await browser.close()


async def register(plate: str, make: str, model: str):
    import bot

    print(f"Config: apartment={bot.APARTMENT_NAME!r} unit={bot.UNIT_NUMBER!r} "
          f"access_code={'set' if bot.ACCESS_CODE else 'EMPTY'} resident={bot.RESIDENT_NAME!r}")
    result = await bot.register_visitor_parking(plate, make, model)
    print("RESULT:", result)
    sys.exit(0 if result["success"] else 1)


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else ""
    if mode == "discover" and len(sys.argv) == 3:
        asyncio.run(discover(sys.argv[2]))
    elif mode == "register" and len(sys.argv) == 5:
        asyncio.run(register(sys.argv[2], sys.argv[3], sys.argv[4]))
    else:
        print(__doc__)
        sys.exit(2)
