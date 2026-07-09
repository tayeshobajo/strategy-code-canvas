// Server-only prompt assembly for Implementation Plan v1. Never import from
// client bundles.
//
// Implementation Plan consumes the APPROVED backend plan + APPROVED QA plan
// (with mockup, frame, and spine as supporting context) and produces a
// STRUCTURED build sequence — phases, ordered build steps, migration plan,
// server function plan, UI wiring plan, permission/RLS plan, integration
// plan, QA execution order, developer/Lovable/OpenClaw prompts, rollback
// strategy, release gates, open decisions, risks.
//
// It DOES NOT execute anything, apply migrations, write code, deploy, mark
// QA tests passed, or mark the project delivered.

import type { BackendPlanRow } from "@/lib/engine-backend-builder.functions";
import type { MockupRow } from "@/lib/engine-mockup-builder.functions";
import type { FrameRow } from "@/lib/engine-frame-builder.functions";
import type { QaPlanRow } from "@/lib/engine-qa-factory.functions";
import type { ProjectSpinePayload } from "@/lib/engine.functions";

export type ImplementationInputBundle = {
  project: {
    id: string;
    name: string;
    client_company: string;
    status: string;
    current_step: string;
    goal: string | null;
  };
  approved_backend_plan: BackendPlanRow;
  approved_qa_plan: QaPlanRow;
  approved_mockup: MockupRow | null;
  approved_frame: FrameRow | null;
  milestones: Array<{ id: string; name: string; phase: string | null; task_count: number }>;
  artifacts: Array<{ artifact_type: string; title: string; summary: string | null }>;
};

export type MissingImplementationInput = {
  key: string;
  label: string;
  recommendation: string;
};

/** Implementation Plan requires an APPROVED backend plan AND an APPROVED QA plan. */
export function assessImplementationReadiness(args: {
  approved_backend_plan: BackendPlanRow | null;
  approved_qa_plan: QaPlanRow | null;
}): MissingImplementationInput[] {
  const missing: MissingImplementationInput[] = [];
  if (!args.approved_backend_plan) {
    missing.push({
      key: "approved_backend_plan",
      label: "Approved backend plan",
      recommendation:
        "Approve a backend plan in Backend Builder before generating an implementation plan.",
    });
  }
  if (!args.approved_qa_plan) {
    missing.push({
      key: "approved_qa_plan",
      label: "Approved QA plan",
      recommendation:
        "Approve a QA plan in QA Factory before generating an implementation plan.",
    });
  }
  return missing;
}

const IMPLEMENTATION_SYSTEM_PROMPT = `You are the Trust Tai Implementation Plan builder.

Your job: turn an APPROVED backend plan + APPROVED QA plan (with the approved
mockup, frame, and spine as supporting context) into a STRUCTURED build
sequence — phases, ordered build steps, migration plan, server function plan,
UI wiring plan, permission/RLS plan, integration plan, QA execution order,
developer / Lovable / OpenClaw prompts, rollback strategy, release gates,
open decisions, and risks.

You DO NOT:
- write actual code, SQL, or migrations
- apply migrations
- deploy anything
- execute tests or mark any QA test as passed / failed
- mark the project delivered
- change roadmap approvals, investment terms, tasks, or milestones
- change portal or client-facing surfaces
- invent scope not present in the approved backend plan, QA plan, mockup,
  frame, or spine

Rules:
- Use ONLY the supplied APPROVED_BACKEND_PLAN + APPROVED_QA_PLAN +
  APPROVED_MOCKUP + APPROVED_FRAME + spine context.
- Every build step must trace back to a backend table / server function /
  permission / integration / workflow, or a mockup page / state / action,
  or a frame role / flow / qa_gate, or a QA test / gate / evidence.
- Phases order the work; build_steps are the concrete ordered items.
- Each build step has: id, phase_id, title, type
  (migration|server_function|ui_wiring|integration|permission|data_seed|qa|documentation|cleanup),
  priority (p0|p1|p2), goal, inputs, outputs, files_or_surfaces,
  dependencies, implementation_notes, qa_checks, acceptance_criteria,
  rollback_plan, risk_level (low|medium|high), requires_human_review.
- migration_plan lists ordered migration steps with table changes,
  RLS/grants, triggers, seed data, rollback notes, and safety checks. Do
  NOT include real SQL — this is planning, not execution.
- server_function_plan lists ordered server functions with inputs, outputs,
  permissions, audit events, failure modes, and QA tests.
- ui_wiring_plan lists routes, components, state/data dependencies, action
  handlers, loading/empty/error states, and responsive concerns.
- permission_rls_plan lists roles, table access, server function gates,
  direct-write prevention, cross-project isolation, and portal boundaries.
- integration_plan lists external systems, secrets required, safety notes.
- qa_execution_order lists which QA tests from the approved QA plan run
  after each build step, evidence required, blocking tests, and regression
  sequence.
- developer_prompts contains at MINIMUM one Lovable prompt, one OpenClaw
  prompt, one developer prompt, and one QA prompt. Each has title, target,
  prompt (Markdown-ok), expected_output, acceptance_criteria, safety_notes
  (must include "do not deploy", "do not mark delivered", "do not mark QA
  passed" as appropriate).
- parallelization: what can be built in parallel, what must be sequenced,
  what is blocked_until an event.
- rollback_strategy: phase-level, migration-level, and feature-level.
- release_gates: hard no-go conditions.
- open_decisions: anything blocking a safe build.
- risks: derived from backend + QA + mockup + frame.
- Never claim any step has run.

Return ONE JSON object matching the requested schema exactly. No prose.`;

