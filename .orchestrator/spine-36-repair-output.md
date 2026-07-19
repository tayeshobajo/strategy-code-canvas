# Spine 36% Repair Output

## Summary

Fixed the issue where clicking **Run AI PM now** reported success while the cakepro Project Spine stayed at 36%.

## Root Cause

The RT-1 orchestrator only ran the legacy fill for steps that were directly runnable. Several readiness-support steps were marked blocked by doctrine gates, so the support backfill never wrote:

- ancillary truth rows
- milestone due dates
- approved roadmap phase rationale
- normalized investment phase ranges

The plan reader also treated milestone dates and phase rationale as always missing, so later runs could falsely report those steps as unresolved.

## Changes Made

- Updated `src/lib/roadmap-synthesis/orchestrator.server.ts` so repair/refresh runs perform a non-destructive support backfill for readiness artifacts even when human-gated ceremony steps remain blocked.
- Updated `src/lib/roadmap-synthesis/runners/legacy-fill.server.ts` to call the shared ancillary seeder directly with the orchestrator's authenticated backend context instead of trying to invoke the server function wrapper in-process.
- Updated `src/lib/roadmap-synthesis/plan.server.ts` so the synthesis plan recognizes existing truth rows, milestones, due dates, and phase rationale as satisfied.
- Repaired cakepro data by writing reviewable assumed support truth rows, phase rationales, milestone due dates, and investment phase-range shape.

## Verification

Database readiness reconstruction now returns **13/14** checks passing for cakepro.

The only remaining failing check is `client_acknowledged_destination`, which is intentionally human-gated and should not be auto-completed by the AI PM.