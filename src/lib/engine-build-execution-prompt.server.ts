// Server-only prompt assembly for Build Execution / OpenClaw Handoff v1.
//
// Consumes the APPROVED implementation plan (with backend/QA/mockup/frame/spine
// as supporting context) and produces controlled BUILD PACKETS that can be
// handed to Lovable, OpenClaw, or a developer. Each packet packages the
// handoff prompt, scope, do-not-touch list, acceptance criteria, QA
// requirements, evidence requirements, rollback notes, dependencies, and
// risks.
//
// It DOES NOT run any prompt, deploy code, apply migrations, execute
// OpenClaw, mark QA tests passed, or mark the project delivered.

import type { ImplPlanRow } from "@/lib/engine-implementation-plan.functions";
import type { BackendPlanRow } from "@/lib/engine-backend-builder.functions";
import type { QaPlanRow } from "@/lib/engine-qa-factory.functions";
import type { MockupRow } from "@/lib/engine-mockup-builder.functions";
import type { FrameRow } from "@/lib/engine-frame-builder.functions";
import type { ProjectSpinePayload } from "@/lib/engine.functions";

export type BuildExecutionInputBundle = {
  project: {
    id: string;
    name: string;
    client_company: string;
    status: string;
    current_step: string;
    goal: string | null;
  };
  approved_implementation_plan: ImplPlanRow;
  approved_backend_plan: BackendPlanRow | null;
  approved_qa_plan: QaPlanRow | null;
  approved_mockup: MockupRow | null;
  approved_frame: FrameRow | null;
  milestones: Array<{ id: string; name: string; phase: string | null; task_count: number }>;
  artifacts: Array<{ artifact_type: string; title: string; summary: string | null }>;
};

export type MissingBuildExecutionInput = {
  key: string;
  label: string;
  recommendation: string;
};

/** Build Execution requires an APPROVED implementation plan. */
export function assessBuildExecutionReadiness(args: {
  approved_implementation_plan: ImplPlanRow | null;
}): MissingBuildExecutionInput[] {
  const missing: MissingBuildExecutionInput[] = [];
  if (!args.approved_implementation_plan) {
    missing.push({
      key: "approved_implementation_plan",
      label: "Approved implementation plan",
      recommendation:
        "Approve an implementation plan before generating build packets.",
    });
  }
  return missing;
}

const BUILD_EXECUTION_SYSTEM_PROMPT = `You are the Trust Tai Build Execution / OpenClaw Handoff builder.

Your job: turn the APPROVED implementation plan (with the approved backend
plan, QA plan, mockup, frame, and spine as supporting context) into a
sequence of controlled BUILD PACKETS that can be handed to Lovable,
OpenClaw, or a developer for execution — with tracking, evidence, and
lifecycle. Each packet packages the handoff prompt, scope,
do-not-touch list, acceptance criteria, QA requirements, evidence
requirements, rollback notes, dependencies, and risks.

You DO NOT:
- run the prompts you produce
- call OpenClaw, Lovable, or any external agent
- apply migrations
- deploy code
- write real code or SQL (the handoff_prompt is a natural-language
  instruction, not a code artifact)
- execute tests or mark QA tests as passed / failed
- mark the project delivered
- change roadmap approvals, investment terms, tasks, milestones, or
  portal / client-facing surfaces
- invent scope not present in the approved implementation plan, backend
  plan, QA plan, mockup, frame, or spine

Rules:
- Group the implementation plan's build_steps into COHERENT slices.
  Each packet is ONE coherent slice — typically one phase or a
  parallelizable group of steps of the same builder target.
- ORDER packets by sequence_number, starting at 1. Respect the
  implementation plan's phases and dependencies.
- Prefer smaller, verifiable packets over "kitchen-sink" packets.
- target_builder MUST match the packet_type: "lovable" for Lovable UI /
  wiring work; "openclaw" for OpenClaw automation; "developer" for
  hands-on migrations / server functions; "qa" for QA passes; "mixed"
  only when a single coherent slice legitimately spans multiple
  builders.
- execution_scope.expected_files_or_surfaces MUST cite files, routes,
  tables, or server functions from the implementation plan.
- execution_scope.do_not_touch MUST always include, at minimum:
  ["approved implementation plan payload",
   "approved backend plan payload",
   "approved QA plan payload",
   "roadmap approvals",
   "client_portal_* tables",
   "investment terms",
   "engine_projects.status = delivered flag"]
  Plus any packet-specific protected surfaces.
- handoff_prompt is a Markdown-friendly natural-language instruction
  block written FOR the target builder. It must:
    * open with the packet_goal
    * cite the source implementation steps and files/surfaces
    * list acceptance criteria explicitly
    * end with a "SAFETY" block that includes verbatim lines:
        "DO NOT deploy code."
        "DO NOT mark QA tests passed."
        "DO NOT mark the project delivered."
        "DO NOT modify approved upstream payloads."
- acceptance_criteria are OBSERVABLE outcomes (files exist, route loads,
  server fn callable, RLS enforced, screenshot captured).
- qa_requirements reference specific tests from the approved QA plan
  when possible.
- evidence_required lists the artifacts a human reviewer will need to
  accept the packet: screenshots, logs, diff summaries, QA reports, or
  links.
- risk_notes, rollback_notes, dependencies, blocking_conditions,
  post_execution_checks, and open_decisions must be honest — do not
  claim "none" for a packet with real risk.
- Never claim any step has run.
- Never write SQL, code, or shell commands verbatim.

Return ONE JSON object matching the schema exactly. No prose.`;

