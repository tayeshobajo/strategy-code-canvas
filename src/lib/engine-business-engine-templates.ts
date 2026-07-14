/* eslint-disable @typescript-eslint/no-explicit-any */
// Phase H3 — Business Engine templates (closes M3–M6)
//
// Four canonical operating engines every services business runs on:
// Content Authority, Lead Follow-Up, Review & Reputation, Client Success.
//
// Templates are defined in code (not DB rows) because they are static,
// versioned with the app, and cloning must produce a real project-scoped
// engine_business_engines row anyway. This avoids the schema change that
// would be needed to store templates without a project_id.

export type EngineTemplate = {
  id:
    | "content_authority"
    | "lead_followup"
    | "review_reputation"
    | "client_success";
  // Maps directly to business_engine_kind enum values in the DB.
  kind:
    | "content_authority"
    | "lead_followup"
    | "review_reputation"
    | "client_success";
  name: string;
  outcome: string;
  cadence: "daily" | "weekly" | "biweekly" | "monthly" | "quarterly" | "ad_hoc";
  cronExpression: string | null;
  workflow: Array<{
    index: number;
    label: string;
    description: string;
    requires_approval?: boolean;
    owner_role?: string;
  }>;
  triggers: Record<string, unknown>;
  approvalRules: Record<string, unknown>;
  metrics: Array<{
    key: string;
    label: string;
    target?: string;
    unit?: string;
  }>;
  exceptionRules: Array<{
    key: string;
    condition: string;
    action: string;
    severity: "low" | "medium" | "high";
  }>;
  summary: string;
};

