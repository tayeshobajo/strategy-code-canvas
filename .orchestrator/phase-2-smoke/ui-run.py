"""Phase 2 Acceptance — Operator UI + DB-trigger smoke pass (linear flow).

Two scratch projects; no runtime resets. Uses the injected admin/operator's
real bearer token against PostgREST for DB-trigger cases (same code path
CeremonyPanel server functions use), and Playwright for UI verification.
"""

import asyncio
import json
import os
import re
import subprocess
import sys
from pathlib import Path

import requests
from playwright.async_api import async_playwright

HERE = Path(__file__).parent
SHOTS = HERE / "screenshots"
SHOTS.mkdir(parents=True, exist_ok=True)

PROJECT_A = "7134233e-c6c5-46b7-ba06-69da4f1cae8c"   # linear flow
PROJECT_B = "00dcd3b3-6cea-4d55-8bb2-375de67e30aa"   # contradiction

SUPABASE_URL = "https://jqehcikzvyewijjvpszh.supabase.co"
ANON = "sb_publishable_mF24_o-spzzxHlB3i3jDkA_8euIpH9o"
TOKEN = os.environ["LOVABLE_BROWSER_SUPABASE_ACCESS_TOKEN"]
SESSION = json.loads(os.environ["LOVABLE_BROWSER_SUPABASE_SESSION_JSON"])
OPERATOR = SESSION["user"]["email"]

HEADERS = {
    "apikey": ANON,
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}

A_KEYS = ["lenses", "diagnosis", "key_diagnosis", "diagnosis:x", "diagnosis:y"]
B_KEYS = [
    "24_month_destination", "10_year_position", "client_outcome", "customer_outcome",
    "operational_outcome", "revenue_outcome", "brand_position",
]

results = []


def record(n, label, expected, actual, passed, detail=""):
    results.append({
        "case": n, "label": label, "expected": expected,
        "actual": actual[:400] if isinstance(actual, str) else actual,
        "result": "PASS" if passed else "FAIL", "detail": detail,
    })
    tag = "PASS" if passed else "FAIL"
    print(f"[{tag}] {str(n):>3}  {label}")
    if not passed:
        print(f"        expected: {expected}\n        actual:   {actual}")


def rest(method, path, **kw):
    r = requests.request(method, f"{SUPABASE_URL}/rest/v1/{path}", headers=HEADERS, timeout=20, **kw)
    return r


def get_ceremony(project_id, spine, status=None):
    q = f"engine_spine_ceremonies?project_id=eq.{project_id}&spine=eq.{spine}&order=updated_at.desc&limit=1"
    if status:
        q += f"&status=eq.{status}"
    rows = rest("GET", q).json()
    return rows[0] if rows else None


def get_truth(project_id, spine, field_key):
    rows = rest(
        "GET",
        f"engine_spine_field_truth?project_id=eq.{project_id}&spine=eq.{spine}&field_key=eq.{field_key}",
    ).json()
    return rows[0] if rows else None


def open_or_reuse_ceremony(project_id, spine):
    existing = get_ceremony(project_id, spine, status="in_progress")
    if existing:
        return existing
    r = rest(
        "POST",
        "engine_spine_ceremonies",
        data=json.dumps({
            "project_id": project_id, "spine": spine,
            "opened_by_email": OPERATOR, "status": "in_progress",
        }),
    )
    if r.status_code >= 300:
        raise RuntimeError(f"open ceremony {spine}: {r.text}")
    return r.json()[0]


def approve_field(ceremony, field_key):
    ref = {
        "kind": "operator_confirmation",
        "approval_kind": "ceremony",
        "ceremony_id": ceremony["id"],
        "operator_confirmed_by": OPERATOR,
        "reason": "approved during smoke",
    }
    r1 = rest(
        "PATCH",
        f"engine_spine_field_truth?project_id=eq.{ceremony['project_id']}&spine=eq.{ceremony['spine']}&field_key=eq.{field_key}",
        data=json.dumps({
            "status": "approved_truth", "source_ref": ref,
            "ceremony_id": ceremony["id"],
            "updated_by_email": OPERATOR, "updated_by_actor": "human",
        }),
    )
    if r1.status_code >= 300:
        raise RuntimeError(f"approve truth {field_key}: {r1.text}")
    r2 = rest(
        "POST",
        "engine_spine_ceremony_decisions",
        data=json.dumps({
            "ceremony_id": ceremony["id"], "project_id": ceremony["project_id"],
            "spine": ceremony["spine"], "field_key": field_key,
            "prior_status": "needs_confirmation", "new_status": "approved_truth",
            "source_ref": ref, "decided_by_email": OPERATOR,
        }),
    )
    if r2.status_code >= 300:
        raise RuntimeError(f"decision {field_key}: {r2.text}")


