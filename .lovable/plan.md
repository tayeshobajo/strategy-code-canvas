## Scope

Wire real data into the three Spine cards that still render placeholders (`—`, hardcoded strings, or derived stand-ins) even when the underlying data exists in the database.

## Fields to fill

| Location | Field | Currently | Fix — source |
|---|---|---|---|
| Snapshot | Health | Label derived from `status` + blocked count | Real numeric `engine_projects.health_score` → show `82 · On Track` with tone bucket (≥80 On Track green, 60–79 Watch amber, <60 At Risk red). Fall back to derived value only when `health_score` is 0/null. |
| Snapshot | Project Owner | Uses `client_company` (the company name) | Use `engine_clients.owner_email`; fall back to `client_company` when missing. |
| Footer | Intelligence Confidence | Ratio `processed / total sources` | Average `confidence` across `engine_extraction_facts` rows for this project; fall back to `—` when no facts exist. |
| Footer | Sources Processed | `processed` count only | Show `{processed} of {total}` for parity with the Snapshot semantics. |

Everything else on the page already reads from live payload (NBA, milestones, approvals, activity, audit, modules, version). Not changing Captain Brief copy fallbacks or the "Auto-saved · Just now" indicator in this pass.

## Backend — `src/lib/engine.functions.ts` (`getProjectSpine`)

- Extend `ProjectSpinePayload.project` with `health_score: number` and `client_owner_email: string | null`.
- Add `ProjectSpinePayload.intelligence: { confidence: number | null; facts_count: number }`.
- Update the `engine_projects` select to include `health_score` and `engine_clients(company,owner_email)`.
- After the existing sources query, run one additional select on `engine_extraction_facts` (fields `confidence`) for `project_id = data.id`. Compute `avg = round(mean * 100)` (facts stored 0–1) or `round(mean)` if already 0–100 — detect by max value. Return null when zero rows.
- Populate the new project fields from `projRow`.

No schema migration. No changes to other consumers of `ProjectSpinePayload` — new fields are additive.

## Frontend — `src/routes/engine.projects.$projectId.spine.tsx`

- `ProjectSnapshotCard`:
  - Accept `healthScore: number` prop; replace `deriveHealth` call to use numeric bucket helper `healthFromScore(score, fallbackStatus, blockedItems)`.
  - Render Health as `{score} · {label}` with the same colored dot.
  - Accept `ownerEmail: string | null`; render Project Owner as `ownerEmail ?? client_company ?? "—"`.
- `FooterStatsBar`:
  - Accept `intelligenceConfidence: number | null` and `sourcesTotal` (already has both count fields); render Confidence as `{n}%` or `—`.
  - Render Sources Processed as `{processed} of {total}`.
- Update the `SpinePage` component to pass `spine.project.health_score`, `spine.project.client_owner_email`, and `spine.intelligence.confidence` into the two cards.

## Verify

- `tsgo` clean.
- Load `/engine/projects/{id}/spine` on a project with facts and an owner email; confirm Health shows a real number, Project Owner shows the email, Confidence shows a percentage.
- On a project with no facts and no owner email, confirm fallbacks (`derived label` for Health, `client_company` for Owner, `—` for Confidence).

## Out of scope

- Adding a real `target_date` column (no schema change).
- Captain Brief content rewiring.
- Truth card per-side source counts.
- Any migrations.
