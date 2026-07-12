/**
 * engine-decision-log.functions.ts
 *
 * Phase 4C — Decision Log
 *
 * Cross-project feed of every approved spine change: frame approvals,
 * mockup approvals, backend plan approvals, QA plan approvals,
 * implementation plan approvals, and converted chat proposals.
 *
 * Reads from engine_activity (no new tables needed).
 * Operators/admins only.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasRoleForEmail } from "@/lib/ops/access";
import { isOperatorEmail, isAdminEmail } from "@/lib/ops/access";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Activity kinds that represent a meaningful spine decision. */
export const DECISION_KINDS = [
  "frame_approved",
  "mockup_approved",
  "backend_plan_approved",
  "qa_plan_approved",
  "implementation_plan_approved",
  "chat_proposal_converted",
  "project_completed",
] as const;

export type DecisionKind = (typeof DECISION_KINDS)[number];

const DECISION_KIND_LABELS: Record<DecisionKind, string> = {
  frame_approved: "Frame Approved",
  mockup_approved: "Mockup Approved",
  backend_plan_approved: "Backend Plan Approved",
  qa_plan_approved: "QA Plan Approved",
  implementation_plan_approved: "Implementation Plan Approved",
  chat_proposal_converted: "Chat Proposal Converted",
  project_completed: "Project Completed",
};

export { DECISION_KIND_LABELS };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DecisionLogEntry = {
  id: string;
  project_id: string;
  project_name: string;
  kind: DecisionKind;
  kind_label: string;
  title: string;
  body: string | null;
  severity: string;
  created_at: string;
  /** Extracted from body heuristically — the actor who approved */
  actor_email: string | null;
  /** Downstream impact description derived from the body text */
  downstream_hint: string | null;
};

export type DecisionLogResult = {
  entries: DecisionLogEntry[];
  total: number;
  has_more: boolean;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Heuristically extract the actor email from the body text.
 * Engine bodies typically start with "<email> approved …" or
 * "<email> converted …".
 */
function extractActor(body: string | null): string | null {
  if (!body) return null;
  // Pattern: "actor@domain.com approved" or "actor@domain.com converted"
  const match = body.match(/^([\w.+%-]+@[\w.-]+\.[a-z]{2,10})(?:\s+(?:approved|converted|dismissed|completed))/i);
  return match?.[1] ?? null;
}

/**
 * Extract a downstream hint — the text after "Next best action:" if present.
 */
function extractDownstreamHint(body: string | null): string | null {
  if (!body) return null;
  const idx = body.indexOf("Next best action:");
  if (idx === -1) return null;
  return body.slice(idx + "Next best action:".length).trim().slice(0, 160) || null;
}

// ---------------------------------------------------------------------------
// Server functions
// ---------------------------------------------------------------------------

const ListDecisionLogInput = z.object({
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
  kinds: z
    .array(z.enum(DECISION_KINDS))
    .optional(),
  projectId: z.string().uuid().optional(),
  since: z.string().datetime().optional(),
});

async function assertOperatorOrAdmin(
  context: { supabase: unknown; claims?: { email?: string } },
) {
  const email = context.claims?.email?.toLowerCase() ?? "";
  if (isOperatorEmail(email) || isAdminEmail(email)) return;
  const ok = await hasRoleForEmail(context.supabase as never, email, "admin");
  if (!ok) throw new Error("Forbidden: operator or admin role required");
}

/**
 * listDecisionLog — paginated cross-project decision feed.
 */
export const listDecisionLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => ListDecisionLogInput.parse(raw ?? {}))
  .handler(async ({ context, data }): Promise<DecisionLogResult> => {
    await assertOperatorOrAdmin(context as never);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb: any = (context as { supabase: unknown }).supabase;

    const kindsFilter = (data.kinds && data.kinds.length > 0 ? data.kinds : DECISION_KINDS) as readonly string[];

    type RawRow = {
      id: string;
      project_id: string;
      kind: string;
      title: string;
      body: string | null;
      severity: string;
      created_at: string;
      engine_projects?: { name: string } | { name: string }[] | null;
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = sb
      .from("engine_activity")
      .select("id, project_id, kind, title, body, severity, created_at, engine_projects(name)", { count: "exact" })
      .in("kind", kindsFilter);

    if (data.projectId) q = q.eq("project_id", data.projectId);
    if (data.since) q = q.gte("created_at", data.since);
    q = q.order("created_at", { ascending: false });
    q = q.range(data.offset, data.offset + data.limit - 1);

    const { data: rows, error, count } = (await q) as {
      data: RawRow[] | null;
      error: unknown;
      count: number | null;
    };

    if (error) throw new Error(`Decision log query failed: ${JSON.stringify(error)}`);

    const entries: DecisionLogEntry[] = (rows ?? []).map((r) => {
      const projectName =
        r.engine_projects
          ? Array.isArray(r.engine_projects)
            ? (r.engine_projects[0]?.name ?? r.project_id)
            : ((r.engine_projects as { name: string }).name ?? r.project_id)
          : r.project_id;

      return {
        id: r.id,
        project_id: r.project_id,
        project_name: projectName,
        kind: r.kind as DecisionKind,
        kind_label: DECISION_KIND_LABELS[r.kind as DecisionKind] ?? r.kind,
        title: r.title,
        body: r.body ?? null,
        severity: r.severity,
        created_at: r.created_at,
        actor_email: extractActor(r.body ?? null),
        downstream_hint: extractDownstreamHint(r.body ?? null),
      };
    });

    return {
      entries,
      total: count ?? entries.length,
      has_more: (count ?? 0) > data.offset + data.limit,
    };
  });

/**
 * getDecisionLogStats — counts by kind across all projects.
 */
export const getDecisionLogStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ stats: { kind: string; kind_label: string; count: number }[] }> => {
    await assertOperatorOrAdmin(context as never);

    const supabase = (context as { supabase: {
      from: (t: string) => {
        select: (cols: string, opts?: Record<string, unknown>) => {
          in: (c: string, v: readonly string[]) => Promise<{ data: { kind: string; count?: number }[] | null; error: unknown }>;
        };
      };
    } }).supabase;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from("engine_activity").select("kind") as any)
      .in("kind", DECISION_KINDS as readonly string[]) as Promise<{ data: { kind: string }[] | null; error: unknown }>;

    if (error) throw new Error(`Stats query failed: ${JSON.stringify(error)}`);

    const countMap = new Map<string, number>();
    for (const row of data ?? []) {
      countMap.set(row.kind, (countMap.get(row.kind) ?? 0) + 1);
    }

    const stats = DECISION_KINDS.map((k) => ({
      kind: k,
      kind_label: DECISION_KIND_LABELS[k],
      count: countMap.get(k) ?? 0,
    })).filter((s) => s.count > 0);

    return { stats };
  });
