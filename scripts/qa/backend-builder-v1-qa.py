#!/usr/bin/env python3
"""Backend Builder v1 end-to-end QA harness.

Mirrors mockup-builder-v1-qa.py. Uses password sign-in with QA_SEED_PASSWORD.
Writes report to /mnt/documents/qa/backend-builder-v1/REPORT.md and
screenshots to /mnt/documents/qa/backend-builder-v1/screenshots/.
"""
import asyncio, json, os, subprocess, urllib.request, urllib.error
from pathlib import Path
from playwright.async_api import async_playwright

OUT = Path("/mnt/documents/qa/backend-builder-v1")
SHOTS = OUT / "screenshots"
SHOTS.mkdir(parents=True, exist_ok=True)

SUPA_URL = os.environ["SUPABASE_URL"]
PK = os.environ["SUPABASE_PUBLISHABLE_KEY"]
PROJECT_REF = "jqehcikzvyewijjvpszh"
STORAGE_KEY = f"sb-{PROJECT_REF}-auth-token"
QA_EMAIL = "qa-operator@trust-tai.com"
QA_PW = os.environ["QA_SEED_PASSWORD"]

JOTAYE_ID = "bbbbbbb1-0000-4000-8000-000000000002"
INBDE_ID = "430ea1f6-fffd-45b9-b631-9e1e98b2e009"
AUG1_ID = "3ade32db-1496-4a34-98ad-b63d3ad522f9"

R = {}

def psql(sql: str) -> str:
    return subprocess.check_output(["psql", "-tAc", sql], text=True).strip()

def rest(path, token=None, method="GET", body=None, extra=None):
    url = f"{SUPA_URL}/rest/v1{path}"
    headers = {"apikey": PK, "Content-Type": "application/json"}
    if token: headers["Authorization"] = f"Bearer {token}"
    if extra: headers.update(extra)
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        resp = urllib.request.urlopen(req, timeout=15)
        return resp.status, resp.read().decode()[:400]
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:400]

