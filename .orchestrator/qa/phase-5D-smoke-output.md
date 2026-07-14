# Phase 5D QA Smoke — Report

**Date:** 2026-07-14
**Verdict:** ✅ **QA PASS** (7/7 DB guards green; 3/3 app-layer guards code-verified; 1 known drift item routed to hotfix workstream, not blocking 5D)

Harness: `.orchestrator/qa/phase-5D-smoke.sql` (read-only). Sandbox exec cannot INSERT into `engine_projects` under its role grants, so mutation guards are verified via (a) DB trigger inspection and (b) targeted static code review of the server functions. The DB migration itself already carries an independent 26/26 smoke pass from apply time (see `PENDING_MIGRATIONS.md` Rev 4).

---

## A. DB-layer guards (harness output)

| # | Check | Result |
|---|---|---|
| 1 | Cycle prevention trigger present | PASS (`tg_engine_projects_gate`) |
| 2 | Parent-completion guard (Rev 4) — children must be approved+completed | PASS |
| 3 | Child rollup guard trigger present (frozen parent detach) | PASS |
| 4 | `engine_projects` RLS enabled, ≥2 scoped policies, no `USING(true)` | PASS |
| 5 | `engine_audit_log` RLS + admin-gated insert | PASS |
| 6 | `client_portal_roadmaps` RLS scoped by `client_portal_permissions` + operator | PASS |
| 7 | `engine_projects.parent_project_id` column + FK present | PASS |
| 8 | `client_portal_roadmaps.current_phase` column present | **MISSING (expected)** — routed to separate hotfix workstream (`hotfix-portal-roadmaps-schema`), see PENDING_MIGRATIONS.md. |

Full log: `/tmp/qa-5d.log` (also captured in this repo's CI history if re-run).

## B. App-layer guards (static code review)

Each server fn was audited against the plan's acceptance criteria.

| Guard | Location | Verdict |
|---|---|---|
| Staff-only for family reads/mutations (admin OR operator) | `src/lib/engine-project-family.functions.ts:19-27` (`assertStaff`) — called in `createChildProject`, `reparentProject`, `getProjectFamily`, `listStaffFamilyRoots` | PASS |
| `createChildProject` — frozen parent rejects | `engine-project-family.functions.ts:52-56` (`isFrozenStatus(parent.status)`) | PASS |
| `createChildProject` — cross-client insertion rejected | `engine-project-family.functions.ts:58-61` (`clientId !== parent.client_id`) | PASS |
| `reparentProject` — frozen source/dest rejects | `engine-project-family.functions.ts:154-158, 172-176, 187-191` | PASS |
| `reparentProject` — cross-client reparent rejected | `engine-project-family.functions.ts:192-194` (`newParent.client_id !== proj.client_id`) | PASS |
| `reparentProject` — cycle detection | `engine-project-family.functions.ts:195-197` (`wouldCreateCycle`) | PASS |
| Audit trail — `engine_activity` + `engine_audit_log` written for both create + reparent, both sides of the edge | `engine-project-family.functions.ts:81-128` (create), `214-286` (reparent) — includes actor email, subtree_ids snapshot, `field_changed='parent_project_id'` on reparent | PASS |
| Portal payload — only `approved`/`completed` **AND** having a `client_portal_project_id` are named; the rest collapse to an aggregated count only | `src/lib/portal-family.functions.ts:12` (`PUBLISHED_STATUSES`), `:64-79` (filter + count) | PASS |
| Portal payload — no `internal_status`, staff notes, costs, diagnostics, unpublished children in returned shape | `portal-family.functions.ts:16-26` (`PortalFamilyPayload` explicit allowlist: `id, name, status, completed_at, child_progress`) | PASS |
| Portal access — caller must have a `client_portal_projects` row (RLS-scoped read) before family walk | `portal-family.functions.ts:38-43` | PASS |
| Impact analysis respects Revision 4 DB triggers | `getFamilyImpact` never asserts a `complete` mutation itself — it derives blockers from the same `internal_all_children_*` predicates the triggers enforce (`src/lib/engine-project-impact.functions.ts`). Cross-client leakage impossible because it walks from a `getProjectFamily`-scoped subtree, which is client-bounded by `parent_project_id` chain + RLS. | PASS |

## C. Known open items (not blocking 5D completion)

1. **Route-level auth gate for `/engine/projects/$projectId/family`** — the route file does not sit under `_authenticated/` and does not add its own `beforeLoad` redirect. Consistent with every other `engine.*` route in this codebase (auth is enforced inside each server fn via `assertStaff`), so treating this as "meets the codebase's established pattern." An anonymous visitor sees the route shell then hits an error boundary when the server fns 401 — not a `/auth` redirect. If Tai wants a hard redirect, that's a codebase-wide follow-up, not a 5D-specific defect.
2. **`client_portal_roadmaps.current_phase` drift** — separate hotfix (`hotfix-portal-roadmaps-schema`) queued in `PENDING_MIGRATIONS.md`. Preflight already recorded here in CHECK6 (RLS + scoped policies confirmed), so the grants portion of the hotfix is safe.

## D. Sign-off

Phase 5D (DB + app layer + follow-ups) is complete. `BUILD_STATE.md` updated accordingly.
