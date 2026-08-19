/**
 * Signed server-to-server transport to Trust Tai OS (Core).
 *
 * One secret — WEBSITE_INTAKE_SECRET — signs both intake submissions and
 * website events. HMAC-SHA256 over `${timestamp}.${rawBody}`.
 * A publishable key is never used as authentication, and the secret is never
 * logged or returned.
 */

import { createHmac } from "crypto";

export type CoreDeliveryResult =
  | { ok: true; status: number; body: unknown }
  | { ok: false; retryable: boolean; error: string; status?: number };

export function signBody(secret: string, timestamp: string, rawBody: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

export async function postSigned(input: {
  endpoint: string;
  body: unknown;
  idempotencyKey?: string;
}): Promise<CoreDeliveryResult> {
  const secret = process.env["WEBSITE_INTAKE_SECRET"];
  if (!secret) {
    // Honest not-configured state — retained locally and retried later.
    return { ok: false, retryable: true, error: "core_not_configured" };
  }

  const rawBody = JSON.stringify(input.body);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = signBody(secret, timestamp, rawBody);

  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-trust-tai-timestamp": timestamp,
    "x-trust-tai-signature": `sha256=${signature}`,
  };
  if (input.idempotencyKey) headers["idempotency-key"] = input.idempotencyKey;

  try {
    const res = await fetch(input.endpoint, { method: "POST", headers, body: rawBody });
    const text = await res.text().catch(() => "");
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text.slice(0, 500);
    }
    if (res.ok) return { ok: true, status: res.status, body: parsed };
    return {
      ok: false,
      status: res.status,
      // 4xx other than 429 means the payload is wrong — retrying will not help.
      retryable: res.status === 429 || res.status >= 500,
      error: `core_http_${res.status}: ${typeof parsed === "string" ? parsed : text.slice(0, 500)}`,
    };
  } catch (err) {
    return { ok: false, retryable: true, error: `core_unreachable: ${(err as Error).message}` };
  }
}