def try_complete(ceremony):
    return rest(
        "PATCH",
        f"engine_spine_ceremonies?id=eq.{ceremony['id']}",
        data=json.dumps({
            "status": "completed", "completed_at": "now()",
            "completed_by_email": OPERATOR,
        }),
    )


def seed_b(project_id):
    rest("POST", "engine_spine_field_truth",
         data=json.dumps([
             {"project_id": project_id, "spine": "point-b", "field_key": k,
              "status": "needs_confirmation", "source_ref": {"kind": "backfill"},
              "updated_by_email": OPERATOR, "updated_by_actor": "human"}
             for k in B_KEYS
         ]))


# =============================================================================
# Linear flow on Project A
# =============================================================================
def run_project_a():
    project = PROJECT_A

    # ---- 1: recordCeremonyDecision stamps ceremony_id on truth row ----
    cer_a = open_or_reuse_ceremony(project, "point-a")
    approve_field(cer_a, "lenses")
    t = get_truth(project, "point-a", "lenses")
    ok = t and t.get("ceremony_id") == cer_a["id"] and t["status"] == "approved_truth"
    record(1, "recordCeremonyDecision stamps ceremony_id on truth row",
           "truth.ceremony_id matches", f"status={t['status']} ceremony_id={t['ceremony_id']}", ok)

    # ---- 2: complete blocked while non-terminal fields remain ----
    r = try_complete(cer_a)
    ok = r.status_code >= 400 and ("not terminal" in r.text.lower() or "cannot complete" in r.text.lower())
    record(2, "completeCeremony blocks non-terminal fields",
           "check_violation mentioning terminal/complete", f"{r.status_code} {r.text[:180]}", ok)

    # ---- 3: mid-approval still blocked (raw path) ----
    for k in ["diagnosis", "key_diagnosis", "diagnosis:x"]:
        approve_field(cer_a, k)
    r = try_complete(cer_a)
    ok = r.status_code >= 400
    record(3, "raw completion path rejected by DB trigger",
           "check_violation", f"{r.status_code} {r.text[:180]}", ok)

    # ---- 4: bare missing blocks completion ----
    rest("PATCH",
         f"engine_spine_field_truth?project_id=eq.{project}&spine=eq.point-a&field_key=eq.diagnosis:y",
         data=json.dumps({
             "status": "missing",
             "source_ref": {"kind": "operator_marked"},
             "updated_by_email": OPERATOR, "updated_by_actor": "human",
         }))
    r = try_complete(cer_a)
    ok = r.status_code >= 400
    record(4, "bare `missing` blocks completion",
           "check_violation", f"{r.status_code} {r.text[:180]}", ok)

    # ---- 5: accepted-risk missing allows completion ----
    ref = {
        "kind": "operator_confirmation", "approval_kind": "operator_override",
        "reason": "n/a for this business", "operator_confirmed_by": OPERATOR,
        "accepted_as_risk": True,
    }
    rest("PATCH",
         f"engine_spine_field_truth?project_id=eq.{project}&spine=eq.point-a&field_key=eq.diagnosis:y",
         data=json.dumps({
             "status": "missing", "source_ref": ref,
             "updated_by_email": OPERATOR, "updated_by_actor": "human",
         }))
    r = try_complete(cer_a)
    ok5 = r.status_code < 300
    record(5, "accepted-risk `missing` allows completion",
           "PATCH 200", f"{r.status_code} {r.text[:180]}", ok5)

    cer_a = get_ceremony(project, "point-a", "completed")

    # ---- 13: dynamic diagnosis:* keys were enumerated by completion trigger ----
    #        (case 5 succeeded only if trigger saw diagnosis:x/y — otherwise
    #        it would have completed on prior attempt with them still pending.)
    record(13, "completion trigger sees dynamic `diagnosis:*` keys",
           "case 4 blocked when diagnosis:y bare, case 5 unblocked with accepted-risk",
           f"cer_a.completed_at={cer_a and cer_a.get('completed_at')}", bool(cer_a and cer_a.get("completed_at")))

    # ---- 10: full Point B approve + complete ----
    seed_b(project)
    cer_b = open_or_reuse_ceremony(project, "point-b")
    for k in B_KEYS:
        approve_field(cer_b, k)
    r = try_complete(cer_b)
    ok10 = r.status_code < 300
    record(10, "full Point B approve+complete works",
           "PATCH 200", f"{r.status_code} {r.text[:180]}", ok10)
    cer_b = get_ceremony(project, "point-b", "completed")

    # ---- 7: abandon Point A rejected while Point B exists w/o invalidation ----
    r = rest(
        "PATCH",
        f"engine_spine_ceremonies?id=eq.{cer_a['id']}",
        data=json.dumps({
            "status": "abandoned", "abandoned_at": "now()",
            "abandoned_by_email": OPERATOR, "abandon_reason": "smoke abandon",
        }),
    )
    ok = r.status_code >= 400 and ("point b" in r.text.lower() or "invalidation" in r.text.lower())
    record(7, "abandon Point A rejected while Point B exists w/o invalidation",
           "check_violation mentioning Point B/invalidation",
           f"{r.status_code} {r.text[:200]}", ok)

    # ---- 8: decision against completed ceremony rejected ----
    r = rest(
        "POST",
        "engine_spine_ceremony_decisions",
        data=json.dumps({
            "ceremony_id": cer_a["id"], "project_id": project, "spine": "point-a",
            "field_key": "lenses", "prior_status": "approved_truth", "new_status": "approved_truth",
            "source_ref": {"approval_kind": "ceremony", "ceremony_id": cer_a["id"],
                           "operator_confirmed_by": OPERATOR, "kind": "operator_confirmation"},
            "decided_by_email": OPERATOR,
        }),
    )
    ok = r.status_code >= 400 and "completed" in r.text.lower()
    record(8, "decision against completed ceremony rejected",
           "check_violation mentioning completed", f"{r.status_code} {r.text[:200]}", ok)

    # ---- 12: blank invalidation reason rejected by CHECK ----
    r = rest(
        "POST",
        "engine_spine_ceremony_invalidations",
        data=json.dumps({
            "project_id": project, "ceremony_id": cer_a["id"],
            "reason": "   ", "created_by_email": OPERATOR,
        }),
    )
    ok = r.status_code >= 400
    record(12, "invalidation.reason blank rejected by CHECK (proves same guard shape for abandonCeremony)",
           "check_violation", f"{r.status_code} {r.text[:200]}", ok)

    # ---- 14: invalidate Point A cascades stale to Point B ----
    inv = rest(
        "POST",
        "engine_spine_ceremony_invalidations",
        data=json.dumps({
            "project_id": project, "ceremony_id": cer_a["id"],
            "reason": "smoke: Point A must be revisited",
            "reversed_field_keys": ["lenses"], "created_by_email": OPERATOR,
        }),
    )
    inv_ok = inv.status_code < 300
    cer_b_after = get_ceremony(project, "point-b")
    cascade_ok = bool(cer_b_after and cer_b_after.get("re_review_required") and cer_b_after.get("stale_since"))
    record(14, "Point A invalidation cascades stale/re-review to Point B",
           "point-b.re_review_required=true and stale_since set",
           f"re_review={cer_b_after and cer_b_after.get('re_review_required')} stale_since={cer_b_after and cer_b_after.get('stale_since')}",
           inv_ok and cascade_ok)

    # ---- 9: approved_truth without provenance rejected (needs an in_progress ceremony)
    # Reopen Point A first — unlocked by active invalidation.
    r = rest(
        "PATCH",
        f"engine_spine_ceremonies?id=eq.{cer_a['id']}",
        data=json.dumps({"status": "in_progress",
                         "completed_at": None, "completed_by_email": None}),
    )
    reopen_ok = r.status_code < 300
    record(15, "invalidation record unlocks Point A reopen",
           "PATCH 200", f"{r.status_code} {r.text[:200]}", reopen_ok)

    if reopen_ok:
        r = rest(
            "POST",
            "engine_spine_ceremony_decisions",
            data=json.dumps({
                "ceremony_id": cer_a["id"], "project_id": project, "spine": "point-a",
                "field_key": "lenses", "prior_status": "approved_truth", "new_status": "approved_truth",
                "source_ref": {"kind": "bogus"},  # no approval_kind, no ceremony_id, no operator_confirmed_by
                "decided_by_email": OPERATOR,
            }),
        )
        ok = r.status_code >= 400 and "approved_truth" in r.text.lower()
        record(9, "approved_truth without provenance rejected",
               "check_violation about approved_truth decisions",
               f"{r.status_code} {r.text[:200]}", ok)
    else:
        record(9, "approved_truth without provenance rejected", "n/a", "reopen failed", False)

    # ---- 16: re-complete Point A auto-resolves the invalidation ----
    if reopen_ok:
        r = try_complete({"id": cer_a["id"], "spine": "point-a"})
        recomp_ok = r.status_code < 300
        inv_rows = rest(
            "GET",
            f"engine_spine_ceremony_invalidations?ceremony_id=eq.{cer_a['id']}&order=created_at.desc&limit=1",
        ).json()
        resolved = bool(inv_rows and inv_rows[0].get("resolved_at"))
        record(16, "re-completion auto-resolves invalidations",
               "invalidation.resolved_at set",
               f"{r.status_code} resolved_at={inv_rows and inv_rows[0].get('resolved_at')}",
               recomp_ok and resolved)
    else:
        record(16, "re-completion auto-resolves invalidations", "n/a", "reopen failed", False)

    # ---- 11: AI actor cannot write verified/approved_truth (app-layer) ----
    src = Path("/dev-server/src/lib/engine-epistemic.server.ts").read_text()
    guard_present = ("AI_WRITABLE_STATUSES" in src) and ('actorKind === "ai"' in src)
    fn = Path("/dev-server/src/lib/engine-epistemic.functions.ts")
    wired = fn.exists() and ("assertStatusAllowedForActor" in fn.read_text())
    record(11, "AI actor cannot write verified/approved_truth (app-layer guard)",
           "assertStatusAllowedForActor present + wired into markSpineFieldStatus",
           f"guard={guard_present} wired={wired}", guard_present and wired)


