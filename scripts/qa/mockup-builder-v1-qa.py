#!/usr/bin/env python3
"""Mockup Builder v1 end-to-end QA harness.

Reads seeded admin creds (QA_SEED_PASSWORD) + PG* + SUPABASE_* env vars.
Writes report to /mnt/documents/qa/mockup-builder-v1/REPORT.md and
screenshots to /mnt/documents/qa/mockup-builder-v1/screenshots/.
"""
import asyncio, json, os, subprocess, urllib.request, urllib.error, time
from pathlib import Path
from playwright.async_api import async_playwright

OUT = Path("/mnt/documents/qa/mockup-builder-v1")
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

RESULTS = {}

def psql(sql: str) -> str:
    return subprocess.check_output(["psql", "-tAc", sql], text=True).strip()

def rest(path: str, token: str | None = None, method="GET", body=None, extra=None):
    url = f"{SUPA_URL}/rest/v1{path}"
    headers = {"apikey": PK, "Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if extra:
        headers.update(extra)
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        resp = urllib.request.urlopen(req, timeout=15)
        return resp.status, resp.read().decode()[:500]
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:500]

def sign_in() -> dict:
    url = f"{SUPA_URL}/auth/v1/token?grant_type=password"
    body = json.dumps({"email": QA_EMAIL, "password": QA_PW}).encode()
    req = urllib.request.Request(url, data=body, headers={"apikey": PK, "Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req).read())

def snapshot_baseline():
    q = {
        "client_portal_projects": "SELECT count(*)||'|'||coalesce(max(updated_at)::text,'') FROM client_portal_projects",
        "client_portal_roadmaps": "SELECT count(*)||'|'||coalesce(max(updated_at)::text,'') FROM client_portal_roadmaps",
        "client_portal_messages": "SELECT count(*)||'|'||coalesce(max(updated_at)::text,'') FROM client_portal_messages",
        "client_portal_files": "SELECT count(*)||'|'||coalesce(max(updated_at)::text,'') FROM client_portal_files",
        "roadmap_approvals": "SELECT count(*)||'|'||coalesce(max(created_at)::text,'') FROM roadmap_approvals",
        "engine_tasks": f"SELECT count(*)||'|'||coalesce(max(updated_at)::text,'') FROM engine_tasks WHERE project_id='{JOTAYE_ID}'",
        "engine_milestones": f"SELECT count(*)||'|'||coalesce(max(updated_at)::text,'') FROM engine_milestones WHERE project_id='{JOTAYE_ID}'",
    }
    return {k: psql(v) for k, v in q.items()}


async def inject_session(context, page, session):
    session_json = json.dumps(session)
    await page.goto("http://localhost:8080/")
    await page.evaluate(
        f"window.localStorage.setItem({json.dumps(STORAGE_KEY)}, {json.dumps(session_json)})"
    )

async def main():
    print("== §1 sign in ==")
    session = sign_in()
    token = session["access_token"]
    print("signed in as", session["user"]["email"])
    RESULTS["auth"] = f"signed in as {session['user']['email']}"

    # ----- DB probes upfront -----
    print("== §12 grants + policies + triggers ==")
    RESULTS["grants"] = psql("""
        SELECT grantee||':'||string_agg(privilege_type, ',' ORDER BY privilege_type)
        FROM information_schema.role_table_grants
        WHERE table_schema='public' AND table_name='engine_project_mockups'
          AND grantee IN ('anon','authenticated','service_role')
        GROUP BY grantee ORDER BY grantee
    """)

    RESULTS["policies"] = psql("""
        SELECT policyname||':'||cmd||':'||coalesce(qual,'-') FROM pg_policies
        WHERE schemaname='public' AND tablename='engine_project_mockups' ORDER BY policyname
    """)
    RESULTS["triggers"] = psql("""
        SELECT tgname FROM pg_trigger WHERE tgrelid='public.engine_project_mockups'::regclass AND NOT tgisinternal
    """)

    print("== §12 anon RLS probes ==")
    anon_get = rest(f"/engine_project_mockups?project_id=eq.{JOTAYE_ID}&select=id")
    anon_ins = rest(f"/engine_project_mockups", method="POST",
                    body={"project_id": JOTAYE_ID, "title": "x", "payload": {}, "status": "draft", "generated_by": "human"},
                    extra={"Prefer": "return=representation"})
    RESULTS["anon_select"] = f"HTTP {anon_get[0]}"
    RESULTS["anon_insert"] = f"HTTP {anon_ins[0]}"

    # ----- baseline snapshot -----
    print("== baseline snapshot ==")
    baseline = snapshot_baseline()
    RESULTS["baseline"] = baseline

    # ----- §1 route + access via Playwright -----
    print("== §1 route + Playwright ==")
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)

        # anon context — should redirect to /auth
        anon_ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})
        anon_page = await anon_ctx.new_page()
        await anon_page.goto(f"http://localhost:8080/engine/projects/{JOTAYE_ID}/mockup-builder", wait_until="networkidle", timeout=30000)
        RESULTS["anon_route_url"] = anon_page.url
        await anon_page.screenshot(path=str(SHOTS / "01_anon_redirect.png"))
        await anon_ctx.close()

        # admin context
        ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await ctx.new_page()
        page.on("console", lambda m: print("[console]", m.type, m.text[:200]) if m.type in ("error","warning") else None)
        page.on("dialog", lambda d: asyncio.create_task(d.accept()))
        await inject_session(ctx, page, session)


        # §2 readiness — INBDE (no approved frame) first
        await page.goto(f"http://localhost:8080/engine/projects/{INBDE_ID}/mockup-builder", wait_until="networkidle", timeout=45000)
        await page.wait_for_timeout(1500)
        await page.screenshot(path=str(SHOTS / "02_inbde_readiness.png"))
        try:
            gen_btn = page.locator("[data-qa=btn-generate-mockups]")
            RESULTS["inbde_generate_disabled"] = await gen_btn.first.is_disabled()
        except Exception as e:
            RESULTS["inbde_generate_disabled"] = f"btn probe error: {e}"

        # Aug 1
        await page.goto(f"http://localhost:8080/engine/projects/{AUG1_ID}/mockup-builder", wait_until="networkidle", timeout=45000)
        await page.wait_for_timeout(1500)
        await page.screenshot(path=str(SHOTS / "02_aug1_readiness.png"))
        try:
            RESULTS["aug1_generate_disabled"] = await page.locator("[data-qa=btn-generate-mockups]").first.is_disabled()
        except Exception as e:
            RESULTS["aug1_generate_disabled"] = f"btn probe error: {e}"

        # §2 Jotaye
        await page.goto(f"http://localhost:8080/engine/projects/{JOTAYE_ID}/mockup-builder", wait_until="networkidle", timeout=45000)
        await page.wait_for_timeout(2000)
        await page.screenshot(path=str(SHOTS / "03_jotaye_ready.png"))
        RESULTS["admin_route_url"] = page.url

        # capture pre-generate mockup count; reuse existing draft if present
        pre_count = psql(f"SELECT count(*) FROM engine_project_mockups WHERE project_id='{JOTAYE_ID}'")
        existing_draft = psql(f"SELECT id FROM engine_project_mockups WHERE project_id='{JOTAYE_ID}' AND status='draft' ORDER BY created_at DESC LIMIT 1")

        # §3 Generate (skip if a draft already exists to conserve AI budget)
        print("== §3 Generate ==")
        if existing_draft:
            RESULTS["jotaye_generate_enabled"] = "SKIPPED (reusing existing draft)"
            RESULTS["generated_mockup_id"] = existing_draft
        else:
            try:
                btn = page.locator("[data-qa=btn-generate-mockups]").first
                enabled = not await btn.is_disabled()
                RESULTS["jotaye_generate_enabled"] = enabled
                if enabled:
                    await btn.click()
                    new_row_id = None
                    for _ in range(60):
                        await page.wait_for_timeout(2000)
                        row = psql(f"SELECT id FROM engine_project_mockups WHERE project_id='{JOTAYE_ID}' ORDER BY created_at DESC LIMIT 1")
                        post_count = psql(f"SELECT count(*) FROM engine_project_mockups WHERE project_id='{JOTAYE_ID}'")
                        if int(post_count) > int(pre_count):
                            new_row_id = row
                            break
                    RESULTS["generated_mockup_id"] = new_row_id or "TIMEOUT"
            except Exception as e:
                RESULTS["generate_error"] = str(e)


        mockup_id = RESULTS.get("generated_mockup_id")
        if mockup_id and mockup_id != "TIMEOUT":
            # §4 payload schema
            print("== §4 payload schema ==")
            payload_json = psql(f"SELECT payload::text FROM engine_project_mockups WHERE id='{mockup_id}'")
            try:
                pl = json.loads(payload_json)
                required_top = ["mockup_goal","source_frame_summary","design_system_notes","pages","global_components","navigation_model","interaction_model","responsive_strategy","qa_expectations","open_decisions"]
                missing = [k for k in required_top if k not in pl]
                page_probs = []
                for p in pl.get("pages", []):
                    for k in ["frame_page_id","title","priority","page_goal","layout_sections","key_actions","states","responsive_notes","data_dependencies","backend_dependencies","qa_checks"]:
                        if k not in p:
                            page_probs.append(f"page {p.get('title','?')}: missing {k}")
                    if not p.get("layout_sections"):
                        page_probs.append(f"page {p.get('title','?')}: 0 layout_sections")
                    if not p.get("states"):
                        page_probs.append(f"page {p.get('title','?')}: 0 states")
                    rn = p.get("responsive_notes", {})
                    for k in ("desktop","tablet","mobile"):
                        if not rn.get(k):
                            page_probs.append(f"page {p.get('title','?')}: missing responsive_notes.{k}")
                # generic image check
                blob = json.dumps(pl).lower()
                has_image_urls = any(x in blob for x in ["http://", "https://"]) and any(x in blob for x in [".png",".jpg",".jpeg",".webp"])
                RESULTS["schema_missing_top"] = missing
                RESULTS["schema_page_problems"] = page_probs[:20]
                RESULTS["schema_has_image_urls"] = has_image_urls
                RESULTS["payload_pages"] = len(pl.get("pages", []))
                RESULTS["payload_states_total"] = sum(len(p.get("states", [])) for p in pl.get("pages", []))
                RESULTS["payload_global_components"] = len(pl.get("global_components", []))
                RESULTS["payload_open_decisions"] = len(pl.get("open_decisions", []))
            except Exception as e:
                RESULTS["schema_error"] = str(e)

            # §5 must-page coverage
            frame_pages = psql(f"""
                SELECT coalesce(jsonb_agg(jsonb_build_object('id',p->>'id','priority',p->>'priority','title',p->>'title'))::text, '[]')
                FROM (
                  SELECT payload FROM engine_project_frames
                  WHERE project_id='{JOTAYE_ID}' AND status='approved'
                  ORDER BY approved_at DESC LIMIT 1
                ) f, jsonb_array_elements(f.payload->'pages') p
            """)

            try:
                fps = json.loads(frame_pages) if frame_pages else []
                must_ids = {p["id"] for p in fps if p.get("priority") == "must"}
                covered = {p.get("frame_page_id") for p in (json.loads(payload_json).get("pages", []))}
                RESULTS["must_pages_total"] = len(must_ids)
                RESULTS["must_pages_covered"] = len(must_ids & covered)
                RESULTS["must_pages_missing"] = sorted(list(must_ids - covered))
            except Exception as e:
                RESULTS["coverage_error"] = str(e)

            # §6 UI rendering — reload
            await page.goto(f"http://localhost:8080/engine/projects/{JOTAYE_ID}/mockup-builder", wait_until="networkidle", timeout=45000)
            await page.wait_for_timeout(2500)
            await page.screenshot(path=str(SHOTS / "04_jotaye_draft_desktop.png"))
            await page.set_viewport_size({"width": 768, "height": 1400})
            await page.wait_for_timeout(500)
            await page.screenshot(path=str(SHOTS / "05_jotaye_draft_tablet.png"))
            await page.set_viewport_size({"width": 390, "height": 1800})
            await page.wait_for_timeout(500)
            await page.screenshot(path=str(SHOTS / "06_jotaye_draft_mobile.png"))
            await page.set_viewport_size({"width": 1280, "height": 1800})
            await page.wait_for_timeout(500)

            # §7 Submit to review
            print("== §7 Submit to review ==")
            review_before = psql(f"SELECT count(*) FROM engine_review_items WHERE project_id='{JOTAYE_ID}' AND item_type='mockup_set'")
            try:
                sb_btn = page.locator("[data-qa=btn-submit-mockup]").first
                await sb_btn.wait_for(state="visible", timeout=15000)
                await sb_btn.click()
                await page.wait_for_timeout(3500)
            except Exception as e:
                RESULTS["submit_error"] = str(e)[:300]

            RESULTS["status_after_submit"] = psql(f"SELECT status FROM engine_project_mockups WHERE id='{mockup_id}'")
            review_after = psql(f"SELECT count(*) FROM engine_review_items WHERE project_id='{JOTAYE_ID}' AND item_type='mockup_set'")
            RESULTS["review_items_added"] = int(review_after) - int(review_before)
            await page.screenshot(path=str(SHOTS / "07_submitted.png"))

            # §8 Approve
            print("== §8 Approve ==")
            try:
                await page.reload(wait_until="networkidle")
                await page.wait_for_timeout(2500)
                ap_btn = page.locator("[data-qa=btn-approve-mockup]").first
                await ap_btn.wait_for(state="visible", timeout=15000)
                await ap_btn.click()
                await page.wait_for_timeout(3500)
            except Exception as e:
                RESULTS["approve_error"] = str(e)[:300]
            RESULTS["status_after_approve"] = psql(f"SELECT status||'|'||coalesce(approved_by_email,'') FROM engine_project_mockups WHERE id='{mockup_id}'")

            await page.screenshot(path=str(SHOTS / "08_approved.png"))

            # §9 Approved protection — direct PostgREST PATCH as anon
            print("== §9 Approved protection ==")
            patch_anon = rest(f"/engine_project_mockups?id=eq.{mockup_id}", method="PATCH",
                              body={"title": "hacked"})
            RESULTS["anon_patch_approved"] = f"HTTP {patch_anon[0]}"
            # authenticated patch
            patch_auth = rest(f"/engine_project_mockups?id=eq.{mockup_id}", token=token, method="PATCH",
                              body={"title": "hacked"})
            RESULTS["auth_patch_approved"] = f"HTTP {patch_auth[0]}"
            # trigger enforcement check: try direct DB PATCH via service role would succeed but bypass
            # Instead verify trigger: try UPDATE via psql to change status invalid
            trigger_test = subprocess.run(
                ["psql", "-c", f"UPDATE engine_project_mockups SET status='draft' WHERE id='{mockup_id}'"],
                capture_output=True, text=True)
            RESULTS["trigger_block_approved_downgrade"] = (
                "BLOCKED" if trigger_test.returncode != 0 or "ERROR" in trigger_test.stderr
                else "NOT BLOCKED (may be service-role bypass)"
            )
            RESULTS["trigger_msg"] = trigger_test.stderr.strip()[:300]

            # §10 Archive — archive the (now approved) mockup as latest;
            # trigger allows archive from any status.
            print("== §10 Archive ==")
            await page.goto(f"http://localhost:8080/engine/projects/{JOTAYE_ID}/mockup-builder", wait_until="networkidle")
            await page.wait_for_timeout(2500)
            try:
                arch_btn = page.locator("[data-qa=btn-archive-mockup]").first
                await arch_btn.wait_for(state="visible", timeout=15000)
                await arch_btn.click()
                await page.wait_for_timeout(3000)
            except Exception as e:
                RESULTS["archive_error"] = str(e)[:300]
            RESULTS["archive_status"] = psql(f"SELECT status FROM engine_project_mockups WHERE id='{mockup_id}'")
            await page.screenshot(path=str(SHOTS / "09_archived.png"))


        await browser.close()

    # §11 Chat awareness — direct DB check that context is exposed
    print("== §11 Chat awareness ==")
    try:
        chat_ctx_txt = Path("src/lib/engine-chat-context.server.ts").read_text()
        mockup_lines = [l for l in chat_ctx_txt.splitlines() if "mockup" in l.lower()]
        RESULTS["chat_context_mockup_lines"] = len(mockup_lines)
        RESULTS["chat_context_sample"] = mockup_lines[:6]
    except Exception as e:
        RESULTS["chat_context_error"] = str(e)


    # §13 protected surface regression
    print("== §13 protected surface regression ==")
    post = snapshot_baseline()
    diffs = {k: (baseline[k], post[k]) for k in baseline if baseline[k] != post[k]}
    RESULTS["protected_surface_diffs"] = diffs

    # §14 audit events
    print("== §14 audit ==")
    RESULTS["audit_events"] = psql(f"""
        SELECT event_type||':'||count(*) FROM engine_project_chat_events
        WHERE project_id='{JOTAYE_ID}' AND event_type LIKE 'mockup_%'
        GROUP BY event_type ORDER BY event_type
    """)
    RESULTS["activity_events"] = psql(f"""
        SELECT kind||':'||count(*) FROM engine_activity
        WHERE project_id='{JOTAYE_ID}' AND kind LIKE 'mockup_%'
        GROUP BY kind ORDER BY kind
    """)
    # audit leak check — ensure no prompt text in payload/summary/title
    leaks = psql(f"""
        SELECT count(*) FROM engine_project_mockups
        WHERE project_id='{JOTAYE_ID}'
          AND (payload::text ILIKE '%api_key%' OR payload::text ILIKE '%system prompt%'
               OR payload::text ILIKE '%anthropic%' OR title ILIKE '%api_key%')
    """)
    RESULTS["leak_scan_hits"] = leaks

    Path(OUT / "results.json").write_text(json.dumps(RESULTS, indent=2, default=str))
    print("\n== DONE ==")
    print(json.dumps(RESULTS, indent=2, default=str)[:4000])

asyncio.run(main())
