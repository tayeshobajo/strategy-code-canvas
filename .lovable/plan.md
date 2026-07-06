## Audit results

**1. Operator can final-approve a roadmap version — FIXED.**
`decideReviewItem` (src/lib/engine-ops.functions.ts:233) is gated `assertOps`, but before the version transition it re-checks the caller and throws `"Forbidden: only Tai (admin) can approve a roadmap version."` for item types `roadmap_version`, `Roadmap Update`, `version_approval`, `Version Change`. Operators can still `send_back` / `reject`, matching the "Tai is the final authority" doctrine. No change needed.

**2. `getPortalContext` leaks internal fields — FIXED.**
`portal.functions.ts:453` now uses an explicit projection (`id, project_id, title, version_label, status, approved_at, published_at, acknowledged_at, executive_summary, current_diagnosis, strategic_priorities, sequence_30_60_90, risks_dependencies, recommended_next_move, supporting_notes, client_safe_canvas`). `published_by`, `approved_roadmap_version_id`, and `metadata` are no longer shipped. `supporting_notes` is listed in `CLIENT_SAFE_KEYS` in `roadmap-publish.ts:528`, so its presence is intentional. No change needed.

**3. Roadmap Canvas — NOT FIXED.** Three separate regressions:
- `MapCanvas.tsx:754-756` — Point A card is hardcoded (`"Current State"` / `"Operating today"`). `journey.pointA.label` and `journey.pointA.detail` are computed and passed through the pipeline but never rendered on the canvas.
- `MapCanvas.tsx:770` — Point B detail is truncated at 60 chars with `slice(0, 60) + "…"`.
- `portal.roadmap.tsx:929-936` — `CurrentPhasePill` maps phase index to hardcoded strings `"Phase 1: Foundation"`, `"Phase 2: Core Platform Build"`, `"Phase 3: Scale Systems"`. Every client sees demo phase names. `journey.phases[idx].label` is available and unused.

**4. Pipeline clobbers live workspace state — PARTIALLY FIXED.**
- Approved step columns are preserved (`engine-intelligence.functions.ts:1275-1308`, Pillar 5).
- `status: "draft"` is still forced unconditionally on every run (line 1272). A project in `on_hold`, `blocked`, `paused`, or `execution` gets shoved back to `draft` by any pipeline run.
- Agent permissions/budget are not consulted before running. Specifically, `submitPortalOnboarding` (`portal.functions.ts:1885-1901`) calls `runIntelligencePipelineInternal` on `supabaseAdmin` without ever hitting `assertActionAllowed` — so a project explicitly `blocked` for `run_intelligence_pipeline` still gets an AI run when the client submits onboarding.

## Fix plan

**Roadmap Canvas (item 3)** — three surgical edits:

1. `src/components/portal/roadmap/MapCanvas.tsx` — Point A card:
   - Replace the hardcoded `"Current State"` / `"Operating today"` with `journey.pointA.label || "Current State"` and, when present, `journey.pointA.detail` on a second line (mirror the Point B card so both sides read from the same shape).
2. `src/components/portal/roadmap/MapCanvas.tsx` — Point B card:
   - Drop the 60-char truncation. Use CSS clamping (`max-w-[220px] line-clamp-2 break-words`) so long detail wraps instead of being cut mid-sentence, and no character-based truncation is applied.
3. `src/routes/portal.roadmap.tsx` — `CurrentPhasePill`:
   - Delete the `"Phase 1: Foundation" | "Phase 2: Core Platform Build" | "Phase 3: Scale Systems"` ladder. Derive `phaseName` from `journey.phases[idx]?.label`, falling back to `journey.phases[0]?.label ?? "Current Phase"` when the index isn't found. No project ever sees hardcoded demo copy again.

**Pipeline safety (item 4)** — two additions inside `runIntelligencePipelineInternal` (`src/lib/engine-intelligence.functions.ts`), plus one at the portal caller:

1. Move the forced `status: "draft"` behind a guard: only downgrade to `draft` when the current project status is one of the transitional/reviewable states (`intake`, `source_processing`, `draft`). For terminal or hold states (`on_hold`, `blocked`, `paused`, `execution`, `delivered`, `archived`), leave `status` unchanged — the review item is still enqueued as the review signal.
2. At the top of `runIntelligencePipelineInternal`, look up `engine_agent_permissions` for the project and call `assertActionAllowed(sb, projectId, "run_intelligence_pipeline")`. If it throws, log to `engine_activity` as `pipeline_blocked` and rethrow — so admins re-running it see the block, and the fire-and-forget portal path records a clean skip instead of silently ignoring the guard.
3. In `submitPortalOnboarding` (`src/lib/portal.functions.ts:1885`), catch the `pipeline_blocked` error separately and log an `engine_activity` entry `client_submitted_intake_but_pipeline_blocked` instead of the generic warning, so operators see "the client submitted intake but agent permissions are blocking auto-extraction." No auto-run happens on a blocked project.

## Files touched

- `src/components/portal/roadmap/MapCanvas.tsx` — Point A + Point B card
- `src/routes/portal.roadmap.tsx` — `CurrentPhasePill` phase name
- `src/lib/engine-intelligence.functions.ts` — status guard + `assertActionAllowed` check
- `src/lib/portal.functions.ts` — onboarding pipeline catch

No schema or migration changes.
