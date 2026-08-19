/**
 * Outgoing contract: Website → Trust Tai OS (Core).
 *
 * The Website keeps its own internal shapes. This module is the single place
 * that maps them into Core's exact body, immediately before signing.
 * Verbatim answer text is passed through string-for-string — never trimmed,
 * normalised, summarised or re-cased here.
 */

import type {
  Attribution,
  IntakeCompany,
  IntakeConsent,
  IntakePerson,
  IntakeSignals,
  StructuredUnderstanding,
  VerbatimAnswer,
} from "./types";

/** Privacy notice version this intake collects consent against. */
export const PRIVACY_VERSION = "website-intake-2026-08";

export const CORE_INTAKE_ENDPOINT = "https://cmd.trusttai.com/api/public/website/intake";
export const CORE_EVENTS_ENDPOINT = "https://cmd.trusttai.com/api/public/website/events";

export type CoreAttribution = {
  landing_path: string | null;
  entry_referrer: string | null;
  utm: {
    source: string | null;
    medium: string | null;
    campaign: string | null;
    term: string | null;
    content: string | null;
  };
  gclid: string | null;
  fbclid: string | null;
  session_id: string | null;
  page_views_before_start: number | null;
  device: string | null;
  locale: string | null;
};

export type CoreVerbatim = {
  question_id: string;
  question_text: string;
  answer_text: string;
  modality: "text" | "voice";
  media_url: string | null;
  answered_at: string;
  skipped: boolean;
};

export type CoreIntakeBody = {
  source_app: "website";
  source_channel: "website";
  source_type: "roadmap_intake";
  submission_id: string;
  submitted_at: string;
  started_at: string | null;
  attribution: CoreAttribution;
  person: { name: string | null; email: string | null; phone: string | null; role: string | null };
  company: {
    name: string | null;
    website: string | null;
    industry_stated: string | null;
    size_stated: string | null;
    location_stated: string | null;
  };
  verbatim: CoreVerbatim[];
  structured: StructuredUnderstanding;
  signals: {
    frame: string;
    frame_confidence: number;
    objective_coverage: number;
    completeness: number;
    authorizes_research: boolean | null;
  };
  consent: { marketing_opt_in: boolean; privacy_version: string };
};

export type InternalSubmission = {
  submission_id: string;
  submitted_at: string;
  started_at: string | null;
  attribution: Attribution;
  person: IntakePerson;
  company: IntakeCompany;
  verbatim: VerbatimAnswer[];
  structured: StructuredUnderstanding;
  signals: IntakeSignals & { authorizes_research?: boolean | null };
  consent: IntakeConsent;
  device?: string | null;
  locale?: string | null;
};

export function toCoreIntakeBody(input: InternalSubmission): CoreIntakeBody {
  const a = input.attribution;
  return {
    source_app: "website",
    source_channel: "website",
    source_type: "roadmap_intake",
    submission_id: input.submission_id,
    submitted_at: input.submitted_at,
    started_at: input.started_at,
    attribution: {
      landing_path: a?.landing_path ?? null,
      entry_referrer: a?.entry_referrer ?? null,
      utm: {
        source: a?.utm_source ?? null,
        medium: a?.utm_medium ?? null,
        campaign: a?.utm_campaign ?? null,
        term: a?.utm_term ?? null,
        content: a?.utm_content ?? null,
      },
      gclid: a?.gclid ?? null,
      fbclid: a?.fbclid ?? null,
      session_id: a?.session_id ?? null,
      page_views_before_start: a?.page_views_before_intake ?? null,
      device: input.device ?? null,
      locale: input.locale ?? null,
    },
    person: {
      name: input.person?.name ?? null,
      email: input.person?.email ?? null,
      phone: input.person?.phone ?? null,
      role: input.person?.role ?? null,
    },
    company: {
      name: input.company?.name ?? null,
      website: input.company?.website ?? null,
      // Not genuinely captured by this intake — never inferred.
      industry_stated: null,
      size_stated: null,
      location_stated: null,
    },
    verbatim: (input.verbatim ?? []).map((v) => ({
      question_id: v.key,
      question_text: v.question,
      answer_text: v.answer,
      modality: v.modality,
      media_url: v.media_ref ?? null,
      answered_at: v.answered_at,
      skipped: v.skipped === true,
    })),
    structured: input.structured,
    signals: {
      frame: input.signals.frame,
      frame_confidence: input.signals.frame_confidence,
      objective_coverage: input.signals.objective_coverage,
      completeness: input.signals.completeness,
      authorizes_research: input.signals.authorizes_research ?? null,
    },
    consent: {
      marketing_opt_in: input.consent?.marketing_ok === true,
      privacy_version: PRIVACY_VERSION,
    },
  };
}

export const WEBSITE_EVENT_NAMES = [
  "page_view",
  "intake_view",
  "intake_started",
  "intake_answered",
  "intake_resume_requested",
  "intake_resumed",
  "intake_submitted",
  "intake_abandoned",
] as const;

export type WebsiteEventName = (typeof WEBSITE_EVENT_NAMES)[number];

export type WebsiteEvent = {
  event_key: string;
  event_name: WebsiteEventName;
  occurred_at: string;
  session_id: string | null;
  submission_id: string | null;
  path: string | null;
  referrer: string | null;
  utm: CoreAttribution["utm"];
  device: string | null;
  properties: Record<string, unknown>;
};

export type CoreEventsBody = {
  source_app: "website";
  events: WebsiteEvent[];
};

export function toCoreEventsBody(events: WebsiteEvent[]): CoreEventsBody {
  return { source_app: "website", events };
}
