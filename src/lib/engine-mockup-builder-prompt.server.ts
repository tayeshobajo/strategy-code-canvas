// Server-only prompt assembly for Mockup Builder v1. Never import from
// client bundles — this file is only used by server functions.
//
// Mockup Builder consumes an APPROVED frame from Frame Builder and produces
// STRUCTURED mockup specs (layout sections, actions, states, responsive
// notes, dependencies, QA checks). It does NOT generate images.

import type { FramePayload, FrameRow } from "@/lib/engine-frame-builder.functions";
import type { ProjectSpinePayload } from "@/lib/engine.functions";

export type MockupInputBundle = {
  project: {
    id: string;
    name: string;
    client_company: string;
    status: string;
    current_step: string;
    goal: string | null;
  };
  approved_frame: FrameRow;
  approved_roadmap: unknown;
  artifacts: Array<{ artifact_type: string; title: string; summary: string | null }>;
  open_frame_decisions: FramePayload["open_decisions"];
};

export type MissingMockupInput = { key: string; label: string; recommendation: string };

/**
 * Mockup Builder requires an APPROVED frame. Anything else is a hard block.
 */
export function assessMockupReadiness(args: {
  approved_frame: FrameRow | null;
}): MissingMockupInput[] {
  const missing: MissingMockupInput[] = [];
  if (!args.approved_frame) {
    missing.push({
      key: "approved_frame",
      label: "Approved frame",
      recommendation: "Approve a frame in Frame Builder before generating mockups.",
    });
    return missing;
  }
  const p = args.approved_frame.payload;
  if (!p?.pages || p.pages.length === 0) {
    missing.push({
      key: "frame_pages",
      label: "Frame pages",
      recommendation: "Approved frame has no pages — regenerate the frame first.",
    });
  }
  return missing;
}

const MOCKUP_SYSTEM_PROMPT = `You are the Trust Tai Mockup Builder.

Your job: turn an APPROVED project frame into a STRUCTURED mockup spec —
layout sections, actions, states, responsive behaviour, data + backend
dependencies, and QA checks. You do NOT generate visual images or pick
final colors/fonts. You are producing a buildable *specification* that a
designer or engineer can use to construct real mockups.

Rules:
- Use ONLY the supplied APPROVED_FRAME + project context. Do not invent
  pages, features, users, or integrations that the frame does not imply.
- Every "must" priority page from the frame MUST appear in your output
  and carry its frame page id in \`frame_page_id\`. "should" pages are
  strongly encouraged. "later" pages are optional.
- Every page MUST include at least one layout_section, at least one
  state (empty/loading/error acceptable), and responsive_notes for
  desktop/tablet/mobile.
- Design system notes must be principle-level (tone, layout, component
  posture) — not concrete color hex codes or font names.
- open_decisions must call out what blocks visual mockups, backend, or
  delivery. Never invent decisions the frame did not surface.

Return ONE JSON object matching the requested schema exactly. No prose.`;

const MOCKUP_JSON_SCHEMA_HINT = `Schema:
{
  "title": string,                     // <= 120 chars
  "summary": string,                   // 1-3 sentences
  "mockup_goal": string,               // what this mockup set must enable
  "source_frame_summary": string,      // paraphrase the approved frame
  "design_system_notes": {
    "brand_direction": string,
    "tone": string,
    "layout_principles": string[],
    "component_principles": string[],
    "responsive_principles": string[]
  },
  "pages": [{
    "frame_page_id": string,           // MUST match a page id from the approved frame
    "title": string,
    "priority": "must" | "should" | "later",
    "page_goal": string,
    "primary_user": string,
    "layout_sections": [{
      "name": string,
      "purpose": string,
      "components": string[],
      "content_notes": string[],
      "interaction_notes": string[]
    }],
    "key_actions": string[],
    "states": [{
      "name": string,
      "trigger": string,
      "ui_expectation": string,
      "empty_state": string,
      "error_state": string,
      "loading_state": string
    }],
    "responsive_notes": { "desktop": string, "tablet": string, "mobile": string },
    "data_dependencies": string[],
    "backend_dependencies": string[],
    "qa_checks": string[],
    "open_questions": string[]
  }],
  "global_components": string[],
  "navigation_model": string[],
  "interaction_model": string[],
  "responsive_strategy": string[],
  "qa_expectations": string[],
  "open_decisions": [{
    "question": string,
    "blocks": ("mockups" | "backend" | "delivery")[],
    "recommended_owner": string,
    "suggested_next_action": string
  }]
}`;

export function buildMockupPrompt(
  bundle: MockupInputBundle,
  spine: ProjectSpinePayload | null,
): { system: string; user: string } {
  const framePayload = bundle.approved_frame.payload;
  const compact = {
    project: bundle.project,
    approved_frame: {
      id: bundle.approved_frame.id,
      title: bundle.approved_frame.title,
      summary: bundle.approved_frame.summary,
      approved_at: bundle.approved_frame.approved_at,
      project_summary: framePayload.project_summary,
      frame_goal: framePayload.frame_goal,
      roles: framePayload.roles,
      pages: (framePayload.pages ?? []).map((p) => ({
        id: p.id,
        title: p.title,
        type: p.type,
        goal: p.goal,
        primary_user: p.primary_user,
        roles_allowed: p.roles_allowed,
        primary_actions: p.primary_actions,
        secondary_actions: p.secondary_actions,
        states: p.states,
        data_reads: p.data_reads,
        data_writes: p.data_writes,
        backend_requirements: p.backend_requirements,
        integrations: p.integrations,
        qa_checks: p.qa_checks,
        open_questions: p.open_questions,
        priority: p.priority,
      })),
      flows: framePayload.flows,
      data_objects: framePayload.data_objects,
      backend_requirements: framePayload.backend_requirements,
      permissions: framePayload.permissions,
      qa_gates: framePayload.qa_gates,
    },
    approved_roadmap: bundle.approved_roadmap ?? null,
    artifacts: bundle.artifacts.slice(0, 20),
    open_frame_decisions: bundle.open_frame_decisions ?? [],
    spine_summary: spine
      ? {
          frame: spine.project?.frame ?? null,
          goal: spine.project?.goal ?? null,
          current_step: spine.project?.current_step ?? null,
          milestones_count: spine.milestones?.length ?? 0,
        }
      : null,
  };

  const user = `${MOCKUP_JSON_SCHEMA_HINT}

Approved frame + project context (JSON):
${JSON.stringify(compact, null, 2)}

Produce the mockup spec now. Return JSON only.`;
  return { system: MOCKUP_SYSTEM_PROMPT, user };
}
