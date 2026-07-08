# Phase 14 — Conversation Intelligence QA Report
**Overall:** 3 / 4 scenarios green — 2 assertion failures


## event_site — ✅ PASS

- Frame: `project.event_site`
- Phase reached: `contact`
- Confidence: `0.7555555555555555` / threshold `0.7`
- Enough signal: `True`
- Turns completed: 0

| # | field_key | reason | conf before → after | question |
|---|---|---|---|---|

## roadmap — ❌ FAIL

- Frame: `roadmap`
- Phase reached: `contact`
- Confidence: `0.85` / threshold `0.82`
- Enough signal: `True`
- Turns completed: 4

| # | field_key | reason | conf before → after | question |
|---|---|---|---|---|
| 0 | `unbuilt_asset` | top-ranked-required | 0.64 → 0.74 | What does the business already own or have that it has not built on yet. |
| 1 | `unbuilt_asset` | clarify-low-confidence | 0.74 → 0.70 | What does the business already own or have that it has not built on yet. |
| 2 | `unbuilt_asset` | clarify-low-confidence | 0.70 → 0.70 | if you knew the onboarding system and team would work, what does the practice lo |
| 3 | `unbuilt_asset` | clarify-low-confidence | 0.70 → 0.85 | What does the business already own or have that it has not built on yet. |

**Failures:**
- turn 1: confidence fell 0.74 → 0.70
- turn 2: confidence fell 0.74 → 0.70

## crm_automation — ✅ PASS

- Frame: `project.crm`
- Phase reached: `contact`
- Confidence: `0.7914285714285715` / threshold `0.78`
- Enough signal: `True`
- Turns completed: 2

| # | field_key | reason | conf before → after | question |
|---|---|---|---|---|
| 0 | `deadline` | top-ranked-required | 0.60 → 0.77 | When does it need to be live, and what makes that date the date. |
| 1 | `deadline` | clarify-low-confidence | 0.77 → 0.79 | When does it need to be live, and what makes that date the date. |

## internal_tool — ✅ PASS

- Frame: `project.internal_tool`
- Phase reached: `contact`
- Confidence: `0.7885714285714285` / threshold `0.78`
- Enough signal: `True`
- Turns completed: 2

| # | field_key | reason | conf before → after | question |
|---|---|---|---|---|
| 0 | `deadline` | top-ranked-required | 0.59 → 0.71 | When does it need to be live, and what makes that date the date. |
| 1 | `assets` | top-ranked-required | 0.71 → 0.79 | What do you already have. Copy, photos, brand, data, systems. |
