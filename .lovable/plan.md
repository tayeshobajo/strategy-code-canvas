# Roadmap Engine Audit Remediation — Pillars 1→12

Goal: turn every PARTIAL / FAIL into PASS, in numerical order. Pillars 3 (Source Room) and the core of 4 & 5 are already PASS — they still get small tightening because the audit flagged caveats. No new tests; each pillar ends with a manual verify (build clean + click-through on the affected screen).

Approach per pillar: read the exact files → make the smallest change that closes the audit finding → verify → move to the next. No batching, no parallel pillars.

---

## Pillar 1 — Intake (PARTIAL → PASS)
**Finding:** portal onboarding auto-extracts, public wizard doesn't; no bridge from intake submission to project.
- Add a "Create project from submission" server fn in `src/lib/intake.functions.ts` that calls `createProjectFromSource` with the submission's text as a `research_note` source.
- Add a button on the ops intake review console (`scripts/intake/001_review_console.sql` surface → the admin route that lists `intake_submissions`) wired to that fn.
- On success, stamp `intake_submissions.linked_project_id` so we don't double-create.

## Pillar 2 — Project Creation (PARTIAL → PASS)
**Finding:** integrity checks exist but no transaction; rollback orphans records and deletes its own audit trail.
- Wrap the multi-insert sequence in `createProjectFromSource` in a single Postgres RPC (`create_project_atomic`) so all sibling inserts (project, agent, permissions, v0.0 version, portal linkage) commit or rollback together.
- Keep the current `integrity_failure` activity log, but write it to a separate table (`engine_project_intake_failures`) so rollback doesn't wipe the failure record.

## Pillar 4 — Intelligence Layer (PASS caveat)
**Finding:** two divergent extraction paths; UI reads a schema the pipeline doesn't write.
- Delete/redirect the older extraction path so only `runIntelligenceExtraction` writes `engine_extracted_signals`.
- Align the Intelligence Layer step UI to read the exact keys the pipeline emits (audit the mismatch first, then fix the reader — not the writer).

## Pillar 5 — Draft Roadmap (PASS caveat)
**Finding:** approved versions safe, but pipeline clobbers live workspace state.
- In the pipeline's post-draft write, skip any workspace step whose `step_states[step].state === 'approved'`.
- Only fields on `draft`/`review` steps get overwritten by re-runs.

## Pillar 6 — Operator Review (PARTIAL → PASS)
**Finding:** operators can approve sacred parts (Point A, Point B, Vision); can't edit what the vision says they should.
- Extend `PROTECTED_APPROVED_FIELDS` (in `engine-agent.functions.ts`) to include `vision`, `point_a`, `point_b` for the `operator` role at review time.
- Add an "Only Tai can approve" guard on those specific review-item sub-fields; operators can comment but not click Approve on them.

## Pillar 7 — Review & Approvals (PARTIAL → PASS)
**Findings:** 5 of 6 gates real, Investment gate is a label only, Version gate leaks to operators.
- Turn the Investment gate into a real check: block publish/version-approve until `engine_projects.investment_confirmed_at` is set (add column + Tai-only setter).
- On the Version gate, filter `listReviewItems` by role: operators see everything except `type = 'version_approval'`; only admin/Tai sees those rows.

## Pillar 8 — Client Portal (PARTIAL → PASS)
**Finding:** one real leak — a `select("*")` ships internal fields to browser.
- Grep `src/lib/portal.functions.ts` and `src/routes/portal.*` for `.select("*")` and replace each with an explicit safe-column projection matching `CLIENT_SAFE_KEYS`.
- Runtime allowlist in `buildClientSafePayload` already exists — extend it to also strip unknown keys from any portal fetcher's result before return (belt + suspenders).

## Pillar 9 — Roadmap Canvas (FAIL → PASS)
**Finding:** Point A never renders. Hardcoded demo copy for every client. Centerpiece shows placeholders.
- In `MapCanvas` / `JourneyCanvas` / `RoadmapOverviewStrip`, remove the `portal-roadmap-demo-fixture` fallback for real portal loads (keep it only behind an explicit `?demo=1` flag).
- Read Point A / Point B / phases / milestones from `client_safe_canvas` returned by `getPortalRoadmapDocs`. If missing, render an empty-state ("Your roadmap is being prepared") — never demo copy.
- Fix the Point A renderer to actually mount when `canvas.pointA` is present (audit the current conditional first).

## Pillar 10 — Client Feedback Loop (PARTIAL → PASS)
**Finding:** decisions/acks close the loop; file uploads and messages don't reach engine.
- On portal file upload (`client_portal_files` insert), add trigger or server-fn hook that writes an `engine_activity` row (`type: 'client_file_uploaded'`) and creates a review item for Tai.
- On portal message send, mirror to `engine_activity` (`type: 'client_message'`) with `related_project_id` — extend the message composer changes already shipped in the prior turn.

## Pillar 11 — Execution Tracker (PARTIAL → PASS)
**Finding:** gating solid; task-to-milestone linkage not enforced; demo data seeds into production.
- Replace the hardcoded `BUILDS` array in `src/routes/engine.execution.tsx` with a live query over `engine_agent_tasks` joined to `engine_milestones` (the P0 backlog item from the QA doc — do it here).
- Add a NOT NULL FK check: `engine_agent_tasks.milestone_id REFERENCES engine_milestones(id)`; migrate existing null rows to a placeholder milestone or archive them.

## Pillar 12 — Intelligence Memory (PARTIAL → PASS)
**Finding:** table exists, taxonomy right; nothing writes automatically, nothing reads at generation time.
- On successful extraction run, auto-insert into `engine_intelligence_memory`: stable patterns (recurring signal categories, repeated phase shapes, common risks).
- In the draft-generation prompt (`engine-agent-prompts.ts`), inject the top-N relevant memory rows for the current client + globally, so the AI actually uses accumulated learning.

---

## Order of execution

1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12 — one at a time. After each pillar: build clean, click the affected screen, mark PASS in `.lovable/engine-qa-audit.md`, move on.

## Out of scope
- No new automated tests (per your call).
- No visual redesigns of any surface — only the data/logic fixes above.
- Pillar 3 already PASS — untouched.
