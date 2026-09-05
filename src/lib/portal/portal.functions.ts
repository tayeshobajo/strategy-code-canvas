import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** The signed-in client's own roadmaps. */
export const getMyRoadmaps = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { roadmapsForEmail } = await import("./portal.server");
    const email = (context.claims?.email as string | undefined) ?? null;
    const roadmaps = await roadmapsForEmail(context.supabase as never);
    return { email, roadmaps };
  });

/** The signed-in client's own submitted questions. */
export const getMyQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("portal_questions")
      .select("id, subject, body, roadmap_slug, status, core_status, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    return { questions: data ?? [] };
  });

export const submitPortalQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        roadmapSlug: z.string().max(60).nullable().default(null),
        subject: z.string().trim().min(3).max(200),
        body: z.string().trim().min(10).max(5000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const email = (context.claims?.email as string | undefined) ?? null;
    if (!email) throw new Error("no email on this account");
    const { recordAndDeliverQuestion } = await import("./portal.server");
    return recordAndDeliverQuestion({
      userId: context.userId,
      email,
      roadmapSlug: data.roadmapSlug,
      subject: data.subject,
      body: data.body,
    });
  });
