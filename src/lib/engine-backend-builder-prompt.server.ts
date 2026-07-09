// Server-only prompt assembly for Backend Builder v1. Never import from
// client bundles.
//
// Backend Builder consumes an APPROVED mockup set (which itself consumes an
// approved frame) and produces a STRUCTURED backend blueprint — data model,
// server functions, RLS/permissions, integrations, workflows, QA plan,
// implementation sequence, risks, and open decisions. It does NOT execute
// migrations, deploy code, or mutate production schema.

import type { MockupRow, MockupPayload } from "@/lib/engine-mockup-builder.functions";
import type { FrameRow } from "@/lib/engine-frame-builder.functions";
import type { ProjectSpinePayload } from "@/lib/engine.functions";

export type BackendInputBundle = {
  project: {
    id: string;
    name: string;
    client_company: string;
    status: string;
    current_step: string;
    goal: string | null;
  };
  approved_mockup: MockupRow;
  approved_frame: FrameRow | null;
  approved_roadmap: unknown;
  artifacts: Array<{ artifact_type: string; title: string; summary: string | null }>;
  open_mockup_decisions: MockupPayload["open_decisions"];
};

export type MissingBackendInput = { key: string; label: string; recommendation: string };

/**
 * Backend Builder requires an APPROVED mockup. Anything else is a hard block.
 */
export function assessBackendReadiness(args: {
  approved_mockup: MockupRow | null;
}): MissingBackendInput[] {
  const missing: MissingBackendInput[] = [];
  if (!args.approved_mockup) {
    missing.push({
      key: "approved_mockup",
      label: "Approved mockup set",
      recommendation:
        "Approve a mockup set in Mockup Builder before generating a backend plan.",
    });
    return missing;
  }
  const p = args.approved_mockup.payload;
  if (!p?.pages || p.pages.length === 0) {
    missing.push({
      key: "mockup_pages",
      label: "Mockup pages",
      recommendation: "Approved mockup has no pages — regenerate the mockup set first.",
    });
  }
  return missing;
}

const BACKEND_SYSTEM_PROMPT = `You are the Trust Tai Backend Builder.

Your job: turn an APPROVED mockup spec into a STRUCTURED backend blueprint —
data model, server functions, RLS/permission rules, integrations, workflows,
notifications, QA plan, implementation sequence, risks, and open decisions.

You DO NOT:
- write runnable SQL migrations that will be executed
- apply migrations or change database schema
- deploy code
- publish anything to clients
- change investment or roadmap approvals
- generate visual UI or images
- invent tables, integrations, or roles that the approved mockup + frame do not imply

Rules:
- Use ONLY the supplied APPROVED_MOCKUP + APPROVED_FRAME + project context.
- Every table you propose must trace back to at least one page's
  data_dependencies or backend_dependencies from the approved mockup.
- Every server function you propose must map to a key_action, workflow, or
  state on an approved mockup page.
- Every permission/RLS rule must reference the roles that appear in the
  approved frame + mockup.
- Every integration must be justified by the approved mockup or frame.
- QA plan must cover role tests, data tests, RLS tests, integration tests,
  edge cases, and regression tests.
- Implementation sequence must be ordered: migrations first, then server
  functions, then UI wiring, then QA, then rollback notes.
- open_decisions must call out what blocks safe implementation.
- risks must call out data-loss, security, or integration risks.
- Never claim to have executed or applied anything. This is a plan.

Return ONE JSON object matching the requested schema exactly. No prose.`;

