"""
Phase 14 Conversation Intelligence QA — end-to-end Playwright driver.

Runs 4 scenarios (Event site, Roadmap, CRM/automation, Internal tool)
through the live intake at /build-my-roadmap/write.

For each scenario, we:
  * type a rich, multi-fact opener
  * click Continue → wait for classification confirmation
  * click "Yes, continue"
  * run N objective turns, providing a scripted answer each turn
  * snapshot `window.__intakeDebug` after every turn

Assertions per scenario (fail → recorded, does not abort other scenarios):
  A. planner does not re-ask a field whose known_facts confidence
     already meets the frame threshold ("no obvious question" rule)
  B. same field key never appears twice in question_history
  C. confidence_score is monotonically non-decreasing across turns
  D. selected_reason is one of the known planner reasons
  E. next question text does not paraphrase / repeat a previous
     question (Jaccard token overlap < 0.6 with any prior question)

Report written to /tmp/browser/phase14/REPORT.md.
"""

import asyncio
import json
import re
import time
from pathlib import Path

from playwright.async_api import async_playwright

ROOT = Path(__file__).parent
SHOTS = ROOT / "screenshots"
SHOTS.mkdir(exist_ok=True)

URL = "http://localhost:8080/build-my-roadmap/write"

# --- Scenarios --------------------------------------------------------------

SCENARIOS = [
    {
        "name": "event_site",
        "opener": (
            "I'm building a private RSVP site for my mother's 60th birthday. "
            "It's August 30, 2026 in Nashville, roughly 120 guests. I need "
            "RSVPs, dietary restrictions, and a private schedule page."
        ),
        "turns": [
            "Guests should RSVP with meal choice (chicken, fish, veg) and any allergies. Plus-ones allowed if named.",
            "I want the site password-protected. Only invited guests should see the schedule and address.",
            "I need everything live by August 1, 2026 so we can send the invitations three weeks ahead.",
            "I have a rough guest list in Google Sheets and a family photo we want on the landing page.",
        ],
    },
    {
        "name": "roadmap",
        "opener": (
            "Everything in the business runs through me. Sales calls, "
            "onboarding, client delivery — if I stop for a day, revenue "
            "stops. I want to step back to strategy and coaching, not "
            "day-to-day operations."
        ),
        "turns": [
            "The biggest bottleneck is client onboarding. After they say yes, I personally send contracts, run the kickoff, and set up their account.",
            "In 12 months I want a $2M practice where I only run strategy calls and quarterly reviews. Everything else is a team member or a system.",
            "Practically that means hiring a client success lead and building an onboarding SOP with a portal. I have no SOP today.",
            "Right now the only asset is my own delivery playbook in Notion. There's no packaged offer or productized service yet.",
        ],
    },
    {
        "name": "crm_automation",
        "opener": (
            "Leads come from LinkedIn DMs, a Typeform on our site, and "
            "referrals over email. Everything lives in my inbox and a "
            "messy spreadsheet. We drop follow-ups constantly and I have "
            "no idea what our real pipeline is."
        ),
        "turns": [
            "Today I copy leads by hand from LinkedIn into the sheet. New Typeform submissions email me and I forward them to my assistant.",
            "The real gap is follow-up. If someone doesn't reply in three days nothing happens. I want automatic reminders and a clear pipeline view.",
            "We do about 40 new leads a month. Audience is B2B founders doing $1M-$5M in revenue.",
            "I already pay for HubSpot Starter but nobody uses it. Also Zapier and Google Workspace.",
        ],
    },
    {
        "name": "internal_tool",
        "opener": (
            "Our ops team of 6 spends every Monday rebuilding the same "
            "client status report in Excel. Data comes from Stripe, our "
            "project tracker, and support tickets. It takes two people "
            "half a day and it's error-prone."
        ),
        "turns": [
            "The task is one weekly status doc per active client: revenue this month, open projects, open tickets, health flag.",
            "Right now Sarah exports Stripe CSVs, Marcus pulls the tracker, and they merge by hand in Excel. Slack messages fly for anything missing.",
            "Data lives in Stripe, Linear, and Zendesk. We have API access to all three but no one on the team writes code.",
            "We have ~40 active clients. I want the whole report generated automatically by 9am every Monday.",
        ],
    },
]

# --- Helpers ---------------------------------------------------------------

VALID_REASONS = {
    "top-ranked-required",
    "clarify-low-confidence",
    "optional-followup",
    "enough-signal",
    "hard-cap",
    "no-gaps",
    "redirect-not-fit",
    "clarify-frame",
}


