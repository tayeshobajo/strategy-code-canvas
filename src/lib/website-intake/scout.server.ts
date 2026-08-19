/**
 * Website → Trust Tai OS (Core / Scout) intake handoff.
 *
 * The website never creates a roadmap, project, client or approval. It sends
 * one idempotent, signed server-to-server submission and lets Core own
 * everything downstream.
 */

import {
  CORE_INTAKE_ENDPOINT,
  toCoreIntakeBody,
  type InternalSubmission,
} from "./core-contract";
import { postSigned } from "./core-client.server";

/** Internal submission shape, unchanged for the rest of the website. */
export type ScoutSubmission = {
  source_app: "website";
  source_channel: "website";
  source_type: "roadmap_intake";
  submission_id: string;
  submitted_at: string;
  started_at: string | null;
  attribution: InternalSubmission["attribution"];
  person: InternalSubmission["person"];
  company: InternalSubmission["company"];
  verbatim: InternalSubmission["verbatim"];
  structured: InternalSubmission["structured"];
  signals: InternalSubmission["signals"];
  consent: InternalSubmission["consent"];
};

export type ScoutDeliveryResult =
  | { ok: true; status: number; prospectId: string | null; duplicate: boolean }
  | { ok: false; retryable: boolean; error: string };

function readProspectId(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const candidate =
    b["prospect_id"] ?? b["scout_prospect_id"] ?? b["id"] ?? b["submission_id"] ?? null;
  return typeof candidate === "string" ? candidate.slice(0, 100) : null;
}

export async function deliverToScout(payload: ScoutSubmission): Promise<ScoutDeliveryResult> {
  const body = toCoreIntakeBody(payload);
  const result = await postSigned({
    endpoint: process.env["CORE_INTAKE_ENDPOINT"] || CORE_INTAKE_ENDPOINT,
    body,
    idempotencyKey: payload.submission_id,
  });
  if (!result.ok) {
    return {
      ok: false,
      retryable: result.retryable,
      error: result.error === "core_not_configured" ? "scout_not_configured" : result.error,
    };
  }
  const b = (result.body ?? {}) as Record<string, unknown>;
  return {
    ok: true,
    status: result.status,
    prospectId: readProspectId(result.body),
    duplicate: b["duplicate"] === true,
  };
}
