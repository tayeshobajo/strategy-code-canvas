/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * AI Product Manager — draft milestone briefs and acceptance criteria for
 * every milestone missing them so the Work tab can open. Never overwrites
 * existing content; only fills gaps and marks the criteria approved.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasRoleForEmail } from "@/lib/ops/access";

const input = z.object({ projectId: z.string().uuid() });

type Sb = any;

function toList(v: unknown): Array<{ text: string; done?: boolean }> {
  if (!Array.isArray(v)) return [];
  return v
    .map((item) => {
      if (typeof item === "string") return { text: item, done: false };
      if (item && typeof item === "object") {
        const r = item as Record<string, unknown>;
        const text = typeof r.text === "string" ? r.text : typeof r.label === "string" ? (r.label as string) : "";
        return { text, done: Boolean(r.done) };
      }
      return { text: "", done: false };
    })
    .filter((x) => x.text.trim().length > 0);
}

/**
 * Fast path: writes deterministic baseline briefs + acceptance criteria +
 * approval for every milestone that needs them. Contains NO AI calls, so
 * it returns in a few hundred milliseconds and the Work page can open
 * immediately after the client invalidates its query. AI polish happens
 * separately via `enrichMilestoneAcceptanceCriteria` below.
 */
export const draftMilestoneAcceptanceCriteria = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => input.parse(raw))
  .handler(async ({ context, data }) => {
    const sb: Sb = (context as any).supabase;
    const email = ((context as any).claims?.email as string | undefined) ?? undefined;
    const isAdmin = await hasRoleForEmail(sb, email, "admin");
    if (!isAdmin) throw new Error("Forbidden: admin role required");
    const actorEmail = email ?? null;

    const { data: project, error: projectErr } = await sb
      .from("engine_projects")
      .select("id,name")
      .eq("id", data.projectId)
      .single();
    if (projectErr || !project) throw new Error(projectErr?.message ?? "Project not found");

    const { data: msRows, error: msErr } = await sb
      .from("engine_milestones")
      .select("id,name,phase,status,approval_status,sort_index,brief_md,acceptance_criteria")
      .eq("project_id", data.projectId)
      .order("sort_index", { ascending: true });
    if (msErr) throw new Error(msErr.message);
    const milestones = (msRows ?? []) as Array<{
      id: string;
      name: string;
      status: string | null;
      approval_status: string | null;
      brief_md: string | null;
      acceptance_criteria: unknown;
    }>;

    const targets = milestones
      .filter((m) => (m.status ?? "").toLowerCase() !== "cancelled" && (m.status ?? "").toLowerCase() !== "dropped")
      .filter((m) => {
        const needsBrief = !m.brief_md || m.brief_md.trim().length < 20;
        const needsCriteria = toList(m.acceptance_criteria).length < 3;
        const needsApproval = (m.approval_status ?? "") !== "approved";
        return needsBrief || needsCriteria || needsApproval;
      });

    if (targets.length === 0) {
      return { ok: true as const, drafted: 0, approved: 0, needs_enrichment: false };
    }

    const now = new Date().toISOString();
    let drafted = 0;
    let approved = 0;

    for (const m of targets) {
      const existingAcc = toList(m.acceptance_criteria);
      const seen = new Set(existingAcc.map((a) => a.text));
      const baselineAcc = [...existingAcc];
      const filler = [
        `Confirm ${m.name} meets the intake-defined outcome.`,
        "Evidence attached against every acceptance item.",
        "Owner and reviewer sign-off recorded.",
      ];
      for (const t of filler) {
        if (baselineAcc.length >= 3) break;
        if (!seen.has(t)) {
          seen.add(t);
          baselineAcc.push({ text: t, done: false });
        }
      }

      const baselineBrief =
        m.brief_md && m.brief_md.trim().length >= 20
          ? m.brief_md
          : `Draft for review: ${m.name} sequences the work needed to move from Point A to Point B for ${project.name}. Confirm scope and owners before starting.`;

      const patch: Record<string, unknown> = {
        brief_md: baselineBrief,
        acceptance_criteria: baselineAcc,
      };
      const needsApproval = (m.approval_status ?? "") !== "approved";
      if (needsApproval) {
        patch.approval_status = "approved";
        patch.approved_by_email = actorEmail;
        patch.approved_at = now;
      }
      const { error } = await sb.from("engine_milestones").update(patch).eq("id", m.id);
      if (!error) {
        drafted++;
        if (needsApproval) approved++;
      }
    }

    await sb.from("engine_activity").insert({
      project_id: data.projectId,
      kind: "milestone_ai_draft",
      title: `AI Product Manager drafted acceptance criteria on ${drafted} milestone${drafted === 1 ? "" : "s"}`,
      body: `${approved} milestone${approved === 1 ? "" : "s"} auto-approved so Work can open. AI polish runs next.`,
      severity: "info",
      actor_email: actorEmail,
    });

    return { ok: true as const, drafted, approved, needs_enrichment: true };
  });

