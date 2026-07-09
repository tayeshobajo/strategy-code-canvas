// Server-only prompt assembly for QA Factory v1. Never import from client
// bundles.
//
// QA Factory consumes the APPROVED backend plan (which itself consumes an
// approved mockup + approved frame + project spine) and produces a
// STRUCTURED QA plan — test matrix, evidence plan, go/no-go criteria,
// open decisions, and risks. It does NOT execute tests, deploy code,
// mutate production data, or mark anything as delivered.

import type { BackendPlanRow } from "@/lib/engine-backend-builder.functions";
import type { MockupRow } from "@/lib/engine-mockup-builder.functions";
import type { FrameRow } from "@/lib/engine-frame-builder.functions";
import type { ProjectSpinePayload } from "@/lib/engine.functions";

export type QaInputBundle = {
  project: {
    id: string;
    name: string;
    client_company: string;
    status: string;
    current_step: string;
    goal: string | null;
  };
  approved_backend_plan: BackendPlanRow;
  approved_mockup: MockupRow | null;
  approved_frame: FrameRow | null;
  milestones: Array<{ id: string; name: string; phase: string | null; task_count: number }>;
  artifacts: Array<{ artifact_type: string; title: string; summary: string | null }>;
};

export type MissingQaInput = { key: string; label: string; recommendation: string };

/** QA Factory requires an APPROVED backend plan. */
export function assessQaReadiness(args: {
  approved_backend_plan: BackendPlanRow | null;
}): MissingQaInput[] {
  const missing: MissingQaInput[] = [];
  if (!args.approved_backend_plan) {
    missing.push({
      key: "approved_backend_plan",
      label: "Approved backend plan",
      recommendation:
        "Approve a backend plan in Backend Builder before generating a QA plan.",
    });
    return missing;
  }
  const p = args.approved_backend_plan.payload;
  const hasTables = (p?.data_model?.tables?.length ?? 0) > 0;
  const hasFns = (p?.server_functions?.length ?? 0) > 0;
  if (!hasTables || !hasFns) {
    missing.push({
      key: "backend_plan_body",
      label: "Backend plan body",
      recommendation:
        "Approved backend plan has no tables or server functions — regenerate the backend plan.",
    });
  }
  return missing;
}

const QA_SYSTEM_PROMPT = `You are the Trust Tai QA Factory.

Your job: turn an APPROVED backend plan (with its approved mockup + frame + spine)
into a STRUCTURED QA plan — test matrix, evidence plan, go/no-go criteria,
open decisions, and risks.

You DO NOT:
- execute any tests
- mark any test as passed / failed / blocked (all statuses start "not_run")
- run destructive tests, mutations, or migrations
- deploy code
- mark the project delivered
- change roadmap approvals, investment terms, tasks, or milestones
- change portal or client-facing surfaces
- invent tests unrelated to the approved backend plan / mockup / frame / spine

Rules:
- Use ONLY the supplied APPROVED_BACKEND_PLAN + APPROVED_MOCKUP + APPROVED_FRAME + spine context.
- Every test must map back to a backend plan table/server function/permission/integration/workflow, or to a mockup page/state/action, or to a frame role/flow/qa_gate.
- Include route, role, data, RLS, workflow, ui_state, responsive, integration, audit, regression, and edge_case tests.
- Every test must include: title, category, priority (p0/p1/p2), source, surface, scenario, steps, expected_result, evidence_required, owner, blocking, status="not_run".
- role_tests / route_tests / data_tests / rls_tests / workflow_tests / ui_state_tests / responsive_tests / integration_tests / audit_tests / regression_tests / edge_cases must each be non-trivial arrays of test IDs (or short strings) that also appear inside test_matrix.
- evidence_plan describes what evidence must be captured (screenshots, DB snapshots, logs, network traces).
- go_no_go_criteria splits into what must pass BEFORE build, BEFORE delivery, what BLOCKS launch, and what can be DEFERRED.
- open_decisions call out anything that blocks safe QA.
- risks call out data-loss, security, regression, or integration risks derived from the approved artifacts.
- Never claim any test has run.

Return ONE JSON object matching the requested schema exactly. No prose.`;

