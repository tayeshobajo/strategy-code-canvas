import { createHmac } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deliverToScout, type ScoutSubmission } from "./scout.server";
import { toCoreIntakeBody, toCoreEventsBody, PRIVACY_VERSION } from "./core-contract";
import { signBody } from "./core-client.server";
import { EMPTY_STRUCTURED } from "./types";
import { EMPTY_ATTRIBUTION } from "./attribution";

const payload: ScoutSubmission = {
  source_app: "website",
  source_channel: "website",
  source_type: "roadmap_intake",
  submission_id: "11111111-1111-1111-1111-111111111111",
  submitted_at: "2026-01-01T00:00:00.000Z",
  started_at: "2026-01-01T00:00:00.000Z",
  attribution: {
    ...EMPTY_ATTRIBUTION,
    landing_path: "/walks",
    entry_referrer: "https://google.com/",
    utm_source: "google",
    utm_medium: "cpc",
    utm_campaign: "roadmap",
    session_id: "sess_1",
    page_views_before_intake: 3,
  },
  person: { name: "Jane", email: "jane@example.com", phone: null, role: null },
  company: { name: "Acme", website: "acme.com" },
  verbatim: [
    {
      key: "future_day",
      question: "What does the good day look like?",
      answer: "  Calm.  With TWO spaces.\nAnd a newline.  ",
      modality: "text",
      media_ref: null,
      answered_at: "2026-01-01T00:00:00.000Z",
    },
  ],
  structured: EMPTY_STRUCTURED,
  signals: { frame: "roadmap", frame_confidence: 0.5, objective_coverage: 0.8, completeness: 0.9 },
  consent: { contact_ok: true, marketing_ok: true, agreed_at: "2026-01-01T00:00:00.000Z" },
};

describe("core intake contract", () => {
  it("maps a real internal session into Core's exact body", () => {
    const body = toCoreIntakeBody(payload);
    expect(body.source_app).toBe("website");
    expect(body.source_type).toBe("roadmap_intake");
    expect(body.submission_id).toBe(payload.submission_id);
    expect(body.attribution.utm).toEqual({
      source: "google",
      medium: "cpc",
      campaign: "roadmap",
      term: null,
      content: null,
    });
    expect(body.attribution.page_views_before_start).toBe(3);
    expect(body.attribution.device).toBeNull();
    expect(body.company).toMatchObject({
      industry_stated: null,
      size_stated: null,
      location_stated: null,
    });
    expect(body.verbatim[0]).toEqual({
      question_id: "future_day",
      question_text: "What does the good day look like?",
      answer_text: payload.verbatim[0]!.answer,
      modality: "text",
      media_url: null,
      answered_at: "2026-01-01T00:00:00.000Z",
      skipped: false,
    });
    expect(body.consent).toEqual({ marketing_opt_in: true, privacy_version: PRIVACY_VERSION });
    expect(body.signals.authorizes_research).toBeNull();
    expect(Object.keys(body.structured)).toEqual([
      "current_state",
      "desired_future",
      "pains",
      "goals",
      "constraints",
      "existing_assets",
      "ideas",
      "open_questions",
    ]);
    expect(JSON.stringify(body)).not.toContain("organization_id");
  });

  it("preserves verbatim answer text string-for-string", () => {
    const body = toCoreIntakeBody(payload);
    expect(body.verbatim[0]!.answer_text).toBe(payload.verbatim[0]!.answer);
  });
});

describe("hmac signing", () => {
  it("matches Core's `${timestamp}.${rawBody}` scheme", () => {
    const raw = JSON.stringify({ a: 1 });
    expect(signBody("s3cret", "1700000000", raw)).toBe(
      createHmac("sha256", "s3cret").update(`1700000000.${raw}`).digest("hex"),
    );
  });
});

describe("scout handoff", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    process.env["CORE_INTAKE_ENDPOINT"] = "https://cmd.example.com/api/public/website/intake";
    process.env["WEBSITE_INTAKE_SECRET"] = "test-secret";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env["CORE_INTAKE_ENDPOINT"];
    delete process.env["WEBSITE_INTAKE_SECRET"];
    vi.restoreAllMocks();
  });

  it("signs the request and keys it by submission id", async () => {
    const spy = vi.fn(
      async (_input: unknown, _init?: unknown) =>
        new Response(JSON.stringify({ prospect_id: "p_1" }), {
          status: 201,
          headers: { "content-type": "application/json" },
        }),
    );
    globalThis.fetch = spy as unknown as typeof fetch;

    const result = await deliverToScout(payload);
    expect(result).toMatchObject({ ok: true, status: 201, prospectId: "p_1" });

    const init = spy.mock.calls[0]![1] as unknown as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["idempotency-key"]).toBe(payload.submission_id);
    expect(headers["x-trust-tai-signature"]).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(headers["x-trust-tai-timestamp"]).toMatch(/^\d+$/);
    // Never a Supabase key as authentication, never the secret in the body.
    expect(JSON.stringify(headers)).not.toMatch(/sb_publishable|apikey/i);
    expect(String(init.body)).not.toContain("test-secret");
    // Signature is over the exact bytes sent.
    expect(headers["x-trust-tai-signature"]).toBe(
      `sha256=${signBody("test-secret", headers["x-trust-tai-timestamp"]!, String(init.body))}`,
    );
  });

  it("retains the submission for retry when Core is unreachable", async () => {
    globalThis.fetch = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const result = await deliverToScout(payload);
    expect(result).toMatchObject({ ok: false, retryable: true });
  });

  it("retains the submission for retry when the secret is not configured yet", async () => {
    delete process.env["WEBSITE_INTAKE_SECRET"];
    const result = await deliverToScout(payload);
    expect(result).toMatchObject({ ok: false, retryable: true, error: "scout_not_configured" });
  });

  it("retries 429 and 5xx but not other 4xx", async () => {
    globalThis.fetch = (async () => new Response("slow down", { status: 429 })) as unknown as typeof fetch;
    expect(await deliverToScout(payload)).toMatchObject({ ok: false, retryable: true });
    globalThis.fetch = (async () => new Response("bad", { status: 400 })) as unknown as typeof fetch;
    expect(await deliverToScout(payload)).toMatchObject({ ok: false, retryable: false });
  });

  it("carries no roadmap, project or client creation intent", () => {
    const body = toCoreIntakeBody(payload) as unknown as Record<string, unknown>;
    expect(Object.keys(body)).not.toContain("project");
    expect(Object.keys(body)).not.toContain("roadmap");
    expect(Object.keys(body)).not.toContain("milestones");
  });
});

describe("event contract", () => {
  it("wraps events under a website source with stable keys and flat utm", () => {
    const body = toCoreEventsBody([
      {
        event_key: "sess_1:intake_answered:future_day",
        event_name: "intake_answered",
        occurred_at: "2026-01-01T00:00:00.000Z",
        session_id: "sess_1",
        submission_id: null,
        path: "/build-my-roadmap",
        referrer: null,
        utm_source: null,
        utm_medium: null,
        utm_campaign: null,
        utm_term: null,
        utm_content: null,
        device: "desktop",
        properties: { question_id: "future_day", modality: "text" },
      },
    ]);
    expect(body.source_app).toBe("website");
    expect(body.events[0]!.event_key).toBe("sess_1:intake_answered:future_day");
    expect(body.events[0]!).not.toHaveProperty("utm");
    expect(body.events[0]!.properties["question_id"]).toBe("future_day");
  });
});