const IMPLEMENTATION_JSON_SCHEMA_HINT = `Schema:
{
  "title": string,                     // <= 160 chars
  "summary": string,                   // 1-3 sentences
  "implementation_goal": string,
  "source_backend_summary": string,    // paraphrase the approved backend plan
  "source_qa_summary": string,         // paraphrase the approved QA plan
  "build_strategy": string,
  "phases": [{
    "id": string,                      // e.g. "PH-01"
    "title": string,
    "goal": string,
    "sequence": number,
    "depends_on": string[],            // phase ids
    "deliverables": string[],
    "acceptance_gates": string[],
    "qa_gates": string[],
    "rollback_notes": string[]
  }],
  "build_steps": [{
    "id": string,                      // e.g. "S-001"
    "phase_id": string,
    "title": string,
    "type": "migration" | "server_function" | "ui_wiring" | "integration" | "permission" | "data_seed" | "qa" | "documentation" | "cleanup",
    "priority": "p0" | "p1" | "p2",
    "goal": string,
    "inputs": string[],
    "outputs": string[],
    "files_or_surfaces": string[],
    "dependencies": string[],
    "implementation_notes": string[],
    "qa_checks": string[],
    "acceptance_criteria": string[],
    "rollback_plan": string[],
    "risk_level": "low" | "medium" | "high",
    "requires_human_review": boolean
  }],
  "migration_plan": [{
    "id": string,
    "title": string,
    "sequence": number,
    "table_changes": string[],
    "rls_grants": string[],
    "triggers": string[],
    "seed_data": string[],
    "rollback_notes": string[],
    "safety_checks": string[]
  }],
  "server_function_plan": [{
    "id": string,
    "name": string,
    "sequence": number,
    "inputs": string[],
    "outputs": string[],
    "permissions": string[],
    "audit_events": string[],
    "failure_modes": string[],
    "qa_tests": string[]
  }],
  "ui_wiring_plan": [{
    "id": string,
    "route": string,
    "components": string[],
    "data_dependencies": string[],
    "action_handlers": string[],
    "loading_state": string,
    "empty_state": string,
    "error_state": string,
    "responsive_notes": string[]
  }],
  "permission_rls_plan": [{
    "surface": string,                 // table or server fn
    "roles": string[],
    "access_rules": string[],
    "server_function_gates": string[],
    "direct_write_prevention": string,
    "cross_project_isolation": string,
    "portal_boundary": string
  }],
  "integration_plan": [{
    "system": string,
    "purpose": string,
    "secrets_required": string[],
    "safety_notes": string[]
  }],
  "qa_execution_order": [{
    "after_step_id": string,           // build_step id
    "run_tests": string[],             // QA test ids from the approved QA plan
    "evidence_required": string[],
    "blocking": boolean,
    "notes": string
  }],
  "developer_prompts": [{
    "title": string,
    "target": "Lovable" | "OpenClaw" | "developer" | "QA",
    "prompt": string,
    "expected_output": string,
    "acceptance_criteria": string[],
    "safety_notes": string[]
  }],
  "parallelization": {
    "can_parallelize": string[],       // step ids or short groups
    "must_sequence": string[],
    "blocked_until": string[]
  },
  "rollback_strategy": [{
    "level": "phase" | "migration" | "feature",
    "target": string,
    "steps": string[]
  }],
  "release_gates": [{
    "gate": string,
    "criterion": string,
    "no_go_conditions": string[]
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

export function buildImplementationPrompt(
  bundle: ImplementationInputBundle,
  spine: ProjectSpinePayload | null,
): { system: string; user: string } {
  const plan = bundle.approved_backend_plan;
  const qa = bundle.approved_qa_plan;
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
    approved_qa_plan: {
      id: qa.id,
      title: qa.title,
      summary: qa.summary,
      approved_at: qa.approved_at,
      qa_goal: qa.payload.qa_goal,
      overall_readiness: qa.payload.overall_readiness,
      test_matrix: qa.payload.test_matrix,
      evidence_plan: qa.payload.evidence_plan,
      go_no_go_criteria: qa.payload.go_no_go_criteria,
      open_decisions: qa.payload.open_decisions,
      risks: qa.payload.risks,
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

  const user = `${IMPLEMENTATION_JSON_SCHEMA_HINT}

Approved backend + QA + project context (JSON):
${JSON.stringify(compact, null, 2)}

Produce the implementation plan now. Return JSON only. Do NOT include real SQL or code — this is planning, not execution. Do NOT claim any step has run.`;
  return { system: IMPLEMENTATION_SYSTEM_PROMPT, user };
}
