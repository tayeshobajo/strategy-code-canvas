# Frame Builder v1 — Generation Proof Pass

Prove the AI generation contract end-to-end on Jotaye Ventures, then rerun the affected Frame Builder QA slices. No Mockup Builder work.

## 1. Seed readiness (migration, minimal)

Update only Jotaye Ventures (`bbbbbbb1-0000-4000-8000-000000000002`) in `engine_projects`:
- `point_a` → concise current-state JSON (founder, offer, constraints) if null/empty
- `point_b` → jsonb with `goal` = "Create a buildable strategy sprint system that turns Jotaye's founder goals, service offer, and operating constraints into a clear roadmap, client-facing structure, and execution plan."
- `goal` column → same string (readiness checks `project.goal`)

Leave milestones, roadmap, portal, tasks untouched. Verify existing 6 milestones remain.

Then via authenticated admin session: call `getProjectFrameBuilder` → confirm `missing_inputs` is empty and Generate button is enabled.

## 2. Live generation

Invoke `generateProjectFrame` (Playwright, click Generate Frame Set in UI). Capture:
- returned frame row (id, status, generated_by, payload)
- `engine_project_chat_events` row with `frame_generated`
- `engine_activity` row

## 3. Payload validation

Zod-parse the payload against `FrameBuilderPayload` schema from `engine-frame-builder.functions.ts`. Verify every top-level field and every page's 17 required fields. Fail loudly on missing/empty.

Grade usefulness against Jotaye's spine:
- pages reference real Jotaye concepts (founder goals, service offer, sprint, roadmap)
- must/should/later distribution present
- flows have actor + steps + success + edge cases
- open_decisions name real blockers

Return: page count, flow count, must-build count, backend req count, open decision count, QA gate count, top-3 strongest pages, top-3 weakest areas.

## 4. Submit → Approve → Protection retest

- Submit draft → verify status=`in_review`, one `engine_review_items` (kind=`frame_set`, status=`pending`, linked to frame_id), no portal/roadmap/task deltas.
- Approve as admin → status=`approved`, approved_by/at set, activity+audit written, `compute_engine_next_best_action` recommends next step.
- Protection retest against the approved AI frame:
  - PostgREST PATCH payload/title/status as authenticated user
  - Server-fn save over approved
  - Reverse-transition approved → draft
  - All expected to fail via triggers/RLS.

## 5. Defense-in-depth migration

```sql
REVOKE INSERT, UPDATE, DELETE ON public.engine_project_frames FROM authenticated, anon;
-- keep SELECT for authenticated (RLS still gates via is_engine_staff)
```

Verify via `information_schema.role_table_grants` that write grants are gone for anon+authenticated; confirm server functions (which use the user's authenticated Supabase client, not service role) still work — if they break, switch the writes in `engine-frame-builder.functions.ts` to `supabaseAdmin` after capability checks. Report finding either way.

## 6. Project Chat frame awareness

Signed-in admin on Jotaye chat, ask the 7 canonical frame questions. Verify answers reference the approved frame (page count matches, must-build pages named, open decisions accurate). Verify chat refuses to approve/generate mockups/mutate protected surfaces (diff snapshot before/after).

## 7. Screenshots (1280×1800 desktop, 1024×1366 tablet, 390×844 mobile)

Readiness enabled, Generate action, generated draft, Pages, Flows, Data+Backend, QA, Open Decisions, Submitted, Approved, Chat frame answer, mobile, tablet.

## 8. Deliverable

`/mnt/documents/qa/frame-builder-v1/GENERATION_REPORT.md` with the requested sections:

Executive Summary · Readiness Seed Results · Live Generation Results · Payload Schema Results · Frame Usefulness Results · Submit/Approve Results · Approved Protection Results · Defense-in-Depth Grant Results · Project Chat Frame Awareness Results · Screenshots · Top Fixes · Recommendation (safe / not safe for Mockup Builder v1)

## Technical notes

- Seeding uses `supabase--migration` (touches `point_a`/`point_b`/`goal` on one project row — schema-safe UPDATE wrapped in a migration since data change is tied to a readiness contract; if preferred we can use `supabase--insert` instead — flag your preference).
- Grant revocation is a schema change → migration tool.
- All UI + server-fn invocations run via Playwright with the seeded admin session (`LOVABLE_BROWSER_AUTH_STATUS=injected` expected this turn).
- No changes to Mockup Builder, portal, roadmap, or protected surfaces.
- Typecheck (`tsgo`) + smoke of Spine/Chat/Action Mode/Proposals routes at the end.

## Out of scope

- Mockup Builder v1
- Any schema change to `engine_project_frames` beyond the REVOKE
- Seeding a non-admin operator (deferred; noted in prior report)
