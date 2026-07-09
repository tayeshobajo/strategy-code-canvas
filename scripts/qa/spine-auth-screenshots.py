import asyncio, json, os
from pathlib import Path
from playwright.async_api import async_playwright

OUT = Path("/tmp/browser/spine/screens"); OUT.mkdir(parents=True, exist_ok=True)
EMAIL = "qa-operator@trust-tai.com"
PASSWORD = os.environ["QA_SEED_PASSWORD"]
SUPA_URL = "https://jqehcikzvyewijjvpszh.supabase.co"
SUPA_KEY = "sb_publishable_mF24_o-spzzxHlB3i3jDkA_8euIpH9o"
STORAGE_KEY = "sb-jqehcikzvyewijjvpszh-auth-token"
JOTAYE = "bbbbbbb1-bbbb-bbbb-bbbb-bbbbbbbb0002"

PROJECTS = [
    ("jotaye", JOTAYE),
]

async def sign_in_via_supabase(page):
    # Call Supabase REST directly; write session to localStorage under sb-* key.
    result = await page.evaluate(
        """async ({url, key, email, password, storageKey}) => {
            const r = await fetch(`${url}/auth/v1/token?grant_type=password`, {
                method: 'POST',
                headers: {'apikey': key, 'Content-Type': 'application/json'},
                body: JSON.stringify({email, password}),
            });
            const j = await r.json();
            if (!r.ok) return {error: j};
            const session = {
                access_token: j.access_token, refresh_token: j.refresh_token,
                expires_at: Math.floor(Date.now()/1000) + (j.expires_in ?? 3600),
                expires_in: j.expires_in, token_type: j.token_type, user: j.user,
            };
            localStorage.setItem(storageKey, JSON.stringify(session));
            return {ok: true, email: j.user?.email};
        }""",
        {"url": SUPA_URL, "key": SUPA_KEY, "email": EMAIL,
         "password": PASSWORD, "storageKey": STORAGE_KEY},
    )
    return result

async def shot(page, name, viewport):
    await page.set_viewport_size(viewport)
    await page.wait_for_timeout(400)
    p = OUT / name
    await page.screenshot(path=str(p))
    print(f"  saved {p} ({viewport['width']}x{viewport['height']})")

async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1440, "height": 1600})
        page = await ctx.new_page()
        page.on("pageerror", lambda e: print(f"[pageerror] {e}"))
        await page.goto("http://localhost:8080/", wait_until="domcontentloaded")
        result = await sign_in_via_supabase(page)
        print("sign in:", result)
        if not result.get("ok"): 
            await browser.close(); return

        for slug, pid in PROJECTS:
            url = f"http://localhost:8080/engine/projects/{pid}/spine"
            print(f"\n[{slug}] -> {url}")
            await page.goto(url, wait_until="networkidle")
            await page.wait_for_timeout(1000)
            await shot(page, f"{slug}-desktop.png", {"width": 1440, "height": 1800})
            await shot(page, f"{slug}-tablet.png",  {"width": 768,  "height": 1400})
            await shot(page, f"{slug}-mobile.png",  {"width": 390,  "height": 1400})

        await browser.close()

asyncio.run(main())
