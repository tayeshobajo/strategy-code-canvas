/**
 * Transport-agnostic handler for POST /api/trust-tai/publish.
 *
 * The store is injected so the semantics can be tested without touching the
 * production database. Never logs or echoes the bearer token.
 */

import {
  canonicalInsightUrl,
  validatePublishPayload,
  type PublishPayload,
} from "./publish-contract";

export type StoredInsight = {
  id: string;
  slug: string;
  idempotency_key: string;
  published_at: string;
};

export type InsertOutcome =
  | { status: "inserted"; row: StoredInsight }
  | { status: "conflict" };

export type PublishStore = {
  findByIdempotencyKey(key: string): Promise<StoredInsight | null>;
  findBySlug(slug: string): Promise<StoredInsight | null>;
  insert(payload: PublishPayload): Promise<InsertOutcome>;
};

export type PublishDeps = {
  token: string | undefined;
  store: PublishStore;
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function receipt(row: StoredInsight): Response {
  return json(
    { url: canonicalInsightUrl(row.slug), id: row.id, published_at: row.published_at },
    200,
  );
}

function safeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function handlePublish(
  request: Request,
  deps: PublishDeps,
): Promise<Response> {
  const expected = deps.token;
  if (!expected) {
    // Fail closed when the runtime secret is not configured.
    return json({ error: "Publishing is not configured" }, 503);
  }

  const auth = request.headers.get("authorization") ?? "";
  const provided = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!provided || !safeEquals(provided, expected)) {
    return json({ error: "Unauthorized" }, 401);
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = validatePublishPayload(raw);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const payload = parsed.value;

  const headerKey = request.headers.get("idempotency-key");
  if (!headerKey || headerKey !== payload.idempotency_key) {
    return json({ error: "idempotency-key header must match body idempotency_key" }, 400);
  }

  const existing = await deps.store.findByIdempotencyKey(payload.idempotency_key);
  if (existing) {
    if (existing.slug !== payload.slug) {
      return json({ error: "idempotency_key already used with a different slug" }, 409);
    }
    return receipt(existing);
  }

  const slugOwner = await deps.store.findBySlug(payload.slug);
  if (slugOwner) {
    return json({ error: "slug already published under a different idempotency_key" }, 409);
  }

  const outcome = await deps.store.insert(payload);
  if (outcome.status === "inserted") return receipt(outcome.row);

  // Concurrent duplicate: resolve by reading the winning row.
  const winner = await deps.store.findByIdempotencyKey(payload.idempotency_key);
  if (winner) {
    if (winner.slug !== payload.slug) {
      return json({ error: "idempotency_key already used with a different slug" }, 409);
    }
    return receipt(winner);
  }
  return json({ error: "slug already published under a different idempotency_key" }, 409);
}
