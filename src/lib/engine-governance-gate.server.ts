/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Governance gate — Phase 1 (Top-10 gap sweep, 2026-07-14).
 *
 * SINGLE SERVER-SIDE CHOKEPOINT for every "AI output → official state"
 * transition. Every server fn that flips a draft artifact to an approved /
 * published / accepted / promoted / completed state MUST route through
 * `assertOfficialTransition`. The DB-side twin (`assert_official_transition()`
 * SECURITY DEFINER + BEFORE triggers on each table) is queued in
 * `.orchestrator/PENDING_MIGRATIONS.md`; until Tai applies it, this module
 * enforces the same rules in the application tier.
 *
 * Rules (per audit acceptance criteria, Gate 0):
 *   1. Actor has the required role for the artifact type.
 *   2. Actor is NOT the artifact's `created_by` (no self-approval).
 *   3. A `engine_review_items` row exists in `approved` state for the
 *      transition, when the transition type requires a review.
 *   4. Artifact's completeness threshold is met (per-artifact predicate).
 *   5. Exactly one `engine_audit_log` row is written per successful transition.
 *
 * NOT a place to add business logic — only the transition gate itself.
 */

export type OfficialArtifactType =
  | "milestone"
  | "implementation_plan"
  | "mockup"
  | "roadmap_version"
  | "delivery_item"
  | "portal_roadmap"
  | "business_engine_run"
  | "intelligence_memory";

export type OfficialNextState =
  | "approved"
  | "published"
  | "sent"
  | "accepted"
  | "promoted"
  | "completed";

/**
 * Canonical registry of official transitions. Every entry here is the
 * "official" version of a state change. Anything not listed here is a draft
 * transition and does not require the gate.
 */
export const OFFICIAL_TRANSITIONS: ReadonlyArray<{
  artifact_type: OfficialArtifactType;
  next_state: OfficialNextState;
  table: string;
  created_by_column: string;
  requires_review_kind: string | null;
  required_role: "admin" | "operator";
}> = [
  {
    artifact_type: "milestone",
    next_state: "approved",
    table: "engine_milestones",
    created_by_column: "created_by",
    requires_review_kind: "milestone_approval",
    required_role: "admin",
  },
  {
    artifact_type: "implementation_plan",
    next_state: "approved",
    table: "engine_project_implementation_plans",
    created_by_column: "created_by",
    requires_review_kind: "implementation_plan_approval",
    required_role: "admin",
  },
  {
    artifact_type: "mockup",
    next_state: "approved",
    table: "engine_project_mockups",
    created_by_column: "created_by",
    requires_review_kind: "mockup_approval",
    required_role: "admin",
  },
  {
    artifact_type: "roadmap_version",
    next_state: "published",
    table: "engine_roadmap_versions",
    created_by_column: "created_by",
    requires_review_kind: "roadmap_version_publish",
    required_role: "admin",
  },
  {
    artifact_type: "delivery_item",
    next_state: "sent",
    table: "engine_delivery_items",
    created_by_column: "created_by",
    requires_review_kind: "delivery_send",
    required_role: "admin",
  },
  {
    artifact_type: "portal_roadmap",
    next_state: "published",
    table: "client_portal_roadmaps",
    created_by_column: "created_by",
    requires_review_kind: "portal_publish",
    required_role: "admin",
  },
  {
    artifact_type: "business_engine_run",
    next_state: "completed",
    table: "engine_business_engine_runs",
    created_by_column: "started_by",
    // Runs may complete autonomously when no approval-required step exists.
    // Governance gate still enforces no-self-completion + audit.
    requires_review_kind: null,
    required_role: "admin",
  },
  {
    artifact_type: "intelligence_memory",
    next_state: "promoted",
    table: "engine_intelligence_memory",
    created_by_column: "created_by",
    requires_review_kind: "intelligence_memory_promotion",
    required_role: "admin",
  },
];

export type OfficialTransitionInput = {
  actor_email: string | null;
  artifact_type: OfficialArtifactType;
  artifact_id: string;
  next_state: OfficialNextState;
  /** Optional review-item id when this transition requires an approval. */
  review_item_id?: string | null;
  /** Optional project id for the audit-log row. Derived when omitted. */
  project_id?: string | null;
  /** Human-readable reason recorded in audit metadata. */
  reason?: string | null;
  /** Skip completeness check (only for internal migrations/backfills). */
  skip_completeness?: boolean;
};

export type OfficialTransitionResult = {
  ok: true;
  audit_id: string;
  artifact_type: OfficialArtifactType;
  next_state: OfficialNextState;
};

class GovernanceGateError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "GovernanceGateError";
  }
}

