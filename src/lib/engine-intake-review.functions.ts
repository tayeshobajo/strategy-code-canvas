// Adaptive Intake Review — internal-only visibility for operators/admins.
//
// Pulls together everything the intake produced for a given engine_project:
//   - Original open answer + full answer history
//   - Detected frame + subtype (with confirmation history if recorded)
//   - Questions asked, objectives covered, open objectives
//   - Extracted signals, source row, extraction runs, roadmap versions
//   - Any pending review items
//
// Nothing here is ever sent to the client portal. Access is gated by the
// admin/operator role check used elsewhere in the engine surface.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasRoleForEmail } from "@/lib/ops/access";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const Input = z.object({ projectId: z.string().regex(UUID_RE) });

async function assertAdminOrOperator(context: {
  claims?: Record<string, unknown>;
  supabase: {
    rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  };
}) {
  const email = (context.claims?.email as string | undefined) ?? undefined;
  const sb = context.supabase as unknown as Parameters<typeof hasRoleForEmail>[0];
  const ok =
    (await hasRoleForEmail(sb, email, "admin")) ||
    (await hasRoleForEmail(sb, email, "operator"));
  if (!ok) throw new Error("Forbidden: operator role required");
}

type Answer = { key: string; question: string; response: string };

export type AdaptiveIntakeReview = {
  linked: boolean;
  project: {
    id: string;
    name: string;
    status: string;
    delivery_mode: string | null;
    created_at: string;
  };
  submission: {
    id: string;
    submitted_at: string;
    name: string | null;
    business: string | null;
    website: string | null;
    email: string | null;
    role: string | null;
  } | null;
  detection: {
    frame: string | null;
    subtype: string | null;
    first_answer: { question: string; response: string } | null;
    confirmation_history: Array<{ frame: string; subtype: string | null; at: string | null }>;
  };
  conversation: {
    asked: string[];
    answered: Answer[];
    objective_scores: Record<string, number>;
    open_objectives: string[];
    reflections: Array<{ key: string; original: string; reflection: string }>;
  };
  sources: Array<{
    id: string;
    name: string;
    type: string;
    status: string;
    visibility: string;
    signals_count: number;
    created_at: string;
    current_stage: string | null;
  }>;
  extraction_runs: Array<{
    id: string;
    status: string;
    started_at: string | null;
    finished_at: string | null;
    signals_count: number;
    error: string | null;
    produced_version_id: string | null;
    model_intake: string | null;
    model_structured: string | null;
    created_at: string;
  }>;
  signals: Array<{
    id: string;
    category: string;
    label: string;
    detail: string | null;
    confidence: number;
    client_safe: boolean;
    created_at: string;
  }>;
  signals_by_category: Record<string, number>;
  versions: Array<{
    id: string;
    version: string;
    label: string | null;
    status: string;
    created_by: string;
    summary: string | null;
    client_preview_status: string;
    created_at: string;
  }>;
  review_items: Array<{
    id: string;
    item_type: string;
    title: string;
    impact: string;
    status: string;
    created_at: string;
    version_id: string | null;
  }>;
};

