## Fix: progress_pct still 0 when pipeline auto-produces artifacts

Read-only computation change in `src/lib/engine.functions.ts` (`getProjectWorkspace` handler), around lines 684-688. No DB, migration, or business-logic changes.

### Change

Replace the "count only touched step_states" fallback with an artifact-aware count over all 14 workspace steps. A step is counted as active when either:

- `step_states[stepKey]?.state` is set (draft/review/approved), OR
- The corresponding project artifact has data.

Artifact map (using existing row columns already in the select):

| Step # | Key            | Artifact "has activity" when                                             |
|--------|----------------|--------------------------------------------------------------------------|
| 1      | intelligence   | `signal_count > 0`                                                       |
| 2      | signal-room    | `signal_count > 0` (or `hasKeys(row.signal_room)`)                        |
| 3      | extraction     | `signal_count > 0` (or `hasKeys(row.extraction)`)                         |
| 4      | point-a        | `hasKeys(row.point_a)`                                                   |
| 5      | point-b        | `hasKeys(row.point_b)`                                                   |
| 6      | hidden-assets  | `hasKeys(row.hidden_assets)`                                             |
| 7      | gap-map        | `hasKeys(row.gap_map)`                                                   |
| 8      | blueprint      | `hasKeys(row.blueprint)`                                                 |
| 9      | builder        | `!!row.roadmap_version` or `hasKeys(row.roadmap)`                        |
| 10     | sequencing     | `hasKeys(row.sequencing)` or `!!row.approved_version`                    |
| 11     | deadlines      | `hasKeys(row.deadlines)` or `!!row.approved_version`                     |
| 12     | investment     | `hasKeys(row.investment)` or `!!row.approved_version`                    |
| 13     | preview        | `hasKeys(row.client_preview)` or `!!row.approved_version`                |
| 14     | delivery       | `hasKeys(row.delivery)`                                                  |

Then:

```ts
const stepsActive = WORKSPACE_STEPS.filter(({ key }) => {
  if (step_states[key]?.state) return true;
  return artifactHasData(key);
}).length;
const computedProgress = Math.round((stepsActive / 14) * 100);
const progress_pct = storedProgress > 0 ? storedProgress : computedProgress;
```

`WORKSPACE_STEPS` is already exported from `@/lib/engine-workspace` (imported elsewhere in the file — reuse the import).

### Out of scope

- No changes to how `engine_projects.progress_pct` is written elsewhere.
- No schema, migration, or server-fn business logic changes.
- Health score fallback stays as-is (already working).
