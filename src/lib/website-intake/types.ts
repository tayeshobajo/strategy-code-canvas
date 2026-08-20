import type { IntakeObjectiveKey, FollowUpKey } from "./questions";

export type AnswerModality = "text" | "voice";

/** Layer A — exactly what the person said. Authoritative, never overwritten. */
export type VerbatimAnswer = {
  key:
    | IntakeObjectiveKey
    | `${IntakeObjectiveKey}__followup_${FollowUpKey}`
    /** A social or relational turn. Kept verbatim, consumes no objective. */
    | `aside__${string}`;
  question: string;
  /** The person's own words. For voice, the transcript of their recording. */
  answer: string;
  modality: AnswerModality;
  /** Storage path of the recording when the answer was spoken. */
  media_ref?: string | null;
  /** Optional model summary. Additive only — never replaces `answer`. */
  summary?: string | null;
  skipped?: boolean;
  answered_at: string;
};

/** Layer B — derived understanding. May evolve; never authoritative. */
export type StructuredUnderstanding = {
  current_state: string[];
  desired_future: string[];
  pains: string[];
  goals: string[];
  constraints: string[];
  existing_assets: string[];
  ideas: string[];
  open_questions: string[];
};

export type IntakeSignals = {
  frame: string;
  frame_confidence: number;
  objective_coverage: number;
  completeness: number;
};

export type Attribution = {
  landing_path: string | null;
  entry_referrer: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  gclid: string | null;
  fbclid: string | null;
  session_id: string | null;
  started_at: string | null;
  page_views_before_intake: number | null;
};

export type IntakePerson = {
  name: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
};

export type IntakeCompany = {
  name: string | null;
  website: string | null;
};

export type IntakeConsent = {
  contact_ok: boolean;
  marketing_ok: boolean;
  /**
   * Explicit permission to review the visitor's public business presence.
   * true = yes, false = no, null = never asked. Never inferred from
   * marketing consent, and never defaulted either way.
   */
  research_ok?: boolean | null;
  agreed_at: string | null;
};

export const EMPTY_STRUCTURED: StructuredUnderstanding = {
  current_state: [],
  desired_future: [],
  pains: [],
  goals: [],
  constraints: [],
  existing_assets: [],
  ideas: [],
  open_questions: [],
};
