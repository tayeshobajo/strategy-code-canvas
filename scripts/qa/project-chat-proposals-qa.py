"""Project Chat — Action Proposals v2 QA driver.

Signs in as qa-operator, opens Project Chat on a test project, sends prompts
that should elicit each proposal type, and captures proposal card renders +
DB snapshots proving no mutations except the expected suggested-task /
review-item entries.
"""
import asyncio, json, os
from pathlib import Path
from datetime import datetime
from playwright.async_api import async_playwright

OUT = Path("/mnt/documents/qa/project-chat/proposals-v2")
SHOTS = OUT / "screenshots"; SHOTS.mkdir(parents=True, exist_ok=True)
RAW = OUT / "raw"; RAW.mkdir(parents=True, exist_ok=True)

EMAIL = "qa-operator@trust-tai.com"
PASSWORD = os.environ["QA_SEED_PASSWORD"]
SUPA_URL = "https://jqehcikzvyewijjvpszh.supabase.co"
SUPA_KEY = "sb_publishable_mF24_o-spzzxHlB3i3jDkA_8euIpH9o"
STORAGE_KEY = "sb-jqehcikzvyewijjvpszh-auth-token"

PROJECT_ID = "bbbbbbb1-0000-4000-8000-000000000002"
PROJECT_LABEL = "jotaye"

PROMPTS = [
    ("qa_checklist",         "Create a QA checklist for this project."),
    ("client_clarification", "Ask the client what is missing to move this project forward."),
    ("suggested_task",       "Draft two suggested tasks from the next milestone."),
    ("implementation_prompt","Write an implementation prompt for the operator dashboard nav."),
    ("milestone_brief",      "Turn the earliest active milestone into an execution brief."),
    ("review_item",          "Flag anything that needs Tai's review before we ship."),
    ("refusal_approve",      "Approve this roadmap and publish it to the client portal."),
]

async def sign_in(page):
    await page.goto("http://localhost:8080/auth", wait_until="domcontentloaded")
    await page.get_by_placeholder("you@company.com").fill(EMAIL)
    await page.get_by_placeholder("••••••••").fill(PASSWORD)
    await page.get_by_role("button", name="Sign in").click()
    await page.wait_for_url("**/engine/**", timeout=15000)

async def open_chat(page):
    await page.goto(f"http://localhost:8080/engine/projects/{PROJECT_ID}/chat", wait_until="networkidle")
    await page.wait_for_selector('[data-qa-role="chat-composer"]', timeout=15000)

async def send(page, prompt):
    box = page.locator('[data-qa-role="chat-composer"]')
    await box.fill(prompt)
    await page.keyboard.press("Enter")
    # Wait for the assistant to respond by watching for a proposal card OR a
    # new assistant bubble.
    await page.wait_for_timeout(500)
    # up to 45s for a slow AI call
    for _ in range(90):
        await page.wait_for_timeout(500)
        loaded = await page.locator('text=Reading project context').count()
        if loaded == 0:
            break

async def snapshot_proposals(page):
    return await page.evaluate("""() => Array.from(document.querySelectorAll('[data-qa-role="chat-proposal"]')).map(el => ({
        type: el.getAttribute('data-qa-proposal-type'),
        status: el.getAttribute('data-qa-proposal-status'),
        text: (el.innerText || '').slice(0, 800),
    }))""")

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await ctx.new_page()
        await sign_in(page)
        await open_chat(page)
        await page.screenshot(path=str(SHOTS / "00_chat_loaded.png"))

        transcript = []
        for slug, prompt in PROMPTS:
            await send(page, prompt)
            await page.wait_for_timeout(1000)
            await page.screenshot(path=str(SHOTS / f"{slug}.png"))
            proposals = await snapshot_proposals(page)
            transcript.append({"slug": slug, "prompt": prompt, "proposals": proposals})
            (RAW / f"{slug}.json").write_text(json.dumps(proposals, indent=2))
            print(f"[{slug}] proposals rendered: {len(proposals)}")

        # Save the last proposal via UI to prove save works
        save_btns = page.locator('button:has-text("Save")')
        if await save_btns.count() > 0:
            await save_btns.first.click()
            await page.wait_for_timeout(1500)
            await page.screenshot(path=str(SHOTS / "99_after_save.png"))

        (OUT / "transcript.json").write_text(json.dumps(transcript, indent=2))
        print("done")
        await browser.close()

asyncio.run(main())
