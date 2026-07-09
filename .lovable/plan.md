# Mockup Builder v1 — End-to-End QA Pass

Run a full 15-section QA against Mockup Builder v1 on Jotaye Ventures (with spot checks on INBDE & ADAT Platform and August 1 intake). Do not build Backend Builder. Deliverable: `/mnt/documents/qa/mockup-builder-v1/REPORT.md` + screenshots.

## Approach

Mirror the Frame Builder v1 generation-proof QA harness. One Python driver script using Playwright + seeded admin session + direct psql/PostgREST probes.

**Script:** `scripts/qa/mockup-builder-v1-qa.py`

Phases:
1. **Setup** — resolve Jotaye project id, confirm approved frame exists, snapshot baseline of protected surfaces (client_portal_*, roadmap_approvals, engine_tasks, engine_milestones counts + updated_at).
2. **Route + access (§1)** — hit `/engine/projects/:id/mockup-builder` as admin (200 + nav active), as anon (redirect to `/auth`), as non-staff (blocked). Verify RLS via anon PostgREST SELECT/INSERT on `engine_project_mockups` → denied.
3. **Readiness (§2)** — pick a project with no approved frame, confirm Generate button disabled + copy present; call `generateProjectMockups` server fn directly → expect refusal, zero rows inserted. Then Jotaye: approved-frame badge visible, Generate enabled.
4. **Generate (§3)** — click Generate on Jotaye; assert row created with status=draft, generated_by ∈ {ai,hybrid}, frame_id = approved frame id, audit + activity rows written, protected-surface snapshot unchanged.
5. **Payload schema (§4)** — Zod-style validation in Python against the schema in `engine-mockup-builder-prompt.server.ts` (top-level keys, design_system_notes, page shape, layout_sections, states). Fail on image output, missing responsive_notes, generic QA, etc.
6. **Must-page coverage (§5)** — diff approved frame `pages[priority=must]` vs mockup `pages[frame_page_id]`. Report counts + missing ids.
7. **UI rendering (§6)** — desktop / tablet (768) / mobile (390) screenshots of every section (header, NBA, badges, buttons, Overview, Pages by priority, Global Components, Interaction Model, Responsive Strategy, QA, Open Decisions, History, AI PM panel). Assert page-card subsections visible.
8. **Submit to review (§7)** — click Submit; assert status draft→in_review, exactly one `engine_review_items` row (item_type=mockup_set, status=pending, mockup ref in metadata), audit + activity, no approval, no backend, no portal change. Double-click guard check.
9. **Approve (§8)** — admin approves; status=approved, approved_by/approved_at set, audit + activity, NBA recommends Backend Builder or next step. Non-admin path: probe server fn directly with a non-staff bearer if seedable, else document skip.
10. **Approved protection (§9)** — direct PostgREST PATCH attempts (status, payload, title) → denied; server-fn save/generation on approved id → creates new draft or refuses, never overwrites; invalid transitions blocked by trigger.
11. **Archive (§10)** — admin archives a draft; status=archived, audit + activity; latest-active logic ignores it.
12. **Chat awareness (§11)** — send seven questions listed; assert answers reference latest mockup counts (pages, states, global components, open decisions, ready_for_backend) and refuse approve/backend/generation actions.
13. **Permission + RLS (§12)** — anon SELECT/INSERT/UPDATE/DELETE → denied; authenticated non-staff same; cross-project id in server-fn payload → rejected.
14. **Protected surface regression (§13)** — re-snapshot client_portal_*, roadmap_approvals, tasks, milestones, investment/delivered fields; diff against baseline = zero.
15. **Audit / activity (§14)** — enumerate expected event kinds (`mockup_generated`, `mockup_submitted_to_review`, `mockup_approved`, `mockup_archived`, plus `mockup_generation_failed` induced by forcing missing frame). Assert no prompts/keys/reasoning/tokens leaked into stored payload.
16. **Regression (§15)** — smoke: Spine, Chat, Action Mode, Frame Builder, portal isolation still load; run tsgo typecheck; capture any console errors.

## Spot checks

INBDE & ADAT Platform + August 1 intake: readiness check only (no approved frame expected → Generate disabled + refusal proof). Screenshot each.

## Deliverable

`/mnt/documents/qa/mockup-builder-v1/REPORT.md` with the 16 requested sections (Executive Summary → Recommendation) and `screenshots/` folder. Recommendation states safe / not safe to proceed to Backend Builder v1, with top fixes if any.

## Technical notes

- Reuse seeded admin session via `LOVABLE_BROWSER_SUPABASE_*` env vars.
- Direct DB reads via `psql` (`PG*` env vars) for row/audit inspection.
- Anon RLS probes via `fetch` to `${SUPABASE_URL}/rest/v1/engine_project_mockups` with publishable key only.
- Screenshots saved under `/mnt/documents/qa/mockup-builder-v1/screenshots/`.
- No schema or code changes as part of QA. If a defect is found, list it under Top Fixes; do not patch during the pass.
