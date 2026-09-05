/**
 * Locked payload contract for the Trust Tai publishing seam.
 *
 * Pure functions only: no environment access, no database access. This module
 * is imported by the server route handler and by tests.
 */

import type { Insight, InsightCategory } from "@/lib/insights-data";

export const CANONICAL_SITE_ORIGIN = "https://trusttai.com";

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type PublishImage = { url: string | null; alt: string };

export type PublishPayload = {
  idempotency_key: string;
  slug: string;
  title: string;
  seo_title: string;
  meta_description: string;
  body_markdown: string;
  category: string;
  tags: string[];
  image: PublishImage;
};

export type ValidationResult =
  | { ok: true; value: PublishPayload }
  | { ok: false; error: string };

function isNonEmptyString(v: unknown, max: number): v is string {
  return typeof v === "string" && v.trim().length > 0 && v.length <= max;
}

export function isSafeSlug(slug: unknown): slug is string {
  return (
    typeof slug === "string" &&
    slug.length > 0 &&
    slug.length <= 120 &&
    SLUG_PATTERN.test(slug)
  );
}

export function validatePublishPayload(input: unknown): ValidationResult {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "Body must be a JSON object" };
  }
  const b = input as Record<string, unknown>;

  if (!isNonEmptyString(b["idempotency_key"], 200)) {
    return { ok: false, error: "idempotency_key is required" };
  }
  if (!isSafeSlug(b["slug"])) {
    return { ok: false, error: "slug must be a safe canonical slug" };
  }
  for (const field of ["title", "seo_title", "meta_description", "body_markdown", "category"]) {
    if (!isNonEmptyString(b[field], 200_000)) {
      return { ok: false, error: `${field} is required` };
    }
  }
  if (
    !Array.isArray(b["tags"]) ||
    b["tags"].some((t) => typeof t !== "string" || t.trim().length === 0 || t.length > 80)
  ) {
    return { ok: false, error: "tags must be an array of non-empty strings" };
  }
  const image = b["image"];
  if (image === null || typeof image !== "object" || Array.isArray(image)) {
    return { ok: false, error: "image is required" };
  }
  const img = image as Record<string, unknown>;
  const url = img["url"];
  if (!(url === null || (typeof url === "string" && /^https:\/\/\S+$/.test(url)))) {
    return { ok: false, error: "image.url must be an https URL or null" };
  }
  if (typeof img["alt"] !== "string") {
    return { ok: false, error: "image.alt must be a string" };
  }

  return {
    ok: true,
    value: {
      idempotency_key: b["idempotency_key"] as string,
      slug: b["slug"] as string,
      title: b["title"] as string,
      seo_title: b["seo_title"] as string,
      meta_description: b["meta_description"] as string,
      body_markdown: b["body_markdown"] as string,
      category: b["category"] as string,
      tags: b["tags"] as string[],
      image: { url: (url as string | null) ?? null, alt: img["alt"] as string },
    },
  };
}

export function canonicalInsightUrl(slug: string): string {
  return `${CANONICAL_SITE_ORIGIN}/insights/${slug}`;
}

/* ----------------------------- public projection ---------------------------- */

export type PublishedInsightRow = {
  id: string;
  slug: string;
  title: string;
  seo_title: string;
  meta_description: string;
  body_markdown: string;
  category: string;
  tags: string[];
  image_url: string | null;
  image_alt: string | null;
  published_at: string;
};

const KNOWN_CATEGORIES = [
  "Systems",
  "The Founder Trap",
  "The Intelligence Layer",
  "Operational Debt",
  "Spirit First",
  "Field Notes",
] as const;

export function normalizeCategory(value: string): InsightCategory {
  const hit = KNOWN_CATEGORIES.find((c) => c.toLowerCase() === value.trim().toLowerCase());
  return (hit ?? "Field Notes") as InsightCategory;
}

export function estimateReadMinutes(markdown: string): number {
  const words = markdown.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

/** Maps a stored row onto the shape the existing Insights UI already renders. */
export function toPublicInsight(row: PublishedInsightRow): Insight & { markdown: string } {
  const minutes = estimateReadMinutes(row.body_markdown);
  const published = new Date(row.published_at);
  const date = Number.isNaN(published.getTime())
    ? ""
    : published.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  return {
    slug: row.slug,
    category: normalizeCategory(row.category),
    title: row.title,
    blurb: row.meta_description,
    read: `${minutes} min read`,
    readMinutes: minutes,
    date,
    publishedAt: Number.isNaN(published.getTime())
      ? row.published_at
      : published.toISOString().slice(0, 10),
    body: [],
    markdown: row.body_markdown,
  };
}
