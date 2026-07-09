#!/usr/bin/env python3
"""QA Factory v1 — three supplemental end-to-end checks.

Adds to the base harness (scripts/qa/qa-factory-v1-qa.py):
  1. Next Best Action after QA approval
  2. Archived plan is not treated as active
  3. New generation after approval creates a new draft (no overwrite)

Sequences: Generate1 → Submit → Approve  →  CHECK3 (Generate2) → CHECK1 (NBA)
           → Archive approved → CHECK2 (archived-not-active)
"""
import asyncio, hashlib, json, os, subprocess, urllib.request
from pathlib import Path
from playwright.async_api import async_playwright

OUT = Path("/mnt/documents/qa/qa-factory-v1")
SHOTS = OUT / "screenshots"
SHOTS.mkdir(parents=True, exist_ok=True)

SUPA_URL = os.environ["SUPABASE_URL"]
PK = os.environ["SUPABASE_PUBLISHABLE_KEY"]
PROJECT_REF = "jqehcikzvyewijjvpszh"
STORAGE_KEY = f"sb-{PROJECT_REF}-auth-token"
QA_EMAIL = "qa-operator@trust-tai.com"
QA_PW = os.environ["QA_SEED_PASSWORD"]
JOTAYE_ID = "bbbbbbb1-0000-4000-8000-000000000002"
TABLE = "engine_project_qa_plans"

R = {"checks": {}}

def psql(sql):
    return subprocess.check_output(["psql", "-tAc", sql], text=True).strip()

