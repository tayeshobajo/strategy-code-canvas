/**
 * Project Spine — variant + section read model.
 *
 * Pure module: no DB, no React, no server imports. Runs identically on
 * the server (inside `getProjectSpine.handler`) and in the browser.
 *
 * Doctrine: `doctrine/PROJECT_SPINE_CONTRACT.md` §5.
 *
 * The Spine page renders one of three variants:
 *   - `incomplete`   — Point A or Point B is not `approved_truth`.
 *   - `client_ready` — all milestones approved OR portal publish is in
 *                      a client-visible state.
 *   - `active`       — otherwise (default operating state).
 *
 * Each variant maps to an ordered list of section keys. The route just
 * iterates that list; it does not re-derive variant or section order.
 */

export type SpineVariant = "incomplete" | "active" | "client_ready";

export type SpineSectionKey =
  // shared
  | "header"
  | "variant_banner"
  // active
  | "hero"
  | "snapshot"
  | "truth"
  | "milestone_readiness"
  | "approvals_inline"
  | "foundation"
  | "captain_brief"
  | "footer_stats"
  | "working_focus"
  | "approval_history"
  | "modules_expandable"
  | "evidence_history"
  | "notifications"
  // incomplete
  | "incomplete_focus"
  | "incomplete_contradictions"
  // client_ready
  | "client_ready_publish"
  | "client_ready_approved_milestones";

export type SpineView = {
  variant: SpineVariant;
  counts: {
    pending_approvals: number;
    approved_milestones: number;
    total_milestones: number;
    blocked_items: number;
    /** `Math.max(sources.total, 1)` — safe divisor for progress bars. */
    source_total_safe: number;
  };
  next_milestone: {
    id: string;
    name: string;
    due_date: string;
  } | null;
  /**
   * Human-readable gaps that block promotion from `active` to
   * `client_ready`. Empty when nothing is blocking.
   */
  missing_for_client_ready: string[];
  sections: SpineSectionKey[];
};

const CLIENT_VISIBLE_PUBLISH_STATUSES = new Set([
  "published",
  "ready_to_publish",
  "acknowledged",
]);

/**
 * Pure variant derivation. Takes primitive inputs so it is trivially
 * testable and identical on server + client.
 */
export function deriveSpineVariant(
  pointAApproved: boolean,
  pointBApproved: boolean,
  milestones: ReadonlyArray<{ approval_status: string }>,
  publish: { status: string } | null | undefined,
  /**
   * Legacy escape hatch: projects created before the field-truth ceremony
   * shipped have no `engine_spine_field_truth` rows, so pointA/B never
   * count as approved. Without this, mid-flight projects that already have
   * milestones, a portal publish, or an approved roadmap collapse to the
   * `incomplete` stub the moment Spine becomes the default landing page.
   * When any of that content exists, treat the project as `active` and
   * let the readiness panel surface the missing ceremony as a checklist
   * item instead of hiding the whole page.
   */
  hasLegacyContent: boolean = false,
): SpineVariant {
  if (!pointAApproved || !pointBApproved) {
    if (!hasLegacyContent) return "incomplete";
    // fall through to active/client_ready
  }
  const allMilestonesApproved =
    milestones.length > 0 &&
    milestones.every((m) => m.approval_status === "approved");
  const publishedOrReady =
    !!publish && CLIENT_VISIBLE_PUBLISH_STATUSES.has(publish.status);
  if (allMilestonesApproved || publishedOrReady) return "client_ready";
  return "active";
}

/** The ordered section list a given variant renders. */
export function sectionsForVariant(variant: SpineVariant): SpineSectionKey[] {
  const shared: SpineSectionKey[] = ["header", "variant_banner"];
  if (variant === "incomplete") {
    return [
      ...shared,
      "incomplete_focus",
      "truth",
      "incomplete_contradictions",
      "notifications",
    ];
  }
  if (variant === "client_ready") {
    return [
      ...shared,
      "client_ready_publish",
      "truth",
      "client_ready_approved_milestones",
      "notifications",
    ];
  }
  return [
    ...shared,
    "hero",
    "snapshot",
    "truth",
    "milestone_readiness",
    "approvals_inline",
    "foundation",
    "captain_brief",
    "footer_stats",
    "working_focus",
    "approval_history",
    "modules_expandable",
    "evidence_history",
    "notifications",
  ];
}

/**
 * Inputs `composeSpineView` needs from the raw spine payload. Kept
 * structural so tests can pass minimal fixtures without touching
 * `ProjectSpinePayload` directly.
 */
export type SpineViewInputs = {
  pointAApproved: boolean;
  pointBApproved: boolean;
  milestones: ReadonlyArray<{
    id: string;
    name: string;
    approval_status: string;
    status: string;
    due_date: string | null;
  }>;
  portal_publish: { status: string } | null | undefined;
  reviews: ReadonlyArray<unknown>;
  activity: ReadonlyArray<{ severity: string }>;
  sources: { total: number };
};

export function composeSpineView(input: SpineViewInputs): SpineView {
  // Legacy escape hatch — see `deriveSpineVariant` doc-comment.
  const hasLegacyContent =
    input.milestones.length > 0 || !!input.portal_publish;
  const variant = deriveSpineVariant(
    input.pointAApproved,
    input.pointBApproved,
    input.milestones,
    input.portal_publish,
    hasLegacyContent,
  );

  const approvedMilestones = input.milestones.filter(
    (m) => m.approval_status === "approved",
  ).length;
  const blockedMilestones = input.milestones.filter(
    (m) => m.status === "blocked" || m.approval_status === "rejected",
  ).length;
  const criticalActivity = input.activity.filter(
    (a) => a.severity === "critical",
  ).length;

  const nextMilestoneRow = [...input.milestones]
    .filter((m): m is typeof m & { due_date: string } => !!m.due_date)
    .sort(
      (a, b) =>
        new Date(a.due_date).getTime() - new Date(b.due_date).getTime(),
    )[0];

  const missing_for_client_ready: string[] = [];
  if (variant === "active") {
    if (input.milestones.some((m) => m.approval_status !== "approved")) {
      missing_for_client_ready.push("all milestones approved");
    }
    if (!input.portal_publish) {
      missing_for_client_ready.push("portal publish check");
    }
  }

  return {
    variant,
    counts: {
      pending_approvals: input.reviews.length,
      approved_milestones: approvedMilestones,
      total_milestones: input.milestones.length,
      blocked_items: blockedMilestones + criticalActivity,
      source_total_safe: Math.max(input.sources.total, 1),
    },
    next_milestone: nextMilestoneRow
      ? {
          id: nextMilestoneRow.id,
          name: nextMilestoneRow.name,
          due_date: nextMilestoneRow.due_date,
        }
      : null,
    missing_for_client_ready,
    sections: sectionsForVariant(variant),
  };
}
