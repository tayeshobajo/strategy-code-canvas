/**
 * Milestone-change audit surface: lists every version that ever carried a
 * `payload.suggested_milestone_changes` diff, plus its review/approval state.
 * Admin-only (assertAdmin via engine-ops helpers).
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasRoleForEmail } from "./ops/access";

type Claims = Record<string, unknown> | undefined;

function emailFromClaims(claims: Claims): string | null {
  if (!claims) return null;
  const raw = (claims.email ??
    (claims as { user_metadata?: { email?: string } }).user_metadata?.email) as
    | string
    | undefined;
  return raw ? raw.trim().toLowerCase() : null;
}

async function requireAdmin(
  claims: Claims,
  supabase: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> },
) {
  const email = emailFromClaims(claims);
  if (!email) throw new Error("Forbidden");
  const ok =
    (await hasRoleForEmail(supabase, email, "admin")) ||
    (await hasRoleForEmail(supabase, email, "operator"));
  if (!ok) throw new Error("Forbidden");
  return email;
}

export type MilestoneChangeAuditRow = {
  version_id: string;
  version: string;
  version_label: string | null;
  project_id: string;
  project_name: string | null;
  status: string;
  created_at: string;
  approved_at: string | null;
  approved_by: string | null;
  added: number;
  modified: number;
  removed: number;
  review_status: string | null;
  reviewed_at: string | null;
  reviewer: string | null;
};

export const listMilestoneChangeAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({ limit: z.number().int().positive().max(200).default(100) })
      .parse(raw ?? {}),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(
      context.claims as Claims,
      context.supabase as unknown as Parameters<typeof requireAdmin>[1],
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: versions, error } = await sb
      .from("engine_roadmap_versions")
      .select(
        "id, version, label, project_id, status, payload, created_at, approved_at, approved_by, engine_projects(name)",
      )
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message ?? "load failed");

    type VRow = {
      id: string;
      version: string;
      label: string | null;
      project_id: string;
      status: string;
      payload: Record<string, unknown> | null;
      created_at: string;
      approved_at: string | null;
      approved_by: string | null;
      engine_projects?: { name: string | null } | null;
    };
    const withDiff = ((versions ?? []) as VRow[]).filter((v) => {
      const d = (v.payload ?? {}) as Record<string, unknown>;
      return d && typeof d === "object" && "suggested_milestone_changes" in d;
    });

    // Fetch matching review items (latest per version_id) for reviewer info.
    const versionIds = withDiff.map((v) => v.id);
    let reviewByVersion: Map<string, { status: string; updated_at: string }> =
      new Map();
    if (versionIds.length) {
      const { data: reviews } = await sb
        .from("engine_review_items")
        .select("version_id, status, updated_at")
        .in("version_id", versionIds);
      for (const r of (reviews ?? []) as Array<{
        version_id: string | null;
        status: string;
        updated_at: string;
      }>) {
        if (!r.version_id) continue;
        const existing = reviewByVersion.get(r.version_id);
        if (!existing || r.updated_at > existing.updated_at) {
          reviewByVersion.set(r.version_id, { status: r.status, updated_at: r.updated_at });
        }
      }
    }

    const rows: MilestoneChangeAuditRow[] = withDiff.map((v) => {
      const diff = ((v.payload ?? {}) as Record<string, unknown>)
        .suggested_milestone_changes as
        | {
            added?: unknown[];
            modified?: unknown[];
            removed?: unknown[];
          }
        | undefined;
      const rv = reviewByVersion.get(v.id);
      return {
        version_id: v.id,
        version: v.version,
        version_label: v.label,
        project_id: v.project_id,
        project_name: v.engine_projects?.name ?? null,
        status: v.status,
        created_at: v.created_at,
        approved_at: v.approved_at,
        approved_by: v.approved_by,
        added: (diff?.added ?? []).length,
        modified: (diff?.modified ?? []).length,
        removed: (diff?.removed ?? []).length,
        review_status: rv?.status ?? null,
        reviewed_at: rv?.updated_at ?? null,
        reviewer: null,
      };
    });
    return { rows };
  });
