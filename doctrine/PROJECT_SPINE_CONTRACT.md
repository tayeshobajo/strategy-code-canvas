# PROJECT SPINE CONTRACT

> Frozen product frame for the Roadmap Engine. Every later phase of the Spine 2.0
> build references this document. Change here first, code second.
>
> Version: 1.0 (2026-07-16)
> Status: **APPROVED — frozen**
> Owner: Tai + Captain

---

## 0. Three representations of one project

```
Engine Rooms        →   Project Spine        →   Client Roadmap
(how it thinks)         (how it operates)         (how it communicates)
```

- **Engine Rooms**: raw sources, extraction, drafts, reasoning, contradictions.
  Internal only.
- **Project Spine**: the concise, protected, approved operating truth for the
  team. This document defines it.
- **Client Roadmap**: a client-safe projection of approved Spine data.

Subsystems produce **drafts**. Only **approved** values populate Spine cards.
The Spine does not automatically mirror every AI draft.

---

## 1. Canonical Spine sections

The Project Spine page (`/engine/projects/:id/spine`) renders exactly these
sections, in this order. No other section may be added without amending this
contract.

1. **Header strip** — client logo, project name, status/health, phase, version,
   persistent actions (Ask Captain, Approvals(n), Export Client Roadmap,
   Project Actions).
2. **Next Best Action** — one action, one owner, one due, one reason,
   one CTA.
3. **Point A — Current Reality** and **Point B — Desired Future** — twin
   truth cards, side by side.
4. **Foundation strip** — 2×3 grid, in this fixed order:
   - Business Context
   - Constraints & Risks
   - Assets & Leverage
   - Approved Scope
   - Success Measures
   - Decisions Pending
5. **Business Roadmap** — horizontal strip `Point A → Phase 1 … Phase N → Point B`
   with current-phase marker and `Open Full Roadmap` link.
6. **Milestone Readiness** — table with the exact columns defined in §6.
7. **Approvals & Blockers** + **Captain Brief** — side by side.
8. **Collapsed Detail** — accordions: Decisions & Version History, Sources &
   Evidence, Recent Activity.

Sections 1–8 are the **only** default surfaces. Everything else lives behind
`Project Actions → Sources & Intelligence` or a milestone workspace.

---

## 2. Field record shape

Every material Spine field carries this envelope. This is the shape the read
model returns and the shape UI cards consume.

```ts
type SpineFieldRecord<T> = {
  value: T | null;                    // the approved value, null if not yet approved
  summary: string | null;             // short human-readable summary for the card
  status: SpineFieldStatus;           // see §3
  source_refs: string[];              // engine_evidence / engine_source ids
  source_count: number;               // convenience for cards
  confidence: number | null;          // 0..100, null if not scored
  version: number;                    // monotonically increases on approved change
  updated_by: string | null;          // actor id/email of last change (any status)
  updated_at: string | null;          // ISO timestamp of last change
  approved_by: string | null;         // actor id/email of last approval; null if unapproved
  approved_at: string | null;         // ISO timestamp of last approval
  change_reason: string | null;       // required on every version bump
  deep_link: string;                  // route into the source room for this field
};
```

Cards render the `summary` + status chip + source count + approved-by/at.
Never render the raw `value` if `status !== "approved_truth"` without a
visible warning.

---

## 3. State machine

```
draft
  ↓ (subsystem produces a candidate)
inferred
  ↓ (Captain proposes)
needs_confirmation
  ↓ (human review)
  ├→ contradictory            (evidence conflicts; must resolve before advancing)
  ├→ accepted_assumption      (explicitly accepted without full verification)
  ├→ verified                 (backed by sufficient evidence)
  └→ approved_truth           (final; feeds Spine cards and downstream systems)
       ↓ (change proposed)
     superseded               (kept for history; a new approved_truth replaces it)
```

`SpineFieldStatus = "draft" | "inferred" | "needs_confirmation" | "contradictory" | "accepted_assumption" | "verified" | "approved_truth" | "superseded"`.

- Only `approved_truth` (and, when explicitly whitelisted per §5,
  `accepted_assumption`) may cross into the Client Roadmap.
- `contradictory` blocks the Spine Readiness gate.
- The AI cannot transition its own field from `needs_confirmation` to
  `approved_truth` (Phase 9C rule, enforced at DB layer separately).

---

## 4. Spine Readiness gate

`spine_readiness.ready === true` iff **all 14** of the following hold. Each is
expressed as a boolean over the read model.

| # | Check id                       | Rule |
|---|--------------------------------|------|
| 1 | `point_a_approved`             | `foundation.point_a.status === "approved_truth"` |
| 2 | `point_b_approved`             | `foundation.point_b.status === "approved_truth"` |
| 3 | `no_material_contradictions`   | no field on the Spine has `status === "contradictory"` |
| 4 | `assumptions_named`            | every `accepted_assumption` field has a non-empty `change_reason` |
| 5 | `constraints_risks_named`      | `foundation.constraints_risks.status ∈ {approved_truth, accepted_assumption}` and `summary` non-empty |
| 6 | `hidden_assets_reviewed`       | `hidden_assets.status !== "draft"` and `updated_at` exists |
| 7 | `gaps_classified`              | `gaps.status ∈ {approved_truth, accepted_assumption}` |
| 8 | `blueprint_reflects_solution`  | `blueprint.status === "approved_truth"` |
| 9 | `roadmap_phases_approved`      | latest roadmap version has `approved_at` and every phase has a `rationale` |
| 10| `sequencing_valid`             | `sequencing.status === "approved_truth"` and no unresolved dependency cycles |
| 11| `critical_dates_captured`      | `deadlines.status !== "draft"` and every milestone in scope has a `due` |
| 12| `success_metrics_measurable`   | `foundation.success_measures.value` is a non-empty array of measurable metrics |
| 13| `investment_present_or_deferred` | `investment.status === "approved_truth"` OR (`status === "accepted_assumption"` AND `updated_by` set as deferral owner) |
| 14| `client_acknowledged`          | Point B has a client acknowledgment row scoped to the current approved roadmap version (see Phase 6C) |

