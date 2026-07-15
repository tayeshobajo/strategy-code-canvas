import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasRoleForEmail } from "@/lib/ops/access";
import { callLovableAi, parseJsonOutput } from "@/lib/engine-ai.server";

export type NextBestAction = {
  action: string;
  reason: string;
  href: string | null;
  severity: "info" | "warning" | "critical";
  ai_generated?: boolean;
  confidence?: number;
};

// ─── helpers ────────────────────────────────────────────────────────────────

// The DB NBA RPC (and older AI outputs) sometimes returns hrefs pointing at
// routes that do not exist in the app (e.g. `/engine/projects/:id/reviews`).
// Remap those to the real destinations so CTA buttons never link to a
// broken/empty page.
function sanitizeNbaHref(href: string | null): string | null {
  if (!href) return href;
  // /engine/projects/:id/reviews  →  /engine/projects/:id/builder
  return href.replace(
    /^(\/engine\/projects\/[^/]+)\/reviews(\/?.*)$/,
    "$1/builder$2",
  );
}

function buildNBAPrompt(ctx: {
  projectName: string;
  clientCompany: string;
  status: string;
  currentPhase: string | null;
  currentStep: number;
  healthScore: number;
  nextAction: string | null;
  pendingReviews: number;
  blockedMilestones: number;
  totalMilestones: number;
  completedMilestones: number;
  overdueDates: string[];
  signalCount: number;
  recentActivity: string[];
  openDecisions: number;
}): string {
  return `You are Captain — the AI COO for Trust Tai's client projects. Your job is to identify the single highest-leverage next action for this project right now.

PROJECT CONTEXT:
- Name: ${ctx.projectName}
- Client: ${ctx.clientCompany}
- Status: ${ctx.status}
- Current Phase: ${ctx.currentPhase ?? "Not set"}
- Step: ${ctx.currentStep} of 14
- Health Score: ${ctx.healthScore}/100
- Pending Reviews: ${ctx.pendingReviews}
- Decisions Open: ${ctx.openDecisions}
- Milestones: ${ctx.completedMilestones} completed / ${ctx.totalMilestones} total (${ctx.blockedMilestones} blocked)
- Intelligence Signals: ${ctx.signalCount}
- Overdue Dates: ${ctx.overdueDates.length > 0 ? ctx.overdueDates.join(", ") : "None"}
- Current next_action field: ${ctx.nextAction ?? "Not set"}
- Recent Activity: ${ctx.recentActivity.slice(0, 3).join(" | ") || "None"}

RULES:
1. Return ONE specific, actionable instruction — not a category, not vague advice.
2. If blocked milestones exist, surface the most critical blocker first.
3. If pending reviews exist, escalate review completion as the action.
4. If health score < 50, severity = critical. If 50-75, severity = warning. If > 75, severity = info.
5. The action should feel like it came from a senior COO who deeply understands this specific project.
6. Keep action under 80 characters. Keep reason under 160 characters.

Respond with ONLY valid JSON, no markdown, no explanation:
{
  "action": "...",
  "reason": "...",
  "severity": "info" | "warning" | "critical",
  "href": null,
  "confidence": 0.0
}`;
}

// ─── SQL fallback ────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getSQLFallback(sb: any, projectId: string): Promise<NextBestAction> {
  const { data: rows } = await sb.rpc("compute_engine_next_best_action", {
    _project_id: projectId,
  });
  const row = Array.isArray(rows) ? rows[0] : undefined;
  if (!row) {
    return {
      action: "Nothing waiting",
      reason: "All gates clear.",
      href: null,
      severity: "info",
      ai_generated: false,
    };
  }
  return {
    action: (row as { action?: string }).action ?? "Nothing waiting",
    reason: (row as { reason?: string }).reason ?? "",
    href: sanitizeNbaHref((row as { href?: string }).href ?? null),
    severity: ((row as { severity?: string }).severity ?? "info") as NextBestAction["severity"],
    ai_generated: false,
  };
}

// ─── main export ─────────────────────────────────────────────────────────────

