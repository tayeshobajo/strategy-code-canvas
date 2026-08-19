/**
 * Website → Trust Tai OS (Scout) handoff.
 *
 * The website never creates a roadmap, project, client or approval. It sends
 * one idempotent, signed server-to-server submission and lets Scout own
 * everything downstream.
 *
 * Auth: HMAC-SHA256 over the exact JSON body using SCOUT_WEBHOOK_SECRET,
 * sent as `x-trusttai-signature: sha256=<hex>` with `x-trusttai-timestamp`.
 * A publishable key is never used as authentication.
 */

import { createHmac } from "crypto";
import type {
  Attribution,
  IntakeCompany,
  IntakeConsent,
  IntakePerson,
  IntakeSignals,
  StructuredUnderstanding,
  VerbatimAnswer,
} from "./types";

export type ScoutSubmission = {
  source_app: "website";
  source_channel: "website";
  source_type: "roadmap_intake";
  submission_id: string;
  submitted_at: string;
  started_at: string | null;
  attribution: Attribution;
  person: IntakePerson;
  company: IntakeCompany;
  verbatim: VerbatimAnswer[];
  structured: StructuredUnderstanding;
  signals: IntakeSignals;
  consent: IntakeConsent;
};

export type ScoutDeliveryResult =
  | { ok: true; status: number }
  | { ok: false; retryable: boolean; error: string };

export async function deliverToScout(payload: ScoutSubmission): Promise<ScoutDeliveryResult> {
  const endpoint = process.env["SCOUT_INTAKE_ENDPOINT"];
  const secret = process.env["SCOUT_WEBHOOK_SECRET"];
  if (!endpoint || !secret) {
    // Not configured yet: keep the submission and retry later. Never a fake success.
    return { ok: false, retryable: true, error: "scout_not_configured" };
  }

  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": payload.submission_id,
        "x-trusttai-timestamp": timestamp,
        "x-trusttai-signature": `sha256=${signature}`,
      },
      body,
    });
    if (res.ok) return { ok: true, status: res.status };
    const text = (await res.text().catch(() => "")).slice(0, 500);
    return {
      ok: false,
      // 4xx (other than 429) means the payload is wrong — retrying will not help.
      retryable: res.status === 429 || res.status >= 500,
      error: `scout_http_${res.status}: ${text}`,
    };
  } catch (err) {
    return { ok: false, retryable: true, error: `scout_unreachable: ${(err as Error).message}` };
  }
}