The gate confirms **no important uncertainty is hiding** — not that every
unknown is gone. Once green, the platform unlocks detailed milestone
planning.

---

## 5. Client-safe field whitelist

Only fields on this list may cross into the Client Roadmap Studio's rendered
output. Everything else stays internal.

**Included (client-safe when `status ∈ {approved_truth, accepted_assumption}`):**

- `project.name`, `project.client_company`, `project.client_logo`
- `point_a.summary` (client-approved variant if distinct from internal)
- `point_b.summary`, `point_b.success_metrics`
- `foundation.business_context.summary`
- `foundation.approved_scope.summary`
- `foundation.success_measures.value`
- `foundation.assets.summary` (only client-facing assets)
- `roadmap.phases[].name`, `.outcome`, `.rationale_public`, `.duration_range`
- `milestone.name`, `.outcome`, `.due`, `.status_public`, `.mockup_preview`
- `investment.public_ranges` (per-phase ranges only; never internal cost)
- `decisions.public[]` (only decisions flagged `visibility = "client"`)

**Never client-safe (internal only):**

- Raw sources, extraction runs, model reasoning, confidence scores,
  contradictions.
- Internal costs, margins, agent assignments, packet contents.
- Constraints & risks (unless individually flagged `visibility = "client"`).
- Any field with `status ∈ {draft, inferred, needs_confirmation, contradictory, superseded}`.
- `updated_by` / `approved_by` actor identities.

The studio enforces this list; the renderer refuses to draw a non-whitelisted
field.

---

## 6. Milestone Readiness row schema

Each row in the Milestone Readiness matrix has this shape:

```ts
type MilestoneReadinessRow = {
  milestone_id: string;
  name: string;
  criteria: GateState;          // Approved | Draft | Missing | N/A
  mockups:  GateState;          // Approved | Review | Draft | Missing | N/A
  build:    GateState;          // Complete | In Progress | Blocked | Not Ready | Locked | N/A
  qa:       GateState;          // Passed | In Progress | Failed | — | N/A
  due:      string | null;      // ISO date; null → shown as "—"
  deep_link: string;            // route to /milestones/:id (its workspace)
  conditional_tabs: {
    mockups: boolean;           // false hides the Mockups tab and forces N/A in this column
    build:   boolean;
    qa:      boolean;
  };
};

type GateState =
  | "approved" | "draft" | "missing" | "review"
  | "complete" | "in_progress" | "blocked" | "not_ready" | "locked"
  | "passed" | "failed"
  | "na" | "unknown";
```

Rules:

- Row click routes to the milestone's own workspace (`deep_link`).
- A gate cell renders `N/A` when its `conditional_tabs.<gate>` is false — the
  milestone type doesn't require that gate (e.g. analytics setup → no mockups).
- No gate may show `Approved`/`Complete`/`Passed` before its predecessors:
  Criteria → Mockups (if applicable) → Build → QA. UI enforces ordering; DB
  should back it up in a later phase.

Milestone type → minimum-sufficient gate path:

| Type            | Path |
|-----------------|------|
| Website         | Brief → Criteria → Mockups → Build → QA → Delivery |
| Analytics setup | Brief → Criteria → Implementation → Evidence → QA |
| Brand strategy  | Brief → Criteria → Strategy artifact → Human approval |
| CRM integration | Brief → Criteria → Architecture → Build → Integration QA |

Captain selects the minimum sufficient path when the milestone is created; a
human can override.

---

## 7. Doctrine rule — drafts vs approved

**Every** subsystem in the engine follows the same lifecycle:

```
Subsystem creates a draft
   → Captain recommends a conclusion
   → Human reviews
   → Approved conclusion promoted into the Spine (bumps version, writes provenance)
   → Downstream systems consume the approved value
```

Consequences:

- Spine cards are **read-only projections** of approved records. They never
  render an unapproved AI draft as if it were truth.
- Downstream systems (milestone workspaces, client roadmap studio,
  portal publishing, delivery gates) read the Spine, never the subsystems
  directly.
- A subsystem that lacks an approval ceremony is not allowed to feed the
  Spine. Add the ceremony first.
- Provenance is non-negotiable. Every field on the Spine must be able to
  answer: what changed, when, by whom, approved by whom, on what evidence,
  and why.

---

## 8. Amendment procedure

This contract is frozen. To change it:

1. Propose the change in a `.orchestrator/spine-contract-amendment-<id>.md`
   file with rationale and impact on the 14-check readiness gate.
2. Tai approves in writing.
3. Bump this file's version, update the section, update dependent phases in
   `.lovable/plan.md`.

No code change may violate this contract. If code needs to violate it, amend
the contract first.