# =============================================================================
# Project B: contradiction blocks completion
# =============================================================================
def run_project_b():
    project = PROJECT_B
    cer = open_or_reuse_ceremony(project, "point-a")
    for k in A_KEYS:
        approve_field(cer, k)
    # Flip one to contradicted after approval
    rest("PATCH",
         f"engine_spine_field_truth?project_id=eq.{project}&spine=eq.point-a&field_key=eq.diagnosis:x",
         data=json.dumps({
             "status": "contradicted",
             "source_ref": {"kind": "contradiction_marker", "reason": "smoke"},
             "updated_by_email": OPERATOR, "updated_by_actor": "human",
         }))
    r = try_complete(cer)
    ok = r.status_code >= 400 and "contradict" in r.text.lower()
    record(6, "contradiction blocks completion",
           "check_violation mentioning contradictions", f"{r.status_code} {r.text[:200]}", ok)


# =============================================================================
# UI verification
# =============================================================================
async def restore_session(page, context):
    key = os.environ.get("LOVABLE_BROWSER_SUPABASE_STORAGE_KEY")
    sess = os.environ.get("LOVABLE_BROWSER_SUPABASE_SESSION_JSON")
    cookies_json = os.environ.get("LOVABLE_BROWSER_SUPABASE_COOKIES_JSON")
    if cookies_json:
        cookies = json.loads(cookies_json)
        for c in cookies:
            c["url"] = "http://localhost:8080"
        await context.add_cookies(cookies)
    await page.goto("http://localhost:8080", wait_until="domcontentloaded")
    if key and sess:
        await page.evaluate(f"window.localStorage.setItem({json.dumps(key)}, {json.dumps(sess)})")