const QA_JSON_SCHEMA_HINT = `Schema:
{
  "title": string,                     // <= 160 chars
  "summary": string,                   // 1-3 sentences
  "qa_goal": string,
  "source_backend_summary": string,    // paraphrase the approved backend plan
  "overall_readiness": "not_ready" | "needs_review" | "ready_for_build" | "ready_for_delivery",
  "test_matrix": [{
    "id": string,                      // stable id like "R-01", "RLS-03"
    "title": string,
    "category": "route" | "role" | "data" | "rls" | "workflow" | "ui_state" | "responsive" | "integration" | "audit" | "regression" | "edge_case",
    "priority": "p0" | "p1" | "p2",
    "source": "frame" | "mockup" | "backend_plan" | "spine" | "task" | "milestone",
    "surface": string,                 // route, table, function, component
    "scenario": string,
    "steps": string[],
    "expected_result": string,
    "evidence_required": string[],
    "status": "not_run",
    "owner": string,
    "blocking": boolean
  }],
  "role_tests": string[],              // test ids or short summaries
  "route_tests": string[],
  "data_tests": string[],
  "rls_tests": string[],
  "workflow_tests": string[],
  "ui_state_tests": string[],
  "responsive_tests": string[],
  "integration_tests": string[],
  "audit_tests": string[],
  "regression_tests": string[],
  "edge_cases": string[],
  "blocked_items": string[],
  "evidence_plan": [{
    "name": string,
    "captures": string[],
    "notes": string
  }],
  "go_no_go_criteria": [{
    "gate": "before_build" | "before_delivery" | "blocks_launch" | "can_be_deferred",
    "criterion": string,
    "detail": string
  }],
  "open_decisions": [{
    "question": string,
    "blocks": ("build" | "delivery" | "security")[],
    "recommended_owner": string,
    "suggested_next_action": string
  }],
  "risks": [{
    "name": string,
    "severity": "low" | "medium" | "high",
    "mitigation": string
  }]
}`;

export function buildQaPrompt(
  bundle: QaInputBundle,
  spine: ProjectSpinePayload | null,
): { system: string; user: string } {
  const plan = bundle.approved_backend_plan;
  const mockup = bundle.approved_mockup;
  const frame = bundle.approved_frame;
  const compact = {
    project: bundle.project,
    approved_backend_plan: {
      id: plan.id,
      title: plan.title,
      summary: plan.summary,
      approved_at: plan.approved_at,
      backend_goal: plan.payload.backend_goal,
      architecture_summary: plan.payload.architecture_summary,
      data_model: plan.payload.data_model,
      server_functions: plan.payload.server_functions,
      permissions: plan.payload.permissions,
      integrations: plan.payload.integrations,
      workflows: plan.payload.workflows,
      api_endpoints: plan.payload.api_endpoints,
      background_jobs: plan.payload.background_jobs,
      notifications: plan.payload.notifications,
      security_checks: plan.payload.security_checks,
      qa_plan_hints: plan.payload.qa_plan,
      implementation_sequence: plan.payload.implementation_sequence,
      open_decisions: plan.payload.open_decisions,
      risks: plan.payload.risks,
    },
    approved_mockup: mockup
      ? {
          id: mockup.id,
          title: mockup.title,
          summary: mockup.summary,
          mockup_goal: mockup.payload?.mockup_goal,
          pages: (mockup.payload?.pages ?? []).map((p) => ({
            title: p.title,
            priority: p.priority,
            key_actions: p.key_actions,
            states: p.states,
            qa_checks: p.qa_checks,
            data_dependencies: p.data_dependencies,
            backend_dependencies: p.backend_dependencies,
          })),
          navigation_model: mockup.payload?.navigation_model,
          qa_expectations: mockup.payload?.qa_expectations,
        }
      : null,
    approved_frame: frame?.payload
      ? {
          id: frame.id,
          project_summary: frame.payload.project_summary,
          frame_goal: frame.payload.frame_goal,
          roles: frame.payload.roles,
          data_objects: frame.payload.data_objects,
          permissions: frame.payload.permissions,
          qa_gates: frame.payload.qa_gates,
          flows: frame.payload.flows,
        }
      : null,
    milestones: bundle.milestones.slice(0, 30),
    artifacts: bundle.artifacts.slice(0, 20),
    spine_summary: spine
      ? {
          frame: spine.project?.frame ?? null,
          goal: spine.project?.goal ?? null,
          current_step: spine.project?.current_step ?? null,
          milestones_count: spine.milestones?.length ?? 0,
        }
      : null,
  };

  const user = `${QA_JSON_SCHEMA_HINT}

Approved backend plan + project context (JSON):
${JSON.stringify(compact, null, 2)}

Produce the QA plan now. Return JSON only. All test statuses MUST be "not_run". Do not execute anything.`;
  return { system: QA_SYSTEM_PROMPT, user };
}
