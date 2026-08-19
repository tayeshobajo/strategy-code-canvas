/**
 * Server-side intake session store.
 *
 * All reads and writes use the service role — the table is not exposed to
 * anonymous or signed-in clients. A visitor proves ownership of a session
 * with their unguessable resume token, nothing more.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { deliverToScout, type ScoutSubmission } from "./scout.server";
import { buildSignals, deriveStructured } from "./structure";
import { completeness, objectiveCoverage, type ConversationState } from "./adaptive";
import { EMPTY_STRUCTURED } from "./types";
import type {
  Attribution,
  IntakeCompany,
  IntakeConsent,
  IntakePerson,
  VerbatimAnswer,
} from "./types";
import type { FollowUpKey, IntakeObjectiveKey } from "./questions";

const TABLE = "website_intake_sessions";
const VOICE_BUCKET = "intake-voice";

export type SessionRecord = {
  id: string;
  resume_token: string;
  status: "in_progress" | "completed";
  attribution: Attribution;
  person: IntakePerson;
  company: IntakeCompany;
  consent: IntakeConsent;
  verbatim: VerbatimAnswer[];
  structured: ReturnType<typeof deriveStructured>;
  signals: Record<string, unknown>;
  scout_status: "not_ready" | "pending" | "delivered" | "failed";
  started_at: string;
  completed_at: string | null;
};

type ProgressMeta = { skipped: IntakeObjectiveKey[]; followUpsAsked: FollowUpKey[] };

function metaOf(signals: Record<string, unknown> | null | undefined): ProgressMeta {
  const raw = (signals ?? {}) as Record<string, unknown>;
  return {
    skipped: Array.isArray(raw["skipped"]) ? (raw["skipped"] as IntakeObjectiveKey[]) : [],
    followUpsAsked: Array.isArray(raw["follow_ups_asked"])
      ? (raw["follow_ups_asked"] as FollowUpKey[])
      : [],
  };
}

export async function createSession(attribution: Attribution) {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .insert({
      attribution: attribution as unknown as never,
      started_at: attribution.started_at ?? new Date().toISOString(),
    })
    .select("id, resume_token")
    .single();
  if (error) throw new Error(`intake_session_create_failed: ${error.message}`);
  return { sessionId: data.id as string, resumeToken: data.resume_token as string };
}

export async function loadSession(resumeToken: string) {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("resume_token", resumeToken)
    .maybeSingle();
  if (error) throw new Error(`intake_session_load_failed: ${error.message}`);
  if (!data) return null;
  const row = data as unknown as SessionRecord;
  const meta = metaOf(row.signals);
  return {
    status: row.status,
    person: row.person ?? {},
    company: row.company ?? {},
    verbatim: Array.isArray(row.verbatim) ? row.verbatim : [],
    skipped: meta.skipped,
    followUpsAsked: meta.followUpsAsked,
    scoutStatus: row.scout_status,
  };
}

/**
 * Autosave. Verbatim answers are written exactly as given; the structured
 * layer is re-derived on every save and is never treated as authoritative.
 */
export async function saveProgress(input: {
  resumeToken: string;
  verbatim: VerbatimAnswer[];
  skipped: IntakeObjectiveKey[];
  followUpsAsked: FollowUpKey[];
  person?: IntakePerson;
  company?: IntakeCompany;
}) {
  const state: ConversationState = {
    answers: input.verbatim,
    skipped: input.skipped,
    followUpsAsked: input.followUpsAsked,
  };
  const coverage = objectiveCoverage(state);
  const done = completeness(state);
  const signals = {
    ...buildSignals(input.verbatim, coverage, done),
    skipped: input.skipped,
    follow_ups_asked: input.followUpsAsked,
  };

  const patch: Record<string, unknown> = {
    verbatim: input.verbatim,
    structured: deriveStructured(input.verbatim),
    signals,
  };
  if (input.person) patch["person"] = input.person;
  if (input.company) patch["company"] = input.company;

  const { error } = await supabaseAdmin
    .from(TABLE)
    .update(patch as never)
    .eq("resume_token", input.resumeToken)
    .eq("status", "in_progress");
  if (error) throw new Error(`intake_session_save_failed: ${error.message}`);
  return { coverage, completeness: done };
}

export async function storeVoiceRecording(input: {
  resumeToken: string;
  questionKey: string;
  bytes: Uint8Array;
  contentType: string;
}) {
  const ext = input.contentType.includes("mp4") ? "m4a" : "webm";
  const path = `${input.resumeToken}/${input.questionKey}-${Date.now()}.${ext}`;
  const { error } = await supabaseAdmin.storage
    .from(VOICE_BUCKET)
    .upload(path, input.bytes, { contentType: input.contentType, upsert: false });
  if (error) throw new Error(`voice_upload_failed: ${error.message}`);
  return `${VOICE_BUCKET}/${path}`;
}