function findRegistryEntry(
  artifact_type: OfficialArtifactType,
  next_state: OfficialNextState,
) {
  return OFFICIAL_TRANSITIONS.find(
    (t) => t.artifact_type === artifact_type && t.next_state === next_state,
  );
}

/**
 * Completeness predicate registry — one per artifact type. Returns null on
 * pass, or a human-readable reason on fail. Intentionally conservative:
 * missing predicate = fail closed with `unknown_predicate`.
 */
async function assertCompleteness(
  sb: any,
  artifact_type: OfficialArtifactType,
  artifact_id: string,
): Promise<void> {
  switch (artifact_type) {
    case "milestone": {
      const { data: row } = await sb
        .from("engine_milestones")
        .select("id, name, brief_md, acceptance_criteria")
        .eq("id", artifact_id)
        .maybeSingle();
      if (!row) throw new GovernanceGateError("artifact_missing", "Milestone not found");
      if (!row.name?.trim() || !row.brief_md?.trim()) {
        throw new GovernanceGateError(
          "incomplete_artifact",
          "Milestone requires name and brief before approval",
        );
      }
      return;
    }
    case "implementation_plan": {
      const { data: row } = await sb
        .from("engine_project_implementation_plans")
        .select("id, payload, field_approvals")
        .eq("id", artifact_id)
        .maybeSingle();
      if (!row) throw new GovernanceGateError("artifact_missing", "Implementation plan not found");
      if (!row.payload || Object.keys(row.payload).length === 0) {
        throw new GovernanceGateError(
          "incomplete_artifact",
          "Implementation plan payload is empty",
        );
      }
      // Field-by-field approval gate (Phase 11 G10) — enforced only when the
      // column exists (post-migration). Absence is tolerated pre-migration.
      if (row.field_approvals && typeof row.field_approvals === "object") {
        const required = ["flows", "acceptance_criteria", "rollback"];
        for (const field of required) {
          const status = (row.field_approvals as any)[field]?.status;
          if (status && status !== "approved") {
            throw new GovernanceGateError(
              "incomplete_field_approvals",
              `Field "${field}" is ${status}, not approved`,
            );
          }
        }
      }
      return;
    }
    case "mockup": {
      const { data: row } = await sb
        .from("engine_project_mockups")
        .select("id, artifact_url, status")
        .eq("id", artifact_id)
        .maybeSingle();
      if (!row) throw new GovernanceGateError("artifact_missing", "Mockup not found");
      if (!row.artifact_url) {
        throw new GovernanceGateError("incomplete_artifact", "Mockup has no artifact");
      }
      return;
    }
    case "roadmap_version": {
      const { data: row } = await sb
        .from("engine_roadmap_versions")
        .select("id, payload")
        .eq("id", artifact_id)
        .maybeSingle();
      if (!row) throw new GovernanceGateError("artifact_missing", "Roadmap version not found");
      if (!row.payload) {
        throw new GovernanceGateError("incomplete_artifact", "Roadmap version has no payload");
      }
      return;
    }
    case "delivery_item": {
      const { data: row } = await sb
        .from("engine_delivery_items")
        .select("id, title, body_md")
        .eq("id", artifact_id)
        .maybeSingle();
      if (!row) throw new GovernanceGateError("artifact_missing", "Delivery item not found");
      if (!row.title?.trim() || !row.body_md?.trim()) {
        throw new GovernanceGateError("incomplete_artifact", "Delivery item requires title and body");
      }
      return;
    }
    case "portal_roadmap": {
      const { data: row } = await sb
        .from("client_portal_roadmaps")
        .select("id, roadmap_payload")
        .eq("id", artifact_id)
        .maybeSingle();
      if (!row) throw new GovernanceGateError("artifact_missing", "Portal roadmap not found");
      if (!row.roadmap_payload) {
        throw new GovernanceGateError("incomplete_artifact", "Portal roadmap has no payload");
      }
      return;
    }
    case "business_engine_run": {
      const { data: row } = await sb
        .from("engine_business_engine_runs")
        .select("id, output")
        .eq("id", artifact_id)
        .maybeSingle();
      if (!row) throw new GovernanceGateError("artifact_missing", "Engine run not found");
      // Runs are allowed to complete with empty output when the engine legitimately
      // produced no exception — but the row itself must exist.
      return;
    }
    case "intelligence_memory": {
      const { data: row } = await sb
        .from("engine_intelligence_memory")
        .select("id, payload")
        .eq("id", artifact_id)
        .maybeSingle();
      if (!row) throw new GovernanceGateError("artifact_missing", "Memory entry not found");
      if (!row.payload) {
        throw new GovernanceGateError("incomplete_artifact", "Memory entry has no payload");
      }
      return;
    }
    default: {
      throw new GovernanceGateError(
        "unknown_predicate",
        `No completeness predicate for artifact_type=${artifact_type}`,
      );
    }
  }
}

