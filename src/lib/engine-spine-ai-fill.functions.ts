/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasRoleForEmail } from "@/lib/ops/access";
import {
  POINT_A_BASE_FIELD_KEYS,
  POINT_B_FIELD_KEYS,
  pointADiagnosisKey,
} from "@/lib/engine-spine-fields";
import {
  HUMAN_LOCKED_STATUSES,
  asRecord,
  changedKeys,
  cleanString,
  isBlank,
  mapTruth,
  normalizePointA,
  normalizePointB,
  type FillResult,
  type PointA,
  type PointB,
  type TruthRow,
} from "@/lib/engine-spine-ai-fill.helpers";

const fillInput = z.object({ projectId: z.string().uuid() });

function buildFallbackPointA(projectName: string, contextPayload: unknown): PointA {
  const contextText = JSON.stringify(contextPayload).replace(/\s+/g, " ").slice(0, 900);
  const sourceHint = contextText
    ? `Drafted from the intake record for ${projectName}: ${contextText.slice(0, 140)}`
    : `Drafted from the intake record for ${projectName}.`;
  return {
    lenses: [
      {
        label: "Current operating model",
        value: "Needs structured review",
        hint: sourceHint,
      },
      {
        label: "Growth constraint",
        value: "Intake-backed bottleneck",
        hint: "Use the intake brief as the source for confirming what currently slows delivery or revenue.",
      },
      {
        label: "Customer path",
        value: "Needs clearer system support",
        hint: "Use founder answers and extracted signals to confirm where prospects, clients, or users get stuck today.",
      },
      {
        label: "Delivery capacity",
        value: "Manual effort still matters",
        hint: "Review the intake for the people, process, and tooling limits that affect reliable execution.",
      },
    ],
    diagnosis: [
      {
        title: "Intake-defined current reality",
        tag: "FOUNDATION",
        bullets: [
          "The intake provides enough context to draft the current-state truth for review.",
          "The exact wording should be confirmed by Tai before this becomes client-facing truth.",
        ],
      },
      {
        title: "System gap to resolve",
        tag: "GAP",
        bullets: [
          "The project needs a clearer operating system between today's process and the desired future state.",
          "This diagnosis is drafted from intake context and should be reviewed against the source brief.",
        ],
      },
      {
        title: "Roadmap opportunity",
        tag: "PATH",
        bullets: [
          "The roadmap can convert the intake brief into sequenced milestones, proof, and approval gates.",
          "Any assumption here remains reviewable until a human approves the Spine truth.",
        ],
      },
    ],
    key_diagnosis: `Draft for review: ${projectName} has enough intake context to define Point A, but the exact current-state diagnosis should be reviewed against the founder's answers, extracted signals, and attached source material before it is treated as final truth.`,
  };
}

function buildFallbackPointB(projectName: string, existingPointB: Record<string, unknown>): Partial<PointB> {
  const destination =
    cleanString(existingPointB.destination) ||
    cleanString(existingPointB.summary) ||
    cleanString(existingPointB.description) ||
    `the future operating model described in the intake for ${projectName}`;
  return {
    "24_month_destination": `Draft for review: In 24 months, ${destination}`,
    "10_year_position": `Draft for review: Long term, ${projectName} should operate from the position implied by the intake: a stronger, more durable business with clear systems, measurable outcomes, and less dependence on ad hoc execution.`,
    client_outcome: `Draft for review: The client has a clearer path from today's constraints to the intended business outcome, with decisions, milestones, and proof tracked in one roadmap.`,
    customer_outcome: `Draft for review: Customers experience a more reliable, polished, and easier path to the value the business already intends to deliver.`,
    operational_outcome: `Draft for review: The business moves from manual or unclear execution toward a repeatable operating rhythm with defined owners, milestones, and acceptance criteria.`,
    revenue_outcome: `Draft for review: Revenue improves as the intake-defined offer, customer path, and delivery system become easier to execute and measure.`,
    brand_position: `Draft for review: The brand presents with more authority and trust, matching the future state described in the intake and supporting higher-confidence buying decisions.`,
  };
}

