// Shared client-safe prompt registry. Templates for Popular Prompts and the
// system prompts for the agent console.

export type AgentTaskKind =
  | "milestone_brief"
  | "acceptance_criteria"
  | "lovable_prompt"
  | "missing_decisions"
  | "update_from_source"
  | "version_compare"
  | "risk_estimate"
  | "client_summary"
  | "qa_checklist"
  | "free_form";

export const POPULAR_PROMPTS: Array<{
  kind: AgentTaskKind;
  label: string;
  template: string;
}> = [
  {
    kind: "milestone_brief",
    label: "Generate milestone brief",
    template:
      "Draft a milestone brief for the current roadmap phase. Include purpose, outcomes, scope in/out, dependencies, and acceptance criteria.",
  },
  {
    kind: "acceptance_criteria",
    label: "Create acceptance criteria",
    template:
      "Generate a 10-point acceptance criteria checklist for the next milestone.",
  },
  {
    kind: "lovable_prompt",
    label: "Draft Lovable prompt",
    template:
      "Draft a detailed Lovable build prompt for the next scoped feature, including data model, routes, components, and states.",
  },
  {
    kind: "missing_decisions",
    label: "Identify missing decisions",
    template:
      "List every decision that is still open and blocking the roadmap from progressing. Order by impact.",
  },
  {
    kind: "update_from_source",
    label: "Update from new source",
    template:
      "Given the newly attached sources, summarize what changes need to be applied to Point A, Point B, and the roadmap sequence.",
  },
  {
    kind: "version_compare",
    label: "Compare versions",
    template:
      "Compare the current approved roadmap version to the latest draft. Highlight scope, deadline, and investment differences.",
  },
  {
    kind: "risk_estimate",
    label: "Estimate risk and effort",
    template:
      "Assess execution risk and effort for the current milestone list. Provide a 1–5 risk score and hours estimate per item.",
  },
  {
    kind: "client_summary",
    label: "Create client-safe summary",
    template:
      "Draft a client-safe executive summary of the current roadmap. Remove internal notes, cost details, and speculation.",
  },
  {
    kind: "qa_checklist",
    label: "Create QA checklist",
    template:
      "Generate a QA and pre-delivery checklist for the current milestone, covering functionality, copy, brand, accessibility, and performance.",
  },
];

export function systemPromptFor(kind: AgentTaskKind): string {
  const base = `You are the Project Agent for Trust Tai's Roadmap Engine. You draft carefully, cite where signals come from when possible, and never invent decisions. Tai approves everything. Use plain, direct sentence-case prose. No em-dashes, no exclamation points, no vendor buzzwords.`;
  const specific: Record<AgentTaskKind, string> = {
    milestone_brief:
      "Return a milestone brief with clear H2 sections: Purpose, Outcomes, Scope In, Scope Out, Dependencies, Acceptance Criteria, Risks.",
    acceptance_criteria:
      "Return a numbered checklist of 10 acceptance criteria written in Given / When / Then format.",
    lovable_prompt:
      "Return a full Lovable build prompt. Include: goal, data model, routes, components, states, edge cases, and success criteria.",
    missing_decisions:
      "Return a numbered list of blocked decisions with owner and impact tag.",
    update_from_source:
      "Return a diff-style summary grouped by module (Point A, Point B, Roadmap, Deadlines, Investment).",
    version_compare:
      "Return a table-style markdown comparison with columns: Area, Approved, Draft, Delta, Impact.",
    risk_estimate:
      "Return a markdown table with columns: Milestone, Risk (1-5), Confidence, Hours estimate, Notes.",
    client_summary:
      "Return polished client-facing markdown. No internal notes, no cost estimates, no unresolved risks.",
    qa_checklist:
      "Return grouped checklists: Functionality, Copy, Brand, Accessibility, Performance, Pre-delivery.",
    free_form: "Follow the user request. Keep the response tight and actionable.",
  };
  return `${base}\n\n${specific[kind]}`;
}

export const PIPELINE_STAGES = [
  { key: "reading", label: "Reading source material" },
  { key: "extracting", label: "Extracting business signals" },
  { key: "point_a", label: "Identifying Point A" },
  { key: "point_b", label: "Identifying Point B" },
  { key: "hidden_assets", label: "Finding hidden assets" },
  { key: "gap_map", label: "Mapping gaps" },
  { key: "blueprint", label: "Generating system blueprint" },
  { key: "roadmap", label: "Building milestone sequence" },
  { key: "deadlines", label: "Checking deadlines" },
  { key: "investment", label: "Estimating investment structure" },
  { key: "client_preview", label: "Preparing client-facing preview" },
] as const;

export type PipelineStageKey = (typeof PIPELINE_STAGES)[number]["key"];
