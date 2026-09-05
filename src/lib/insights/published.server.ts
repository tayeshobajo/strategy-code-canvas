/**
 * Server-only access to the published_insights table.
 *
 * Runtime access uses the existing service-role client; the table itself has
 * RLS enabled with no anon/authenticated grants.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { PublishPayload } from "./publish-contract";
import type { PublishStore, InsertOutcome, StoredInsight } from "./publish-handler";
import { toPublicInsight, type PublishedInsightRow } from "./publish-contract";

const TABLE = "published_insights";

const SELECT_PUBLIC =
  "id, slug, title, seo_title, meta_description, body_markdown, category, tags, image_url, image_alt, published_at";

async function db(): Promise<SupabaseClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // The generated Database type does not yet include this table.
  return supabaseAdmin as unknown as SupabaseClient;
}

export function createPublishStore(): PublishStore {
  return {
    async findByIdempotencyKey(key) {
      const client = await db();
      const { data, error } = await client
        .from(TABLE)
        .select("id, slug, idempotency_key, published_at")
        .eq("idempotency_key", key)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as StoredInsight | null) ?? null;
    },
    async findBySlug(slug) {
      const client = await db();
      const { data, error } = await client
        .from(TABLE)
        .select("id, slug, idempotency_key, published_at")
        .eq("slug", slug)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as StoredInsight | null) ?? null;
    },
    async insert(payload: PublishPayload): Promise<InsertOutcome> {
      const client = await db();
      const { data, error } = await client
        .from(TABLE)
        .insert({
          idempotency_key: payload.idempotency_key,
          slug: payload.slug,
          title: payload.title,
          seo_title: payload.seo_title,
          meta_description: payload.meta_description,
          body_markdown: payload.body_markdown,
          category: payload.category,
          tags: payload.tags,
          image_url: payload.image.url,
          image_alt: payload.image.alt,
        })
        .select("id, slug, idempotency_key, published_at")
        .single();
      if (error) {
        if (error.code === "23505") return { status: "conflict" };
        throw new Error(error.message);
      }
      return { status: "inserted", row: data as StoredInsight };
    },
  };
}

export async function listPublishedInsightsServer() {
  const client = await db();
  const { data, error } = await client
    .from(TABLE)
    .select(SELECT_PUBLIC)
    .order("published_at", { ascending: false });
  if (error) {
    console.error("[insights] list published failed", error.message);
    return [];
  }
  return ((data ?? []) as unknown as PublishedInsightRow[]).map(toPublicInsight);
}

export async function getPublishedInsightServer(slug: string) {
  const client = await db();
  const { data, error } = await client
    .from(TABLE)
    .select(SELECT_PUBLIC)
    .eq("slug", slug)
    .maybeSingle();
  if (error) {
    console.error("[insights] get published failed", error.message);
    return null;
  }
  if (!data) return null;
  return toPublicInsight(data as unknown as PublishedInsightRow);
}