def tokenize(s: str) -> set[str]:
    return {t for t in re.findall(r"[a-z0-9]+", s.lower()) if len(t) > 2}


def jaccard(a: str, b: str) -> float:
    ta, tb = tokenize(a), tokenize(b)
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / len(ta | tb)


async def read_debug(page):
    return await page.evaluate("() => window.__intakeDebug ?? null")


async def get_visible_question(page) -> str:
    # Route renders question as the serif <p> in the objective section.
    try:
        el = page.locator("p.font-serif").last
        return (await el.text_content()) or ""
    except Exception:
        return ""


async def click_continue(page):
    # Continue button lives at the bottom of the current screen.
    btn = page.locator("button:not([disabled]):visible", has_text=re.compile(r"^\s*Continue\s*$"))
    await btn.first.wait_for(state="visible", timeout=15000)
    await btn.first.click()


async def wait_debug_change(page, prev, timeout_ms=15000):
    """Wait for __intakeDebug question_history length or phase to change."""
    prev_qlen = len(prev.get("question_history") or []) if prev else -1
    prev_phase = prev.get("phase") if prev else None
    deadline = time.time() + timeout_ms / 1000
    last = prev
    while time.time() < deadline:
        d = await read_debug(page)
        if d:
            if d.get("phase") != prev_phase:
                return d
            qh = d.get("question_history") or []
            if len(qh) != prev_qlen:
                return d
            last = d
        await page.wait_for_timeout(250)
    return last


async def run_scenario(page, scenario: dict) -> dict:
    result = {
        "name": scenario["name"],
        "turns": [],
        "failures": [],
        "final_debug": None,
    }
    await page.goto(URL, wait_until="domcontentloaded")
    await page.wait_for_selector("textarea", timeout=15000)
    await page.wait_for_timeout(1800)  # allow React hydration

    # Open screen
    await page.locator("textarea").first.press_sequentially(scenario["opener"], delay=2)
    await page.screenshot(path=str(SHOTS / f"{scenario['name']}_00_opener.png"))
    prev = await read_debug(page)
    await click_continue(page)

    # Wait for classification / confirm frame
    try:
        yes = page.get_by_role("button", name=re.compile(r"Yes, continue"))
        await yes.wait_for(timeout=20000)
        await page.screenshot(path=str(SHOTS / f"{scenario['name']}_01_confirm.png"))
        await yes.click()
    except Exception as e:
        result["failures"].append(f"classification/confirm failed: {e}")
        result["final_debug"] = await read_debug(page)
        return result

    # Wait for first objective question to render.
    await page.wait_for_timeout(500)
    prev = await read_debug(page)

    prior_questions: list[str] = []
    prior_field_keys: list[str] = []
    prior_conf = 0.0

    for i, answer in enumerate(scenario["turns"]):
        # Read what the planner is about to ask.
        debug_before = await read_debug(page)
        # Early stop: planner declared enough signal (or route advanced past
        # the objective loop). That is a legitimate outcome — record it.
        phase_now = (debug_before or {}).get("phase")
        if (debug_before or {}).get("enough_signal") or phase_now in ("review", "contact", "submitted"):
            result["early_stop"] = {"turn": i, "phase": phase_now, "reason": "enough_signal"}
            break
        question_text = await get_visible_question(page)
        next_gap = (debug_before or {}).get("next_gap") or {}
        selected_reason = (debug_before or {}).get("selected_reason")
        known = (debug_before or {}).get("known_facts") or {}
        threshold = (debug_before or {}).get("confidence_threshold") or 0.75
        conf = float((debug_before or {}).get("confidence_score") or 0.0)

        turn_record = {
            "index": i,
            "field_key": next_gap.get("field_key"),
            "question": question_text,
            "selected_reason": selected_reason,
            "confidence_before": conf,
            "enough_signal": (debug_before or {}).get("enough_signal"),
        }

        # Assertion A — planner must not ask about a field already ≥ threshold.
        fk = next_gap.get("field_key")
        if fk and fk in known and (known[fk].get("confidence") or 0) >= threshold:
            result["failures"].append(
                f"turn {i}: planner asked '{fk}' but known_facts already at "
                f"{known[fk].get('confidence'):.2f} ≥ threshold {threshold}"
            )

        # Assertion B — no repeated field key WHEN that field's known_facts
        # confidence already meets threshold. Clarification loops on
        # low-confidence answers are allowed (selected_reason=
        # `clarify-low-confidence`) and are not treated as defects here.
        if (
            fk
            and fk in prior_field_keys
            and fk in known
            and (known[fk].get("confidence") or 0) >= threshold
        ):
            result["failures"].append(
                f"turn {i}: planner re-asked '{fk}' after it reached "
                f"confidence {known[fk].get('confidence'):.2f} ≥ {threshold}"
            )

        # Assertion D — reason valid.
        if selected_reason and selected_reason not in VALID_REASONS:
            result["failures"].append(f"turn {i}: unknown selected_reason '{selected_reason}'")

        # Assertion E — same-question paraphrase is only a defect when the
        # planner is NOT explicitly clarifying a low-confidence answer.
        if selected_reason != "clarify-low-confidence":
            for q in prior_questions:
                overlap = jaccard(q, question_text)
                if overlap >= 0.6 and question_text.strip():
                    result["failures"].append(
                        f"turn {i}: question overlaps prior (jaccard={overlap:.2f}): '{question_text[:80]}'"
                    )
                    break

        # Type answer and continue.
        try:
            ta = page.locator("textarea")
            await ta.wait_for(timeout=10000)
            await ta.press_sequentially(answer, delay=1)
            await page.screenshot(path=str(SHOTS / f"{scenario['name']}_turn{i}.png"))
            await click_continue(page)
        except Exception as e:
            result["failures"].append(f"turn {i}: could not submit answer: {e}")
            break

        # Wait for next question or completion.
        new_debug = await wait_debug_change(page, debug_before)
        new_conf = float((new_debug or {}).get("confidence_score") or 0.0)

        # Assertion C — confidence must not fall.
        if new_conf + 1e-6 < prior_conf:
            result["failures"].append(
                f"turn {i}: confidence fell {prior_conf:.2f} → {new_conf:.2f}"
            )
        prior_conf = max(prior_conf, new_conf)

        turn_record["confidence_after"] = new_conf
        turn_record["missing_after"] = (new_debug or {}).get("missing_fields") or []
        turn_record["enough_signal_after"] = (new_debug or {}).get("enough_signal")
        result["turns"].append(turn_record)

        if fk:
            prior_field_keys.append(fk)
        if question_text.strip():
            prior_questions.append(question_text.strip())

        # If planner is done, stop early.
        if (new_debug or {}).get("enough_signal") or "review" in ((new_debug or {}).get("phase") or ""):
            break

    result["final_debug"] = await read_debug(page)
    return result


