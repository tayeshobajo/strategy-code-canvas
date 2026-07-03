/**
 * Deterministic fixture used by the `?__visual=demo` flag on /portal/roadmap
 * so Playwright can snapshot the roadmap canvas without needing a real
 * Supabase session. Kept in sync with the shapes accepted by
 * `buildRoadmapJourney`.
 */

export const DEMO_ROADMAP_RAW = {
  title: "Trust Tai — Growth Operating System",
  version_label: "v1.2 · Approved",
  approved_at: "2026-06-20T12:00:00.000Z",
  current_focus: "Ship the Foundation phase and lock the operating cadence.",
  next_meeting_at: "2026-07-15T15:00:00.000Z",
  executive_summary:
    "Move from a single-founder operator model to a systematized growth engine over the next 90 days. Foundation locks the data + revenue plumbing, Core Platform unifies delivery, and Scale Systems compounds it.",
  recommended_next_move:
    "Approve the roadmap, confirm the operating cadence, and greenlight the Foundation kickoff so the Phase 1 sprint can start next Monday.",
  strategic_priorities: [
    { title: "Lock the revenue foundation", detail: "Stripe + entitlement + billing surface." },
    { title: "Unify the delivery layer", detail: "Portal, roadmap, files, messages." },
    { title: "Build the intelligence loop", detail: "Signals in, decisions out, memory retained." },
  ],
  risks_dependencies: [
    "Timely responses on the Foundation approval keep Phase 2 on schedule.",
    "Owner sign-off on brand voice unblocks all outbound comms.",
    "Third-party integrations (Calendar, Payments) need admin credentials by day 20.",
  ],
  sequence_30_60_90: {
    now: [
      { title: "Approve Roadmap v1", status: "in_progress", kind: "decision", summary: "Sign off on scope and cadence." },
      { title: "Foundation kickoff", status: "upcoming", summary: "Kick off the 30-day Foundation sprint." },
      { title: "Operating cadence locked", status: "upcoming", kind: "milestone", summary: "Weekly review + monthly steering." },
      { title: "Point A diagnosis published", status: "completed", kind: "deliverable", summary: "Baseline current-state report shared." },
    ],
    next: [
      { title: "Portal handoff live", status: "upcoming", kind: "deliverable", summary: "Client portal cutover complete." },
      { title: "Billing surface hardened", status: "upcoming", summary: "Stripe + entitlement flows verified." },
      { title: "Decision: pricing tier structure", status: "upcoming", kind: "decision", summary: "Choose the go-to-market tiering." },
    ],
    later: [
      { title: "Scale ops rollout", status: "upcoming", summary: "Roll the operating system to the next cohort." },
      { title: "Intelligence loop online", status: "upcoming", kind: "milestone", summary: "Signals → decisions → memory in production." },
      { title: "Quarterly review", status: "upcoming", kind: "meeting", meeting_at: "2026-09-30T15:00:00.000Z" },
    ],
  },
};

export const DEMO_PROJECT = {
  point_a: "Founder-led delivery with fragmented tools and no repeatable operating cadence.",
  point_b: "A repeatable growth operating system with clear ownership, cadence, and measurable outcomes.",
};
