# Hardening Sprint H6.5 — Wire-Up, Governance, and CI

Eight work items, sequenced so each one lands on a green baseline before the next starts. No schema DDL is applied autonomously — any new migration is written to `.orchestrator/PENDING_MIGRATIONS.md` for your approval.

## Sequencing

```text
1. Regen types  →  2. Impact/Risk UI plumbing  →  3. Regression tests
                                    ↓
4. applyApprovedProposal + B12 unblock
                                    ↓
5. Portal activity tracking  →  6. Drift-detection detail view
                                    ↓
7. Portal readiness gate  →  8. CI check
```

---

## 1. Regenerate Supabase types + baseline typecheck

- Regenerate `src/integrations/supabase/types.ts` against the live schema so `impact_summary`, `risk_score`, `severity`, `impact_score`, `urgency_score`, `deadline_at`, `client_risk` appear on the correct rows.
- Run `tsgo` across the repo. Fix any fallout from newly-typed columns (mostly `.select("*")` sites that now return the new fields).
- Deliverable: clean typecheck, committed types file.

## 2. Impact-summary + risk-score UI plumbing

Read/edit/save paths for the two new columns.

- **Proposals (impact_summary):**
  - `ProposalImpactPanel` already renders. Add a Zod schema `impactSummarySchema` in `src/lib/engine-proposal-impact.ts` and validate on write.
  - Server fn `updateProposalImpact({ proposalId, impact_summary })` under `src/lib/engine-ops.functions.ts`, admin-only, writes with `deriveImpactSummary` fallback if fields missing.
  - Editor UI in the proposal detail drawer (chat proposals + approvals queue expanded card).
- **Review items (risk_score inputs):**
  - Trigger recomputes on input change; UI never writes `risk_score` directly.
  - Add a "Risk inputs" editor (severity / impact / urgency / deadline / client_risk) inside the approvals-queue expanded card in `src/routes/engine.approvals.tsx`.
  - Server fn `updateReviewItemRiskInputs(...)` with Zod validation matching DB CHECK constraints.
  - Sort queue by `risk_score DESC, created_at DESC` (matches new index).

## 3. Regression tests for J4 + I11

Vitest specs under `src/lib/__tests__/`:

- `impact-summary-backfill.test.ts` — new proposals default to `{}`; inserted proposals get non-empty summary via server fn; malformed payloads rejected by Zod.
- `risk-score-trigger.test.ts` — inserts with each input combo recompute `risk_score` within expected weighted range; CHECK constraint blocks out-of-range values.
- Both tests read from a scratch project fixture, assert via `supabaseAdmin`, and clean up.

## 4. applyApprovedProposal + unblock B12

- New server fn `applyApprovedProposal({ proposalId })` in `src/lib/engine-ops.functions.ts`:
  - Admin-gated via `hasRoleForEmail`.
  - Wraps writes in a Postgres transaction that first runs `SET LOCAL engine.proposal_apply = 'on'` (via a `SECURITY DEFINER` RPC — see PENDING_MIGRATIONS entry below).
  - Applies the proposal payload to the correct table using the real column map (`engine_milestones.brief_md / acceptance_criteria / developer_prompt / client_safe_md`, `engine_project_implementation_plans.summary / payload`).
- Rewrite the B12 migration in `.orchestrator/PENDING_MIGRATIONS.md`:
  - Correct target columns (per the schema, not the doctrine wording).
  - Trigger checks `current_setting('engine.proposal_apply', true) = 'on'` and blocks direct edits otherwise.
  - Add the `SECURITY DEFINER` helper `public.begin_proposal_apply()` that sets the GUC.
- Mark migration DDL as pending; do not apply.

## 5. End-to-end portal activity tracking

- Extend `client_portal_activity` writes to cover the full lifecycle: `viewed`, `downloaded`, `acknowledged`, `replied`, `follow_up_needed`. Confirm columns exist; if a new enum value or column is required, write it to PENDING_MIGRATIONS.
- Client-side hooks:
  - `useTrackPortalView` on roadmap / milestone / file components (fire on mount, dedupe per session).
  - `download` handler in file card + PDF viewer records `downloaded` with `resource_id`.
  - Ack banner already writes; add `replied` on comment submit and `follow_up_needed` toggle from client + admin.
- Auditable UI: new `PortalActivityLog` component on the client detail page (admin) and a compact "Recent activity" strip on the client's own portal.

## 6. Admin drift-detection detail view

- New route `src/routes/admin.drift-detection.$clusterId.tsx`.
- Data via `getDriftClusterDetail(clusterId)` in `engine-drift-causality.functions.ts` returning cluster, member signals, causality edges, and linked review-item / proposal / version evidence.
- Render:
  - Header with score, severity, first/last-seen.
  - Causality graph (simple SVG DAG using existing utility) with edge weights.
  - Evidence table linking each row to its source (approvals queue, chat proposal, roadmap version).
- Link from cluster rows in `/admin/drift-detection` list.

## 7. Portal governance readiness gate

- New component `PortalReadinessGate` on the portal roadmap top-of-page.
- Reads gate state via new server fn `getPortalReadiness(projectId)` returning:
  - Point A blockers (intake completeness, unresolved clarifications, missing acceptance).
  - Point B blockers (unapproved current version, open critical change events, unconfirmed investment, unacknowledged roadmap).
  - Each blocker: title, plain-English reason, "who can unblock" (client vs Trust Tai admin), CTA link.
- Milestones remain read-only until gate reports `ready`. Approval requires signed-in authorized approver — reuses existing `roadmap_approvals` writer, no new auth surface.

## 8. CI check

- Add `.github/workflows/ci.yml` (or extend existing) running on PR:
  - `bun install --frozen-lockfile`
  - `bun run typecheck` (`tsgo`).
  - Migration validation: `bun run scripts/qa/validate-migrations.ts` — new script that parses every file in `supabase/migrations/`, ensures each `CREATE TABLE public.*` has a `GRANT` and `ENABLE ROW LEVEL SECURITY` in the same file.
  - Playwright smoke on critical admin/portal routes (`/admin/engine-templates`, `/admin/outcome-scheduler`, `/admin/drift-detection`, `/engine/approvals`, `/portal`), reusing existing `playwright.config.ts` with a fresh dev server.
- Fails the PR on any red step.

---

## Technical notes

- **No autonomous DDL.** Items 4, 5, 6 write proposed DDL to `.orchestrator/PENDING_MIGRATIONS.md` for review. Items 1–3, 6–8 are code-only.
- **No AI self-approval.** New `updateProposalImpact` and `applyApprovedProposal` require `hasRoleForEmail(email, "admin")` and are audit-logged in `engine_activity`.
- **RLS.** New reads in the portal (activity log, readiness) go through `requireSupabaseAuth`-scoped server fns; admin reads via existing admin gate.
- **Types regen (step 1) must land first** so subsequent server fns compile against the new column set.

## Out of scope

- Sprints H7–H10 (intake pipeline, captain/roadmap depth, outcome loop, final re-score) — proposed separately after this sprint lands.
- Reworking the existing approvals queue visual layout beyond adding the risk-input editor.