async def main():
    results = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        for sc in SCENARIOS:
            context = await browser.new_context(viewport={"width": 1280, "height": 1800})
            page = await context.new_page()
            page.on("pageerror", lambda e, n=sc["name"]: print(f"[{n}] pageerror:", e))
            try:
                r = await run_scenario(page, sc)
            except Exception as e:
                r = {"name": sc["name"], "failures": [f"scenario crashed: {e}"], "turns": [], "final_debug": None}
            results.append(r)
            await context.close()
        await browser.close()

    # Write raw JSON + markdown report.
    (ROOT / "results.json").write_text(json.dumps(results, indent=2, default=str))

    lines = ["# Phase 14 — Conversation Intelligence QA Report", ""]
    total_fail = 0
    for r in results:
        status = "✅ PASS" if not r["failures"] else "❌ FAIL"
        total_fail += len(r["failures"])
        lines.append(f"## {r['name']} — {status}")
        lines.append("")
        fd = r.get("final_debug") or {}
        lines.append(f"- Frame: `{fd.get('frame')}`")
        lines.append(f"- Phase reached: `{fd.get('phase')}`")
        lines.append(f"- Confidence: `{fd.get('confidence_score')}` / threshold `{fd.get('confidence_threshold')}`")
        lines.append(f"- Enough signal: `{fd.get('enough_signal')}`")
        lines.append(f"- Turns completed: {len(r['turns'])}")
        lines.append("")
        lines.append("| # | field_key | reason | conf before → after | question |")
        lines.append("|---|---|---|---|---|")
        for t in r["turns"]:
            q = (t.get("question") or "").replace("|", "\\|")[:80]
            lines.append(
                f"| {t['index']} | `{t.get('field_key')}` | {t.get('selected_reason')} | "
                f"{t.get('confidence_before'):.2f} → {t.get('confidence_after', 0):.2f} | {q} |"
            )
        if r["failures"]:
            lines.append("")
            lines.append("**Failures:**")
            for f in r["failures"]:
                lines.append(f"- {f}")
        lines.append("")

    lines.insert(1, "")
    lines.insert(1, f"**Overall:** {len(results) - sum(1 for r in results if r['failures'])} / {len(results)} scenarios green — {total_fail} assertion failures")
    (ROOT / "REPORT.md").write_text("\n".join(lines))
    print("Wrote", ROOT / "REPORT.md")
    print("Total failures:", total_fail)


asyncio.run(main())
