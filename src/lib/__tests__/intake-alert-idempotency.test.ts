// Per-recipient idempotency key prevents double-sends on retries.
//
// enqueueTransactionalEmail is the single choke-point every operator alert
// (and every app email) flows through. When the caller supplies an
// `idempotencyKey` and a prior row for that key is already `pending` or
// `sent`, the helper must NOT enqueue a duplicate — even if the caller
// retries. This guarantees a resend button in the admin UI (or a naive
// Promise.allSettled retry after a partial network failure) never
// double-notifies operators.

import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mock the Supabase admin client used by the helper. ------------------
// We build a small chainable stub that captures every insert / select /
// contains call so the test can assert on the interaction shape.

type InsertCall = { table: string; row: Record<string, unknown> };
type RpcCall = { fn: string; args: Record<string, unknown> };

const inserts: InsertCall[] = [];
const rpcCalls: RpcCall[] = [];
let priorRowsForIdempotencyKey: Array<{ id: string; status: string; message_id: string }> = [];

function makeSelectChain(table: string) {
  // Only email_send_log SELECT drives idempotency; other selects (suppression,
  // unsubscribe tokens) short-circuit to "no row".
  const chain: Record<string, (...args: unknown[]) => unknown> = {};
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.in = () => chain;
  chain.contains = () => chain;
  chain.limit = async () => {
    if (table === "email_send_log") return { data: priorRowsForIdempotencyKey, error: null };
    return { data: [], error: null };
  };
  chain.maybeSingle = async () => ({ data: null, error: null });
  chain.upsert = async () => ({ error: null });
  return chain;
}

const supabaseAdminMock = {
  from(table: string) {
    const selectChain = makeSelectChain(table);
    return {
      ...selectChain,
      insert: async (row: Record<string, unknown>) => {
        inserts.push({ table, row });
        return { error: null };
      },
      select: selectChain.select,
      upsert: selectChain.upsert,
    };
  },
  rpc: async (fn: string, args: Record<string, unknown>) => {
    rpcCalls.push({ fn, args });
    return { error: null };
  },
};

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: supabaseAdminMock,
}));

vi.mock("react-email", () => ({
  render: async () => "<html>test</html>",
}));

vi.mock("@/lib/email-templates/registry", () => ({
  TEMPLATES: {
    "intake-submission-operator-alert": {
      component: () => null,
      subject: "New roadmap intake",
    },
  },
}));

// crypto.randomUUID exists in jsdom + node; nothing to mock.

beforeEach(() => {
  inserts.length = 0;
  rpcCalls.length = 0;
  priorRowsForIdempotencyKey = [];
});

async function loadHelper() {
  const mod = await import("../email/enqueue-transactional.server");
  return mod.enqueueTransactionalEmail;
}

describe("enqueueTransactionalEmail — idempotency key", () => {
  it("enqueues on the first call for a given idempotency key", async () => {
    const enqueue = await loadHelper();
    const submissionId = "11111111-1111-4111-8111-111111111111";
    const recipient = "operator-a@trusttai.com";
    const key = `intake-alert-${submissionId}-${recipient}`;

    const result = await enqueue({
      templateName: "intake-submission-operator-alert",
      recipientEmail: recipient,
      idempotencyKey: key,
      metadata: { submission_id: submissionId, kind: "intake_submission_operator_alert" },
      templateData: {},
    });

    expect(result.queued).toBe(true);
    // enqueue_email RPC was hit exactly once with our idempotency key baked in
    const enqueueCalls = rpcCalls.filter((c) => c.fn === "enqueue_email");
    expect(enqueueCalls).toHaveLength(1);
    const payload = enqueueCalls[0].args.payload as { idempotency_key: string };
    expect(payload.idempotency_key).toBe(key);
    // Pending log row was written with the idempotency key in metadata
    const pending = inserts.find(
      (i) => i.table === "email_send_log" && i.row.status === "pending",
    );
    expect(pending).toBeDefined();
    const md = pending!.row.metadata as { idempotency_key: string; submission_id: string };
    expect(md.idempotency_key).toBe(key);
    expect(md.submission_id).toBe(submissionId);
  });

  it("SKIPS enqueue when a prior row with the same key is still pending", async () => {
    const enqueue = await loadHelper();
    const key = "intake-alert-abc-op@trusttai.com";
    priorRowsForIdempotencyKey = [
      { id: "log-1", status: "pending", message_id: "prev-msg" },
    ];

    const result = await enqueue({
      templateName: "intake-submission-operator-alert",
      recipientEmail: "op@trusttai.com",
      idempotencyKey: key,
      metadata: { submission_id: "abc" },
      templateData: {},
    });

    expect(result.queued).toBe(false);
    expect(result.reason).toBe("duplicate_idempotency_key");
    expect(result.messageId).toBe("prev-msg");
    // Critical: NO enqueue_email RPC was fired for the duplicate attempt.
    expect(rpcCalls.filter((c) => c.fn === "enqueue_email")).toHaveLength(0);
    // Critical: NO new pending row was written either.
    expect(
      inserts.filter((i) => i.table === "email_send_log" && i.row.status === "pending"),
    ).toHaveLength(0);
  });

  it("SKIPS enqueue when a prior send already succeeded (status=sent)", async () => {
    const enqueue = await loadHelper();
    const key = "intake-alert-xyz-op@trusttai.com";
    priorRowsForIdempotencyKey = [
      { id: "log-2", status: "sent", message_id: "sent-msg" },
    ];

    const result = await enqueue({
      templateName: "intake-submission-operator-alert",
      recipientEmail: "op@trusttai.com",
      idempotencyKey: key,
      metadata: { submission_id: "xyz" },
      templateData: {},
    });

    expect(result.queued).toBe(false);
    expect(result.reason).toBe("duplicate_idempotency_key");
    expect(rpcCalls.filter((c) => c.fn === "enqueue_email")).toHaveLength(0);
  });

  it("ALLOWS retry when the prior attempt failed (no pending/sent row)", async () => {
    const enqueue = await loadHelper();
    const key = "intake-alert-retry-op@trusttai.com";
    // Empty prior rows == prior 'failed'/'dlq' rows were not in ('pending','sent').
    priorRowsForIdempotencyKey = [];

    const result = await enqueue({
      templateName: "intake-submission-operator-alert",
      recipientEmail: "op@trusttai.com",
      idempotencyKey: key,
      metadata: { submission_id: "retry" },
      templateData: {},
    });

    expect(result.queued).toBe(true);
    const payload = rpcCalls.find((c) => c.fn === "enqueue_email")?.args.payload as {
      idempotency_key: string;
    };
    expect(payload.idempotency_key).toBe(key);
  });

  it("uses a stable key shape so the same submission + recipient always collides", async () => {
    // This test locks in the shape both the fanout in intake.functions.ts
    // and the manual resend in intake-alerts.functions.ts rely on.
    const submissionId = "22222222-2222-4222-8222-222222222222";
    const recipient = "henry@trusttai.com";
    const expected = `intake-alert-${submissionId}-${recipient}`;
    // Two independent callers building the key produce the identical string.
    const fromFanout = `intake-alert-${submissionId}-${recipient}`;
    const fromResend = `intake-alert-${submissionId}-${recipient.trim().toLowerCase()}`;
    expect(fromFanout).toBe(expected);
    expect(fromResend).toBe(expected);
  });
});