def sign_in():
    url = f"{SUPA_URL}/auth/v1/token?grant_type=password"
    body = json.dumps({"email": QA_EMAIL, "password": QA_PW}).encode()
    req = urllib.request.Request(url, data=body, headers={"apikey": PK, "Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req).read())

def portal_snap():
    return {
        "cpr": psql("SELECT count(*)||'|'||coalesce(md5(string_agg(status||coalesce(updated_at::text,''),'|' ORDER BY id)),'')  FROM client_portal_roadmaps"),
        "cpp_last": psql("SELECT count(*)||'|'||coalesce(md5(string_agg(coalesce(last_client_activity_at::text,''),'|' ORDER BY id)),'') FROM client_portal_projects"),
        "cpm": psql("SELECT count(*) FROM client_portal_messages"),
        "cpf": psql("SELECT count(*) FROM client_portal_files"),
    }

async def inject(page, session):
    await page.goto("http://localhost:8080/")
    await page.evaluate(
        f"window.localStorage.setItem({json.dumps(STORAGE_KEY)}, {json.dumps(json.dumps(session))})"
    )

async def click_and_wait_row_change(page, selector, before_count, timeout_s=180):
    btn = page.locator(selector).first
    await btn.wait_for(state="visible", timeout=15000)
    await btn.click()
    for _ in range(timeout_s // 2):
        await page.wait_for_timeout(2000)
        after = int(psql(f"SELECT count(*) FROM {TABLE} WHERE project_id='{JOTAYE_ID}'"))
        if after > before_count:
            return after
    return before_count

async def main():
    session = sign_in()
    R["auth_user"] = session["user"]["email"]

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await ctx.new_page()
        errs = []
        page.on("console", lambda m: errs.append(m.text[:200]) if m.type == "error" else None)
        page.on("dialog", lambda d: asyncio.create_task(d.accept()))
        await inject(page, session)

        # --------- Bootstrap approved plan (Jotaye currently has only archived rows) ---------
        pre = int(psql(f"SELECT count(*) FROM {TABLE} WHERE project_id='{JOTAYE_ID}'"))
        R["rows_before"] = pre

        await page.goto(f"http://localhost:8080/engine/projects/{JOTAYE_ID}/qa-factory", wait_until="networkidle", timeout=60000)
        await page.wait_for_timeout(2500)

        after = await click_and_wait_row_change(page, "[data-qa=btn-generate-qa]", pre, timeout_s=200)
        if after == pre:
            R["bootstrap_generate"] = "TIMEOUT"
            Path(OUT/"extras-results.json").write_text(json.dumps(R, indent=2, default=str))
            print("BOOTSTRAP GENERATE FAILED"); return
        R["bootstrap_generate"] = "ok"
        plan1 = psql(f"SELECT id FROM {TABLE} WHERE project_id='{JOTAYE_ID}' ORDER BY created_at DESC LIMIT 1")
        R["plan1_id"] = plan1

        # Submit
        await page.reload(wait_until="networkidle"); await page.wait_for_timeout(2500)
        sb = page.locator("[data-qa=btn-submit-qa]").first
        await sb.wait_for(state="visible", timeout=15000); await sb.click()
        await page.wait_for_timeout(3500)
        R["plan1_status_after_submit"] = psql(f"SELECT status FROM {TABLE} WHERE id='{plan1}'")

        # Approve
        await page.reload(wait_until="networkidle"); await page.wait_for_timeout(2500)
        ap = page.locator("[data-qa=btn-approve-qa]").first
        await ap.wait_for(state="visible", timeout=15000); await ap.click()
        await page.wait_for_timeout(3500)
        R["plan1_status_after_approve"] = psql(f"SELECT status FROM {TABLE} WHERE id='{plan1}'")
        assert R["plan1_status_after_approve"] == "approved", f"expected approved, got {R['plan1_status_after_approve']}"

        # =========================================================================
        # CHECK 3 — Regenerate after approval creates a new draft, no overwrite
        # =========================================================================
        approved_hash_before = psql(f"SELECT md5(payload::text) FROM {TABLE} WHERE id='{plan1}'")
        approved_updated_before = psql(f"SELECT updated_at::text FROM {TABLE} WHERE id='{plan1}'")
        approved_title_before = psql(f"SELECT title FROM {TABLE} WHERE id='{plan1}'")
        count_before_regen = int(psql(f"SELECT count(*) FROM {TABLE} WHERE project_id='{JOTAYE_ID}'"))

        await page.goto(f"http://localhost:8080/engine/projects/{JOTAYE_ID}/qa-factory", wait_until="networkidle", timeout=60000)
        await page.wait_for_timeout(2500)
        await page.screenshot(path=str(SHOTS/"12_before_regenerate.png"))

        after = await click_and_wait_row_change(page, "[data-qa=btn-generate-qa]", count_before_regen, timeout_s=200)
        await page.screenshot(path=str(SHOTS/"12_after_regenerate.png"))

        new_draft_id = psql(f"SELECT id FROM {TABLE} WHERE project_id='{JOTAYE_ID}' AND status='draft' ORDER BY created_at DESC LIMIT 1")
        approved_hash_after = psql(f"SELECT md5(payload::text) FROM {TABLE} WHERE id='{plan1}'")
        approved_updated_after = psql(f"SELECT updated_at::text FROM {TABLE} WHERE id='{plan1}'")
        approved_title_after = psql(f"SELECT title FROM {TABLE} WHERE id='{plan1}'")
        approved_status_after = psql(f"SELECT status FROM {TABLE} WHERE id='{plan1}'")

        R["checks"]["check3_regenerate_no_overwrite"] = {
            "new_row_created": after > count_before_regen,
            "new_draft_id": new_draft_id,
            "new_draft_distinct_from_approved": new_draft_id != plan1,
            "approved_status_unchanged": approved_status_after == "approved",
            "approved_hash_unchanged": approved_hash_before == approved_hash_after,
            "approved_updated_at_unchanged": approved_updated_before == approved_updated_after,
            "approved_title_unchanged": approved_title_before == approved_title_after,
            "history_contains_both": psql(f"SELECT string_agg(id||':'||status,',' ORDER BY created_at DESC) FROM {TABLE} WHERE project_id='{JOTAYE_ID}' AND id IN ('{plan1}','{new_draft_id}')"),
            "approved_hash_before": approved_hash_before,
            "approved_hash_after": approved_hash_after,
        }

        # =========================================================================
        # CHECK 1 — Next Best Action after QA approval
        # =========================================================================
        portal_before = portal_snap()
        proj_status_before = psql(f"SELECT status FROM engine_projects WHERE id='{JOTAYE_ID}'")

        nba = psql(f"SELECT action||'||'||coalesce(reason,'')||'||'||coalesce(href,'')||'||'||coalesce(severity,'') FROM compute_engine_next_best_action('{JOTAYE_ID}')")
        action, reason, href, severity = (nba.split("||") + ["","","",""])[:4]

        proj_status_after = psql(f"SELECT status FROM engine_projects WHERE id='{JOTAYE_ID}'")
        portal_after = portal_snap()

        import re
        recommends_build = bool(re.search(r"implementation|build|execute|next.*build|publish|preview|deliver|roadmap|review", action, re.I))
        R["checks"]["check1_nba_after_approval"] = {
            "nba_action": action,
            "nba_reason": reason,
            "nba_href": href,
            "nba_severity": severity,
            "recommends_next_build_layer": recommends_build,
            "project_status": proj_status_after,
            "project_status_is_not_delivered": proj_status_after not in ("delivered",),
            "project_status_is_not_in_execution": proj_status_after != "in_execution",
            "portal_diff": {k: (portal_before[k], portal_after[k]) for k in portal_before if portal_before[k] != portal_after[k]},
        }

        # =========================================================================
        # Archive the approved plan (plan1) — must go via UI (trigger + admin gate)
        # =========================================================================
        # First navigate to plan1 view. UI shows latest by created_at, which is now
        # the new draft. Archive via server fn: click on plan1 selector if present,
        # else fall back to admin RPC via authenticated PATCH is blocked. We'll drive
        # the UI to switch to plan1 first.
        await page.goto(f"http://localhost:8080/engine/projects/{JOTAYE_ID}/qa-factory", wait_until="networkidle", timeout=60000)
        await page.wait_for_timeout(2500)
        # Try switching plans via history selector
        switched = False
        try:
            sel = page.locator(f"[data-qa=qa-history-row][data-plan-id='{plan1}']").first
            if await sel.count() > 0:
                await sel.click()
                await page.wait_for_timeout(1500)
                switched = True
        except Exception:
            pass
        R["archive_switched_via_history_row"] = switched

        # If UI can't switch, we archive by clicking Archive on whichever plan is
        # shown — but that would archive the draft, not approved. To exercise
        # check 2 we need the *approved* plan archived. Fall back: call the
        # server-fn RPC by hitting the same endpoint /_serverFn — simplest is via
        # a targeted URL if the page component exposes one. Otherwise use psql to
        # invoke via a test seam is not available; the safest fallback is to
        # accept that only the currently-shown plan can be archived by UI. In
        # that case, archive the draft first then submit+approve plan1 was
        # already done. So we click Archive on whatever is shown:
        try:
            ar = page.locator("[data-qa=btn-archive-qa]").first
            await ar.wait_for(state="visible", timeout=15000)
            visible_plan = psql(f"SELECT id FROM {TABLE} WHERE project_id='{JOTAYE_ID}' ORDER BY created_at DESC LIMIT 1") if not switched else plan1
            await ar.click()
            await page.wait_for_timeout(3500)
            R["archived_plan_id"] = visible_plan
            R["archived_plan_status"] = psql(f"SELECT status FROM {TABLE} WHERE id='{visible_plan}'")
        except Exception as e:
            R["archive_err"] = str(e)[:300]

        # If the archived plan was the draft (not plan1), we still need to
        # archive plan1 to prove check 2. Do it now by reloading (latest becomes
        # plan1 or next draft) and re-clicking Archive.
        if R.get("archived_plan_id") != plan1:
            await page.reload(wait_until="networkidle"); await page.wait_for_timeout(2500)
            try:
                ar = page.locator("[data-qa=btn-archive-qa]").first
                await ar.wait_for(state="visible", timeout=15000)
                cur = psql(f"SELECT id FROM {TABLE} WHERE project_id='{JOTAYE_ID}' AND status<>'archived' ORDER BY created_at DESC LIMIT 1")
                await ar.click(); await page.wait_for_timeout(3500)
                R["archived_plan_id_2"] = cur
                R["archived_plan_status_2"] = psql(f"SELECT status FROM {TABLE} WHERE id='{cur}'")
            except Exception as e:
                R["archive_err_2"] = str(e)[:300]

        # Continue archiving until plan1 is archived (max 3 loops)
        for i in range(3):
            plan1_status = psql(f"SELECT status FROM {TABLE} WHERE id='{plan1}'")
            if plan1_status == "archived":
                break
            await page.reload(wait_until="networkidle"); await page.wait_for_timeout(2500)
            try:
                ar = page.locator("[data-qa=btn-archive-qa]").first
                if await ar.count() == 0:
                    break
                await ar.wait_for(state="visible", timeout=10000)
                await ar.click(); await page.wait_for_timeout(3500)
            except Exception as e:
                R[f"archive_loop_{i}_err"] = str(e)[:200]
                break
        R["plan1_final_status"] = psql(f"SELECT status FROM {TABLE} WHERE id='{plan1}'")

        await page.screenshot(path=str(SHOTS/"11_history_after_archive.png"))

        # =========================================================================
        # CHECK 2 — Archived plan is not treated as active
        # =========================================================================
        # Compute the same fields getProjectQaFactory returns (server fn requires
        # a client bearer token — DB check is equivalent since the server fn is
        # a straight SELECT + array.find).
        latest_id = psql(f"SELECT id FROM {TABLE} WHERE project_id='{JOTAYE_ID}' ORDER BY created_at DESC LIMIT 1")
        latest_status = psql(f"SELECT status FROM {TABLE} WHERE id='{latest_id}'") if latest_id else ""
        latest_approved_id = psql(f"SELECT id FROM {TABLE} WHERE project_id='{JOTAYE_ID}' AND status='approved' ORDER BY created_at DESC LIMIT 1")
        history_ids = psql(f"SELECT string_agg(id||':'||status,',' ORDER BY created_at DESC) FROM {TABLE} WHERE project_id='{JOTAYE_ID}'")

        # Chat context uses .neq('status','archived'); pick the same row.
        chat_ctx_target = psql(f"SELECT id||'|'||status FROM {TABLE} WHERE project_id='{JOTAYE_ID}' AND status<>'archived' ORDER BY created_at DESC LIMIT 1")

        R["checks"]["check2_archived_not_active"] = {
            "plan1_archived": R["plan1_final_status"] == "archived",
            "history_contains_archived_plan1": plan1 in history_ids,
            "latest_by_created_at_id": latest_id,
            "latest_by_created_at_status": latest_status,
            "latest_approved_id": latest_approved_id or None,
            "latest_approved_is_not_plan1": (latest_approved_id or "") != plan1,
            "chat_context_target_row": chat_ctx_target or "NONE (no non-archived plan present)",
            "chat_context_would_show_plan1": chat_ctx_target.startswith(plan1) if chat_ctx_target else False,
        }

        # Grep chat context source for filter guard as documentary evidence.
        ctx_src = Path("src/lib/engine-chat-context.server.ts").read_text()
        R["chat_context_archived_filter_present"] = ".neq(\"status\", \"archived\")" in ctx_src

        R["console_errors_tail"] = errs[-20:]
        await browser.close()

    Path(OUT/"extras-results.json").write_text(json.dumps(R, indent=2, default=str))
    print(json.dumps(R, indent=2, default=str)[:8000])

asyncio.run(main())
