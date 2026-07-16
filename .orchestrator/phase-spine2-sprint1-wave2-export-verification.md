# Phase Spine 2 · Sprint 1 · Wave 2 — Export Client Roadmap Verification

Date: 2026-07-16

## Method

Playwright script (`/tmp/browser/spine2/export/run.py`) restored the sandbox
Supabase session, navigated to `/engine/projects/<pid>/spine`, waited for
network idle, then clicked `[data-qa-action="export-roadmap"]` and captured
the resulting download. The saved PDF was parsed with `pypdf` and inspected
against real project data pulled from `engine_projects` /
`engine_milestones`.

## Results

| Project | ID | Download OK | Size | Suggested filename |
|---|---|---|---|---|
| cakepro — intake | `cf21df7b-…c62d0c7ead0` | ✅ | 9,981 B | `spine-cakepro-intake-2026-07-16.pdf` |

Extracted content (page 1):

- Project name, client company, updated timestamp — ✅ present
  (`cakepro — intake`, `Status: Needs Review`, `Updated Jul 15, 2026, 4:26 PM`).
- Next Best Action block with severity chip — ✅ present.
- Point A / Point B statements — ✅ present (Point A "Not yet defined."
  Point B destination rendered from `engine_projects.point_b`).
- Roadmap version + status — ✅ (`Latest version: v0.1 — AI draft from
  Adaptive intake brief`).
- Milestone roll-up — ✅ (`Milestones approved: 0/21` matches the DB:
  `SELECT count(*) FILTER (WHERE approval_status='approved'), count(*)`
  on cakepro returns `0 / 21`). Each milestone is listed with phase and
  `[Draft]` approval-status prefix.

## Finding — CTA label vs. behavior mismatch

The header CTA is labeled **"Export Client Roadmap"** but the handler
bound to it (`onExportPdf={() => exportSpinePdf(spine, historyRows)}`)
generates the **internal spine PDF** (`exportSpinePdf`), not the
client-facing PDF (`exportClientRoadmapPdf` in `src/lib/roadmap-pdf.ts`,
which is still wired to the `/engine/projects/$projectId/preview` route
and to `PresentationMode`).

Observed:
- Filename prefix is `spine-…`, not `<project>-roadmap.pdf`.
- Content includes internal `[Draft]` milestone flags, "Not yet defined."
  Point A text, and NBA severity metadata — none of these are safe for
  client sharing.

Two acceptable remediations, out of scope for this verification pass:
1. Rename the header CTA to "Export Spine PDF" so the label matches the
   handler, or
2. Rebind the header CTA to `exportClientRoadmapPdf(project)` (the
   client-safe variant lives on the `/preview` route today) and keep an
   internal export elsewhere.

## Approvals count accuracy

The spine PDF renders "Milestones approved: N/M" using the same
`approval_status = 'approved'` count the DB reports:

```
SELECT count(*) FILTER (WHERE approval_status='approved') AS approved,
       count(*) AS total
FROM engine_milestones WHERE project_id = 'cf21df7b-…c62d0c7ead0';
-- approved=0, total=21
```

## Formatting

- Helvetica / Times mix per `src/lib/roadmap-pdf.ts` conventions used by
  the spine PDF too.
- Footer + pagination present (`Trust Tai · trusttai.com` on each page,
  `n / N` right-aligned).
- No layout overflow observed at Letter format.

## Screenshots

- `/tmp/browser/spine2/export/cakepro-spine.png` — spine page before
  triggering export.
- `/tmp/browser/spine2/export/cakepro-roadmap.pdf` — generated PDF (kept
  under `/tmp` intentionally; not user-facing artifact).

## Conclusion

Export CTA is functional, produces a valid multi-page PDF populated from
real project data with a correct approvals count. The single defect is
the label/handler mismatch: the button labeled "Export Client Roadmap"
currently outputs the internal spine PDF, which contains draft/internal
content. Recommend renaming the button or rebinding the handler in a
follow-up before this reaches operators who expect a client-safe file.
