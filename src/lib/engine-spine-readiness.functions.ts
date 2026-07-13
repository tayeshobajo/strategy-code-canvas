/* eslint-disable @typescript-eslint/no-explicit-any */
// Phase 4B — Spine approval readiness helper.
// Thin wrapper around public.spine_points_approved() so the Engines UI
// can render missing keys and disable "Approve" when ready=false.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Sb = any;

export type SpineReadiness = {
  ready: boolean;
  point_a: { required: string[]; missing: string[]; approved: boolean };
  point_b: { required: string[]; missing: string[]; approved: boolean };
  has_active_contradictions: boolean;
};

export const getSpineReadiness = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = (context as { supabase: Sb }).supabase;
    const { data: row, error } = await supabase.rpc("spine_points_approved", {
      _project_id: data.projectId,
    });
    if (error) throw new Error(error.message);
    return { readiness: (row ?? null) as SpineReadiness | null };
  });