export const ENGINE_TEMPLATES: EngineTemplate[] = [
  {
    id: "content_authority",
    kind: "content_authority",
    name: "Content Authority Engine",
    outcome:
      "Publish one authority piece per week that earns trust, ranks, and can be repurposed across channels.",
    cadence: "weekly",
    cronExpression: "0 14 * * 1", // Mondays 14:00 UTC
    summary:
      "Weekly authority publishing loop: research → outline → draft → review → publish → repurpose.",
    workflow: [
      {
        index: 0,
        label: "Pick topic from backlog",
        description:
          "Choose one topic aligned to the current strategic theme. Confirm target audience + primary keyword.",
        owner_role: "content_lead",
      },
      {
        index: 1,
        label: "Draft outline",
        description:
          "Structured outline with claim, evidence, and unique angle. Blocks empty listicles.",
        owner_role: "writer",
      },
      {
        index: 2,
        label: "Write first draft",
        description: "Full draft to spec. Cites sources.",
        owner_role: "writer",
      },
      {
        index: 3,
        label: "Editorial review",
        description:
          "Editor checks claims, structure, and voice. Separate person from the writer.",
        requires_approval: true,
        owner_role: "editor",
      },
      {
        index: 4,
        label: "Publish",
        description:
          "Publish to owned channels. Set canonical URL, meta, and structured data.",
        owner_role: "content_lead",
      },
      {
        index: 5,
        label: "Repurpose",
        description:
          "At minimum: 1 LinkedIn post, 1 email snippet, 1 short-form video hook.",
        owner_role: "content_lead",
      },
    ],
    triggers: {
      time: "weekly:monday:14:00Z",
      manual: true,
    },
    approvalRules: {
      requires_separate_approver: true,
      approver_role: "editor",
      blocks_publish_without_approval: true,
    },
    metrics: [
      { key: "pieces_published", label: "Pieces published", target: "1/week", unit: "count" },
      { key: "avg_time_to_publish_days", label: "Cycle time", target: "≤ 7", unit: "days" },
      { key: "organic_impressions_30d", label: "Organic impressions (30d)", unit: "count" },
    ],
    exceptionRules: [
      {
        key: "no_publish_within_cadence",
        condition: "No published piece in the last 10 days",
        action: "Emit engine_business_engine_exceptions row + review item",
        severity: "high",
      },
      {
        key: "editorial_review_skipped",
        condition: "Publish step completed without editorial review step",
        action: "Block + flag for governance review",
        severity: "high",
      },
    ],
  },
  {
    id: "lead_followup",
    kind: "lead_followup",
    name: "Lead Follow-Up Engine",
    outcome:
      "No qualified lead goes cold. Every inbound gets a first response within 60 minutes and a structured 24h / 72h / 7d cadence.",
    cadence: "daily",
    cronExpression: "*/15 * * * *", // every 15 min
    summary:
      "Event-triggered follow-up cadence with escalation. Blocks silent drop-offs.",
    workflow: [
      {
        index: 0,
        label: "Lead ingested",
        description:
          "New inbound routed to owner within 15 minutes of arrival.",
        owner_role: "sales_ops",
      },
      {
        index: 1,
        label: "T+0 first response",
        description:
          "Personalized reply within 60 minutes of ingest. Not a boilerplate autoresponder.",
        owner_role: "account_exec",
      },
      {
        index: 2,
        label: "T+24h nudge",
        description:
          "Second touch if no reply. Adds value (case study, calendar link).",
        owner_role: "account_exec",
      },
      {
        index: 3,
        label: "T+72h escalation",
        description:
          "Third touch escalated to a different owner or channel (LinkedIn, phone).",
        owner_role: "sales_lead",
      },
      {
        index: 4,
        label: "T+7d final",
        description:
          "Final structured close-loop message. Move to nurture or archive.",
        owner_role: "account_exec",
      },
      {
        index: 5,
        label: "Disposition",
        description:
          "Mark outcome: qualified / disqualified / nurture / no-response. Feeds learning loop.",
        requires_approval: true,
        owner_role: "sales_lead",
      },
    ],
    triggers: {
      event: "new_lead_created",
      time_offsets_hours: [0, 24, 72, 168],
      escalation_after_hours: 72,
    },
    approvalRules: {
      requires_separate_approver: false,
      disposition_requires_lead_review: true,
    },
    metrics: [
      { key: "median_first_response_minutes", label: "Median first response", target: "≤ 60", unit: "min" },
      { key: "no_response_after_7d_pct", label: "No response after 7d", target: "≤ 30", unit: "%" },
      { key: "qualified_conversion_pct", label: "Qualified conversion", target: "≥ 25", unit: "%" },
    ],
    exceptionRules: [
      {
        key: "first_response_sla_breached",
        condition: "T+0 first response > 60 minutes",
        action: "Emit exception + notify sales_lead",
        severity: "high",
      },
      {
        key: "cadence_skipped",
        condition: "Any of T+24h / T+72h / T+7d touches missed",
        action: "Emit exception + surface in dashboard",
        severity: "medium",
      },
    ],
  },
  {
    id: "review_reputation",
    kind: "review_reputation",
    name: "Review & Reputation Engine",
    outcome:
      "Every delivered engagement produces a public review request, a private feedback capture, and a response to any public review within 48h.",
    cadence: "weekly",
    cronExpression: "0 15 * * 3", // Wednesdays 15:00 UTC
    summary:
      "Post-delivery review capture + reputation response cadence.",
    workflow: [
      {
        index: 0,
        label: "Detect delivery",
        description:
          "Scan for client_portal_projects transitioning to delivered in the last 7 days.",
        owner_role: "cs_ops",
      },
      {
        index: 1,
        label: "Private feedback ask",
        description:
          "Send private feedback form to primary client contact. Captures NPS + verbatim.",
        owner_role: "csm",
      },
      {
        index: 2,
        label: "Public review request",
        description:
          "If private feedback is ≥ 8 NPS, send public review link (Google / G2 / Clutch).",
        requires_approval: true,
        owner_role: "csm",
      },
      {
        index: 3,
        label: "New public review triage",
        description:
          "Any new public review is triaged within 48h. Negative reviews escalated.",
        owner_role: "cs_lead",
      },
      {
        index: 4,
        label: "Response drafted + approved",
        description:
          "Response drafted by CSM, approved by CS lead (separate approver) before posting.",
        requires_approval: true,
        owner_role: "cs_lead",
      },
      {
        index: 5,
        label: "Post + log",
        description: "Post response, log in engine_activity for the account.",
        owner_role: "cs_ops",
      },
    ],
    triggers: {
      event: "project_delivered",
      time: "weekly:wednesday:15:00Z",
      external_signal: "new_public_review",
    },
    approvalRules: {
      requires_separate_approver: true,
      approver_role: "cs_lead",
      negative_review_requires_leadership: true,
    },
    metrics: [
      { key: "review_request_rate_pct", label: "Delivered → review requested", target: "≥ 90", unit: "%" },
      { key: "median_response_hours", label: "Public review response time", target: "≤ 48", unit: "hours" },
      { key: "avg_public_rating_30d", label: "Avg public rating (30d)", target: "≥ 4.6", unit: "stars" },
    ],
    exceptionRules: [
      {
        key: "delivered_no_ask",
        condition: "Delivery > 14 days ago with no feedback ask sent",
        action: "Emit exception + review item",
        severity: "medium",
      },
      {
        key: "negative_review_stale",
        condition: "Public review ≤ 3 stars with no response after 48h",
        action: "Emit high-severity exception + notify cs_lead + leadership",
        severity: "high",
      },
    ],
  },
  {
    id: "client_success",
    kind: "client_success",
    name: "Client Success Engine",
    outcome:
      "Every active account has a documented health score, a monthly value review, and an early-warning system for at-risk accounts.",
    cadence: "monthly",
    cronExpression: "0 13 1 * *", // 1st of each month 13:00 UTC
    summary:
      "Monthly account health review with at-risk exception surfacing.",
    workflow: [
      {
        index: 0,
        label: "Refresh health score",
        description:
          "Recompute health per account from usage, response cadence, sentiment, invoice status.",
        owner_role: "cs_ops",
      },
      {
        index: 1,
        label: "Monthly value review prep",
        description:
          "One-page recap: outcomes delivered, wins, blockers, next month plan.",
        owner_role: "csm",
      },
      {
        index: 2,
        label: "Client review call",
        description: "30-minute review with the sponsor. Capture decisions.",
        owner_role: "csm",
      },
      {
        index: 3,
        label: "Log outcomes + risks",
        description:
          "Write outcomes to engine_activity. Any new risk raised on the call becomes a review item.",
        requires_approval: true,
        owner_role: "cs_lead",
      },
      {
        index: 4,
        label: "At-risk triage",
        description:
          "Any account whose health dropped by ≥ 15 points month-over-month enters the at-risk pipeline.",
        owner_role: "cs_lead",
      },
      {
        index: 5,
        label: "Renewal / expansion signal",
        description:
          "Flag renewals due in 90 days and expansion signals from the review.",
        owner_role: "cs_lead",
      },
    ],
    triggers: {
      time: "monthly:1st:13:00Z",
      event: "renewal_within_90d",
      health_delta_threshold: -15,
    },
    approvalRules: {
      requires_separate_approver: true,
      approver_role: "cs_lead",
      at_risk_flag_requires_leadership_ack: true,
    },
    metrics: [
      { key: "reviews_completed_pct", label: "Monthly reviews completed", target: "100", unit: "%" },
      { key: "at_risk_accounts_count", label: "At-risk accounts", target: "≤ 10% of book", unit: "count" },
      { key: "gross_retention_pct", label: "Gross retention (12m)", target: "≥ 95", unit: "%" },
    ],
    exceptionRules: [
      {
        key: "review_missed",
        condition: "Any active account with no monthly review in ≥ 45 days",
        action: "Emit exception + review item",
        severity: "medium",
      },
      {
        key: "health_score_freefall",
        condition: "Health score dropped by ≥ 25 points in one cycle",
        action: "Emit high-severity exception + notify leadership",
        severity: "high",
      },
    ],
  },
];

export function getTemplateById(id: string): EngineTemplate | null {
  return ENGINE_TEMPLATES.find((t) => t.id === id) ?? null;
}
