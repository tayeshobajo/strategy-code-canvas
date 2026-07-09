#!/usr/bin/env python3
"""Implementation Plan v1 end-to-end QA harness.

Mirrors qa-factory-v1-qa.py. Planning-only verification: NO migrations,
deployments, or delivery mutations. Writes report to
/mnt/documents/qa/implementation-plan-v1/ and screenshots subdir.
"""
import asyncio, json, os, subprocess, urllib.request, urllib.error, hashlib
from pathlib import Path
from playwright.async_api import async_playwright

OUT = Path("/mnt/documents/qa/implementation-plan-v1")
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
TABLE     = "engine_project_implementation_plans"

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
        "backend_j": f"SELECT coalesce(md5(payload::text),'')||'|'||coalesce(updated_at::text,'') FROM engine_project_backend_plans WHERE project_id='{JOTAYE_ID}' AND status='approved' LIMIT 1",
        "qa_j":      f"SELECT coalesce(md5(payload::text),'')||'|'||coalesce(updated_at::text,'') FROM engine_project_qa_plans WHERE project_id='{JOTAYE_ID}' AND status='approved' LIMIT 1",
        "mockup_j":  f"SELECT coalesce(md5(payload::text),'')||'|'||coalesce(updated_at::text,'') FROM engine_project_mockups WHERE project_id='{JOTAYE_ID}' AND status='approved' LIMIT 1",
        "frame_j":   f"SELECT coalesce(md5(payload::text),'')||'|'||coalesce(updated_at::text,'') FROM engine_project_frames WHERE project_id='{JOTAYE_ID}' AND status='approved' LIMIT 1",
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
    R["grants"] = psql(f"""
      SELECT string_agg(r.rolname||': s='||has_table_privilege(r.rolname,'public.{TABLE}','SELECT')::text
        ||' i='||has_table_privilege(r.rolname,'public.{TABLE}','INSERT')::text
        ||' u='||has_table_privilege(r.rolname,'public.{TABLE}','UPDATE')::text
        ||' d='||has_table_privilege(r.rolname,'public.{TABLE}','DELETE')::text, E'\n')
      FROM pg_roles r WHERE rolname IN ('anon','authenticated','service_role')""")
    R["policies"] = psql(f"SELECT policyname||':'||cmd||':'||coalesce(qual,'-') FROM pg_policies WHERE schemaname='public' AND tablename='{TABLE}' ORDER BY policyname")
    R["triggers"] = psql(f"SELECT tgname FROM pg_trigger WHERE tgrelid='public.{TABLE}'::regclass AND NOT tgisinternal")
    R["anon_select"] = f"HTTP {rest(f'/{TABLE}?select=id&limit=1')[0]}"
    approved_bp = psql(f"SELECT id FROM engine_project_backend_plans WHERE project_id='{JOTAYE_ID}' AND status='approved' ORDER BY approved_at DESC LIMIT 1")
    approved_qa = psql(f"SELECT id FROM engine_project_qa_plans WHERE project_id='{JOTAYE_ID}' AND status='approved' ORDER BY approved_at DESC LIMIT 1")
    R["approved_backend_plan_id"] = approved_bp
    R["approved_qa_plan_id"] = approved_qa
    fake_body = {'project_id':JOTAYE_ID,'backend_plan_id':approved_bp,'qa_plan_id':approved_qa,'title':'hack','payload':{}}
    R["anon_insert"] = f"HTTP {rest(f'/{TABLE}', method='POST', body=fake_body, extra={'Prefer':'return=representation'})[0]}"
    R["auth_insert"] = f"HTTP {rest(f'/{TABLE}', token=token, method='POST', body=fake_body, extra={'Prefer':'return=representation'})[0]}"
    R["auth_update_any"] = f"HTTP {rest(f'/{TABLE}?id=eq.00000000-0000-0000-0000-000000000000', token=token, method='PATCH', body={'title':'x'})[0]}"
    R["auth_delete_any"] = f"HTTP {rest(f'/{TABLE}?id=eq.00000000-0000-0000-0000-000000000000', token=token, method='DELETE')[0]}"
    R["auth_select"] = f"HTTP {rest(f'/{TABLE}?select=id&limit=1', token=token)[0]}"

    baseline = snap()
    R["baseline"] = baseline
    pre = int(psql(f"SELECT count(*) FROM {TABLE} WHERE project_id='{JOTAYE_ID}'"))

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)

        # §1 anon redirect
        anon_ctx = await browser.new_context(viewport={"width":1280,"height":1800})
        anon_page = await anon_ctx.new_page()
        try:
            await anon_page.goto(f"http://localhost:8080/engine/projects/{JOTAYE_ID}/implementation-plan", wait_until="networkidle", timeout=30000)
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

        # §2 readiness on projects w/o approved backend+qa plan
        for pid, tag in [(INBDE_ID,"inbde"), (AUG1_ID,"aug1")]:
            await page.goto(f"http://localhost:8080/engine/projects/{pid}/implementation-plan", wait_until="networkidle", timeout=45000)
            await page.wait_for_timeout(1800)
            await page.screenshot(path=str(SHOTS/f"02_{tag}_missing.png"))
            try:
                R[f"{tag}_generate_disabled"] = await page.locator("[data-qa=btn-generate-impl]").first.is_disabled()
            except Exception as e:
                R[f"{tag}_generate_disabled"] = f"err: {str(e)[:80]}"
            R[f"{tag}_missing_inputs_ui"] = await page.locator("[data-qa=impl-missing-inputs]").count() > 0

        # §2 Jotaye — has approved backend + QA
        await page.goto(f"http://localhost:8080/engine/projects/{JOTAYE_ID}/implementation-plan", wait_until="networkidle", timeout=45000)
        await page.wait_for_timeout(2500)
        await page.screenshot(path=str(SHOTS/"03_jotaye_ready.png"))
        R["admin_route_url"] = page.url
        R["approved_backend_badge"] = await page.locator("[data-qa=badge-approved-backend]").count() > 0
        R["approved_qa_badge"] = await page.locator("[data-qa=badge-approved-qa]").count() > 0
        R["nav_impl_present"] = await page.locator("[data-qa-nav=implementation-plan]").count() > 0

        # Nav ordering: implementation plan should come after qa-factory in dom order
        try:
            order = await page.eval_on_selector_all(
                "[data-qa-nav]",
                "els => els.map(e => e.getAttribute('data-qa-nav'))"
            )
            R["nav_order"] = order
            if "qa-factory" in order and "implementation-plan" in order:
                R["nav_order_ok"] = order.index("implementation-plan") > order.index("qa-factory")
        except Exception as e:
            R["nav_order_err"] = str(e)[:200]

        # §3 Generate (reuse draft if present)
        existing = psql(f"SELECT id FROM {TABLE} WHERE project_id='{JOTAYE_ID}' AND status='draft' ORDER BY created_at DESC LIMIT 1")
        plan_id = None
        if existing:
            plan_id = existing
            R["generate_result"] = f"SKIPPED reuse={existing}"
        else:
            print("== §3 Generate ==")
            try:
                btn = page.locator("[data-qa=btn-generate-impl]").first
                await btn.wait_for(state="visible", timeout=15000)
                enabled = not await btn.is_disabled()
                R["jotaye_generate_enabled"] = enabled
                if enabled:
                    await btn.click()
                    for _ in range(120):
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
            # §3 metadata & FK links
            meta = psql(f"SELECT status||'|'||generated_by||'|'||coalesce(backend_plan_id::text,'null')||'|'||coalesce(qa_plan_id::text,'null')||'|'||coalesce(mockup_id::text,'null')||'|'||coalesce(frame_id::text,'null') FROM {TABLE} WHERE id='{plan_id}'")
            R["plan_metadata"] = meta
            R["backend_link_ok"] = approved_bp in meta
            R["qa_link_ok"] = approved_qa in meta

            # §4 payload schema
            print("== §4 schema ==")
            payload_txt = psql(f"SELECT payload::text FROM {TABLE} WHERE id='{plan_id}'")
            try:
                pl = json.loads(payload_txt)
                req_top = ["implementation_goal","source_backend_summary","source_qa_summary","build_strategy","phases","build_steps","migration_plan","server_function_plan","ui_wiring_plan","permission_rls_plan","integration_plan","qa_execution_order","developer_prompts","parallelization","rollback_strategy","release_gates","open_decisions","risks"]
                R["schema_missing_top"] = [k for k in req_top if k not in pl]
                probs = []
                phase_ids = set()
                for ph in pl.get("phases", []):
                    for k in ["id","title","goal","sequence","depends_on","deliverables","acceptance_gates","qa_gates","rollback_notes"]:
                        if k not in ph: probs.append(f"phase {ph.get('id','?')}: missing {k}")
                    phase_ids.add(ph.get("id"))
                priorities = set(); step_types = set(); risks_seen = set(); build_step_ids = set()
                p0=p1=p2=0; high=med=low=0
                for st in pl.get("build_steps", []):
                    for k in ["id","phase_id","title","type","priority","goal","inputs","outputs","files_or_surfaces","dependencies","implementation_notes","qa_checks","acceptance_criteria","rollback_plan","risk_level","requires_human_review"]:
                        if k not in st: probs.append(f"step {st.get('id','?')}: missing {k}")
                    build_step_ids.add(st.get("id"))
                    priorities.add(st.get("priority")); step_types.add(st.get("type")); risks_seen.add(st.get("risk_level"))
                    if st.get("priority")=="p0": p0+=1
                    elif st.get("priority")=="p1": p1+=1
                    elif st.get("priority")=="p2": p2+=1
                    if st.get("risk_level")=="high": high+=1
                    elif st.get("risk_level")=="medium": med+=1
                    elif st.get("risk_level")=="low": low+=1
                    if st.get("phase_id") and st.get("phase_id") not in phase_ids:
                        probs.append(f"step {st.get('id','?')}: unknown phase_id {st.get('phase_id')}")
                for dp in pl.get("developer_prompts", []):
                    for k in ["title","target","prompt","expected_output","acceptance_criteria","safety_notes"]:
                        if k not in dp: probs.append(f"prompt {dp.get('title','?')}: missing {k}")
                targets = sorted({(dp.get("target") or "") for dp in pl.get("developer_prompts", [])})
                R["prompt_targets"] = targets
                R["schema_problems"] = probs[:25]
                R["counts"] = {
                    "phases": len(pl.get("phases", [])),
                    "build_steps": len(pl.get("build_steps", [])),
                    "migration_plan": len(pl.get("migration_plan", [])),
                    "server_function_plan": len(pl.get("server_function_plan", [])),
                    "ui_wiring_plan": len(pl.get("ui_wiring_plan", [])),
                    "permission_rls_plan": len(pl.get("permission_rls_plan", [])),
                    "integration_plan": len(pl.get("integration_plan", [])),
                    "qa_execution_order": len(pl.get("qa_execution_order", [])),
                    "developer_prompts": len(pl.get("developer_prompts", [])),
                    "rollback_strategy": len(pl.get("rollback_strategy", [])),
                    "release_gates": len(pl.get("release_gates", [])),
                    "open_decisions": len(pl.get("open_decisions", [])),
                    "risks": len(pl.get("risks", [])),
                    "p0": p0, "p1": p1, "p2": p2,
                    "high_risk": high, "med_risk": med, "low_risk": low,
                }
                low_txt = payload_txt.lower()
                R["leak_hits"] = [k for k in ["api_key","anthropic","openai_api","system prompt","bearer "] if k in low_txt]
                R["auto_exec_hits"] = [k for k in ["migration applied","migration was applied","deployed to production","tests passed","marked as delivered","successfully deployed"] if k in low_txt]
            except Exception as e:
                R["schema_err"] = str(e)[:300]

            # §6 UI screenshots
            print("== §6 UI ==")
            await page.goto(f"http://localhost:8080/engine/projects/{JOTAYE_ID}/implementation-plan", wait_until="networkidle", timeout=45000)
            await page.wait_for_timeout(2500)
            await page.screenshot(path=str(SHOTS/"04_desktop_draft.png"))
            R["ai_pm_panel_present"] = await page.locator("[data-qa=ai-pm-panel]").count() > 0
            R["filter_phase_present"] = await page.locator("[data-qa=filter-phase]").count() > 0
            R["filter_type_present"] = await page.locator("[data-qa=filter-type]").count() > 0
            R["filter_priority_present"] = await page.locator("[data-qa=filter-priority]").count() > 0
            await page.set_viewport_size({"width":1024,"height":1400})
            await page.wait_for_timeout(500)
            await page.screenshot(path=str(SHOTS/"05_tablet.png"))
            await page.set_viewport_size({"width":390,"height":1800})
            await page.wait_for_timeout(500)
            await page.screenshot(path=str(SHOTS/"06_mobile.png"))
            await page.set_viewport_size({"width":1280,"height":1800})

            # §7 Submit
            print("== §7 Submit ==")
            rev_before = int(psql(f"SELECT count(*) FROM engine_review_items WHERE project_id='{JOTAYE_ID}' AND item_type='implementation_plan'"))
            try:
                sb = page.locator("[data-qa=btn-submit-impl]").first
                await sb.wait_for(state="visible", timeout=15000)
                await sb.click()
                await page.wait_for_timeout(3500)
            except Exception as e:
                R["submit_err"] = str(e)[:300]
            R["status_after_submit"] = psql(f"SELECT status FROM {TABLE} WHERE id='{plan_id}'")
            R["review_items_added"] = int(psql(f"SELECT count(*) FROM engine_review_items WHERE project_id='{JOTAYE_ID}' AND item_type='implementation_plan'")) - rev_before
            R["review_item_status"] = psql(f"SELECT status FROM engine_review_items WHERE project_id='{JOTAYE_ID}' AND item_type='implementation_plan' ORDER BY created_at DESC LIMIT 1")
            await page.screenshot(path=str(SHOTS/"07_submitted.png"))

            # §8 Approve
            print("== §8 Approve ==")
            await page.reload(wait_until="networkidle")
            await page.wait_for_timeout(2500)
            try:
                ap = page.locator("[data-qa=btn-approve-impl]").first
                await ap.wait_for(state="visible", timeout=15000)
                await ap.click()
                await page.wait_for_timeout(3500)
            except Exception as e:
                R["approve_err"] = str(e)[:300]
            R["status_after_approve"] = psql(f"SELECT status||'|'||coalesce(approved_by_email,'')||'|'||coalesce(approved_at::text,'null') FROM {TABLE} WHERE id='{plan_id}'")
            await page.screenshot(path=str(SHOTS/"08_approved.png"))

            # capture approved fingerprint
            approved_fp = psql(f"SELECT md5(payload::text)||'|'||title||'|'||status||'|'||updated_at::text FROM {TABLE} WHERE id='{plan_id}'")
            R["approved_fingerprint"] = approved_fp

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
            trig3 = subprocess.run(["psql","-c",f"UPDATE {TABLE} SET title='hacked-sql' WHERE id='{plan_id}'"], capture_output=True, text=True)
            R["trigger_block_title"] = "BLOCKED" if trig3.returncode!=0 or "ERROR" in trig3.stderr else "NOT BLOCKED"
            R["trigger_msg_title"] = trig3.stderr.strip()[:200]
            R["title_intact_after_attacks"] = psql(f"SELECT title FROM {TABLE} WHERE id='{plan_id}'")

            # §11 NBA post-approval
            print("== §11 NBA ==")
            R["nba"] = psql(f"SELECT string_agg(action||':'||coalesce(reason,''), ' | ') FROM (SELECT * FROM compute_engine_next_best_action('{JOTAYE_ID}') LIMIT 5) t")
            R["project_status_after_approve"] = psql(f"SELECT status||'|'||coalesce(current_step,'') FROM engine_projects WHERE id='{JOTAYE_ID}'")

            # §17 regenerate-after-approval
            print("== §17 regenerate ==")
            fp_before = approved_fp
            pre2 = int(psql(f"SELECT count(*) FROM {TABLE} WHERE project_id='{JOTAYE_ID}'"))
            await page.reload(wait_until="networkidle")
            await page.wait_for_timeout(2000)
            try:
                gb = page.locator("[data-qa=btn-generate-impl]").first
                if await gb.count() > 0 and not await gb.is_disabled():
                    await gb.click()
                    for _ in range(100):
                        await page.wait_for_timeout(2000)
                        post2 = int(psql(f"SELECT count(*) FROM {TABLE} WHERE project_id='{JOTAYE_ID}'"))
                        if post2 > pre2: break
                    R["regen_new_row"] = post2 > pre2
                    R["approved_fp_after_regen"] = psql(f"SELECT md5(payload::text)||'|'||title||'|'||status||'|'||updated_at::text FROM {TABLE} WHERE id='{plan_id}'")
                    R["approved_fp_stable"] = R["approved_fp_after_regen"] == fp_before
                else:
                    R["regen_generate_disabled"] = True
            except Exception as e:
                R["regen_err"] = str(e)[:200]

            # §10 Archive (archive the new draft, keep approved)
            print("== §10 Archive ==")
            await page.reload(wait_until="networkidle")
            await page.wait_for_timeout(2000)
            draft_id = psql(f"SELECT id FROM {TABLE} WHERE project_id='{JOTAYE_ID}' AND status='draft' ORDER BY created_at DESC LIMIT 1")
            try:
                ar = page.locator("[data-qa=btn-archive-impl]").first
                if await ar.count() > 0:
                    await ar.wait_for(state="visible", timeout=10000)
                    await ar.click()
                    await page.wait_for_timeout(3000)
            except Exception as e:
                R["archive_err"] = str(e)[:200]
            R["draft_id_targeted"] = draft_id
            R["draft_status_after_archive"] = psql(f"SELECT status FROM {TABLE} WHERE id='{draft_id}'") if draft_id else "no-draft"
            await page.screenshot(path=str(SHOTS/"09_archived.png"))

        # §18 regression smoke
        print("== §18 regression ==")
        reg = {}
        for path in ["spine","chat","frame-builder","mockup-builder","backend-builder","qa-factory","implementation-plan"]:
            e_before = len(errs)
            await page.goto(f"http://localhost:8080/engine/projects/{JOTAYE_ID}/{path}", wait_until="networkidle", timeout=45000)
            await page.wait_for_timeout(1200)
            reg[path] = {"url": page.url, "new_console_errors": len(errs)-e_before}
        R["regression"] = reg
        R["console_errors_tail"] = errs[-30:]

        await browser.close()

    # §11 chat context source review
    print("== chat ctx ==")
    ctx_src = Path("src/lib/engine-chat-context.server.ts").read_text()
    R["chat_ctx_impl_mentions"] = sum(1 for l in ctx_src.splitlines() if "implementation_plan" in l.lower())
    prompt_src = Path("src/lib/engine-chat-prompt.server.ts").read_text()
    R["chat_prompt_impl_mentions"] = sum(1 for l in prompt_src.splitlines() if "implementation_plan" in l.lower() or "implementation plan" in l.lower())

    # §13 protected diff
    print("== §13 diff ==")
    post = snap()
    R["protected_diffs"] = {k: (baseline[k], post[k]) for k in baseline if baseline[k] != post[k]}

    # §14 audit + activity
    print("== §14 audit ==")
    R["audit_events"] = psql(f"""SELECT event_type||':'||count(*) FROM engine_project_chat_events
      WHERE project_id='{JOTAYE_ID}' AND event_type LIKE 'implementation_plan_%' GROUP BY event_type ORDER BY event_type""")
    R["activity_events"] = psql(f"""SELECT kind||':'||count(*) FROM engine_activity
      WHERE project_id='{JOTAYE_ID}' AND kind LIKE 'implementation_plan_%' GROUP BY kind ORDER BY kind""")
    R["leak_scan"] = psql(f"""SELECT count(*) FROM {TABLE} WHERE project_id='{JOTAYE_ID}'
      AND (payload::text ILIKE '%api_key%' OR payload::text ILIKE '%anthropic%' OR payload::text ILIKE '%system prompt%')""")

    Path(OUT/"results.json").write_text(json.dumps(R, indent=2, default=str))
    print("\n== DONE ==")
    print(json.dumps(R, indent=2, default=str)[:10000])

asyncio.run(main())
