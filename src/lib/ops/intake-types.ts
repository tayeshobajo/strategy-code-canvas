// Shared types mirroring the dedicated intake project's tables.
// The intake project is not in the Supabase types codegen, so we hand-type it.

export type ReviewStatus =
  | "needs_review"
  | "in_review"
  | "approved"
  | "rejected"
  | "archived";

export const REVIEW_STATUSES: ReadonlyArray<ReviewStatus> = [
  "needs_review",
  "in_review",
  "approved",
  "rejected",
  "archived",
];

export type IntakeAnswer = {
  key: string;
  question: string;
  response: string;
  reflected_offered?: string | null;
};

export type IntakeSubmissionRow = {
  id: string;
  name: string;
  business: string | null;
  website: string | null;
  email: string;
  authorizes_scan: boolean;
  answers: IntakeAnswer[] | null;
  source: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export type ReviewArtifact = {
  version?: string;
  source?: string;
  generated_at?: string;
  summary?: {
    founder_name?: string;
    business?: string | null;
    website?: string | null;
    reply_preference?: string | null;
    timeline?: string | null;
    decision_makers?: string | null;
    answer_count?: number;
  };
  draft?: {
    point_a?: string;
    point_b?: string;
    point_c?: string;
    unbuilt_asset?: string;
    gap_hypothesis?: string;
    first_move?: string;
  };
  gap_analysis?: {
    current_weight?: string;
    why_now?: string;
    attempted_fixes?: string;
    missing_context?: string[];
    review_questions?: string[];
  };
  review_gate?: {
    state?: string;
    approval_required?: boolean;
    outbound_blocked?: boolean;
    allowed_next_actions?: string[];
  };
};

export type ReviewRow = {
  id: string;
  submission_id: string;
  status: ReviewStatus;
  artifact: ReviewArtifact | null;
  approval_required: boolean;
  outbound_blocked: boolean;
  reviewer_email: string | null;
  decided_at: string | null;
  internal_summary: string | null;
  created_at: string;
  updated_at: string;
};

// Eight roadmap sections an operator can edit before delivery.
export type DraftContent = {
  situation_summary: string;
  core_constraint: string;
  strategic_diagnosis: string;
  first_moves: string;
  ninety_day_sequence: string;
  risks: string;
  recommended_engagement: string;
  next_step: string;
};

export const DRAFT_SECTIONS: ReadonlyArray<{
  key: keyof DraftContent;
  label: string;
  hint: string;
}> = [
  { key: "situation_summary", label: "Situation summary", hint: "Where the business is today, in plain language." },
  { key: "core_constraint", label: "Core constraint", hint: "The single thing holding everything else back." },
  { key: "strategic_diagnosis", label: "Strategic diagnosis", hint: "What's actually going on under the surface." },
  { key: "first_moves", label: "First moves", hint: "The two or three things to do first." },
  { key: "ninety_day_sequence", label: "90-day sequence", hint: "What gets sequenced across the first quarter." },
  { key: "risks", label: "Risks", hint: "What could go sideways and what watches for it." },
  { key: "recommended_engagement", label: "Recommended engagement", hint: "How Trust Tai would help and at what pace." },
  { key: "next_step", label: "Next step", hint: "The single next action for the founder." },
];

export type DraftRow = {
  id: string;
  submission_id: string;
  review_id: string | null;
  content: Partial<DraftContent> | null;
  version: number;
  last_edited_by: string | null;
  created_at: string;
  updated_at: string;
};

export type NoteRow = {
  id: string;
  submission_id: string;
  author_email: string;
  body: string;
  created_at: string;
};

export type AuditAction =
  | "opened"
  | "marked_in_review"
  | "note_added"
  | "draft_saved"
  | "approved"
  | "rejected"
  | "archived"
  | "reopened"
  | "notified_operator"
  | "bridged_to_engine";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type AuditRow = {
  id: string;
  submission_id: string;
  actor_email: string | null;
  action: AuditAction | string;
  metadata: JsonValue;
  created_at: string;
};

// Derive a one-line core signal from the artifact for queue rows.
export function deriveCoreSignal(artifact: ReviewArtifact | null | undefined): string {
  if (!artifact) return "";
  const weight = artifact.gap_analysis?.current_weight?.trim();
  if (weight && weight.length > 0) return weight;
  const draft = artifact.draft?.point_a?.trim();
  return draft ?? "";
}

export function emptyDraft(): DraftContent {
  return {
    situation_summary: "",
    core_constraint: "",
    strategic_diagnosis: "",
    first_moves: "",
    ninety_day_sequence: "",
    risks: "",
    recommended_engagement: "",
    next_step: "",
  };
}

// Seed the editable draft from the generated artifact so the operator starts
// with the model's output instead of a blank slate.
export function seedDraftFromArtifact(artifact: ReviewArtifact | null | undefined): DraftContent {
  const base = emptyDraft();
  if (!artifact) return base;
  const d = artifact.draft ?? {};
  const g = artifact.gap_analysis ?? {};
  return {
    ...base,
    situation_summary: d.point_a ?? "",
    core_constraint: g.current_weight ?? "",
    strategic_diagnosis: d.gap_hypothesis ?? "",
    first_moves: d.first_move ?? "",
    ninety_day_sequence: "",
    risks: (g.missing_context ?? []).map((m) => `• ${m}`).join("\n"),
    recommended_engagement: "",
    next_step: d.first_move ?? "",
  };
}
