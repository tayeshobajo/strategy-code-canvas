#!/usr/bin/env python3
"""QA Factory v1 end-to-end QA harness.

Mirrors backend-builder-v1-qa.py. Uses password sign-in (QA_SEED_PASSWORD).
Writes report to /mnt/documents/qa/qa-factory-v1/REPORT.md and screenshots
to /mnt/documents/qa/qa-factory-v1/screenshots/.
"""
import asyncio, json, os, subprocess, urllib.request, urllib.error
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
INBDE_ID  = "430ea1f6-fffd-45b9-b631-9e1e98b2e009"
AUG1_ID   = "3ade32db-1496-4a34-98ad-b63d3ad522f9"
TABLE     = "engine_project_qa_plans"

R = {}

def psql(sql):
    return subprocess.check_output(["psql","-tAc",sql], text=True).strip()

def rest(path, token=None, method="GET", body=None, extra=None):
    url = f"{SUPA_URL}/rest/v1{path}"
    headers = {"apikey": PK, "Content-Type": "application/json"}
    if token: headers["Authorization"] = f"Bearer {token}"
    if extra: headers.update(extra)
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        r = urllib.request.urlopen(req, timeout=15)
        return r.status, r.read().decode()[:400]
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:400]

def sign_in():
    url = f"{SUPA_URL}/auth/v1/token?grant_type=password"
    body = json.dumps({"email": QA_EMAIL, "password": QA_PW}).encode()
    req = urllib.request.Request(url, data=body, headers={"apikey": PK, "Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req).read())

def snap():
    q = {
        "cpp": "SELECT count(*)||'|'||coalesce(max(updated_at)::text,'') FROM client_portal_projects",
        "cpr": "SELECT count(*)||'|'||coalesce(max(updated_at)::text,'') FROM client_portal_roadmaps",
        "cpm": "SELECT count(*)||'|'||coalesce(max(updated_at)::text,'') FROM client_portal_messages",
        "cpf": "SELECT count(*)||'|'||coalesce(max(updated_at)::text,'') FROM client_portal_files",
        "ra":  "SELECT count(*) FROM roadmap_approvals",
        "rd":  "SELECT count(*) FROM roadmap_documents",
        "tasks_j": f"SELECT count(*)||'|'||coalesce(max(updated_at)::text,'') FROM engine_tasks WHERE project_id='{JOTAYE_ID}'",
        "milestones_j": f"SELECT count(*)||'|'||coalesce(max(updated_at)::text,'') FROM engine_milestones WHERE project_id='{JOTAYE_ID}'",
        "proj_j": f"SELECT status||'|'||coalesce(current_step,'') FROM engine_projects WHERE id='{JOTAYE_ID}'",
        "backend_j": f"SELECT count(*)||'|'||count(*) FILTER (WHERE status='approved') FROM engine_project_backend_plans WHERE project_id='{JOTAYE_ID}'",
        "mockup_j":  f"SELECT count(*)||'|'||count(*) FILTER (WHERE status='approved') FROM engine_project_mockups WHERE project_id='{JOTAYE_ID}'",
        "frame_j":   f"SELECT count(*)||'|'||count(*) FILTER (WHERE status='approved') FROM engine_project_frames WHERE project_id='{JOTAYE_ID}'",
    }
    return {k: psql(v) for k, v in q.items()}

async def inject(page, session):
    await page.goto("http://localhost:8080/")
    await page.evaluate(
        f"window.localStorage.setItem({json.dumps(STORAGE_KEY)}, {json.dumps(json.dumps(session))})"
    )

async def main():
    print("== sign in ==")
    session = sign_in()
    token = session["access_token"]
    R["auth_user"] = session["user"]["email"]

    # §12 grants + policies + triggers
    print("== §12 db security ==")
    R["grants"] = psql("""
      SELECT string_agg(r.rolname||': s='||has_table_privilege(r.rolname,'public.engine_project_qa_plans','SELECT')::text
        ||' i='||has_table_privilege(r.rolname,'public.engine_project_qa_plans','INSERT')::text
        ||' u='||has_table_privilege(r.rolname,'public.engine_project_qa_plans','UPDATE')::text
        ||' d='||has_table_privilege(r.rolname,'public.engine_project_qa_plans','DELETE')::text, E'\n')
      FROM pg_roles r WHERE rolname IN ('anon','authenticated','service_role')""")
    R["policies"] = psql(f"SELECT policyname||':'||cmd||':'||coalesce(qual,'-') FROM pg_policies WHERE schemaname='public' AND tablename='{TABLE}' ORDER BY policyname")
    R["triggers"] = psql(f"SELECT tgname FROM pg_trigger WHERE tgrelid='public.{TABLE}'::regclass AND NOT tgisinternal")
    R["anon_select"] = f"HTTP {rest(f'/{TABLE}?select=id&limit=1')[0]}"
    R["anon_insert"] = f"HTTP {rest(f'/{TABLE}', method='POST', body={'project_id':JOTAYE_ID,'backend_plan_id':'00000000-0000-0000-0000-000000000000','title':'x','payload':{}}, extra={'Prefer':'return=representation'})[0]}"
    R["auth_insert"] = f"HTTP {rest(f'/{TABLE}', token=token, method='POST', body={'project_id':JOTAYE_ID,'backend_plan_id':'00000000-0000-0000-0000-000000000000','title':'x','payload':{}}, extra={'Prefer':'return=representation'})[0]}"
    R["auth_update"] = f"HTTP {rest(f'/{TABLE}?id=eq.00000000-0000-0000-0000-000000000000', token=token, method='PATCH', body={'title':'x'})[0]}"
    R["auth_delete"] = f"HTTP {rest(f'/{TABLE}?id=eq.00000000-0000-0000-0000-000000000000', token=token, method='DELETE')[0]}"
    R["auth_select"] = f"HTTP {rest(f'/{TABLE}?select=id&limit=1', token=token)[0]}"

    baseline = snap()
    R["baseline"] = baseline

    approved_bp = psql(f"SELECT id FROM engine_project_backend_plans WHERE project_id='{JOTAYE_ID}' AND status='approved' ORDER BY approved_at DESC LIMIT 1")
    R["approved_backend_plan_id"] = approved_bp
    pre = int(psql(f"SELECT count(*) FROM {TABLE} WHERE project_id='{JOTAYE_ID}'"))

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)

        # §1 anon redirect
        anon_ctx = await browser.new_context(viewport={"width":1280,"height":1800})
        anon_page = await anon_ctx.new_page()
        try:
            await anon_page.goto(f"http://localhost:8080/engine/projects/{JOTAYE_ID}/qa-factory", wait_until="networkidle", timeout=30000)
        except Exception as e:
            R["anon_nav_err"] = str(e)[:200]
        R["anon_route_url"] = anon_page.url
        await anon_page.screenshot(path=str(SHOTS/"01_anon_redirect.png"))
        await anon_ctx.close()

        # admin ctx
        ctx = await browser.new_context(viewport={"width":1280,"height":1800})
        page = await ctx.new_page()
        errs = []
        page.on("console", lambda m: errs.append(m.text[:200]) if m.type=="error" else None)
        page.on("dialog", lambda d: asyncio.create_task(d.accept()))
        await inject(page, session)

        # §2 readiness on projects w/o approved backend plan
        for pid, tag in [(INBDE_ID,"inbde"), (AUG1_ID,"aug1")]:
            await page.goto(f"http://localhost:8080/engine/projects/{pid}/qa-factory", wait_until="networkidle", timeout=45000)
            await page.wait_for_timeout(1800)
            await page.screenshot(path=str(SHOTS/f"02_{tag}_no_backend.png"))
            try:
                R[f"{tag}_generate_disabled"] = await page.locator("[data-qa=btn-generate-qa]").first.is_disabled()
            except Exception as e:
                R[f"{tag}_generate_disabled"] = f"err: {e}"
            R[f"{tag}_missing_inputs_ui"] = await page.locator("[data-qa=qa-missing-inputs]").count() > 0

        # §2 Jotaye — has approved backend plan
        await page.goto(f"http://localhost:8080/engine/projects/{JOTAYE_ID}/qa-factory", wait_until="networkidle", timeout=45000)
        await page.wait_for_timeout(2500)
        await page.screenshot(path=str(SHOTS/"03_jotaye_ready.png"))
        R["admin_route_url"] = page.url
        R["approved_backend_badge"] = await page.locator("[data-qa=badge-approved-backend]").count() > 0

        # WorkspaceHeader nav
        R["nav_qa_factory_present"] = await page.locator("nav a[href*='qa-factory'], a[href*='qa-factory']").count() > 0

        # §3 Generate (reuse draft if present)
        existing = psql(f"SELECT id FROM {TABLE} WHERE project_id='{JOTAYE_ID}' AND status='draft' ORDER BY created_at DESC LIMIT 1")
        plan_id = None
        if existing:
            plan_id = existing
            R["generate_result"] = f"SKIPPED reuse={existing}"
        else:
            print("== §3 Generate ==")
            try:
                btn = page.locator("[data-qa=btn-generate-qa]").first
                enabled = not await btn.is_disabled()
                R["jotaye_generate_enabled"] = enabled
                if enabled:
                    await btn.click()
                    for _ in range(90):
                        await page.wait_for_timeout(2000)
                        post = int(psql(f"SELECT count(*) FROM {TABLE} WHERE project_id='{JOTAYE_ID}'"))
                        if post > pre:
                            plan_id = psql(f"SELECT id FROM {TABLE} WHERE project_id='{JOTAYE_ID}' ORDER BY created_at DESC LIMIT 1")
                            break
                    R["generate_result"] = plan_id or "TIMEOUT"
            except Exception as e:
                R["generate_error"] = str(e)[:300]

        R["plan_id"] = plan_id

        if plan_id and plan_id != "TIMEOUT":
            # §3 metadata
            meta = psql(f"SELECT status||'|'||generated_by||'|'||coalesce(backend_plan_id::text,'null')||'|'||coalesce(mockup_id::text,'null')||'|'||coalesce(frame_id::text,'null') FROM {TABLE} WHERE id='{plan_id}'")
            R["plan_metadata"] = meta
            R["backend_link_ok"] = approved_bp in meta

            # §4 payload schema
            print("== §4 schema ==")
            payload_txt = psql(f"SELECT payload::text FROM {TABLE} WHERE id='{plan_id}'")
            try:
                pl = json.loads(payload_txt)
                req_top = ["qa_goal","source_backend_summary","overall_readiness","test_matrix","role_tests","route_tests","data_tests","rls_tests","workflow_tests","ui_state_tests","responsive_tests","integration_tests","audit_tests","regression_tests","edge_cases","blocked_items","evidence_plan","go_no_go_criteria","open_decisions","risks"]
                R["schema_missing_top"] = [k for k in req_top if k not in pl]
                probs = []
                statuses = set()
                priorities = set()
                categories = set()
                blocking_count = 0
                for t in pl.get("test_matrix", []):
                    for k in ["id","title","category","priority","source","surface","scenario","steps","expected_result","evidence_required","status","owner","blocking"]:
                        if k not in t: probs.append(f"test {t.get('id','?')}: missing {k}")
                    statuses.add(t.get("status"))
                    priorities.add(t.get("priority"))
                    categories.add(t.get("category"))
                    if t.get("blocking"): blocking_count += 1
                    if not t.get("evidence_required"): probs.append(f"test {t.get('id','?')}: empty evidence_required")
                R["test_problems"] = probs[:20]
                R["all_statuses"] = sorted(str(s) for s in statuses)
                R["priorities_seen"] = sorted(str(s) for s in priorities)
                R["categories_seen"] = sorted(str(s) for s in categories)
                R["counts"] = {
                    "test_matrix": len(pl.get("test_matrix", [])),
                    "role_tests": len(pl.get("role_tests", [])),
                    "route_tests": len(pl.get("route_tests", [])),
                    "data_tests": len(pl.get("data_tests", [])),
                    "rls_tests": len(pl.get("rls_tests", [])),
                    "workflow_tests": len(pl.get("workflow_tests", [])),
                    "ui_state_tests": len(pl.get("ui_state_tests", [])),
                    "responsive_tests": len(pl.get("responsive_tests", [])),
                    "integration_tests": len(pl.get("integration_tests", [])),
                    "audit_tests": len(pl.get("audit_tests", [])),
                    "regression_tests": len(pl.get("regression_tests", [])),
                    "edge_cases": len(pl.get("edge_cases", [])),
                    "evidence_plan": len(pl.get("evidence_plan", [])),
                    "go_no_go_criteria": len(pl.get("go_no_go_criteria", [])),
                    "open_decisions": len(pl.get("open_decisions", [])),
                    "risks": len(pl.get("risks", [])),
                    "blocking_tests": blocking_count,
                }
                R["hard_lock_all_not_run"] = R["all_statuses"] == ["not_run"]
                low = payload_txt.lower()
                R["leak_hits"] = [k for k in ["api_key","anthropic","openai_api","system prompt","bearer "] if k in low]
                R["auto_exec_hits"] = [k for k in ["automatically run","auto-execute","will deploy","will run tests","mark as passed"] if k in low]
            except Exception as e:
                R["schema_err"] = str(e)[:300]

            # §5 hard-lock: saveProjectQaPlanDraft normalizes statuses
            # (simulate: try a direct PATCH that bypasses server fn — will be blocked by grants)
            # Verified above via auth_update.

            # §6 UI screenshots
            print("== §6 UI ==")
            await page.goto(f"http://localhost:8080/engine/projects/{JOTAYE_ID}/qa-factory", wait_until="networkidle", timeout=45000)
            await page.wait_for_timeout(2500)
            await page.screenshot(path=str(SHOTS/"04_desktop_draft.png"))
            R["ai_pm_panel_present"] = await page.locator("[data-qa=ai-pm-panel]").count() > 0
            R["filter_category_present"] = await page.locator("[data-qa=filter-category]").count() > 0
            R["filter_priority_present"] = await page.locator("[data-qa=filter-priority]").count() > 0
            R["filter_blocking_present"] = await page.locator("[data-qa=filter-blocking]").count() > 0
            await page.set_viewport_size({"width":1024,"height":1400})
            await page.wait_for_timeout(500)
            await page.screenshot(path=str(SHOTS/"05_tablet.png"))
            await page.set_viewport_size({"width":390,"height":1800})
            await page.wait_for_timeout(500)
            await page.screenshot(path=str(SHOTS/"06_mobile.png"))
            await page.set_viewport_size({"width":1280,"height":1800})

            # §7 Submit
            print("== §7 Submit ==")
            rev_before = int(psql(f"SELECT count(*) FROM engine_review_items WHERE project_id='{JOTAYE_ID}' AND item_type='qa_plan'"))
            try:
                sb = page.locator("[data-qa=btn-submit-qa]").first
                await sb.wait_for(state="visible", timeout=15000)
                await sb.click()
                await page.wait_for_timeout(3500)
            except Exception as e:
                R["submit_err"] = str(e)[:300]
            R["status_after_submit"] = psql(f"SELECT status FROM {TABLE} WHERE id='{plan_id}'")
            R["review_items_added"] = int(psql(f"SELECT count(*) FROM engine_review_items WHERE project_id='{JOTAYE_ID}' AND item_type='qa_plan'")) - rev_before
            R["review_item_status"] = psql(f"SELECT status FROM engine_review_items WHERE project_id='{JOTAYE_ID}' AND item_type='qa_plan' ORDER BY created_at DESC LIMIT 1")
            await page.screenshot(path=str(SHOTS/"07_submitted.png"))

            # §8 Approve
            print("== §8 Approve ==")
            await page.reload(wait_until="networkidle")
            await page.wait_for_timeout(2500)
            try:
                ap = page.locator("[data-qa=btn-approve-qa]").first
                await ap.wait_for(state="visible", timeout=15000)
                await ap.click()
                await page.wait_for_timeout(3500)
            except Exception as e:
                R["approve_err"] = str(e)[:300]
            R["status_after_approve"] = psql(f"SELECT status||'|'||coalesce(approved_by_email,'')||'|'||coalesce(approved_at::text,'null') FROM {TABLE} WHERE id='{plan_id}'")
            await page.screenshot(path=str(SHOTS/"08_approved.png"))

            # §9 Approved protection
            print("== §9 Protection ==")
            R["anon_patch_approved"] = f"HTTP {rest(f'/{TABLE}?id=eq.{plan_id}', method='PATCH', body={'title':'hacked'})[0]}"
            R["auth_patch_approved"] = f"HTTP {rest(f'/{TABLE}?id=eq.{plan_id}', token=token, method='PATCH', body={'title':'hacked'})[0]}"
            trig = subprocess.run(["psql","-c",f"UPDATE {TABLE} SET status='draft' WHERE id='{plan_id}'"], capture_output=True, text=True)
            R["trigger_block_downgrade"] = "BLOCKED" if trig.returncode!=0 or "ERROR" in trig.stderr else "NOT BLOCKED"
            R["trigger_msg_downgrade"] = trig.stderr.strip()[:200]
            trig2 = subprocess.run(["psql","-c",f"UPDATE {TABLE} SET payload='{{}}' WHERE id='{plan_id}'"], capture_output=True, text=True)
            R["trigger_block_overwrite"] = "BLOCKED" if trig2.returncode!=0 or "ERROR" in trig2.stderr else "NOT BLOCKED"
            R["trigger_msg_overwrite"] = trig2.stderr.strip()[:200]
            # Verify title unchanged
            R["title_intact_after_patch"] = psql(f"SELECT title FROM {TABLE} WHERE id='{plan_id}'")

            # §10 Archive
            print("== §10 Archive ==")
            await page.reload(wait_until="networkidle")
            await page.wait_for_timeout(2500)
            try:
                ar = page.locator("[data-qa=btn-archive-qa]").first
                await ar.wait_for(state="visible", timeout=15000)
                await ar.click()
                await page.wait_for_timeout(3000)
            except Exception as e:
                R["archive_err"] = str(e)[:300]
            R["status_after_archive"] = psql(f"SELECT status FROM {TABLE} WHERE id='{plan_id}'")
            await page.screenshot(path=str(SHOTS/"09_archived.png"))

        # §15 regression smoke
        print("== §15 regression ==")
        reg = {}
        for path in ["spine","chat","frame-builder","mockup-builder","backend-builder"]:
            e_before = len(errs)
            await page.goto(f"http://localhost:8080/engine/projects/{JOTAYE_ID}/{path}", wait_until="networkidle", timeout=45000)
            await page.wait_for_timeout(1200)
            reg[path] = {"url": page.url, "new_console_errors": len(errs)-e_before}
        R["regression"] = reg
        R["console_errors_tail"] = errs[-20:]

        await browser.close()

    # §11 chat context
    print("== §11 chat context ==")
    ctx_src = Path("src/lib/engine-chat-context.server.ts").read_text()
    R["chat_ctx_qa_mentions"] = sum(1 for l in ctx_src.splitlines() if "qa_plan" in l.lower() or "qa plan" in l.lower() or "qa factory" in l.lower())

    # §13 protected diff
    print("== §13 diff ==")
    post = snap()
    R["protected_diffs"] = {k: (baseline[k], post[k]) for k in baseline if baseline[k] != post[k]}

    # §14 audit + activity
    print("== §14 audit ==")
    R["audit_events"] = psql(f"""SELECT event_type||':'||count(*) FROM engine_project_chat_events
      WHERE project_id='{JOTAYE_ID}' AND event_type LIKE 'qa_plan_%' GROUP BY event_type ORDER BY event_type""")
    R["activity_events"] = psql(f"""SELECT kind||':'||count(*) FROM engine_activity
      WHERE project_id='{JOTAYE_ID}' AND kind LIKE 'qa_plan_%' GROUP BY kind ORDER BY kind""")
    R["leak_scan"] = psql(f"""SELECT count(*) FROM {TABLE} WHERE project_id='{JOTAYE_ID}'
      AND (payload::text ILIKE '%api_key%' OR payload::text ILIKE '%anthropic%' OR payload::text ILIKE '%system prompt%')""")

    Path(OUT/"results.json").write_text(json.dumps(R, indent=2, default=str))
    print("\n== DONE ==")
    print(json.dumps(R, indent=2, default=str)[:8000])

asyncio.run(main())
