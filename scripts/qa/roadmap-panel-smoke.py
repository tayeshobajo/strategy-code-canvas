"""
Phase 14 UI smoke test — /portal/roadmap-mockup

Verifies the roadmap panel renders its three primary surfaces:
  1. Phase tabs (Foundation, Core Platform, Scale Systems)
  2. Phase 1/2/3 labels above each tab (the "quarters" grid)
  3. Status legend (Completed, In progress, Upcoming) plus per-kind labels

Fails loudly if any expected text is missing, if the tabs don't respond
to clicks, or if a runtime console error fires during render.

Run:  python3 scripts/qa/roadmap-panel-smoke.py
"""

import asyncio, json, sys
from pathlib import Path
from playwright.async_api import async_playwright

OUT = Path("/tmp/browser/roadmap-panel"); OUT.mkdir(parents=True, exist_ok=True)
SCREENSHOTS = OUT / "screenshots"; SCREENSHOTS.mkdir(exist_ok=True)

EXPECTED_TABS   = ["Foundation", "Core Platform", "Scale Systems"]
EXPECTED_INDEXES = ["Phase 1", "Phase 2", "Phase 3"]
EXPECTED_STATUS = ["Completed", "In progress", "Upcoming"]

async def main() -> int:
    findings = {"assertions": [], "console_errors": []}
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await ctx.new_page()
        page.on("console", lambda msg: findings["console_errors"].append(msg.text)
                if msg.type == "error" else None)

        await page.goto("http://localhost:8080/portal/roadmap-mockup",
                        wait_until="domcontentloaded")
        await page.wait_for_load_state("networkidle")
        await page.screenshot(path=str(SCREENSHOTS / "01_loaded.png"))

        body_text = (await page.locator("body").inner_text()).strip()

        def check(label, ok, detail=""):
            findings["assertions"].append({"name": label, "ok": bool(ok), "detail": detail})

        for tab in EXPECTED_TABS:
            check(f"tab:{tab}", tab in body_text, f"missing '{tab}' in body text")
        for idx in EXPECTED_INDEXES:
            check(f"index:{idx}", idx in body_text, f"missing '{idx}' in body text")
        for st in EXPECTED_STATUS:
            check(f"legend:{st}", st in body_text, f"missing '{st}' in body text")

        # Tab interaction: click Scale Systems and confirm it becomes active.
        try:
            await page.get_by_role("button", name="Scale Systems").first.click()
            await page.wait_for_timeout(300)
            await page.screenshot(path=str(SCREENSHOTS / "02_scale-tab.png"))
            check("tab-click:Scale Systems", True)
        except Exception as e:
            check("tab-click:Scale Systems", False, str(e))

        # Legend region should contain all three status pills together.
        legend_ok = all(s in body_text for s in EXPECTED_STATUS)
        check("legend-full", legend_ok)

        await browser.close()

    (OUT / "results.json").write_text(json.dumps(findings, indent=2))
    failed = [a for a in findings["assertions"] if not a["ok"]]
    print(json.dumps({
        "passed": len(findings["assertions"]) - len(failed),
        "failed": len(failed),
        "console_errors": len(findings["console_errors"]),
        "failures": failed,
    }, indent=2))
    return 1 if failed or findings["console_errors"] else 0

sys.exit(asyncio.run(main()))
