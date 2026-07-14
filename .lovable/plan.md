# /engine Command Center → Decision Cockpit

Presentation-only rewrite of `src/routes/engine.index.tsx`. No schema changes, no server-function changes, no new packages. All data already exists in `CommandCenterPayload` returned by `getCommandCenter` — this plan just reshapes what's rendered from it.

## Why

Today's `/engine` reads as a generic analytics dashboard: stat cards, a donut, a stage-flow chart, activity feed. It does not tell Tai the single most important thing to do. Exceptions and metrics sit at the same visual weight, and healthy state is as loud as risk.

## New page structure

```text
┌─────────────────────────────────────────────────────────────────────┐
│ 1. COMMAND STRIP                                                   │
│    "Today's Command Center" · date/time · system status pill ·     │
│    critical alerts count · CTA "Review highest-priority decision"  │
├──────────────────────────────┬──────────────────────────────────────┤
│ 2. REQUIRES DECISION (left)  │ 4. SYSTEM INTELLIGENCE (right rail)  │
│    Ranked queue: approvals,  │    - Next Best Action                │
│    escalations, blocked,     │    - Recent material changes         │
│    cost overruns, failed     │    - Cost/budget warnings            │
│    agent runs, client        │    - Outcome check-ins due           │
│    follow-ups.               │    - Agent failures / retries        │
│    Each row: project/client, │    - Upcoming deadlines              │
│    why it matters, risk,     │                                      │
│    owner, recommended        │                                      │
│    action, CTA.              │                                      │
│                              │                                      │
│ 3. PROJECTS NEEDING          │                                      │
│    ATTENTION (center/below)  │                                      │
│    Exceptions only, grouped: │                                      │
│    At Risk · Blocked ·       │                                      │
│    Needs Review · Waiting on │                                      │
│    Client · Over Budget.     │                                      │
│    Healthy projects hidden.  │                                      │
├──────────────────────────────┴──────────────────────────────────────┤
│ 5. SUPPORTING CONTEXT (demoted, small, muted)                       │
│    Total · Active · Completed · Avg health · stage counts inline    │
└─────────────────────────────────────────────────────────────────────┘
```

## Data mapping (all from existing `CommandCenterPayload`)

- Command strip status/alerts: `metrics.system_health`, `agent_ops.failures_24h`, `metrics.blocked_decisions`, `approval_breakdown.total`.
- Requires Decision queue (ranked): merge + sort by severity from
  `approval_breakdown.items` (impact=high first), `agent_alerts` (severity), projects with `status in (blocked, at_risk)` from `active_projects`, `client_action_counts.decisions_needed`, `agent_ops.failures_24h`. Recommended action pulled from matching entry in `next_best_actions_v2` when project_id matches, else derived from item type.
- Projects Needing Attention groups: filter `active_projects` by status → At Risk, Blocked, Needs Review; Waiting on Client from `client_action_counts` + project rows with pending client responses; Over Budget from `metrics.agent_spend_cents / agent_budget_cents` per project (portfolio-level shown if per-project not available).
- System Intelligence rail: `next_best_actions_v2[0]`, `recent_activity` (top 4, material only — filter out routine kinds), budget warning from `metrics.agent_spend_cents/budget_cents`, `upcoming_deadlines` (top 3), `agent_alerts` (top 2).
- Supporting context strip: `metrics.active_projects`, `stage_breakdown` totals, `health_breakdown` as tiny inline chips (not a donut).

## Removed / demoted

- Big donut "Project Health" chart — replaced by 5 inline health chips in supporting strip.
- "Projects by Stage" tabbed table above the fold — moved to a small collapsible below supporting strip.
- Full "Recent Activity" panel — replaced by "Recent material changes" (top 4) in the right rail.
- "Summary Stats" grid (Client Actions / Agent Ops / Delivery Forecast / System Health cards) — folded into the right rail as compact one-liners.
- Top row of 5 stat cards with sparklines — removed; only kept as small muted counters in the supporting strip.

## Files touched

- `src/routes/engine.index.tsx` — full body rewrite. Local subcomponents kept in the same file: `CommandStrip`, `RequiresDecisionQueue`, `DecisionRow`, `AttentionGroup`, `AttentionProjectRow`, `SystemIntelligenceRail`, `SupportingContext`. Reuse `EngineStatusBadge`, `formatDate`, `formatCents`, `cn`.

No other files change. No server functions change. No new queries.

## Copy rules (locked)

Command language only: "Needs decision", "Blocked by", "Recommended action", "Risk driver", "Owner", "Due", "Escalate", "Review", "Resolve". No generic "Dashboard", "Overview", "Statistics".

## Visual direction

Premium dark operational UI — Linear + Vercel + air-traffic-control. Tight spacing, muted borders (white/8), strong hierarchy. Amber only for warnings, red only for true critical, green only for verified healthy. Everything else neutral. No decorative gradients, no big donuts, no colored stat cards.

## Acceptance

- In 5 seconds Tai sees the single highest-priority decision above the fold with a CTA.
- Exceptions dominate the page; metrics are demoted to a muted strip.
- Every top-level Requires-Decision and Attention row has an explicit recommended action + CTA.
- Healthy projects never appear in Attention groups.
- No chart above the fold.
- Mobile clean at 375px (rail stacks below main columns).

## Out of scope

- Server-function or schema changes.
- Per-project overview page (already redesigned).
- Sidebar / global chrome.