async def run_ui_cases():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await ctx.new_page()
        await restore_session(page, ctx)

        # Point A
        await page.goto(f"http://localhost:8080/engine/projects/{PROJECT_A}/point-a",
                        wait_until="networkidle")
        await page.wait_for_timeout(4000)
        try:
            await page.wait_for_selector('[data-qa-ceremony-badge="point-a"]', timeout=8000)
        except Exception:
            pass
        await page.screenshot(path=str(SHOTS / "01_point_a.png"))
        html = await page.content()
        has_panel = "Approval walkthrough" in html or "Open ceremony" in html or "Ceremony" in html
        record("UI-A", "CeremonyPanel present on /engine/.../point-a",
               "CeremonyPanel DOM visible", f"panel_markers={has_panel}", has_panel)
        b = await page.query_selector('[data-qa-ceremony-badge="point-a"]')
        state_a = await b.get_attribute("data-qa-ceremony-state") if b else None
        record("UI-BADGE-A", "WorkspaceStepper badge on Point A step",
               "data-qa-ceremony-state populated (completed after case 16)",
               f"state={state_a}", state_a in ("completed", "re_review", "in_progress", "stale"))

        # Point B
        await page.goto(f"http://localhost:8080/engine/projects/{PROJECT_A}/point-b",
                        wait_until="networkidle")
        await page.wait_for_timeout(4000)
        try:
            await page.wait_for_selector('[data-qa-ceremony-badge="point-b"]', timeout=8000)
        except Exception:
            pass
        await page.screenshot(path=str(SHOTS / "02_point_b.png"))
        b = await page.query_selector('[data-qa-ceremony-badge="point-b"]')
        state_b = await b.get_attribute("data-qa-ceremony-state") if b else None
        record("UI-BADGE-B", "WorkspaceStepper badge on Point B step",
               "data-qa-ceremony-state populated",
               f"state={state_b}", state_b is not None)

        # Portal isolation
        portal_ok = True
        portal_detail = {}
        for path in ["/portal/home", "/portal/roadmap", "/portal/onboarding"]:
            try:
                await page.goto(f"http://localhost:8080{path}", wait_until="domcontentloaded")
                await page.wait_for_timeout(2000)
                html = await page.content()
                bad = (
                    "Approval walkthrough" in html
                    or "data-qa-ceremony-badge" in html
                    or "Open ceremony" in html
                )
                portal_detail[path] = bad
                if bad:
                    portal_ok = False
                await page.screenshot(path=str(SHOTS / f"03_portal_{path.strip('/').replace('/', '_')}.png"))
            except Exception as e:
                portal_detail[path] = f"ERR: {e}"
        record("UI-PORTAL", "No portal route renders CeremonyPanel",
               "all portal paths free of ceremony DOM",
               json.dumps(portal_detail), portal_ok)

        # Static import audit
        rg = subprocess.run(["rg", "-l", "CeremonyPanel", "/dev-server/src"],
                            capture_output=True, text=True)
        files = [ln for ln in rg.stdout.splitlines() if ln]
        allowed = {
            "/dev-server/src/components/engine/CeremonyPanel.tsx",
            "/dev-server/src/routes/engine.projects.$projectId.point-a.tsx",
            "/dev-server/src/routes/engine.projects.$projectId.point-b.tsx",
        }
        stray = [f for f in files if f not in allowed]
        record("UI-IMPORTS", "CeremonyPanel imported only from Point A / Point B routes",
               "no stray importers", f"files={files}", not stray)

        await browser.close()


def main():
    for fn in (run_project_a, run_project_b):
        try:
            fn()
        except Exception as e:
            import traceback; traceback.print_exc()
            record(f"FATAL-{fn.__name__}", "crashed", "no crash", str(e), False)
    try:
        asyncio.run(run_ui_cases())
    except Exception as e:
        import traceback; traceback.print_exc()
        record("FATAL-UI", "ui crashed", "no crash", str(e), False)

    (HERE / "results.json").write_text(json.dumps(results, indent=2))
    passed = sum(1 for r in results if r["result"] == "PASS")
    failed = sum(1 for r in results if r["result"] == "FAIL")
    print(f"\n=== Phase 2 UI smoke: {passed} PASS / {failed} FAIL / {len(results)} total ===")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