export function buildScoutPayload(row: {
  id: string;
  attribution: Attribution;
  person: IntakePerson;
  company: IntakeCompany;
  consent: IntakeConsent;
  verbatim: VerbatimAnswer[];
  started_at: string | null;
  completed_at: string | null;
  skipped: IntakeObjectiveKey[];
  followUpsAsked: FollowUpKey[];
}): ScoutSubmission {
  const state: ConversationState = {
    answers: row.verbatim,
    skipped: row.skipped,
    followUpsAsked: row.followUpsAsked,
  };
  const coverage = objectiveCoverage(state);
  const done = completeness(state);
  return {
    source_app: "website",
    source_channel: "website",
    source_type: "roadmap_intake",
    submission_id: row.id,
    submitted_at: row.completed_at ?? new Date().toISOString(),
    started_at: row.started_at,
    attribution: row.attribution,
    person: row.person,
    company: row.company,
    verbatim: row.verbatim,
    structured: { ...EMPTY_STRUCTURED, ...deriveStructured(row.verbatim) },
    signals: buildSignals(row.verbatim, coverage, done),
    consent: row.consent,
  };
}

/**
 * Mark the conversation complete and attempt the single handoff.
 * The submission is persisted first, so a Scout outage can never lose it.
 */
export async function completeSession(input: {
  resumeToken: string;
  person: IntakePerson;
  company: IntakeCompany;
  consent: IntakeConsent;
}) {
  const { data: existing, error: loadErr } = await supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("resume_token", input.resumeToken)
    .maybeSingle();
  if (loadErr) throw new Error(`intake_session_load_failed: ${loadErr.message}`);
  if (!existing) throw new Error("intake_session_not_found");

  const row = existing as unknown as SessionRecord & { completed_at: string | null };
  const meta = metaOf(row.signals);
  const completedAt = row.completed_at ?? new Date().toISOString();

  if (row.status !== "completed") {
    const { error: updErr } = await supabaseAdmin
      .from(TABLE)
      .update({
        status: "completed",
        person: input.person as unknown as never,
        company: input.company as unknown as never,
        consent: input.consent as unknown as never,
        completed_at: completedAt,
        scout_status: "pending",
      } as never)
      .eq("resume_token", input.resumeToken);
    if (updErr) throw new Error(`intake_session_complete_failed: ${updErr.message}`);
  }

  // Already handed off — idempotent no-op.
  if (row.scout_status === "delivered") return { delivered: true, retained: false };

  const payload = buildScoutPayload({
    id: row.id,
    attribution: row.attribution,
    person: input.person,
    company: input.company,
    consent: input.consent,
    verbatim: Array.isArray(row.verbatim) ? row.verbatim : [],
    started_at: row.started_at,
    completed_at: completedAt,
    skipped: meta.skipped,
    followUpsAsked: meta.followUpsAsked,
  });

  const result = await deliverToScout(payload);
  await supabaseAdmin
    .from(TABLE)
    .update({
      scout_status: result.ok ? "delivered" : result.retryable ? "pending" : "failed",
      scout_attempts: (row as unknown as { scout_attempts?: number }).scout_attempts
        ? Number((row as unknown as { scout_attempts: number }).scout_attempts) + 1
        : 1,
      scout_last_error: result.ok ? null : result.error,
      scout_prospect_id: result.ok ? result.prospectId : null,
      scout_delivered_at: result.ok ? new Date().toISOString() : null,
    } as never)
    .eq("id", row.id);

  return { delivered: result.ok, retained: !result.ok };
}

/** Retry loop for anything Scout has not accepted yet. */
export async function retryPendingHandoffs(limit = 25) {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("status", "completed")
    .eq("scout_status", "pending")
    .order("updated_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`intake_retry_query_failed: ${error.message}`);

  let delivered = 0;
  let stillPending = 0;
  for (const raw of data ?? []) {
    const row = raw as unknown as SessionRecord & {
      completed_at: string | null;
      scout_attempts: number;
    };
    const meta = metaOf(row.signals);
    const payload = buildScoutPayload({
      id: row.id,
      attribution: row.attribution,
      person: row.person,
      company: row.company,
      consent: row.consent,
      verbatim: Array.isArray(row.verbatim) ? row.verbatim : [],
      started_at: row.started_at,
      completed_at: row.completed_at,
      skipped: meta.skipped,
      followUpsAsked: meta.followUpsAsked,
    });
    const result = await deliverToScout(payload);
    if (result.ok) delivered += 1;
    else stillPending += 1;
    await supabaseAdmin
      .from(TABLE)
      .update({
        scout_status: result.ok ? "delivered" : result.retryable ? "pending" : "failed",
        scout_attempts: Number(row.scout_attempts ?? 0) + 1,
        scout_last_error: result.ok ? null : result.error,
        scout_prospect_id: result.ok ? result.prospectId : null,
        scout_delivered_at: result.ok ? new Date().toISOString() : null,
      } as never)
      .eq("id", row.id);
  }
  return { processed: (data ?? []).length, delivered, stillPending };
}
