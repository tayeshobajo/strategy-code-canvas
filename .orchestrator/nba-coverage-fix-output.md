# NBA Build & QA Coverage Fix — Output Summary

**Date:** 2026-07-10  
**Task:** Extend `compute_engine_next_best_action` to cover Build Execution, OpenClaw runs, and QA Evidence  
**Migration file created:** `supabase/migrations/20260710100000_nba_build_qa_coverage.sql`

---

## What Was Done

Created a **new migration file** (`20260710100000_nba_build_qa_coverage.sql`) containing a full `CREATE OR REPLACE FUNCTION public.compute_engine_next_best_action(...)`.

All existing branches from `20260708213524_9ab40452-11f0-4548-b404-9bdbb1693fa8.sql` were copied verbatim. Four new branches were inserted **after the review-items branch** and **before the version-status branches**, in the following priority order:

---

## New Branches Added

### Branch A — Build Packets Needing Attention
**Table:** `engine_project_build_packets`  
**Logic:**
- Counts packets with `status IN ('rejected', 'returned')` → `failed_packets`
- Counts packets with `status IN ('in_progress', 'handed_off')` → `active_packets`

**Actions surfaced:**
| Condition | Action | Severity |
|---|---|---|
| `failed_packets > 0` | "Retry failed build packet" | `critical` |
| `active_packets > 0` | "Build in progress" | `info` |

**Note:** `rejected` and `returned` were used (not `failed` — which is not a valid build packet status per schema CHECK constraint). The valid statuses are: `draft`, `ready`, `handed_off`, `in_progress`, `returned`, `qa_required`, `accepted`, `rejected`, `archived`.

---

### Branch B — OpenClaw Runs
**Table:** `engine_project_openclaw_runs` joined to `engine_project_build_packets`  
**Join:** `ocr.build_packet_id = bp.id WHERE bp.project_id = _project_id`  
**Valid run statuses (per schema):** `queued`, `sent`, `running`, `completed`, `failed`, `cancelled`, `timed_out`, `returned_for_review`

**Actions surfaced:**
| Condition | Action | Severity |
|---|---|---|
| `failed_oc_runs > 0` | "Review failed OpenClaw run" | `critical` |
| `running_oc_runs > 0` | "OpenClaw build in progress" | `info` |

---

### Branch C — QA Evidence Pending
**Table:** `engine_project_qa_evidence_reviews`  
**Logic:**
- `pending_qa`: rows with `status IN ('draft', 'in_review')`
- `critical_qa`: rows with `verdict IN ('insufficient', 'needs_owner_decision')` AND not in terminal status (`approved`, `archived`, `rejected`)

Critical findings checked first (higher priority than generic pending).

**Actions surfaced:**
| Condition | Action | Severity |
|---|---|---|
| `critical_qa > 0` | "Address critical QA findings before delivery" | `critical` |
| `pending_qa > 0` | "Review QA evidence" | `warning` |

---

### Branch D — Delivery Readiness
**Tables:** `engine_project_build_packets`, `engine_projects.delivery JSONB`  
**Logic:**
- Only fires if `total_packets > 0` (project is in build phase) AND `accepted_packets > 0`
- Checks `delivery->>'sent_at' IS NULL` (no delivery sent yet)

**Action surfaced:**
| Condition | Action | Severity |
|---|---|---|
| Accepted packets exist, no delivery sent | "Prepare delivery package" | `warning` |

---

## Existing Branches Preserved

All original branches preserved and unchanged:
1. Failed/stalled extraction run → `critical`
2. Blocked tasks → `warning`
3. Unanswered client messages → `warning`
4. Pending review items → `warning`
5. Approved version not published → `warning`
6. AI-drafted version pending review → `warning`
7. Failed intake sources → `critical`
8. Pending extraction sources → `info`
9. No signals yet → `info`
10. Investment not confirmed → `info`
11. Nothing waiting (fallback) → `info`

---

## Files Created / Modified

| File | Action |
|---|---|
| `supabase/migrations/20260710100000_nba_build_qa_coverage.sql` | **Created** |
| `.orchestrator/nba-coverage-fix-output.md` | **Created** |

No existing migration files, source files, or test files were modified.

---

## Schema Notes

- `engine_project_build_packets.status` CHECK constraint: `('draft','ready','handed_off','in_progress','returned','qa_required','accepted','rejected','archived')` — no `failed` or `queued` status exists at packet level; those belong to OpenClaw run level.
- `engine_project_openclaw_runs.status` CHECK constraint: `('queued','sent','running','completed','failed','cancelled','timed_out','returned_for_review')`
- `engine_project_qa_evidence_reviews.verdict` CHECK constraint: `('pending','evidence_sufficient','needs_more_evidence','needs_owner_decision','insufficient')`
- `engine_project_openclaw_runs` does NOT have a direct `project_id` column — it references `build_packet_id` which has `project_id`. The NBA SQL joins through the packets table accordingly.
