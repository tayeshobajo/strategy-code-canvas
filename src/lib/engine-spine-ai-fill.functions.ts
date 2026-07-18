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

type EpistemicStatus =
  | "stated"
  | "inferred"
  | "assumed"
  | "missing"
  | "contradicted"
  | "needs_confirmation"
  | "verified"
  | "approved_truth";

type Lens = { label: string; value: string; hint: string };
type DiagnosisCard = { title: string; tag: string; bullets: string[] };
type PointA = { lenses?: Lens[]; diagnosis?: DiagnosisCard[]; key_diagnosis?: string };
type PointB = Record<(typeof POINT_B_FIELD_KEYS)[number], string>;
type FillResult = { ok: true; changed: string[]; statuses: string[] };
type TruthRow = { field_key: string; status: EpistemicStatus; spine: string };

const fillInput = z.object({ projectId: z.string().uuid() });

async function assertAdmin(context: any) {
  const email = (context.claims?.email as string | undefined) ?? undefined;
  const ok = await hasRoleForEmail(context.supabase, email, "admin");
  if (!ok) throw new Error("Forbidden: admin role required");
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isBlank(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(asRecord(value)).length === 0;
  return false;
}

function cleanString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim().slice(0, 1_200) : fallback;
}

function normalizePointA(raw: unknown): PointA {
  const rec = asRecord(raw);
  const lenses = Array.isArray(rec.lenses)
    ? rec.lenses
        .map((item) => {
          const r = asRecord(item);
          return {
            label: cleanString(r.label, "Lens").slice(0, 48),
            value: cleanString(r.value, "Needs review").slice(0, 96),
            hint: cleanString(r.hint, "Drafted from intake context.").slice(0, 180),
          };
        })
        .filter((lens) => lens.label && lens.value)
        .slice(0, 6)
    : [];

  const diagnosis = Array.isArray(rec.diagnosis)
    ? rec.diagnosis
        .map((item) => {
          const r = asRecord(item);
          const bullets = Array.isArray(r.bullets)
            ? r.bullets
                .map((bullet) => cleanString(bullet).slice(0, 240))
                .filter(Boolean)
                .slice(0, 4)
            : cleanString(r.bullets)
              ? [cleanString(r.bullets).slice(0, 240)]
              : [];
          return {
            title: cleanString(r.title, "Working diagnosis").slice(0, 80),
            tag: cleanString(r.tag, "DEFAULT").toUpperCase().slice(0, 24),
            bullets: bullets.length ? bullets : ["Needs confirmation from Tai before approval."],
          };
        })
        .filter((card) => card.title)
        .slice(0, 6)
    : [];

  return {
    lenses,
    diagnosis,
    key_diagnosis: cleanString(rec.key_diagnosis).slice(0, 1_000),
  };
}

function normalizePointB(raw: unknown): Partial<PointB> {
  const rec = asRecord(raw);
  const out: Partial<PointB> = {};
  for (const key of POINT_B_FIELD_KEYS) {
    const value = cleanString(rec[key]).slice(0, 1_000);
    if (value) out[key] = value;
  }
  return out;
}

function changedKeys(prev: Record<string, unknown>, next: Record<string, unknown>): string[] {
  const keys = Array.from(new Set([...Object.keys(prev), ...Object.keys(next)]));
  return keys.filter(
    (key) => JSON.stringify(prev[key] ?? null) !== JSON.stringify(next[key] ?? null),
  );
}

function mapTruth(rows: TruthRow[], spine: "point-a" | "point-b") {
  return new Map(
    rows.filter((row) => row.spine === spine).map((row) => [row.field_key, row.status] as const),
  );
}

const HUMAN_LOCKED_STATUSES = new Set<EpistemicStatus>([
  "stated",
  "verified",
  "approved_truth",
  "contradicted",
]);

export const fillMissingSpineDetailsFromIntake = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => fillInput.parse(raw))
  .handler(async ({ context, data }): Promise<FillResult> => {
    await assertAdmin(context);

    const sb = (context as any).supabase;
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
    if (
      stepStates["point-a"]?.state === "approved" ||
      stepStates["point-b"]?.state === "approved"
    ) {
      throw new Error(
        "AI Product Manager cannot overwrite an approved Point A or Point B. Reopen the step first.",
      );
    }

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

    const parsed = parseJsonOutput<{ point_a?: unknown; point_b?: unknown; summary?: string }>(
      ai.text,
    );
    if (!parsed) throw new Error("AI Product Manager returned an unreadable draft. Try again.");

    const draftPointA = normalizePointA(parsed.point_a);
    const draftPointB = normalizePointB(parsed.point_b);
    const nextPointA: PointA = { ...existingPointA };
    const nextPointB: Record<string, unknown> = { ...existingPointB };
    const changed: string[] = [];
    const canWriteA = (key: string) => !HUMAN_LOCKED_STATUSES.has(pointAStatus.get(key)!);
    const canWriteB = (key: string) => !HUMAN_LOCKED_STATUSES.has(pointBStatus.get(key)!);

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
    if (changedKeys(asRecord(project.point_a), nextPointA as Record<string, unknown>).length) {
      patch.point_a = nextPointA;
    }
    if (changedKeys(existingPointB, nextPointB).length) patch.point_b = nextPointB;

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
              reason: "Field had content but no durable truth status. Human review is still required.",
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
      body: parsed.summary ?? "Missing Point A and Point B details were reviewed from intake context.",
      severity: "info",
      actor_email: actorEmail,
    });

    return {
      ok: true,
      changed,
      statuses: truthWrites.map((row) => `${row.spine}.${row.field_key}`),
    };
  });