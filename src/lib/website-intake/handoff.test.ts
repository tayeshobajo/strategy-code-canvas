import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deliverToScout, type ScoutSubmission } from "./scout.server";
import { EMPTY_STRUCTURED } from "./types";
import { EMPTY_ATTRIBUTION } from "./attribution";

const payload: ScoutSubmission = {
  source_app: "website",
  source_channel: "website",
  source_type: "roadmap_intake",
  submission_id: "11111111-1111-1111-1111-111111111111",
  submitted_at: "2026-01-01T00:00:00.000Z",
  started_at: "2026-01-01T00:00:00.000Z",
  attribution: EMPTY_ATTRIBUTION,
  person: { name: "Jane", email: "jane@example.com", phone: null, role: null },
  company: { name: null, website: null },
  verbatim: [],
  structured: EMPTY_STRUCTURED,
  signals: { frame: "roadmap", frame_confidence: 0.5, objective_coverage: 0.8, completeness: 0.9 },
  consent: { contact_ok: true, marketing_ok: false, agreed_at: null },
};

describe("scout handoff", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    process.env["SCOUT_INTAKE_ENDPOINT"] = "https://os.example.com/scout/intake";
    process.env["SCOUT_WEBHOOK_SECRET"] = "test-secret";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env["SCOUT_INTAKE_ENDPOINT"];
    delete process.env["SCOUT_WEBHOOK_SECRET"];
    vi.restoreAllMocks();
  });

  it("signs the request and keys it by submission id", async () => {
    const spy = vi.fn(async (_input: unknown, _init?: unknown) => new Response("ok", { status: 200 }));
    globalThis.fetch = spy as unknown as typeof fetch;

    const result = await deliverToScout(payload);
    expect(result.ok).toBe(true);

    const init = spy.mock.calls[0]![1] as unknown as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["idempotency-key"]).toBe(payload.submission_id);
    expect(headers["x-trusttai-signature"]).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(headers["x-trusttai-timestamp"]).toMatch(/^\d+$/);
    // Never a Supabase key as authentication.
    expect(JSON.stringify(headers)).not.toMatch(/sb_publishable|apikey/i);
  });

  it("retains the submission for retry when Scout is unreachable", async () => {
    globalThis.fetch = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const result = await deliverToScout(payload);
    expect(result).toMatchObject({ ok: false, retryable: true });
  });

  it("retains the submission for retry when Scout is not configured yet", async () => {
    delete process.env["SCOUT_INTAKE_ENDPOINT"];
    const result = await deliverToScout(payload);
    expect(result).toMatchObject({ ok: false, retryable: true, error: "scout_not_configured" });
  });

  it("does not retry a rejected payload", async () => {
    globalThis.fetch = (async () => new Response("bad", { status: 400 })) as unknown as typeof fetch;
    const result = await deliverToScout(payload);
    expect(result).toMatchObject({ ok: false, retryable: false });
  });

  it("carries no roadmap, project or client creation intent", () => {
    const keys = Object.keys(payload);
    expect(keys).not.toContain("project");
    expect(keys).not.toContain("roadmap");
    expect(keys).not.toContain("milestones");
  });
});
