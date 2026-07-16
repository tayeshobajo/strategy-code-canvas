/* eslint-disable @typescript-eslint/no-explicit-any */
// Sprint 1 · Wave 3 — Milestone workspace read helpers.
// Auth-gated. Reads existing tables; scopes by project and best-effort
// filters rows tagged with `payload.milestone_id = milestoneId`.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Sb = any;

const scopeInput = z.object({
  projectId: z.string().uuid(),
  milestoneId: z.string().uuid(),
});

function matchesMilestone(payload: any, milestoneId: string): boolean {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;
  return (
    p.milestone_id === milestoneId ||
    p.milestoneId === milestoneId ||
    (Array.isArray(p.milestone_ids) && (p.milestone_ids as string[]).includes(milestoneId))
  );
}

export type MilestoneScopeContext = {
  milestone: { id: string; name: string; phase: string | null; status: string; approval_status: string } | null;
};

async function loadMilestone(supabase: Sb, milestoneId: string, projectId: string) {
  const { data } = await supabase
    .from("engine_milestones")
    .select("id,name,phase,status,approval_status,project_id")
    .eq("id", milestoneId)
    .eq("project_id", projectId)
    .maybeSingle();
  return data ?? null;
}

export const getMilestoneMockups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => scopeInput.parse(d))
  .handler(async ({ data, context }) => {
    const supabase = (context as { supabase: Sb }).supabase;
    const milestone = await loadMilestone(supabase, data.milestoneId, data.projectId);
    const { data: rows } = await supabase
      .from("engine_project_mockups")
      .select("id,title,summary,status,generated_by,created_by_email,approved_by_email,approved_at,created_at,updated_at,payload")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false })
      .limit(40);
    const scoped = (rows ?? []).filter((r: any) => matchesMilestone(r.payload, data.milestoneId));
    return { milestone, mockups: scoped, total_in_project: (rows ?? []).length };
  });

export const getMilestoneBuildPackets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => scopeInput.parse(d))
  .handler(async ({ data, context }) => {
    const supabase = (context as { supabase: Sb }).supabase;
    const milestone = await loadMilestone(supabase, data.milestoneId, data.projectId);
    const { data: packets } = await supabase
      .from("engine_project_build_packets")
      .select("id,title,summary,status,packet_type,sequence_number,priority,assigned_to,handed_off_at,accepted_at,rejected_reason,created_at,updated_at,payload")
      .eq("project_id", data.projectId)
      .order("sequence_number", { ascending: true })
      .limit(60);
    const scoped = (packets ?? []).filter((r: any) => matchesMilestone(r.payload, data.milestoneId));
    const packetIds = scoped.map((p: any) => p.id);
    let evidence: any[] = [];
    if (packetIds.length) {
      const { data: ev } = await supabase
        .from("engine_project_build_evidence")
        .select("id,build_packet_id,evidence_type,title,summary,created_by_email,created_at")
        .in("build_packet_id", packetIds)
        .order("created_at", { ascending: false })
        .limit(60);
      evidence = ev ?? [];
    }
    return { milestone, packets: scoped, evidence, total_in_project: (packets ?? []).length };
  });

export const getMilestoneQa = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => scopeInput.parse(d))
  .handler(async ({ data, context }) => {
    const supabase = (context as { supabase: Sb }).supabase;
    const milestone = await loadMilestone(supabase, data.milestoneId, data.projectId);
    const { data: plans } = await supabase
      .from("engine_project_qa_plans")
      .select("id,title,summary,status,generated_by,approved_by_email,approved_at,created_at,updated_at,payload")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false })
      .limit(40);
    const scopedPlans = (plans ?? []).filter((r: any) => matchesMilestone(r.payload, data.milestoneId));
    const { data: reviews } = await supabase
      .from("engine_project_qa_evidence_reviews")
      .select("id,build_packet_id,title,summary,status,verdict,approved_by_email,approved_at,rejected_reason,created_at,payload")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false })
      .limit(60);
    const scopedReviews = (reviews ?? []).filter((r: any) => matchesMilestone(r.payload, data.milestoneId));
    return {
      milestone,
      plans: scopedPlans,
      reviews: scopedReviews,
      total_plans_in_project: (plans ?? []).length,
      total_reviews_in_project: (reviews ?? []).length,
    };
  });
