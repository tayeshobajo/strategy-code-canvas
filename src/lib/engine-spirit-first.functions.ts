/* eslint-disable @typescript-eslint/no-explicit-any */
// Spirit First analysis — reads the project's intake brief source and asks
// the Lovable AI Gateway (same pattern as engine-intelligence.functions.ts)
// for a structured operating-identity assessment. Result is stored on
// engine_projects.spirit_first_analysis (JSONB). Admin-only.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasRoleForEmail } from "@/lib/ops/access";

async function assertAdmin(context: any) {
  const email = (context.claims?.email as string | undefined) ?? undefined;
  const ok = await hasRoleForEmail(context.supabase, email, "admin");
  if (!ok) throw new Error("Forbidden: admin role required");
  return (email ?? "unknown").toLowerCase();
}

export type SpiritFirstAnalysis = {
  operatingIdentityBaseline: {
    currentRole: string;
    businessIdentity: string;
    operationalStyle: string;
    decisionPattern: string;
  };
  identityThermostat: {
    pullbackPattern: string;
    trigger: string;
    defaultResponse: string;
    ceilingBehavior: string;
  };
  futureOperatingIdentity: {
    targetRole: string;
    shiftRequired: string;
    newDecisionPattern: string;
    timeline: string;
  };
  evidenceLedger: Array<{ claim: string; evidence: string; confidence: string }>;
  tensionTrustNotes: {
    primaryTension: string;
    trustAssets: string[];
    trustDeficits: string[];
  };
  operatingTargets: {
    daily: string[];
    weekly: string[];
  };
  generated_at?: string;
  generated_by_email?: string;
};

async function logAudit(
  sb: any,
  args: {
    project_id: string;
    actor_email: string;
    action: string;
    summary: string;
    metadata?: Record<string, any>;
  },
) {
  try {
    await sb.from("engine_audit_log").insert({
      project_id: args.project_id,
      actor_email: args.actor_email,
      action: args.action,
      summary: args.summary.slice(0, 500),
      affected_modules: ["spirit_first"],
      metadata: args.metadata ?? {},
    });
  } catch { /* audit best-effort */ }
}

async function logActivity(
  sb: any,
  projectId: string,
  kind: string,
  title: string,
  body: string,
) {
  try {
    await sb.from("engine_activity").insert({
      project_id: projectId,
      kind,
      title,
      body,
      severity: "info",
    });
  } catch { /* best-effort */ }
}

export const getSpiritFirstAnalysis = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ projectId: z.string().uuid() }).parse(raw),
  )
  .handler(async ({ context, data }): Promise<{ analysis: SpiritFirstAnalysis | null }> => {
    await assertAdmin(context);
    const sb = (context as any).supabase;
    const { data: row, error } = await sb
      .from("engine_projects")
      .select("spirit_first_analysis")
      .eq("id", data.projectId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { analysis: (row?.spirit_first_analysis as SpiritFirstAnalysis | null) ?? null };
  });

export const runSpiritFirstAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ projectId: z.string().uuid() }).parse(raw),
  )
  .handler(async ({ context, data }): Promise<{ analysis: SpiritFirstAnalysis }> => {
    const actor = await assertAdmin(context);
    const sb = (context as any).supabase;

    // Pull the brief text. Prefer type='brief', fall back to any transcript/note.
    const { data: sources, error: srcErr } = await sb
      .from("engine_sources")
      .select("id,name,type,raw_text")
      .eq("project_id", data.projectId)
      .not("raw_text", "is", null);
    if (srcErr) throw new Error(srcErr.message);
    const rows = (sources ?? []) as Array<{ id: string; name: string; type: string; raw_text: string | null }>;
    if (rows.length === 0) {
      throw new Error("No source material found for this project. Add an intake brief first.");
    }
    const briefs = rows.filter((r) => r.type === "brief");
    const chosen = (briefs.length ? briefs : rows).slice(0, 4);
    const combined = chosen
      .map((r) => `SOURCE: ${r.name} (${r.type})\n${(r.raw_text ?? "").slice(0, 12_000)}`)
      .join("\n\n---\n\n")
      .slice(0, 40_000);

    const { callLovableAi, parseJsonOutput } = await import("@/lib/engine-ai.server");
    const ai = await callLovableAi(
      [
        {
          role: "system",
          content:
            "You are a Spirit First analyst. Given raw client intake material, extract the operator's identity baseline, identity thermostat (self-limiting patterns), future operating identity, evidence, tension/trust notes, and daily/weekly operating targets. Ground every claim in the material. Never invent. Return strict JSON only.",
        },
        {
          role: "user",
          content: `INTAKE MATERIAL:\n\n${combined}\n\nReturn JSON with exactly this shape:\n{\n  "operatingIdentityBaseline": { "currentRole": "", "businessIdentity": "", "operationalStyle": "", "decisionPattern": "" },\n  "identityThermostat": { "pullbackPattern": "", "trigger": "", "defaultResponse": "", "ceilingBehavior": "" },\n  "futureOperatingIdentity": { "targetRole": "", "shiftRequired": "", "newDecisionPattern": "", "timeline": "" },\n  "evidenceLedger": [ { "claim": "", "evidence": "", "confidence": "low|medium|high" } ],\n  "tensionTrustNotes": { "primaryTension": "", "trustAssets": [""], "trustDeficits": [""] },\n  "operatingTargets": { "daily": [""], "weekly": [""] }\n}`,
        },
      ],
      { json: true, temperature: 0.3 },
    );
    const parsed = parseJsonOutput<SpiritFirstAnalysis>(ai.text);
    if (!parsed) throw new Error("Spirit First: AI returned unparseable JSON.");

    const nowIso = new Date().toISOString();
    const analysis: SpiritFirstAnalysis = {
      ...parsed,
      generated_at: nowIso,
      generated_by_email: actor,
    };

    const { error: upErr } = await sb
      .from("engine_projects")
      .update({ spirit_first_analysis: analysis as any })
      .eq("id", data.projectId);
    if (upErr) throw new Error(upErr.message);

    await logAudit(sb, {
      project_id: data.projectId,
      actor_email: actor,
      action: "spirit_first_analysis_generated",
      summary: `Spirit First analysis generated from ${chosen.length} source(s).`,
      metadata: {
        tokens_in: ai.tokens_in,
        tokens_out: ai.tokens_out,
        cost_cents: ai.cost_cents,
        source_ids: chosen.map((c) => c.id),
      },
    });
    await logActivity(
      sb,
      data.projectId,
      "spirit_first_generated",
      "Spirit First analysis generated",
      `${actor} generated a Spirit First analysis from ${chosen.length} source(s).`,
    );

    return { analysis };
  });