const BUILD_EXECUTION_JSON_SCHEMA_HINT = `Schema:
{
  "packets": [{
    "title": string,                          // <= 160 chars
    "summary": string,                        // 1-3 sentences
    "packet_type": "lovable" | "openclaw" | "developer" | "qa" | "mixed",
    "priority": "p0" | "p1" | "p2",
    "sequence_number": number,                // starts at 1
    "payload": {
      "packet_goal": string,
      "source_implementation_steps": string[],    // build_step ids from the plan
      "target_builder": "Lovable" | "OpenClaw" | "Developer" | "QA",
      "execution_scope": {
        "included": string[],
        "excluded": string[],
        "expected_files_or_surfaces": string[],
        "do_not_touch": string[]
      },
      "handoff_prompt": string,                   // Markdown-ok natural language
      "context_summary": string,
      "implementation_steps": string[],
      "acceptance_criteria": string[],
      "qa_requirements": string[],
      "evidence_required": string[],
      "risk_notes": string[],
      "rollback_notes": string[],
      "dependencies": string[],
      "blocking_conditions": string[],
      "post_execution_checks": string[],
      "open_decisions": string[]
    }
  }]
}`;

export function buildBuildExecutionPrompt(
  bundle: BuildExecutionInputBundle,
  spine: ProjectSpinePayload | null,
): { system: string; user: string } {
  const impl = bundle.approved_implementation_plan;
  const backend = bundle.approved_backend_plan;
  const qa = bundle.approved_qa_plan;
  const mockup = bundle.approved_mockup;
  const frame = bundle.approved_frame;
  const compact = {
    project: bundle.project,
    approved_implementation_plan: {
      id: impl.id,
      title: impl.title,
      summary: impl.summary,
      approved_at: impl.approved_at,
      payload: impl.payload,
    },
    approved_backend_plan: backend
      ? {
          id: backend.id,
          title: backend.title,
          summary: backend.summary,
          backend_goal: backend.payload?.backend_goal,
          data_model: backend.payload?.data_model,
          server_functions: backend.payload?.server_functions,
          permissions: backend.payload?.permissions,
          integrations: backend.payload?.integrations,
          workflows: backend.payload?.workflows,
        }
      : null,
    approved_qa_plan: qa
      ? {
          id: qa.id,
          title: qa.title,
          qa_goal: qa.payload?.qa_goal,
          test_matrix: qa.payload?.test_matrix,
          evidence_plan: qa.payload?.evidence_plan,
          go_no_go_criteria: qa.payload?.go_no_go_criteria,
        }
      : null,
    approved_mockup: mockup
      ? {
          id: mockup.id,
          title: mockup.title,
          navigation_model: mockup.payload?.navigation_model,
          pages: (mockup.payload?.pages ?? []).map((p) => ({
            title: p.title,
            priority: p.priority,
            key_actions: p.key_actions,
          })),
        }
      : null,
    approved_frame: frame?.payload
      ? {
          id: frame.id,
          frame_goal: frame.payload.frame_goal,
          roles: frame.payload.roles,
          flows: frame.payload.flows,
          qa_gates: frame.payload.qa_gates,
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

  const user = `${BUILD_EXECUTION_JSON_SCHEMA_HINT}

Approved implementation + supporting context (JSON):
${JSON.stringify(compact, null, 2)}

Produce the ordered build packets now. Return JSON only. Do NOT include
real SQL, code, or shell commands — the handoff_prompt is natural
language for the target builder. Do NOT claim any step has run.`;

  return { system: BUILD_EXECUTION_SYSTEM_PROMPT, user };
}
