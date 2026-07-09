// Server-only prompt assembly for Frame Builder v1. Never import from
// client bundles — this file references server-only helpers.

import type { ProjectSpinePayload } from "@/lib/engine.functions";

export type FrameInputBundle = {
  project: {
    id: string;
    name: string;
    client_company: string;
    status: string;
    current_step: string;
    frame: string | null;
    goal: string | null;
    point_a: unknown;
    point_b: unknown;
  };
  approved_roadmap: unknown;
  milestones: Array<{
    id: string;
    name: string;
    phase: string | null;
    status: string;
    approval_status: string | null;
  }>;
  artifacts: Array<{
    artifact_type: string;
    title: string;
    summary: string | null;
  }>;
  chat_proposals_saved: Array<{
    proposal_type: string;
    title: string;
    summary: string | null;
  }>;
};

export type MissingInput = { key: string; label: string; recommendation: string };

/**
 * Check whether the project has enough approved direction to synthesize a frame.
 * Returns a list of missing inputs when it does NOT.
 */
export function assessFrameReadiness(bundle: FrameInputBundle): MissingInput[] {
  const missing: MissingInput[] = [];
  if (!bundle.project.point_a) {
    missing.push({
      key: "point_a",
      label: "Point A diagnosis",
      recommendation: "Capture Point A in the workspace before generating a frame.",
    });
  }
  if (!bundle.project.goal) {
    missing.push({
      key: "point_b_goal",
      label: "Point B goal",
      recommendation: "Define the Point B goal so the frame has a destination.",
    });
  }
  if (!bundle.milestones.length) {
    missing.push({
      key: "milestones",
      label: "Approved milestones",
      recommendation: "Build at least a draft milestone plan before framing the product.",
    });
  }
  return missing;
}

const FRAME_SYSTEM_PROMPT = `You are the Trust Tai Frame Builder.

Your job: turn an APPROVED project direction into a STRUCTURAL FRAME of the
product/project — before any mockups, visual design, or backend build. You
produce pages, flows, roles, actions, states, data needs, backend
implications, QA expectations, and open decisions.

Rules:
- Use ONLY the supplied project context. Do not invent facts, users, or
  features not implied by Point A, Point B, milestones, artifacts, or saved
  chat proposals.
- If context is thin, prefer fewer, higher-confidence pages over a padded set.
- Never reference "the client" as an audience; the frame is internal.
- Prioritize each page as "must", "should", or "later".
- Every page card MUST include roles_allowed, primary_actions, states,
  data_reads, data_writes, backend_requirements, qa_checks, and priority.
- Flows must have a clear actor, steps, success_condition, and edge_cases.
- Open decisions must call out what blocks mockups, backend, or delivery.

Return ONE JSON object matching the requested schema exactly. No prose.`;

const FRAME_JSON_SCHEMA_HINT = `Schema:
{
  "title": string,                  // <= 120 chars, human-readable frame title
  "summary": string,                // 1-3 sentences
  "project_summary": string,        // paraphrase of what the project is
  "frame_goal": string,             // what this frame must enable
  "roles": [{ "id": string, "label": string, "description": string }],
  "pages": [{
    "id": string,
    "title": string,
    "type": "marketing" | "dashboard" | "form" | "admin" | "detail" | "settings" | "portal" | "workflow" | "other",
    "goal": string,
    "primary_user": string,
    "roles_allowed": string[],
    "entry_points": string[],
    "primary_actions": string[],
    "secondary_actions": string[],
    "states": string[],
    "data_reads": string[],
    "data_writes": string[],
    "backend_requirements": string[],
    "integrations": string[],
    "qa_checks": string[],
    "open_questions": string[],
    "priority": "must" | "should" | "later"
  }],
  "flows": [{
    "title": string,
    "actor": string,
    "steps": string[],
    "success_condition": string,
    "edge_cases": string[]
  }],
  "data_objects": [{ "name": string, "purpose": string, "owned_by": string }],
  "backend_requirements": string[],
  "permissions": [{ "role": string, "can": string[] }],
  "qa_gates": [{ "name": string, "detail": string }],
  "open_decisions": [{
    "question": string,
    "blocks": ("mockups" | "backend" | "delivery")[],
    "recommended_owner": string,
    "suggested_next_action": string
  }]
}`;

export function buildFramePrompt(
  bundle: FrameInputBundle,
  spine: ProjectSpinePayload | null,
): { system: string; user: string } {
  const compact = {
    project: bundle.project,
    approved_roadmap: bundle.approved_roadmap ?? null,
    milestones: bundle.milestones.slice(0, 40),
    artifacts: bundle.artifacts.slice(0, 30),
    saved_proposals: bundle.chat_proposals_saved.slice(0, 30),
    spine_summary: spine
      ? {
          frame: spine.project?.frame ?? null,
          goal: spine.project?.goal ?? null,
          current_step: spine.project?.current_step ?? null,
          approved_version_status: spine.version?.status ?? null,
          milestones_count: spine.milestones?.length ?? 0,
        }
      : null,
  };
  const user = `${FRAME_JSON_SCHEMA_HINT}

Project context (JSON):
${JSON.stringify(compact, null, 2)}

Produce the frame now. Return JSON only.`;
  return { system: FRAME_SYSTEM_PROMPT, user };
}