export const fillMissingSpineDetailsFromIntake = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => fillInput.parse(raw))
  .handler(async ({ context, data }): Promise<FillResult> => {
    const sb = (context as any).supabase;
    const email = ((context as any).claims?.email as string | undefined) ?? undefined;
    const isAdmin = await hasRoleForEmail(sb, email, "admin");
    if (!isAdmin) throw new Error("Forbidden: admin role required");

    const actorEmail = ((context as any).claims?.email as string | undefined) ?? null;
    const { callLovableAiWithFallback, parseJsonOutput } = await import("@/lib/engine-ai.server");

    const { data: project, error: projectErr } = await sb
      .from("engine_projects")
      .select(
        "id,name,step_states,point_a,point_b,signal_room,extraction,hidden_assets,gap_map,blueprint,roadmap,sequencing,deadlines,investment,client_preview, engine_clients(company,industry,notes)",
      )
      .eq("id", data.projectId)
      .single();

    if (projectErr || !project) {
      throw new Error((projectErr as { message?: string } | null)?.message ?? "Project not found");
    }

    const stepStates = (project.step_states ?? {}) as Record<
      string,
      { state?: string; updated_at?: string; updated_by?: string | null; note?: string | null }
    >;
    const pointAApproved = stepStates["point-a"]?.state === "approved";
    const pointBApproved = stepStates["point-b"]?.state === "approved";

    const [{ data: signalRows }, { data: sourceRows }, { data: truthRows }] = await Promise.all([
      sb
        .from("engine_extracted_signals")
        .select("id,category,label,detail,confidence,created_at")
        .eq("project_id", data.projectId)
        .order("created_at", { ascending: false })
        .limit(80),
      sb
        .from("engine_sources")
        .select("id,name,type,raw_text,status,created_at")
        .eq("project_id", data.projectId)
        .order("created_at", { ascending: false })
        .limit(10),
      sb
        .from("engine_spine_field_truth")
        .select("field_key,status,spine")
        .eq("project_id", data.projectId)
        .in("spine", ["point-a", "point-b"]),
    ]);

    const rows = (truthRows ?? []) as TruthRow[];
    const pointAStatus = mapTruth(rows, "point-a");
    const pointBStatus = mapTruth(rows, "point-b");
    const existingPointARecord = asRecord(project.point_a);
    const existingPointA = normalizePointA(project.point_a);
    const existingPointB = asRecord(project.point_b);

    const contextPayload = {
      project: { name: project.name, client: project.engine_clients ?? null },
      current_modules: {
        point_a: project.point_a ?? null,
        point_b: project.point_b ?? null,
        signal_room: project.signal_room ?? null,
        extraction: project.extraction ?? null,
        hidden_assets: project.hidden_assets ?? null,
        gap_map: project.gap_map ?? null,
        blueprint: project.blueprint ?? null,
        roadmap: project.roadmap ?? null,
        sequencing: project.sequencing ?? null,
        deadlines: project.deadlines ?? null,
        investment: project.investment ?? null,
        client_preview: project.client_preview ?? null,
      },
      signals: (signalRows ?? []).slice(0, 80),
      sources: (sourceRows ?? []).map((source: any) => ({
        id: source.id,
        name: source.name,
        type: source.type,
        status: source.status,
        text: typeof source.raw_text === "string" ? source.raw_text.slice(0, 6_000) : "",
      })),
      missing_content: {
        point_a: POINT_A_BASE_FIELD_KEYS.filter((key) =>
          isBlank((existingPointA as Record<string, unknown>)[key]),
        ),
        point_b: POINT_B_FIELD_KEYS.filter((key) => isBlank(existingPointB[key])),
      },
      missing_truth_status: {
        point_a: POINT_A_BASE_FIELD_KEYS.filter((key) => !pointAStatus.has(key)),
        point_b: POINT_B_FIELD_KEYS.filter((key) => !pointBStatus.has(key)),
      },
    };

    const ai = await callLovableAiWithFallback(
      [
        {
          role: "system",
          content:
            "You are the Trust Tai AI Product Manager. Fill missing Project Spine details from intake, extracted signals, and current project modules. Do not approve anything. If a detail is inferred, phrase it as a reviewable draft. No em dashes, no exclamation points. Return strict JSON only.",
        },
        {
          role: "user",
          content: `Draft missing Point A and Point B details.

Rules:
- Preserve existing content. Only provide useful replacement content for blank fields.
- Point A lenses should be 4 to 6 business lenses with label, value, hint.
- Point A diagnosis should be 3 to 6 cards with title, tag, bullets.
- Point A key_diagnosis should be one concise paragraph.
- Point B must use exactly these keys: ${POINT_B_FIELD_KEYS.join(", ")}.
- If the source does not prove the answer, make clear the draft needs confirmation.

Return JSON only:
{"point_a":{"lenses":[{"label":"","value":"","hint":""}],"diagnosis":[{"title":"","tag":"","bullets":[""]}],"key_diagnosis":""},"point_b":{"24_month_destination":"","10_year_position":"","client_outcome":"","customer_outcome":"","operational_outcome":"","revenue_outcome":"","brand_position":""},"summary":""}

PROJECT CONTEXT:
${JSON.stringify(contextPayload, null, 2).slice(0, 45_000)}`,
        },
      ],
      { json: true, temperature: 0.2, maxRetriesPerModel: 1 },
    );

    const parsed =
      parseJsonOutput<{ point_a?: unknown; point_b?: unknown; summary?: string }>(ai.text) ?? {};

    const draftPointA = normalizePointA(parsed.point_a);
    const fallbackPointA = buildFallbackPointA(project.name, contextPayload);
    if (!draftPointA.lenses?.length) draftPointA.lenses = fallbackPointA.lenses;
    if (!draftPointA.diagnosis?.length) draftPointA.diagnosis = fallbackPointA.diagnosis;
    if (!draftPointA.key_diagnosis) draftPointA.key_diagnosis = fallbackPointA.key_diagnosis;
    const draftPointB = {
      ...buildFallbackPointB(project.name, existingPointB),
      ...normalizePointB(parsed.point_b),
    };
    const nextPointA: PointA & Record<string, unknown> = {
      ...existingPointARecord,
      ...existingPointA,
    };
    const nextPointB: Record<string, unknown> = { ...existingPointB };
    const changed: string[] = [];
    const canWriteA = (key: string) =>
      !pointAApproved && !HUMAN_LOCKED_STATUSES.has(pointAStatus.get(key)!);
    const canWriteB = (key: string) =>
      !pointBApproved && !HUMAN_LOCKED_STATUSES.has(pointBStatus.get(key)!);

    if (isBlank(nextPointA.lenses) && draftPointA.lenses?.length && canWriteA("lenses")) {
      nextPointA.lenses = draftPointA.lenses;
      changed.push("point_a.lenses");
    }
    if (isBlank(nextPointA.diagnosis) && draftPointA.diagnosis?.length && canWriteA("diagnosis")) {
      nextPointA.diagnosis = draftPointA.diagnosis;
      changed.push("point_a.diagnosis");
    }
    if (
      isBlank(nextPointA.key_diagnosis) &&
      draftPointA.key_diagnosis &&
      canWriteA("key_diagnosis")
    ) {
      nextPointA.key_diagnosis = draftPointA.key_diagnosis;
      changed.push("point_a.key_diagnosis");
    }
    for (const key of POINT_B_FIELD_KEYS) {
      if (isBlank(nextPointB[key]) && draftPointB[key] && canWriteB(key)) {
        nextPointB[key] = draftPointB[key];
        changed.push(`point_b.${key}`);
      }
    }

    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {};
    if (
      changed.some((key) => key.startsWith("point_a.")) &&
      changedKeys(existingPointARecord, nextPointA).length
    ) {
      patch.point_a = nextPointA;
    }
    if (
      changed.some((key) => key.startsWith("point_b.")) &&
      changedKeys(existingPointB, nextPointB).length
    ) {
      patch.point_b = nextPointB;
    }

    const nextStates = { ...stepStates };
    if (changed.some((key) => key.startsWith("point_a."))) {
      nextStates["point-a"] = {
        state: "review",
        updated_at: now,
        updated_by: actorEmail,
        note: "AI Product Manager filled missing Point A details from intake. Human approval still required.",
      };
    }
    if (changed.some((key) => key.startsWith("point_b."))) {
      nextStates["point-b"] = {
        state: "review",
        updated_at: now,
        updated_by: actorEmail,
        note: "AI Product Manager filled missing Point B details from intake. Human approval still required.",
      };
    }
    if (Object.keys(patch).length) {
      patch.step_states = nextStates;
      patch.last_activity_at = now;
      const { error: updateErr } = await sb
        .from("engine_projects")
        .update(patch)
        .eq("id", data.projectId);
      if (updateErr) {
        throw new Error(
          (updateErr as { message?: string }).message ?? "Failed to save AI-filled Spine details",
        );
      }
    }

    const truthWrites: Array<Record<string, unknown>> = [];
    const addTruth = (spine: "point-a" | "point-b", fieldKey: string, generated: boolean) => {
      if (spine === "point-a" && pointAApproved) return;
      if (spine === "point-b" && pointBApproved) return;
      const current = spine === "point-a" ? pointAStatus.get(fieldKey) : pointBStatus.get(fieldKey);
      if (current && HUMAN_LOCKED_STATUSES.has(current)) return;
      truthWrites.push({
        project_id: data.projectId,
        spine,
        field_key: fieldKey,
        status: generated ? "inferred" : "needs_confirmation",
        source_ref: generated
          ? {
              kind: "ai_inference",
              model: ai.model_used,
              prompt_ref: "spine_ai_fill_v1",
              rationale: "Drafted by AI Product Manager from intake, source, and project context.",
            }
          : {
              kind: "ai_fill_review",
              reason:
                "Field had content but no durable truth status. Human review is still required.",
            },
        updated_by_email: actorEmail,
        updated_by_actor: "ai",
        updated_at: now,
      });
    };

    for (const key of POINT_A_BASE_FIELD_KEYS) {
      if (!isBlank((nextPointA as Record<string, unknown>)[key])) {
        addTruth("point-a", key, changed.includes(`point_a.${key}`));
      }
    }
    for (const card of nextPointA.diagnosis ?? []) {
      const key = pointADiagnosisKey(card.title);
      if (key !== "diagnosis:" && !HUMAN_LOCKED_STATUSES.has(pointAStatus.get(key)!)) {
        addTruth("point-a", key, changed.includes("point_a.diagnosis"));
      }
    }
    for (const key of POINT_B_FIELD_KEYS) {
      if (!isBlank(nextPointB[key])) addTruth("point-b", key, changed.includes(`point_b.${key}`));
    }

    if (truthWrites.length) {
      const { error: truthErr } = await sb
        .from("engine_spine_field_truth")
        .upsert(truthWrites, { onConflict: "project_id,spine,field_key" });
      if (truthErr) {
        throw new Error(
          (truthErr as { message?: string }).message ?? "Failed to save durable truth statuses",
        );
      }
    }

    if (changed.length) {
      await sb.from("engine_audit_log").insert(
        changed.map((field) => ({
          project_id: data.projectId,
          actor_email: actorEmail,
          action: "spine_ai_fill",
          summary: `AI Product Manager filled ${field}`,
          affected_modules: ["spine", field.startsWith("point_a") ? "point_a" : "point_b"],
          field_changed: field,
          old_value: null,
          new_value: field.startsWith("point_a") ? nextPointA : nextPointB,
          reason: "Filled missing Spine detail after intake.",
          metadata: { model: ai.model_used, summary: parsed.summary ?? null },
        })),
      );
    }

    await sb.from("engine_activity").insert({
      project_id: data.projectId,
      kind: "spine_ai_fill",
      title: changed.length
        ? `AI Product Manager filled ${changed.length} Spine field${changed.length === 1 ? "" : "s"}`
        : "AI Product Manager reviewed the Spine",
      body:
        parsed.summary ?? "Missing Point A and Point B details were reviewed from intake context.",
      severity: "info",
      actor_email: actorEmail,
    });

    return {
      ok: true,
      changed,
      statuses: truthWrites.map((row) => `${row.spine}.${row.field_key}`),
    };
  });