/**
 * Enforce an official transition. Throws `GovernanceGateError` on any rule
 * failure; returns `{ ok: true, audit_id }` on success and writes exactly one
 * `engine_audit_log` row.
 *
 * Callers pass the authenticated Supabase client (from `requireSupabaseAuth`)
 * so RLS is applied to the audit-log write.
 */
export async function assertOfficialTransition(
  sb: any,
  input: OfficialTransitionInput,
): Promise<OfficialTransitionResult> {
  const entry = findRegistryEntry(input.artifact_type, input.next_state);
  if (!entry) {
    throw new GovernanceGateError(
      "unknown_transition",
      `No official transition registered for ${input.artifact_type}→${input.next_state}`,
    );
  }

  if (!input.actor_email) {
    throw new GovernanceGateError("missing_actor", "Actor email required for official transition");
  }

  // Rule 1: role
  const { hasRoleForEmail } = await import("@/lib/ops/access");
  const roleOk = await hasRoleForEmail(sb, input.actor_email, entry.required_role);
  if (!roleOk) {
    throw new GovernanceGateError(
      "insufficient_role",
      `Actor lacks required role "${entry.required_role}" for ${input.artifact_type}`,
    );
  }

  // Rule 2: no self-approval + rule 4: completeness (parallel-safe)
  const [{ data: artifact }] = await Promise.all([
    sb
      .from(entry.table)
      .select(`id, ${entry.created_by_column}, project_id`)
      .eq("id", input.artifact_id)
      .maybeSingle(),
    input.skip_completeness ? Promise.resolve() : assertCompleteness(sb, input.artifact_type, input.artifact_id),
  ]);

  if (!artifact) {
    throw new GovernanceGateError(
      "artifact_missing",
      `${input.artifact_type} ${input.artifact_id} not found`,
    );
  }
  const createdBy = (artifact as any)[entry.created_by_column];
  if (createdBy && createdBy === input.actor_email) {
    throw new GovernanceGateError(
      "self_approval",
      `Actor ${input.actor_email} cannot approve their own ${input.artifact_type}`,
    );
  }

  // Rule 3: review item present + approved
  if (entry.requires_review_kind) {
    if (!input.review_item_id) {
      throw new GovernanceGateError(
        "missing_review_item",
        `${input.artifact_type}→${input.next_state} requires an approved review item of kind "${entry.requires_review_kind}"`,
      );
    }
    const { data: review } = await sb
      .from("engine_review_items")
      .select("id, kind, status, target_id")
      .eq("id", input.review_item_id)
      .maybeSingle();
    if (!review) {
      throw new GovernanceGateError("review_item_missing", "Referenced review item not found");
    }
    if (review.kind !== entry.requires_review_kind) {
      throw new GovernanceGateError(
        "review_item_wrong_kind",
        `Review item kind "${review.kind}" does not match required "${entry.requires_review_kind}"`,
      );
    }
    if (review.status !== "approved" && review.status !== "approved_with_conditions") {
      throw new GovernanceGateError(
        "review_item_not_approved",
        `Review item status is "${review.status}", not approved`,
      );
    }
    if (review.target_id && review.target_id !== input.artifact_id) {
      throw new GovernanceGateError(
        "review_item_target_mismatch",
        "Review item targets a different artifact",
      );
    }
  }

  // Rule 5: audit-log row
  const project_id =
    input.project_id ?? (artifact as any).project_id ?? null;
  const { data: auditRow, error: auditErr } = await sb
    .from("engine_audit_log")
    .insert({
      project_id,
      actor_email: input.actor_email,
      action: "official_transition",
      summary: `${input.artifact_type} → ${input.next_state}`,
      affected_modules: [input.artifact_type],
      target_id: input.artifact_id,
      metadata: {
        artifact_type: input.artifact_type,
        next_state: input.next_state,
        review_item_id: input.review_item_id ?? null,
        reason: input.reason ?? null,
      },
    })
    .select("id")
    .single();
  if (auditErr || !auditRow) {
    throw new GovernanceGateError(
      "audit_write_failed",
      `Failed to write audit-log row: ${auditErr?.message ?? "unknown"}`,
    );
  }

  return {
    ok: true,
    audit_id: (auditRow as any).id as string,
    artifact_type: input.artifact_type,
    next_state: input.next_state,
  };
}

export { GovernanceGateError };