/**
 * Slow path: AI polish. Refines briefs + acceptance criteria in place for
 * milestones that still look like the baseline filler. Safe to fire in the
 * background from the client after the fast path resolves — any failure
 * (timeout, JSON parse, rate limit) leaves the deterministic defaults intact.
 */
export const enrichMilestoneAcceptanceCriteria = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => input.parse(raw))
  .handler(async ({ context, data }) => {
    const sb: Sb = (context as any).supabase;
    const email = ((context as any).claims?.email as string | undefined) ?? undefined;
    const isAdmin = await hasRoleForEmail(sb, email, "admin");
    if (!isAdmin) throw new Error("Forbidden: admin role required");

    const { data: project } = await sb
      .from("engine_projects")
      .select("id,name,point_a,point_b,blueprint,gap_map,hidden_assets,sequencing")
      .eq("id", data.projectId)
      .single();
    if (!project) return { ok: true as const, enriched: 0 };

    const { data: msRows } = await sb
      .from("engine_milestones")
      .select("id,name,phase,brief_md,acceptance_criteria,status")
      .eq("project_id", data.projectId)
      .order("sort_index", { ascending: true });

    const milestones = ((msRows ?? []) as Array<{
      id: string;
      name: string;
      phase: string | null;
      brief_md: string | null;
      acceptance_criteria: unknown;
      status: string | null;
    }>).filter((m) => (m.status ?? "").toLowerCase() !== "cancelled" && (m.status ?? "").toLowerCase() !== "dropped");

    // Only enrich milestones whose current brief/criteria still look like the
    // baseline "Draft for review:" filler.
    const targets = milestones.filter((m) => {
      const briefIsFiller = !m.brief_md || m.brief_md.trim().startsWith("Draft for review:");
      const accTexts = toList(m.acceptance_criteria).map((a) => a.text);
      const accIsFiller = accTexts.some((t) => t.startsWith("Confirm ") && t.endsWith("meets the intake-defined outcome."));
      return briefIsFiller || accIsFiller;
    });
    if (targets.length === 0) return { ok: true as const, enriched: 0 };

    let enriched = 0;
    try {
      const { callLovableAiWithFallback, parseJsonOutput } = await import(
        "@/lib/engine-ai.server"
      );
      const ctx = {
        project: { name: project.name },
        point_a: project.point_a ?? null,
        point_b: project.point_b ?? null,
        blueprint: project.blueprint ?? null,
        gap_map: project.gap_map ?? null,
        hidden_assets: project.hidden_assets ?? null,
        sequencing: project.sequencing ?? null,
      };
      const asked = targets.map((m) => ({
        id: m.id,
        name: m.name,
        phase: m.phase,
        existing_brief: m.brief_md ?? "",
        existing_acceptance: toList(m.acceptance_criteria).map((a) => a.text),
      }));
      const ai = await callLovableAiWithFallback(
        [
          {
            role: "system",
            content:
              "You are the Trust Tai AI Product Manager. Draft crisp acceptance criteria and short briefs for milestones. Ground each in the Point A / Point B / blueprint context. Every criterion must be observable and testable. No em dashes, no exclamation points. Return strict JSON only.",
          },
          {
            role: "user",
            content: `For each milestone below, produce:
- brief: one short paragraph (60 to 140 words).
- acceptance: 3 to 5 observable, testable criteria that a reviewer could check.

Return JSON only:
{"milestones":[{"id":"","brief":"","acceptance":["",""]}]}

CONTEXT:
${JSON.stringify(ctx).slice(0, 20_000)}

MILESTONES:
${JSON.stringify(asked).slice(0, 25_000)}`,
          },
        ],
        { json: true, temperature: 0.2, maxRetriesPerModel: 1 },
      );
      const parsed = parseJsonOutput<{
        milestones?: Array<{ id?: string; brief?: string; acceptance?: unknown }>;
      }>(ai.text) ?? {};
      for (const row of parsed.milestones ?? []) {
        if (!row?.id) continue;
        const brief = typeof row.brief === "string" ? row.brief.trim() : "";
        const acc = Array.isArray(row.acceptance)
          ? row.acceptance
              .map((a) => (typeof a === "string" ? a.trim() : ""))
              .filter((s) => s.length > 0)
              .slice(0, 6)
              .map((text) => ({ text, done: false }))
          : [];
        const patch: Record<string, unknown> = {};
        if (brief.length >= 20) patch.brief_md = brief;
        if (acc.length >= 3) patch.acceptance_criteria = acc;
        if (Object.keys(patch).length === 0) continue;
        const { error } = await sb.from("engine_milestones").update(patch).eq("id", row.id);
        if (!error) enriched++;
      }
    } catch {
      // Baseline defaults remain; caller ignores errors here.
    }

    return { ok: true as const, enriched };
  });

