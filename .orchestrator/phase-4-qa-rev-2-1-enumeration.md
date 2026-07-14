# Phase 4 QA Fixes — Rev 2.1 / 2.2 Enumeration

**Date:** 2026-07-14
**Predicate run:** Rev 2.2 patched (ceremony status `IN ('in_progress','completed')`), and Rev 2.1 delta.

## Result — clean under patched predicate

| Category | Count |
|---|---:|
| Total `approved_truth` rows | 15 |
| Non-human actor | 0 |
| No ceremony AND no `operator_override` | 0 |
| Ceremony present but no matching decision / wrong status | 0 |
| `operator_override` with invalid email/reason | 0 |

## Rev 2.1 vs Rev 2.2 delta

| Check | Count |
|---|---:|
| Rows referencing an `in_progress` ceremony (would deadlock under Rev 2.1) | 0 |

## Ceremony status distribution

| status | count |
|---|---:|
| completed | 2 |
| in_progress | 1 |

## Verdict

- **No remediation required.** All 15 legacy `approved_truth` rows satisfy the Rev 2.2 predicate.
- **Deadlock risk was real** — the ceremony lifecycle uses `in_progress` — but no legacy rows currently exhibit it. Rev 2.1 would still deadlock the *runtime* write path in Phase 2 `recordCeremonyDecision()`. Rev 2.2 fixes that.
- **Do not apply yet.** Re-review Rev 2.2 (patched below), then apply G1 + G1a + G1b + G1c + G2 + G3 together.
