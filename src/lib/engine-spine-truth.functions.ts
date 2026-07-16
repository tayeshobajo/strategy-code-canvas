/* eslint-disable @typescript-eslint/no-explicit-any */
// Sprint 1 · Wave 2 — Inspector propose/edit flow.
//
// Persists proposed spine statement changes into
// `engine_project_chat_proposals` (proposal_type = 'spine_field_change')
// so the existing Approvals Queue picks them up. Also writes an
// `engine_activity` audit event with actor attribution.
//
// No schema migrations applied. If a first-class `engine_spine_field_truth`
// value column lands later, swap the write target — the read contract
// (getSpineFieldHistory) already unions both sources.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Sb = any;

export type SpineFieldHistoryEntry = {
  id: string;
  status: string;
  new_value: string | null;
  change_reason: string | null;
  actor_email: string | null;
  created_at: string;
  source: "proposal" | "truth";
};

export const proposeSpineFieldChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        projectId: z.string().uuid(),
        sectionKey: z.string().min(1),
        fieldKey: z.string().min(1),
        newValue: z.string().min(1).max(4000),
        changeReason: z.string().max(2000).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = (context as { supabase: Sb; userId: string; claims: any }).supabase;
    const actor = ((context as any).claims?.email as string | undefined) ?? null;
    const userId = (context as any).userId as string;

    const title = `Spine change · ${data.sectionKey} · ${data.fieldKey}`;
    const summary = data.changeReason?.slice(0, 300) ?? "Proposed change to approved spine statement.";
    const payload = {
      section_key: data.sectionKey,
      field_key: data.fieldKey,
      new_value: data.newValue,
      change_reason: data.changeReason ?? null,
      submitted_via: "source_truth_inspector",
    };

    const { data: inserted, error } = await supabase
      .from("engine_project_chat_proposals")
      .insert({
        project_id: data.projectId,
        proposal_type: "spine_field_change",
        title,
        summary,
        payload,
        status: "pending",
        target_route: `/engine/projects/${data.projectId}/spine`,
        created_by: userId,
      })
      .select("id,created_at")
      .single();

    if (error) throw new Error(error.message);

    // Best-effort audit; ignore failures so the proposal still lands.
    await supabase.from("engine_activity").insert({
      project_id: data.projectId,
      kind: "spine_field_proposed",
      title,
      body:
        (data.changeReason ? `${data.changeReason}\n\n` : "") +
        `New value: ${data.newValue.slice(0, 400)}`,
      severity: "info",
      actor_email: actor,
    });

    return { ok: true, proposalId: inserted.id, createdAt: inserted.created_at };
  });

export const getSpineFieldHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        projectId: z.string().uuid(),
        sectionKey: z.string().min(1),
        fieldKey: z.string().min(1),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = (context as { supabase: Sb }).supabase;
    const out: SpineFieldHistoryEntry[] = [];

    // Proposals originated from the inspector.
    const { data: proposals } = await supabase
      .from("engine_project_chat_proposals")
      .select("id,payload,status,summary,created_at,created_by")
      .eq("project_id", data.projectId)
      .eq("proposal_type", "spine_field_change")
      .order("created_at", { ascending: false })
      .limit(20);

    for (const row of proposals ?? []) {
      const p = (row.payload ?? {}) as Record<string, unknown>;
      if (p.section_key !== data.sectionKey || p.field_key !== data.fieldKey) continue;
      out.push({
        id: String(row.id),
        status: String(row.status ?? "pending"),
        new_value: typeof p.new_value === "string" ? p.new_value : null,
        change_reason: typeof p.change_reason === "string" ? p.change_reason : null,
        actor_email: null,
        created_at: String(row.created_at),
        source: "proposal",
      });
    }

    // Merge any field-truth history rows (attribution only — no value column).
    const { data: truthRows } = await supabase
      .from("engine_spine_field_truth")
      .select("id,status,updated_at,updated_by_email,stale_reason,field_key,spine")
      .eq("project_id", data.projectId)
      .eq("spine", data.sectionKey)
      .eq("field_key", data.fieldKey)
      .order("updated_at", { ascending: false })
      .limit(20);

    for (const t of truthRows ?? []) {
      out.push({
        id: String(t.id),
        status: String(t.status ?? "unknown"),
        new_value: null,
        change_reason: (t.stale_reason as string | null) ?? null,
        actor_email: (t.updated_by_email as string | null) ?? null,
        created_at: String(t.updated_at),
        source: "truth",
      });
    }

    out.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return { history: out };
  });