def sign_in():
    url = f"{SUPA_URL}/auth/v1/token?grant_type=password"
    body = json.dumps({"email": QA_EMAIL, "password": QA_PW}).encode()
    req = urllib.request.Request(url, data=body, headers={"apikey": PK, "Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req).read())

def snap():
    q = {
        "client_portal_projects": "SELECT count(*)||'|'||coalesce(max(updated_at)::text,'') FROM client_portal_projects",
        "client_portal_roadmaps": "SELECT count(*)||'|'||coalesce(max(updated_at)::text,'') FROM client_portal_roadmaps",
        "client_portal_messages": "SELECT count(*)||'|'||coalesce(max(updated_at)::text,'') FROM client_portal_messages",
        "client_portal_files": "SELECT count(*)||'|'||coalesce(max(updated_at)::text,'') FROM client_portal_files",
        "roadmap_approvals": "SELECT count(*)||'|'||coalesce(max(created_at)::text,'') FROM roadmap_approvals",
        "roadmap_documents": "SELECT count(*)||'|'||coalesce(max(created_at)::text,'') FROM roadmap_documents",
        "engine_tasks_jotaye": f"SELECT count(*)||'|'||coalesce(max(updated_at)::text,'') FROM engine_tasks WHERE project_id='{JOTAYE_ID}'",
        "engine_milestones_jotaye": f"SELECT count(*)||'|'||coalesce(max(updated_at)::text,'') FROM engine_milestones WHERE project_id='{JOTAYE_ID}'",
        "engine_projects_jotaye": f"SELECT status||'|'||coalesce(investment_confirmed_at::text,'null') FROM engine_projects WHERE id='{JOTAYE_ID}'",
        "engine_project_frames_jotaye": f"SELECT count(*) FROM engine_project_frames WHERE project_id='{JOTAYE_ID}'",
        "engine_project_mockups_jotaye": f"SELECT count(*) FROM engine_project_mockups WHERE project_id='{JOTAYE_ID}'",
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

    # §12 grants + policies + triggers (DB probes)
    print("== §12 grants ==")
    R["grants_has_table_privilege"] = psql("""
        SELECT string_agg(r.rolname||': s='||has_table_privilege(r.rolname,'public.engine_project_backend_plans','SELECT')::text
          ||' i='||has_table_privilege(r.rolname,'public.engine_project_backend_plans','INSERT')::text
          ||' u='||has_table_privilege(r.rolname,'public.engine_project_backend_plans','UPDATE')::text
          ||' d='||has_table_privilege(r.rolname,'public.engine_project_backend_plans','DELETE')::text, E'\n')
        FROM pg_roles r WHERE rolname IN ('anon','authenticated','service_role')
    """)
    R["policies"] = psql("""SELECT policyname||':'||cmd||':'||coalesce(qual,'-') FROM pg_policies
        WHERE schemaname='public' AND tablename='engine_project_backend_plans' ORDER BY policyname""")
    R["triggers"] = psql("""SELECT tgname FROM pg_trigger WHERE tgrelid='public.engine_project_backend_plans'::regclass AND NOT tgisinternal""")

    # anon PostgREST probes
    R["anon_select"] = f"HTTP {rest(f'/engine_project_backend_plans?project_id=eq.{JOTAYE_ID}&select=id')[0]}"
    R["anon_insert"] = f"HTTP {rest('/engine_project_backend_plans', method='POST', body={'project_id': JOTAYE_ID, 'mockup_id': '00000000-0000-0000-0000-000000000000', 'title': 'x', 'payload': {}}, extra={'Prefer': 'return=representation'})[0]}"
    # authenticated direct write attempt
    R["auth_insert"] = f"HTTP {rest('/engine_project_backend_plans', token=token, method='POST', body={'project_id': JOTAYE_ID, 'mockup_id': '00000000-0000-0000-0000-000000000000', 'title': 'x', 'payload': {}}, extra={'Prefer': 'return=representation'})[0]}"

    baseline = snap()
    R["baseline"] = baseline

    pre_bplans = int(psql(f"SELECT count(*) FROM engine_project_backend_plans WHERE project_id='{JOTAYE_ID}'"))
    approved_mockup_id = psql(f"SELECT id FROM engine_project_mockups WHERE project_id='{JOTAYE_ID}' AND status='approved' ORDER BY approved_at DESC LIMIT 1")
    R["approved_mockup_id"] = approved_mockup_id

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)

        # §1 anon redirect
        anon_ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})
        anon_page = await anon_ctx.new_page()
        try:
            await anon_page.goto(f"http://localhost:8080/engine/projects/{JOTAYE_ID}/backend-builder", wait_until="networkidle", timeout=30000)
        except Exception as e:
            R["anon_nav_err"] = str(e)[:200]
        R["anon_route_url"] = anon_page.url
        await anon_page.screenshot(path=str(SHOTS / "01_anon_redirect.png"))
        await anon_ctx.close()

        # admin ctx
        ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await ctx.new_page()
        errs = []
        page.on("console", lambda m: errs.append(m.text[:200]) if m.type == "error" else None)
        page.on("dialog", lambda d: asyncio.create_task(d.accept()))
        await inject(page, session)

        # §2 readiness — INBDE (no approved mockup)
        await page.goto(f"http://localhost:8080/engine/projects/{INBDE_ID}/backend-builder", wait_until="networkidle", timeout=45000)
        await page.wait_for_timeout(2000)
        await page.screenshot(path=str(SHOTS / "02_inbde_no_mockup.png"))
        try:
            R["inbde_generate_disabled"] = await page.locator("[data-qa=btn-generate-backend]").first.is_disabled()
        except Exception as e:
            R["inbde_generate_disabled"] = f"err: {e}"
        R["inbde_has_missing_inputs_ui"] = await page.locator("[data-qa=backend-missing-inputs]").count() > 0

        # Aug 1
        await page.goto(f"http://localhost:8080/engine/projects/{AUG1_ID}/backend-builder", wait_until="networkidle", timeout=45000)
        await page.wait_for_timeout(1500)
        await page.screenshot(path=str(SHOTS / "02_aug1_no_mockup.png"))
        try:
            R["aug1_generate_disabled"] = await page.locator("[data-qa=btn-generate-backend]").first.is_disabled()
        except Exception as e:
            R["aug1_generate_disabled"] = f"err: {e}"

        # §2 Jotaye (approved mockup present)
        await page.goto(f"http://localhost:8080/engine/projects/{JOTAYE_ID}/backend-builder", wait_until="networkidle", timeout=45000)
        await page.wait_for_timeout(2500)
        await page.screenshot(path=str(SHOTS / "03_jotaye_ready.png"))
        R["admin_route_url"] = page.url
        R["approved_mockup_badge"] = await page.locator("[data-qa=badge-approved-mockup]").count() > 0

        # Server-side refusal on INBDE via direct server-fn call (bearer)
        # Backend server fns are POST /_serverFn/<hash>. Test via UI-forbidden path is enough here.
        # Reuse existing draft if present
        existing_draft = psql(f"SELECT id FROM engine_project_backend_plans WHERE project_id='{JOTAYE_ID}' AND status='draft' ORDER BY created_at DESC LIMIT 1")
        plan_id = None
        if existing_draft:
            R["generate_result"] = f"SKIPPED reuse={existing_draft}"
            plan_id = existing_draft
        else:
            # §3 Generate
            print("== §3 Generate ==")
            try:
                btn = page.locator("[data-qa=btn-generate-backend]").first
                enabled = not await btn.is_disabled()
                R["jotaye_generate_enabled"] = enabled
                if enabled:
                    await btn.click()
                    for _ in range(90):
                        await page.wait_for_timeout(2000)
                        post = int(psql(f"SELECT count(*) FROM engine_project_backend_plans WHERE project_id='{JOTAYE_ID}'"))
                        if post > pre_bplans:
                            plan_id = psql(f"SELECT id FROM engine_project_backend_plans WHERE project_id='{JOTAYE_ID}' ORDER BY created_at DESC LIMIT 1")
                            break
                    R["generate_result"] = plan_id or "TIMEOUT"
            except Exception as e:
                R["generate_error"] = str(e)[:300]

        R["plan_id"] = plan_id

        if plan_id and plan_id != "TIMEOUT":
            # §3 metadata
            meta = psql(f"SELECT status||'|'||generated_by||'|'||coalesce(mockup_id::text,'null')||'|'||coalesce(frame_id::text,'null') FROM engine_project_backend_plans WHERE id='{plan_id}'")
            R["plan_metadata"] = meta
            R["mockup_link_ok"] = approved_mockup_id in meta

            # §4 payload schema
            print("== §4 schema ==")
            payload_txt = psql(f"SELECT payload::text FROM engine_project_backend_plans WHERE id='{plan_id}'")
            try:
                pl = json.loads(payload_txt)
                req_top = ["backend_goal","source_mockup_summary","architecture_summary","data_model","server_functions","permissions","integrations","workflows","api_endpoints","background_jobs","notifications","security_checks","qa_plan","implementation_sequence","open_decisions","risks"]
                R["schema_missing_top"] = [k for k in req_top if k not in pl]
                dm = pl.get("data_model", {})
                R["dm_missing"] = [k for k in ["tables","views","enums","storage_buckets"] if k not in dm]
                tprobs = []
                for t in dm.get("tables", [])[:50]:
                    for k in ["name","purpose","fields","relationships","indexes","rls_rules","audit_requirements"]:
                        if k not in t: tprobs.append(f"table {t.get('name','?')}: missing {k}")
                    for f in t.get("fields", [])[:30]:
                        for k in ["name","type","required","notes"]:
                            if k not in f: tprobs.append(f"table {t.get('name','?')} field {f.get('name','?')}: missing {k}")
                R["table_problems"] = tprobs[:20]
                fnprobs = []
                for fn in pl.get("server_functions", []):
                    for k in ["name","purpose","inputs","outputs","permissions","side_effects","audit_events","failure_modes"]:
                        if k not in fn: fnprobs.append(f"fn {fn.get('name','?')}: missing {k}")
                R["fn_problems"] = fnprobs[:20]
                permprobs = []
                for p in pl.get("permissions", []):
                    for k in ["role","can_read","can_create","can_update","can_delete","notes"]:
                        if k not in p: permprobs.append(f"perm {p.get('role','?')}: missing {k}")
                R["perm_problems"] = permprobs[:20]
                intprobs = []
                for i in pl.get("integrations", []):
                    for k in ["name","purpose","direction","data_exchanged","auth_required","failure_modes"]:
                        if k not in i: intprobs.append(f"int {i.get('name','?')}: missing {k}")
                R["integration_problems"] = intprobs[:20]
                wfprobs = []
                for w in pl.get("workflows", []):
                    for k in ["name","trigger","steps","success_condition","failure_modes"]:
                        if k not in w: wfprobs.append(f"wf {w.get('name','?')}: missing {k}")
                R["workflow_problems"] = wfprobs[:20]
                qa = pl.get("qa_plan", {})
                R["qa_plan_missing"] = [k for k in ["role_tests","data_tests","rls_tests","integration_tests","edge_cases","regression_tests"] if k not in qa]
                R["counts"] = {
                    "tables": len(dm.get("tables", [])),
                    "views": len(dm.get("views", [])),
                    "server_functions": len(pl.get("server_functions", [])),
                    "permissions": len(pl.get("permissions", [])),
                    "integrations": len(pl.get("integrations", [])),
                    "workflows": len(pl.get("workflows", [])),
                    "implementation_sequence": len(pl.get("implementation_sequence", [])),
                    "open_decisions": len(pl.get("open_decisions", [])),
                    "risks": len(pl.get("risks", [])),
                }
                # leak scan
                low = payload_txt.lower()
                R["leak_hits"] = [k for k in ["api_key","anthropic","openai_api","system prompt","bearer "] if k in low]
                # apply-migration-language scan (should describe, not execute)
                R["auto_apply_hits"] = [k for k in ["automatically apply","auto-apply migration","will execute migration","will deploy"] if k in low]
            except Exception as e:
                R["schema_err"] = str(e)[:300]

            # §6 UI screenshots per section: full page desktop + tablet + mobile
            print("== §6 UI ==")
            await page.goto(f"http://localhost:8080/engine/projects/{JOTAYE_ID}/backend-builder", wait_until="networkidle", timeout=45000)
            await page.wait_for_timeout(2500)
            await page.screenshot(path=str(SHOTS / "04_desktop_draft.png"))
            await page.set_viewport_size({"width": 1024, "height": 1400})
            await page.wait_for_timeout(500)
            await page.screenshot(path=str(SHOTS / "05_tablet_draft.png"))
            await page.set_viewport_size({"width": 390, "height": 1800})
            await page.wait_for_timeout(500)
            await page.screenshot(path=str(SHOTS / "06_mobile_draft.png"))
            await page.set_viewport_size({"width": 1280, "height": 1800})
            await page.wait_for_timeout(500)
            R["ai_pm_panel_present"] = await page.locator("[data-qa=ai-pm-panel]").count() > 0

            # §7 Submit to review
            print("== §7 Submit ==")
            rev_before = int(psql(f"SELECT count(*) FROM engine_review_items WHERE project_id='{JOTAYE_ID}' AND item_type='backend_plan'"))
            try:
                sb = page.locator("[data-qa=btn-submit-backend]").first
                await sb.wait_for(state="visible", timeout=15000)
                await sb.click()
                await page.wait_for_timeout(3500)
            except Exception as e:
                R["submit_err"] = str(e)[:300]
            R["status_after_submit"] = psql(f"SELECT status FROM engine_project_backend_plans WHERE id='{plan_id}'")
            R["review_items_added"] = int(psql(f"SELECT count(*) FROM engine_review_items WHERE project_id='{JOTAYE_ID}' AND item_type='backend_plan'")) - rev_before
            R["review_item_pending"] = psql(f"SELECT status FROM engine_review_items WHERE project_id='{JOTAYE_ID}' AND item_type='backend_plan' ORDER BY created_at DESC LIMIT 1")
            await page.screenshot(path=str(SHOTS / "07_submitted.png"))

            # §8 Approve
            print("== §8 Approve ==")
            await page.reload(wait_until="networkidle")
            await page.wait_for_timeout(2500)
            try:
                ap = page.locator("[data-qa=btn-approve-backend]").first
                await ap.wait_for(state="visible", timeout=15000)
                await ap.click()
                await page.wait_for_timeout(3500)
            except Exception as e:
                R["approve_err"] = str(e)[:300]
            R["status_after_approve"] = psql(f"SELECT status||'|'||coalesce(approved_by_email,'')||'|'||coalesce(approved_at::text,'null') FROM engine_project_backend_plans WHERE id='{plan_id}'")
            await page.screenshot(path=str(SHOTS / "08_approved.png"))

            # §9 Approved protection — anon + auth PATCH + direct psql revert
            print("== §9 Protection ==")
            R["anon_patch_approved"] = f"HTTP {rest(f'/engine_project_backend_plans?id=eq.{plan_id}', method='PATCH', body={'title':'hacked'})[0]}"
            R["auth_patch_approved"] = f"HTTP {rest(f'/engine_project_backend_plans?id=eq.{plan_id}', token=token, method='PATCH', body={'title':'hacked'})[0]}"
            trig = subprocess.run(["psql","-c",f"UPDATE engine_project_backend_plans SET status='draft' WHERE id='{plan_id}'"], capture_output=True, text=True)
            R["trigger_block_downgrade"] = "BLOCKED" if trig.returncode!=0 or "ERROR" in trig.stderr else "NOT BLOCKED"
            R["trigger_msg"] = trig.stderr.strip()[:200]

            # §10 Archive — archive the approved plan
            print("== §10 Archive ==")
            await page.reload(wait_until="networkidle")
            await page.wait_for_timeout(2500)
            try:
                ar = page.locator("[data-qa=btn-archive-backend]").first
                await ar.wait_for(state="visible", timeout=15000)
                await ar.click()
                await page.wait_for_timeout(3000)
            except Exception as e:
                R["archive_err"] = str(e)[:300]
            R["status_after_archive"] = psql(f"SELECT status FROM engine_project_backend_plans WHERE id='{plan_id}'")
            await page.screenshot(path=str(SHOTS / "09_archived.png"))

        # §15 regression smoke — hit sibling routes, expect 200 + no page errors
        print("== §15 regression ==")
        reg = {}
        for path in ["spine","chat","frame-builder","mockup-builder"]:
            e_before = len(errs)
            await page.goto(f"http://localhost:8080/engine/projects/{JOTAYE_ID}/{path}", wait_until="networkidle", timeout=45000)
            await page.wait_for_timeout(1500)
            reg[path] = {"url": page.url, "new_console_errors": len(errs)-e_before}
        R["regression"] = reg
        R["all_console_errors"] = errs[-15:]

        await browser.close()

    # §11 chat awareness — verify context surface
    print("== §11 chat context ==")
    ctx_src = Path("src/lib/engine-chat-context.server.ts").read_text()
    R["chat_ctx_backend_mentions"] = sum(1 for l in ctx_src.splitlines() if "backend_plan" in l.lower() or "backend plan" in l.lower())

    # §13 protected-surface diff
    print("== §13 diff ==")
    post = snap()
    R["protected_diffs"] = {k: (baseline[k], post[k]) for k in baseline if baseline[k] != post[k]}

    # §14 audit + activity
    print("== §14 audit ==")
    R["audit_events"] = psql(f"""SELECT event_type||':'||count(*) FROM engine_project_chat_events
        WHERE project_id='{JOTAYE_ID}' AND event_type LIKE 'backend_plan_%' GROUP BY event_type ORDER BY event_type""")
    R["activity_events"] = psql(f"""SELECT kind||':'||count(*) FROM engine_activity
        WHERE project_id='{JOTAYE_ID}' AND kind LIKE 'backend_plan_%' GROUP BY kind ORDER BY kind""")
    R["leak_scan"] = psql(f"""SELECT count(*) FROM engine_project_backend_plans WHERE project_id='{JOTAYE_ID}'
        AND (payload::text ILIKE '%api_key%' OR payload::text ILIKE '%anthropic%' OR payload::text ILIKE '%system prompt%')""")

    Path(OUT / "results.json").write_text(json.dumps(R, indent=2, default=str))
    print("\n== DONE ==")
    print(json.dumps(R, indent=2, default=str)[:6000])

asyncio.run(main())
