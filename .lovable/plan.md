
# QA Pass Plan — Roadmap Engine Post-Build Loop

This is a read-only QA pass. Executing it requires shell + browser + DB tools (psql, Playwright, tsgo, supabase read_query), which are only available after approval switches me to build mode. On approval I will run the checks below and return the report in the exact format you specified — no code changes, no migrations, no mutations to real client data.

## Scope

16 capabilities + 5 cross-cutting checks (typecheck, browser smoke desk/mobile, console/network scan, RLS sanity, DB integrity). Read-only throughout.

## Execution approach

**Phase 1 — Static / codebase audit (fast, no browser)**
- `tsgo` typecheck.
- Grep for rejected surfaces: `engine_projects.acknowledged_`, `engine_spine_versions`, duplicate/deprecated routes.
- Confirm acknowledgment source of truth is `client_portal_roadmaps.acknowledged_at / acknowledged_by_email` at every read site.
- Trace approval / self-approval guards in `approveChatProposal`, `updateMilestone`, `updateTaskStatus`, spine mutation path.
- Confirm `SpineVersionHistory` reads `engine_audit_log`, not the rejected table.

**Phase 2 — DB / RLS sanity (psql + supabase read_query)**
- Verify 3 CHECK constraints exist with correct `conrelid` (milestones × 2, tasks × 1).
- Confirm no `engine_spine_versions` table.
- Confirm no `engine_projects.acknowledged_*` columns.
- Spot-check RLS on: `client_portal_roadmaps`, `client_portal_permissions`, `engine_*`, `user_roles`, `engine_audit_log`.
- Scan for public tables missing GRANTs.
- Look for duplicate/deprecated columns from recent migrations.

**Phase 3 — Live browser smoke (Playwright headless, injected admin session)**
- Desktop (1280×1800) + mobile (390×844) passes.
- Routes exercised: `/engine`, `/engine/projects/:id/overview`, `/spine`, `/chat`, `/roadmap`, `/delivery`, `/intelligence`, `/exceptions`, `/drift`, `/plan-depth`, `/roadmap-intelligence`, `/ops/insights`, `/portal/home`, `/portal/roadmap`, `/portal/messages`.
- Capture console errors + failed network requests per route.
- Screenshot each surface for evidence.
- Verify admin-only routes reject unauth (session-cleared context).

**Phase 4 — Capability-by-capability functional checks**
For each of the 16 capabilities, map: expected → observed → status → evidence (route/file/query/screenshot path). Read-only proposal/approval walkthroughs on the existing test project only; no writes to real client data. Any test needing a write is documented as "would test X" instead.

## Report format (as requested)

1. Verdict (PASS / PASS WITH ISSUES / FAIL)
2. Launch risk (Low / Medium / High)
3. P0 blockers
4. P1 issues
5. P2 polish/regression notes
6. Capability matrix (16 rows)
7. Security/RLS findings
8. DB/migration findings
9. Prioritized next actions

## Guardrails

- No code edits, no migrations, no `supabase--migration` calls.
- No writes to real client projects; test project only, and only if strictly needed.
- No secrets echoed; use `LOVABLE_BROWSER_*` session injection per browser-use rules.
- Findings-only output — no autonomous fixes.

## Deliverable

Single QA report posted in chat. Evidence artifacts (screenshots, query outputs) saved under `/tmp/browser/qa-<timestamp>/` and referenced by path in the matrix.

Approve to run.
