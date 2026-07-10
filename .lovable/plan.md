## Fix: Signals count + Health/Progress showing 0 on project overview

Display-only fixes in the workspace loader and header. No DB / migration / server-fn business logic changes.

### 1. `src/lib/engine.functions.ts` — `getProjectWorkspace` handler

Add two extra parallel reads after the base project fetch:

- Count extracted signals: `sb.from("engine_extracted_signals").select("id", { count: "exact", head: true }).eq("project_id", data.id)` → `signalCount`.
- Latest roadmap version (for health scoring, if `row.roadmap_version` alone isn't enough — reuse the existing `row.approved_version` / `row.roadmap_version` columns instead of a new query when possible).

Compute derived values before building the `project` object:

- `signal_count = signalCount ?? 0`
- `computed_health_score` — clamp 0–100:
  - signals: `min(40, round(signalCount / 20 * 40))`
  - roadmap draft exists (`row.roadmap_version` truthy): +20
  - Spirit First analysis (heuristic: `row.point_a` or `row.point_b` has non-empty keys): +15
  - approved roadmap (`row.approved_version` truthy): +15
  - delivery checklist (`row.delivery` has non-empty keys): +10
  - If the stored `row.health_score` is already > 0, prefer it (keeps future backend logic authoritative); otherwise use computed.
- `computed_progress_pct` — count workspace steps in `row.step_states` whose `state` is `"review"` or `"approved"` (touched beyond draft would be too loose; use any state != null). Actually use: `stepsTouched = Object.values(step_states).filter(s => s?.state).length`, then `round(stepsTouched / 14 * 100)`. Prefer stored `progress_pct` when > 0.

Populate `project.health_score`, `project.progress_pct`, `project.signal_count` from those.

### 2. `src/lib/engine-workspace.ts`

Add `signal_count: number` to `WorkspaceProject` type.

### 3. `src/components/engine/WorkspaceHeader.tsx`

Change:
```tsx
<Metric label="Signals" value={project.open_decisions.toString()} hint="All sources" tone="blue" />
```
to:
```tsx
<Metric label="Signals" value={project.signal_count.toString()} hint="All sources" tone="blue" />
```

### Out of scope
- No DB schema changes, no migrations.
- No changes to how `engine_projects.health_score` / `progress_pct` are written by other code paths — this is a read-time fallback so pages render meaningful values today.