export const getIntelligentNextAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: z.string().uuid() }).parse(raw))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .handler(async ({ context, data }): Promise<NextBestAction> => {
    const email = (context.claims as { email?: string } | undefined)?.email;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;

    const isOperator = await hasRoleForEmail(sb, email, "operator");
    const isAdmin = await hasRoleForEmail(sb, email, "admin");
    if (!isOperator && !isAdmin) throw new Error("Forbidden: operator role required");

    // ── 1. Load project row ──────────────────────────────────────────────
    const { data: projRows } = await sb
      .from("engine_projects")
      .select(
        "name, engine_clients(company), status, current_phase, current_step, health_score, next_action, open_decisions, agent_status",
      )
      .eq("id", data.projectId);
    const proj =
      Array.isArray(projRows) && projRows.length > 0
        ? (projRows[0] as Record<string, unknown>)
        : null;

    // Derive source_count via aggregation (column not present on engine_projects)
    const { count: sourceCount } = await sb
      .from("engine_sources")
      .select("id", { count: "exact", head: true })
      .eq("project_id", data.projectId);


    // ── 2. Load milestones ───────────────────────────────────────────────
    const { data: msRows } = await sb
      .from("engine_milestones")
      .select("status, approval_status, name, due_date")
      .eq("project_id", data.projectId);
    const milestones = (Array.isArray(msRows) ? msRows : []) as Array<Record<string, string | null>>;

    // ── 3. Load pending reviews ──────────────────────────────────────────
    const { data: revRows } = await sb
      .from("engine_review_items")
      .select("status, title")
      .eq("project_id", data.projectId);
    const reviews = (Array.isArray(revRows) ? revRows : []) as Array<Record<string, string>>;

    // ── 4. Load recent activity ──────────────────────────────────────────
    const { data: actRows } = await sb
      .from("engine_activity")
      .select("title")
      .eq("project_id", data.projectId);
    const activity = (Array.isArray(actRows) ? actRows : []) as Array<Record<string, string>>;

    // ── 5. Load overdue dates ────────────────────────────────────────────
    const { data: dateRows } = await sb
      .from("engine_project_dates")
      .select("label, due_on")
      .eq("project_id", data.projectId);
    const dates = (Array.isArray(dateRows) ? dateRows : []) as Array<Record<string, string>>;
    const today = new Date().toISOString().split("T")[0];
    const overdueDates = dates
      .filter((d) => d.due_on && d.due_on < today)
      .map((d) => d.label ?? d.due_on);

    // ── 6. Build context ─────────────────────────────────────────────────
    if (!proj) {
      return getSQLFallback(sb, data.projectId);
    }

    const completedMs = milestones.filter((m) => m.status === "completed").length;
    const blockedMs = milestones.filter((m) => m.status === "blocked").length;
    const pendingReviews = reviews.filter((r) => r.status === "pending").length;

    const prompt = buildNBAPrompt({
      projectName: (proj.name as string) ?? "Unknown",
      clientCompany:
        ((proj.engine_clients as { company?: string } | null)?.company as string) ?? "Unknown",
      status: (proj.status as string) ?? "unknown",
      currentPhase: proj.current_phase as string | null,
      currentStep: (proj.current_step as number) ?? 1,
      healthScore: (proj.health_score as number) ?? 50,
      nextAction: proj.next_action as string | null,
      pendingReviews,
      blockedMilestones: blockedMs,
      totalMilestones: milestones.length,
      completedMilestones: completedMs,
      overdueDates,
      signalCount: sourceCount ?? 0,
      recentActivity: activity.slice(0, 5).map((a) => a.title ?? ""),
      openDecisions: (proj.open_decisions as number) ?? 0,
    });

    // ── 7. Call AI via Lovable Gateway ────────────────────────────────────
    try {
      const result = await callLovableAi(
        [{ role: "user", content: prompt }],
        { model: "anthropic/claude-haiku-4-5", json: true, temperature: 0.3 },
      );

      const parsed = parseJsonOutput<{
        action?: string;
        reason?: string;
        severity?: string;
        href?: string | null;
        confidence?: number;
      }>(result.text);

      if (!parsed?.action) return getSQLFallback(sb, data.projectId);

      return {
        action: parsed.action,
        reason: parsed.reason ?? "",
        href: sanitizeNbaHref(parsed.href ?? null),
        severity: (["info", "warning", "critical"].includes(parsed.severity ?? "")
          ? parsed.severity
          : "info") as NextBestAction["severity"],
        ai_generated: true,
        confidence: parsed.confidence ?? 0.8,
      };
    } catch {
      // AI call failed — fall back to SQL RPC gracefully
      return getSQLFallback(sb, data.projectId);
    }
  });
