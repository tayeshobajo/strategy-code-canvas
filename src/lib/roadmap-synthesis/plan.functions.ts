/**
 * Phase RT-1 — Server functions (thin adapters over orchestrator).
 *
 * Split from helpers per tanstack-serverfn-splitting. Handlers only
 * reference imports and handler-local declarations.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasRoleForEmail } from "@/lib/ops/access";
import { SYNTHESIS_STEP_IDS } from "./registry";
import { deriveSynthesisPlan } from "./plan.server";
import { runSynthesis } from "./orchestrator.server";
import type { FillMode, SynthesisStepId } from "./contract";

const stepIdSchema = z.enum(SYNTHESIS_STEP_IDS as unknown as [SynthesisStepId, ...SynthesisStepId[]]);

const planInput = z.object({ projectId: z.string().uuid() });

export const getRoadmapSynthesisPlan = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => planInput.parse(raw))
  .handler(async ({ context, data }) => {
    const sb = (context as { supabase: unknown }).supabase as any;
    const email = ((context as { claims?: { email?: string } }).claims?.email) ?? undefined;
    const isAdmin = await hasRoleForEmail(sb, email, "admin");
    if (!isAdmin) throw new Error("Forbidden: admin role required");
    return deriveSynthesisPlan({ projectId: data.projectId, supabase: sb });
  });

const runInput = z.object({
  projectId: z.string().uuid(),
  mode: z.enum(["repair", "refresh", "rebuild_draft"]),
  stepIds: z.array(stepIdSchema).optional(),
});

export const runRoadmapSynthesis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => runInput.parse(raw))
  .handler(async ({ context, data }) => {
    const sb = (context as { supabase: unknown }).supabase as any;
    const claims = (context as { claims?: { email?: string } }).claims;
    const email = claims?.email;
    const isAdmin = await hasRoleForEmail(sb, email, "admin");
    if (!isAdmin) throw new Error("Forbidden: admin role required");
    return runSynthesis({
      projectId: data.projectId,
      supabase: sb,
      actorEmail: email ?? null,
      mode: data.mode as FillMode,
      stepIds: data.stepIds,
    });
  });

const candidateInput = z.object({
  candidateId: z.string(),
  decision: z.enum([
    "approve",
    "reject",
    "request_revision",
    "accept_as_supporting",
    "defer",
    "amend_roadmap",
  ]),
  reason: z.string().max(2_000).optional(),
});

/**
 * RT-1 stub. Human promotion ships in RT-4/RT-5. `defer` is honored
 * (writes state); other decisions return not_implemented.
 */
export const reviewSynthesisCandidate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => candidateInput.parse(raw))
  .handler(async ({ context, data }) => {
    const sb = (context as { supabase: unknown }).supabase as any;
    const email = ((context as { claims?: { email?: string } }).claims?.email) ?? undefined;
    const isAdmin = await hasRoleForEmail(sb, email, "admin");
    if (!isAdmin) throw new Error("Forbidden: admin role required");
    if (data.decision === "defer") {
      try {
        await sb
          .from("engine_project_synthesis_step_state")
          .update({
            state: "awaiting_review",
            reason: "candidate_waiting_review",
            updated_at: new Date().toISOString(),
          })
          .eq("latest_candidate_id", data.candidateId);
      } catch {
        /* persistence pending migration */
      }
      return { status: "deferred" as const };
    }
    return { status: "not_implemented" as const, reason: "Ships in RT-4/RT-5" };
  });
