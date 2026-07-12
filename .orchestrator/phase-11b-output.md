# Phase 11B Output — Exception-Based Management

**Status:** COMPLETE  
**Completed:** 2026-07-12 07:49 CDT  
**Commit SHA:** 21d242fb503c21a2ac513b75336bbf681704a4d1  
**Migrations required:** None

---

## What was built

### Server function: `src/lib/engine-exception-management.functions.ts`

`getExceptionBoard()` — cross-project exception feed for operators.

**Exception categories (in severity order):**

| Priority | Kind | Severity | Trigger |
|---|---|---|---|
| 1 | `project_stalled` | critical | No activity >7 days |
| 2 | `packets_rejected` | critical | Any non-archived packet in `rejected` status |
| 3 | `open_decisions` | high | `open_decisions > 0` on project |
| 4 | `evidence_gap` | high | Pending milestones with no processed sources |
| 5 | `qa_stuck` | high | Packets in `qa_required` state >3 days |
| 6 | `low_health_score` | medium | `health_score <= 40` |
| 7 | `ack_overdue` | medium | Approved roadmap >2d ago with no post-ack step |
| 8 | `packets_idle` | low | Draft/in-progress packets >5 days no update |

**Algorithm:**
- Loads all active (non-completed, non-archived) projects
- Batched queries: projects → packets → milestones → sources (4 queries total)
- Evaluates 8 exception categories per project
- Sorts: severity desc, then daysSince desc (worst first)
- Returns structured `ExceptionBoard` with exceptions flat + grouped by project
- Excludes completed/archived projects from tracking entirely

**Response shape:**
```ts
ExceptionBoard {
  exceptions: ProjectException[]         // flat sorted list
  affectedProjectCount: number
  criticalCount / highCount / mediumCount / lowCount: number
  byProject: Array<{ projectId, projectName, exceptions, worstSeverity }>
  totalProjects: number
  clearProjectCount: number
  generatedAt: string
}
```

### Route: `src/routes/admin.exception-management.tsx`

Full-featured admin page at `/admin/exception-management`:

- **Stats strip:** Active projects scanned / Needing attention / Critical / Clear
- **Severity badge strip:** Shows critical/high/medium/low counts when non-zero
- **All-clear state:** Green "All projects on track" message when no exceptions
- **View toggle:** "By project" (default) vs "By exception type"
  - By project: collapsible project groups, each showing all exceptions, sorted by worst severity
  - By exception: sections per severity level with project name labels inline
- **ExceptionRow:** icon, severity badge, kind label, title, detail text, action CTA link
- **Operator principle callout:** "Silence is signal. A blank board means the platform is working."

### Nav: `src/routes/admin.tsx`

- Added `Zap` icon import from lucide-react
- Added `exception-management` nav entry at **position 1** (top of nav — this is the daily driver)
- Route: `/admin/exception-management` / Label: `Exception board`

---

## Design decisions

1. **Top of nav:** Exception board is the operator's daily driver. It goes first, above everything else.
2. **Completed/archived projects excluded:** No exceptions for projects the operator has already shipped. Only active work surfaces.
3. **4 batched queries:** Same pattern as delivery gate / evidence enforcement — no N+1 queries regardless of project count.
4. **No mutations:** This page is purely observational. The operator follows the CTA links to act. The board never modifies state.
5. **ack_overdue heuristic:** Uses `current_step` substring check to avoid false positives on projects that have already moved past the acknowledgment phase.
6. **Stale time 60s:** Board refreshes on window focus but doesn't hammer the DB on every render.

---

## Next phase

**11C — Drift Detection:** Compare project state to approved Spine continuously.