export const getAdaptiveIntakeReview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data, context }): Promise<AdaptiveIntakeReview> => {
    await assertAdminOrOperator(
      context as unknown as Parameters<typeof assertAdminOrOperator>[0],
    );

    // Read paths go through the RLS-scoped user client — operators can read the
    // engine tables. intake_submissions has an admin/operator SELECT policy.
    const sb = context.supabase as unknown as {
      from: (t: string) => {
        select: (s: string) => {
          eq: (c: string, v: string) => {
            maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
            order: (
              c: string,
              o: { ascending: boolean },
            ) => { limit: (n: number) => Promise<{ data: unknown; error: unknown }> };
          };
        };
      };
    };

    // 1. Engine project + submission linkage.
    const projRes = await (
      sb.from("engine_projects").select(
        "id,name,status,delivery_mode,created_at,signal_room",
      ) as unknown as {
        eq: (
          c: string,
          v: string,
        ) => {
          maybeSingle: () => Promise<{
            data: {
              id: string;
              name: string;
              status: string;
              delivery_mode: string | null;
              created_at: string;
              signal_room: Record<string, unknown> | null;
            } | null;
            error: unknown;
          }>;
        };
      }
    )
      .eq("id", data.projectId)
      .maybeSingle();

    if (projRes.error || !projRes.data) {
      throw new Error("Project not found");
    }
    const proj = projRes.data;
    const submissionId =
      (proj.signal_room && (proj.signal_room["intake_submission_id"] as string | undefined)) ||
      null;

    // 2. Intake submission row (may be missing for projects created outside the
    //    adaptive intake — that's fine, we still surface the engine artifacts).
    let submission: AdaptiveIntakeReview["submission"] = null;
    const answers: Answer[] = [];
    let objective_scores: Record<string, number> = {};
    let asked: string[] = [];
    let frame: string | null = null;
    let subtype: string | null = null;
    const confirmation_history: Array<{
      frame: string;
      subtype: string | null;
      at: string | null;
    }> = [];
    const reflections: Array<{ key: string; original: string; reflection: string }> = [];

    if (submissionId) {
      const subRes = await (
        sb.from("intake_submissions").select(
          "id,name,business,website,email,answers,created_at",
        ) as unknown as {
          eq: (
            c: string,
            v: string,
          ) => {
            maybeSingle: () => Promise<{
              data: {
                id: string;
                name: string | null;
                business: string | null;
                website: string | null;
                email: string | null;
                answers: unknown;
                created_at: string;
              } | null;
              error: unknown;
            }>;
          };
        }
      )
        .eq("id", submissionId)
        .maybeSingle();

      if (subRes.data) {
        const rawAnswers = Array.isArray(subRes.data.answers)
          ? (subRes.data.answers as Array<Record<string, unknown>>)
          : [];
        for (const a of rawAnswers) {
          const key = String(a.key ?? "");
          const question = String(a.question ?? "");
          const response = a.response == null ? "" : String(a.response);
          if (!key) continue;
          if (key === "_frame") {
            frame = response || null;
            if (frame && frame.startsWith("project:")) {
              subtype = frame.split(":")[1] ?? null;
            }
          } else if (key === "_asked") {
            try {
              const parsed = JSON.parse(response);
              if (Array.isArray(parsed)) asked = parsed.map(String);
            } catch {
              /* ignore */
            }
          } else if (key === "_scores") {
            try {
              const parsed = JSON.parse(response);
              if (parsed && typeof parsed === "object") {
                objective_scores = parsed as Record<string, number>;
              }
            } catch {
              /* ignore */
            }
          } else if (key === "_confirmation_history") {
            try {
              const parsed = JSON.parse(response);
              if (Array.isArray(parsed)) {
                for (const c of parsed) {
                  confirmation_history.push({
                    frame: String((c as Record<string, unknown>).frame ?? ""),
                    subtype:
                      ((c as Record<string, unknown>).subtype as string | null | undefined) ??
                      null,
                    at: ((c as Record<string, unknown>).at as string | null | undefined) ?? null,
                  });
                }
              }
            } catch {
              /* ignore */
            }
          } else if (key === "_reflections") {
            try {
              const parsed = JSON.parse(response);
              if (Array.isArray(parsed)) {
                for (const r of parsed) {
                  const rr = r as Record<string, unknown>;
                  reflections.push({
                    key: String(rr.key ?? ""),
                    original: String(rr.original ?? ""),
                    reflection: String(rr.reflection ?? ""),
                  });
                }
              }
            } catch {
              /* ignore */
            }
          } else if (key.startsWith("_")) {
            // Skip other meta wrappers (artifact, contact, etc.)
            continue;
          } else {
            answers.push({ key, question, response });
          }

          // Per-answer reflection: some drafts stored the "clearer version"
          // inline on the answer as `reflected_offered`.
          const reflected = (a as Record<string, unknown>).reflected_offered;
          if (typeof reflected === "string" && reflected.trim() && !key.startsWith("_")) {
            reflections.push({ key, original: response, reflection: reflected });
          }
        }

        // Role often lives in the artifact meta; derive best-effort from a
        // dedicated "role" answer if present.
        const roleAnswer = rawAnswers.find(
          (a) => String(a.key ?? "").toLowerCase() === "role",
        );
        submission = {
          id: subRes.data.id,
          submitted_at: subRes.data.created_at,
          name: subRes.data.name,
          business: subRes.data.business,
          website: subRes.data.website,
          email: subRes.data.email,
          role:
            roleAnswer && roleAnswer.response
              ? String(roleAnswer.response)
              : null,
        };
      }
    }

    // First open answer = first non-underscore answer that has content.
    const firstAnswered = answers.find((a) => a.response.trim().length > 0) ?? null;

    // Open objectives: everything asked or scored below the "enough" bar.
    const BAR = 60;
    const open_objectives = Array.from(
      new Set([
        ...asked.filter((k) => (objective_scores[k] ?? 0) < BAR),
        ...Object.keys(objective_scores).filter((k) => (objective_scores[k] ?? 0) < BAR),
      ]),
    );

    // 3. Engine sources for this project.
    const srcRes = await (
      sb.from("engine_sources").select(
        "id,name,type,status,visibility,signals_count,created_at,current_stage",
      ) as unknown as {
        eq: (
          c: string,
          v: string,
        ) => {
          order: (
            c: string,
            o: { ascending: boolean },
          ) => Promise<{ data: unknown; error: unknown }>;
        };
      }
    )
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false });
    const sources = ((srcRes.data as AdaptiveIntakeReview["sources"] | null) ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      type: s.type,
      status: s.status,
      visibility: s.visibility,
      signals_count: s.signals_count,
      created_at: s.created_at,
      current_stage: s.current_stage,
    }));

    // 4. Extraction runs (latest 5).
    const runRes = await (
      sb.from("engine_extraction_runs").select(
        "id,status,started_at,finished_at,signals_count,error,produced_version_id,model_intake,model_structured,created_at",
      ) as unknown as {
        eq: (
          c: string,
          v: string,
        ) => {
          order: (
            c: string,
            o: { ascending: boolean },
          ) => { limit: (n: number) => Promise<{ data: unknown; error: unknown }> };
        };
      }
    )
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false })
      .limit(5);
    const extraction_runs =
      (runRes.data as AdaptiveIntakeReview["extraction_runs"] | null) ?? [];

    // 5. Extracted signals for this project (cap at 200 to stay lean).
    const sigRes = await (
      sb.from("engine_extracted_signals").select(
        "id,category,label,detail,confidence,client_safe,created_at",
      ) as unknown as {
        eq: (
          c: string,
          v: string,
        ) => {
          order: (
            c: string,
            o: { ascending: boolean },
          ) => { limit: (n: number) => Promise<{ data: unknown; error: unknown }> };
        };
      }
    )
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false })
      .limit(200);
    const signals = (sigRes.data as AdaptiveIntakeReview["signals"] | null) ?? [];
    const signals_by_category: Record<string, number> = {};
    for (const s of signals) {
      signals_by_category[s.category] = (signals_by_category[s.category] ?? 0) + 1;
    }

    // 6. Roadmap versions.
    const verRes = await (
      sb.from("engine_roadmap_versions").select(
        "id,version,label,status,created_by,summary,client_preview_status,created_at",
      ) as unknown as {
        eq: (
          c: string,
          v: string,
        ) => {
          order: (
            c: string,
            o: { ascending: boolean },
          ) => { limit: (n: number) => Promise<{ data: unknown; error: unknown }> };
        };
      }
    )
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false })
      .limit(10);
    const versions = (verRes.data as AdaptiveIntakeReview["versions"] | null) ?? [];

    // 7. Review items.
    const revRes = await (
      sb.from("engine_review_items").select(
        "id,item_type,title,impact,status,created_at,version_id",
      ) as unknown as {
        eq: (
          c: string,
          v: string,
        ) => {
          order: (
            c: string,
            o: { ascending: boolean },
          ) => { limit: (n: number) => Promise<{ data: unknown; error: unknown }> };
        };
      }
    )
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false })
      .limit(25);
    const review_items = (revRes.data as AdaptiveIntakeReview["review_items"] | null) ?? [];

    return {
      linked: !!submissionId,
      project: {
        id: proj.id,
        name: proj.name,
        status: proj.status,
        delivery_mode: proj.delivery_mode,
        created_at: proj.created_at,
      },
      submission,
      detection: {
        frame,
        subtype,
        first_answer: firstAnswered
          ? { question: firstAnswered.question, response: firstAnswered.response }
          : null,
        confirmation_history,
      },
      conversation: {
        asked,
        answered: answers,
        objective_scores,
        open_objectives,
        reflections,
      },
      sources,
      extraction_runs,
      signals,
      signals_by_category,
      versions,
      review_items,
    };
  });