const BACKEND_JSON_SCHEMA_HINT = `Schema:
{
  "title": string,                     // <= 160 chars
  "summary": string,                   // 1-3 sentences
  "backend_goal": string,              // what this backend plan must enable
  "source_mockup_summary": string,     // paraphrase the approved mockup
  "architecture_summary": string,      // high-level architecture in prose
  "data_model": {
    "tables": [{
      "name": string,
      "purpose": string,
      "fields": [{
        "name": string,
        "type": string,
        "required": boolean,
        "notes": string
      }],
      "relationships": string[],
      "indexes": string[],
      "rls_rules": string[],
      "audit_requirements": string[]
    }],
    "views": string[],
    "enums": string[],
    "storage_buckets": string[]
  },
  "server_functions": [{
    "name": string,
    "purpose": string,
    "inputs": string[],
    "outputs": string[],
    "permissions": string[],
    "side_effects": string[],
    "audit_events": string[],
    "failure_modes": string[]
  }],
  "permissions": [{
    "role": string,
    "can_read": string[],
    "can_create": string[],
    "can_update": string[],
    "can_delete": string[],
    "notes": string
  }],
  "integrations": [{
    "name": string,
    "purpose": string,
    "direction": "inbound" | "outbound" | "both",
    "data_exchanged": string[],
    "auth_required": string,
    "failure_modes": string[]
  }],
  "workflows": [{
    "name": string,
    "trigger": string,
    "steps": string[],
    "success_condition": string,
    "failure_modes": string[]
  }],
  "api_endpoints": string[],
  "background_jobs": string[],
  "notifications": string[],
  "security_checks": string[],
  "qa_plan": {
    "role_tests": string[],
    "data_tests": string[],
    "rls_tests": string[],
    "integration_tests": string[],
    "edge_cases": string[],
    "regression_tests": string[]
  },
  "implementation_sequence": string[],
  "open_decisions": [{
    "question": string,
    "blocks": ("implementation" | "security" | "delivery")[],
    "recommended_owner": string,
    "suggested_next_action": string
  }],
  "risks": [{
    "name": string,
    "severity": "low" | "medium" | "high",
    "mitigation": string
  }]
}`;

export function buildBackendPrompt(
  bundle: BackendInputBundle,
  spine: ProjectSpinePayload | null,
): { system: string; user: string } {
  const mockup = bundle.approved_mockup;
  const framePayload = bundle.approved_frame?.payload;
  const compact = {
    project: bundle.project,
    approved_mockup: {
      id: mockup.id,
      title: mockup.title,
      summary: mockup.summary,
      approved_at: mockup.approved_at,
      mockup_goal: mockup.payload.mockup_goal,
      source_frame_summary: mockup.payload.source_frame_summary,
      pages: (mockup.payload.pages ?? []).map((p) => ({
        frame_page_id: p.frame_page_id,
        title: p.title,
        priority: p.priority,
        page_goal: p.page_goal,
        primary_user: p.primary_user,
        key_actions: p.key_actions,
        states: p.states,
        data_dependencies: p.data_dependencies,
        backend_dependencies: p.backend_dependencies,
        qa_checks: p.qa_checks,
        open_questions: p.open_questions,
      })),
      global_components: mockup.payload.global_components,
      navigation_model: mockup.payload.navigation_model,
      interaction_model: mockup.payload.interaction_model,
      qa_expectations: mockup.payload.qa_expectations,
    },
    approved_frame: framePayload
      ? {
          id: bundle.approved_frame?.id,
          project_summary: framePayload.project_summary,
          frame_goal: framePayload.frame_goal,
          roles: framePayload.roles,
          data_objects: framePayload.data_objects,
          backend_requirements: framePayload.backend_requirements,
          permissions: framePayload.permissions,
          qa_gates: framePayload.qa_gates,
          flows: framePayload.flows,
        }
      : null,
    approved_roadmap: bundle.approved_roadmap ?? null,
    artifacts: bundle.artifacts.slice(0, 20),
    open_mockup_decisions: bundle.open_mockup_decisions ?? [],
    spine_summary: spine
      ? {
          frame: spine.project?.frame ?? null,
          goal: spine.project?.goal ?? null,
          current_step: spine.project?.current_step ?? null,
          milestones_count: spine.milestones?.length ?? 0,
        }
      : null,
  };

  const user = `${BACKEND_JSON_SCHEMA_HINT}

Approved mockup + project context (JSON):
${JSON.stringify(compact, null, 2)}

Produce the backend blueprint now. Return JSON only. Do not include runnable SQL that would be executed automatically — describe migrations in the implementation_sequence and rls_rules in prose.`;
  return { system: BACKEND_SYSTEM_PROMPT, user };
}
