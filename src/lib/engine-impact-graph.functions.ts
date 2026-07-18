/**
 * Phase RT-5 — Impact graph read model.
 *
 * Walks source → signal → truth → milestone → task edges for one project
 * and returns a typed graph plus per-truth blast radius. Read-only; RLS
 * is honored via the authenticated Supabase client.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasRoleForEmail } from "@/lib/ops/access";

type Row = Record<string, unknown>;
type Sb = { from: (t: string) => any };

export type ImpactNode = {
  id: string;
  kind: "source" | "signal" | "truth" | "milestone" | "task";
  label: string;
  status: string | null;
  spine?: string | null;
  fieldKey?: string | null;
  milestoneId?: string | null;
  sourceId?: string | null;
};

export type ImpactEdge = {
  from: string;
  to: string;
  reason: "produces" | "informs" | "sequences" | "belongs_to";
};

export type ImpactGraph = {
  nodes: ImpactNode[];
  edges: ImpactEdge[];
  counts: {
    sources: number;
    signals: number;
    truth: number;
    milestones: number;
    tasks: number;
  };
};

const input = z.object({ projectId: z.string().uuid() });

export const getProjectImpactGraph = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => input.parse(raw))
  .handler(async ({ context, data }): Promise<ImpactGraph> => {
    const sb = (context as { supabase: Sb }).supabase;
    const email = (context as { claims?: { email?: string } }).claims?.email;
    const isAdmin = await hasRoleForEmail(sb as never, email, "admin");
    if (!isAdmin) throw new Error("Forbidden: admin role required");

    const [srcRes, sigRes, truthRes, msRes, taskRes] = await Promise.all([
      sb.from("engine_sources").select("id, name, type, status").eq("project_id", data.projectId).limit(500),
      sb
        .from("engine_extracted_signals")
        .select("id, source_id, label, status, category")
        .eq("project_id", data.projectId)
        .limit(1000),
      sb
        .from("engine_spine_field_truth")
        .select("id, spine, field_key, status, source_ref")
        .eq("project_id", data.projectId)
        .limit(500),
      sb
        .from("engine_milestones")
        .select("id, name, status, approval_status, related_gap, related_system_node, related_hidden_asset")
        .eq("project_id", data.projectId)
        .limit(500),
      sb
        .from("engine_tasks")
        .select("id, milestone_id, name, status")
        .eq("project_id", data.projectId)
        .limit(2000),
    ]);

    const sources = (srcRes.data as Row[]) ?? [];
    const signals = (sigRes.data as Row[]) ?? [];
    const truth = (truthRes.data as Row[]) ?? [];
    const milestones = (msRes.data as Row[]) ?? [];
    const tasks = (taskRes.data as Row[]) ?? [];

    const nodes: ImpactNode[] = [];
    const edges: ImpactEdge[] = [];

    for (const s of sources) {
      nodes.push({
        id: `src:${s.id as string}`,
        kind: "source",
        label: (s.name as string) ?? "Untitled source",
        status: (s.status as string) ?? null,
      });
    }
    for (const sig of signals) {
      const id = `sig:${sig.id as string}`;
      nodes.push({
        id,
        kind: "signal",
        label: (sig.label as string) ?? "Signal",
        status: (sig.status as string) ?? null,
        sourceId: (sig.source_id as string) ?? null,
      });
      if (sig.source_id) edges.push({ from: `src:${sig.source_id as string}`, to: id, reason: "produces" });
    }
    for (const t of truth) {
      const id = `truth:${t.id as string}`;
      nodes.push({
        id,
        kind: "truth",
        label: `${t.spine as string} · ${t.field_key as string}`,
        status: (t.status as string) ?? null,
        spine: (t.spine as string) ?? null,
        fieldKey: (t.field_key as string) ?? null,
      });
      // source_ref may carry {source_ids:[...]} or {signal_ids:[...]}
      const ref = (t.source_ref as { source_ids?: unknown; signal_ids?: unknown } | null) ?? null;
      const srcIds = Array.isArray(ref?.source_ids) ? (ref.source_ids as string[]) : [];
      const sigIds = Array.isArray(ref?.signal_ids) ? (ref.signal_ids as string[]) : [];
      for (const sid of srcIds) edges.push({ from: `src:${sid}`, to: id, reason: "informs" });
      for (const sid of sigIds) edges.push({ from: `sig:${sid}`, to: id, reason: "informs" });
    }
    for (const m of milestones) {
      const id = `milestone:${m.id as string}`;
      nodes.push({
        id,
        kind: "milestone",
        label: (m.name as string) ?? "Milestone",
        status: (m.approval_status as string) ?? (m.status as string) ?? null,
      });
      // Best-effort linking via related_gap/system_node keys back to truth field_key.
      for (const key of ["related_gap", "related_system_node", "related_hidden_asset"] as const) {
        const v = m[key] as string | null;
        if (!v) continue;
        const match = truth.find((t) => (t.field_key as string) === v);
        if (match) edges.push({ from: `truth:${match.id as string}`, to: id, reason: "sequences" });
      }
    }
    for (const tk of tasks) {
      const id = `task:${tk.id as string}`;
      nodes.push({
        id,
        kind: "task",
        label: (tk.name as string) ?? "Task",
        status: (tk.status as string) ?? null,
        milestoneId: (tk.milestone_id as string) ?? null,
      });
      if (tk.milestone_id)
        edges.push({ from: `milestone:${tk.milestone_id as string}`, to: id, reason: "belongs_to" });
    }

    return {
      nodes,
      edges,
      counts: {
        sources: sources.length,
        signals: signals.length,
        truth: truth.length,
        milestones: milestones.length,
        tasks: tasks.length,
      },
    };
  });

const blastInput = z.object({
  projectId: z.string().uuid(),
  truthId: z.string().uuid(),
});

export type BlastRadius = {
  truthId: string;
  milestones: Array<{ id: string; name: string; status: string | null }>;
  tasks: Array<{ id: string; name: string; milestoneId: string | null; status: string | null }>;
  downstreamSpines: string[];
};

export const getTruthBlastRadius = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => blastInput.parse(raw))
  .handler(async ({ context, data }): Promise<BlastRadius> => {
    const sb = (context as { supabase: Sb }).supabase;
    const email = (context as { claims?: { email?: string } }).claims?.email;
    const isAdmin = await hasRoleForEmail(sb as never, email, "admin");
    if (!isAdmin) throw new Error("Forbidden: admin role required");

    const truthRes = await sb
      .from("engine_spine_field_truth")
      .select("id, spine, field_key")
      .eq("id", data.truthId)
      .maybeSingle();
    const t = (truthRes.data as Row | null) ?? null;
    if (!t) return { truthId: data.truthId, milestones: [], tasks: [], downstreamSpines: [] };

    const fieldKey = t.field_key as string;
    const msRes = await sb
      .from("engine_milestones")
      .select("id, name, status, approval_status, related_gap, related_system_node, related_hidden_asset")
      .eq("project_id", data.projectId);
    const milestones = ((msRes.data as Row[]) ?? []).filter(
      (m) =>
        m.related_gap === fieldKey ||
        m.related_system_node === fieldKey ||
        m.related_hidden_asset === fieldKey,
    );
    const msIds = milestones.map((m) => m.id as string);

    const tasks = msIds.length
      ? (
          (await sb
            .from("engine_tasks")
            .select("id, name, status, milestone_id")
            .in("milestone_id", msIds)).data as Row[]
        ) ?? []
      : [];

    // Static doctrine of which spines are downstream of each spine.
    const DOWNSTREAM: Record<string, string[]> = {
      "point-a": ["gaps", "assets", "milestones", "phase-rationale", "sequencing"],
      "point-b": ["milestones", "phase-rationale", "blueprint", "sequencing"],
      "world-entry": ["strategic-thesis", "milestones"],
      "execution-boundary": ["milestones", "phase-rationale"],
      "strategic-thesis": ["milestones", "phase-rationale"],
      blueprint: ["milestones", "phase-rationale"],
      gaps: ["milestones"],
      assets: ["milestones"],
      constraints: ["milestones", "phase-rationale"],
      sequencing: ["milestones", "phase-rationale"],
    };
    const downstream = DOWNSTREAM[t.spine as string] ?? [];

    return {
      truthId: data.truthId,
      milestones: milestones.map((m) => ({
        id: m.id as string,
        name: (m.name as string) ?? "Milestone",
        status: (m.approval_status as string) ?? (m.status as string) ?? null,
      })),
      tasks: tasks.map((tk) => ({
        id: tk.id as string,
        name: (tk.name as string) ?? "Task",
        milestoneId: (tk.milestone_id as string) ?? null,
        status: (tk.status as string) ?? null,
      })),
      downstreamSpines: downstream,
    };
  });
