import { describe, expect, it } from "vitest";

import { handlePublish, type PublishStore, type StoredInsight } from "./publish-handler";
import { toPublicInsight, validatePublishPayload } from "./publish-contract";

const TOKEN = "test-token-value";

function payload(overrides: Record<string, unknown> = {}) {
  return {
    idempotency_key: "key-001",
    slug: "the-founder-trap",
    title: "The founder trap",
    seo_title: "The founder trap | Trust Tai",
    meta_description: "Why the business cannot outgrow the founder's calendar.",
    body_markdown: "## Heading\n\nSome body text.",
    category: "The Founder Trap",
    tags: ["systems", "founders"],
    image: { url: null, alt: "" },
    ...overrides,
  };
}

function request(body: unknown, opts: { token?: string | null; key?: string | null } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const token = opts.token === undefined ? TOKEN : opts.token;
  if (token) headers["authorization"] = `Bearer ${token}`;
  const key =
    opts.key === undefined
      ? ((body as Record<string, unknown>)?.["idempotency_key"] as string | undefined)
      : opts.key;
  if (key) headers["idempotency-key"] = key;
  return new Request("https://trusttai.com/api/trust-tai/publish", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function memoryStore() {
  const rows: StoredInsight[] = [];
  let n = 0;
  const store: PublishStore = {
    async findByIdempotencyKey(key) {
      return rows.find((r) => r.idempotency_key === key) ?? null;
    },
    async findBySlug(slug) {
      return rows.find((r) => r.slug === slug) ?? null;
    },
    async insert(p) {
      if (rows.some((r) => r.slug === p.slug || r.idempotency_key === p.idempotency_key)) {
        return { status: "conflict" };
      }
      n += 1;
      const row: StoredInsight = {
        id: `00000000-0000-4000-8000-00000000000${n}`,
        slug: p.slug,
        idempotency_key: p.idempotency_key,
        published_at: "2026-09-06T10:00:00.000Z",
      };
      rows.push(row);
      return { status: "inserted", row };
    },
  };
  return { store, rows };
}

describe("publish endpoint", () => {
  it("fails closed when the secret is absent", async () => {
    const { store } = memoryStore();
    const res = await handlePublish(request(payload()), { token: undefined, store });
    expect(res.status).toBe(503);
  });

  it("rejects missing or wrong auth", async () => {
    const { store } = memoryStore();
    expect(
      (await handlePublish(request(payload(), { token: null }), { token: TOKEN, store })).status,
    ).toBe(401);
    expect(
      (await handlePublish(request(payload(), { token: "nope" }), { token: TOKEN, store })).status,
    ).toBe(401);
  });

  it("rejects malformed bodies", async () => {
    const { store } = memoryStore();
    const bad = await handlePublish(request(payload({ slug: "Not A Slug" }), { key: "key-001" }), {
      token: TOKEN,
      store,
    });
    expect(bad.status).toBe(400);
    const missing = await handlePublish(request({ slug: "ok-slug" }, { key: "key-001" }), {
      token: TOKEN,
      store,
    });
    expect(missing.status).toBe(400);
  });

  it("rejects an idempotency header that does not match the body", async () => {
    const { store } = memoryStore();
    const res = await handlePublish(request(payload(), { key: "other-key" }), {
      token: TOKEN,
      store,
    });
    expect(res.status).toBe(400);
  });

  it("creates one row and returns a canonical receipt", async () => {
    const { store, rows } = memoryStore();
    const res = await handlePublish(request(payload()), { token: TOKEN, store });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { url: string; id: string; published_at: string };
    expect(body.url).toBe("https://trusttai.com/insights/the-founder-trap");
    expect(rows).toHaveLength(1);
  });

  it("replays the same receipt without creating a duplicate", async () => {
    const { store, rows } = memoryStore();
    const first = await (await handlePublish(request(payload()), { token: TOKEN, store })).json();
    const second = await (await handlePublish(request(payload()), { token: TOKEN, store })).json();
    expect(second).toEqual(first);
    expect(rows).toHaveLength(1);
  });

  it("returns 409 when the same key is replayed with a different slug", async () => {
    const { store, rows } = memoryStore();
    await handlePublish(request(payload()), { token: TOKEN, store });
    const res = await handlePublish(request(payload({ slug: "different-slug" })), {
      token: TOKEN,
      store,
    });
    expect(res.status).toBe(409);
    expect(rows).toHaveLength(1);
  });

  it("returns 409 when the slug is owned by another key", async () => {
    const { store, rows } = memoryStore();
    await handlePublish(request(payload()), { token: TOKEN, store });
    const res = await handlePublish(request(payload({ idempotency_key: "key-002" })), {
      token: TOKEN,
      store,
    });
    expect(res.status).toBe(409);
    expect(rows).toHaveLength(1);
  });
});

describe("public projection", () => {
  it("maps a stored row onto the insight shape the site renders", () => {
    const insight = toPublicInsight({
      id: "id-1",
      slug: "the-founder-trap",
      title: "The founder trap",
      seo_title: "seo",
      meta_description: "blurb text",
      body_markdown: "word ".repeat(440),
      category: "the founder trap",
      tags: [],
      image_url: null,
      image_alt: null,
      published_at: "2026-09-06T10:00:00.000Z",
    });
    expect(insight.slug).toBe("the-founder-trap");
    expect(insight.category).toBe("The Founder Trap");
    expect(insight.blurb).toBe("blurb text");
    expect(insight.publishedAt).toBe("2026-09-06");
    expect(insight.readMinutes).toBe(2);
  });

  it("accepts a valid payload contract", () => {
    expect(validatePublishPayload(payload()).ok).toBe(true);
  });
});
