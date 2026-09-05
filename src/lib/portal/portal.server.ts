/**
 * Server-only portal logic: who may see which roadmap, and delivery of
 * portal questions to Trust Tai Core.
 */

import { CORE_INTAKE_ENDPOINT } from "@/lib/website-intake/core-contract";
import { postSigned } from "@/lib/website-intake/core-client.server";
import { CLIENT_ROADMAPS, findRoadmap } from "@/lib/client-roadmaps/registry";

export type PortalRoadmap = {
  slug: string;
  to: string;
  client: string;
  headline: string;
  summary: string;
  cover: string;
};

/** Roadmaps this email has been granted. Reads through the caller's RLS. */
export async function roadmapsForEmail(
  supabase: {
    from: (t: string) => {
      select: (c: string) => Promise<{ data: { roadmap_slug: string }[] | null; error: unknown }>;
    };
  },
): Promise<PortalRoadmap[]> {
  const { data } = await supabase.from("client_roadmap_access").select("roadmap_slug");
  const slugs = new Set((data ?? []).map((r) => r.roadmap_slug));
  return CLIENT_ROADMAPS.filter((r) => slugs.has(r.slug)).map((r) => ({
    slug: r.slug,
    to: r.to,
    client: r.client,
    headline: r.headline,
    summary: r.summary,
    cover: r.cover,
  }));
}

export async function recordAndDeliverQuestion(input: {
  userId: string;
  email: string;
  roadmapSlug: string | null;
  subject: string;
  body: string;
}): Promise<{ id: string; delivered: boolean }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const slug = input.roadmapSlug && findRoadmap(input.roadmapSlug) ? input.roadmapSlug : null;

  const { data, error } = await supabaseAdmin
    .from("portal_questions")
    .insert({
      user_id: input.userId,
      email: input.email,
      roadmap_slug: slug,
      subject: input.subject,
      body: input.body,
    })
    .select("id")
    .single();

  if (error || !data) throw new Error("could not save your question");
  const id = data.id as string;

  const result = await postSigned({
    endpoint: process.env["CORE_INTAKE_ENDPOINT"] || CORE_INTAKE_ENDPOINT,
    idempotencyKey: id,
    body: {
      source_app: "website",
      source_channel: "website",
      source_type: "portal_question",
      submission_id: id,
      submitted_at: new Date().toISOString(),
      person: { name: null, email: input.email, phone: null, role: null },
      company: { name: null, website: null },
      roadmap_slug: slug,
      question: { subject: input.subject, body: input.body },
    },
  });

  await supabaseAdmin
    .from("portal_questions")
    .update(
      result.ok
        ? { core_status: "delivered", core_delivered_at: new Date().toISOString() }
        : { core_status: result.retryable ? "pending" : "failed", core_error: result.error },
    )
    .eq("id", id);

  return { id, delivered: result.ok };
}
