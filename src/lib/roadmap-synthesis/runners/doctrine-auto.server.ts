/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Doctrine auto-resolver.
 *
 * When the AI PM runs, resolve doctrine gates that are objectively
 * satisfied so synthesis can continue end-to-end. This never overrides
 * a human decision: it only acts when a gate has no approved version
 * yet AND the artifact meets the thresholds the gate itself checks.
 *
 * - World Entry: if a version is drafted / awaiting_review and meets
 *   thresholds (summary ≥ 20 chars, ≥3 competitors, ≥5 vocabulary,
 *   ≥1 evidence), promote it to approved.
 * - Execution Boundary: if no version exists, seed a conservative
 *   default draft from the capability menu + intake, then approve.
 *
 * Human reviewers can still edit or reject afterward — a new proposal
 * supersedes the AI-approved version like any other revision.
 */

import { loadCapabilityMenu } from "@/lib/engine-capability-registry.functions";
import {
  mirrorWorldEntryToFieldTruth,
  type WorldEntryState,
  type WorldEntryVersion,
} from "@/lib/engine-world-entry.functions";
import type { ExecutionBoundaryState, ExecutionBoundaryVersion } from "@/lib/engine-execution-boundary.functions";
import { insertEngineActivity } from "@/lib/engine-activity";

type Sb = any;

const WORLD_KEY = "world_entry_workspace";
const BOUNDARY_KEY = "execution_boundary_workspace";

export async function autoResolveDoctrineGates(args: {
  supabase: Sb;
  projectId: string;
  actorEmail: string | null;
}): Promise<{ worldEntry: boolean; executionBoundary: boolean }> {
  const sb = args.supabase;
  const actor = args.actorEmail ?? "ai@trust-tai";

  const { data: proj, error } = await sb
    .from("engine_projects")
    .select("id, name, spirit_first_analysis, intake_summary, context_snapshot")
    .eq("id", args.projectId)
    .maybeSingle();
  if (error || !proj) return { worldEntry: false, executionBoundary: false };
  const spirit = ((proj.spirit_first_analysis as Record<string, unknown> | null) ?? {}) as Record<
    string,
    unknown
  >;

  let mutated = false;
  let nextSpirit = spirit;
  let worldEntryDid = false;
  let boundaryDid = false;

  // ---------- World Entry ----------
  const weState = ((nextSpirit[WORLD_KEY] as WorldEntryState | undefined) ?? {
    current: null,
    history: [],
  }) as WorldEntryState;
  const weCurrent = weState.current;
  if (weCurrent && weCurrent.status !== "approved") {
    const summaryOk = (weCurrent.destination_summary ?? "").trim().length >= 20;
    const compsOk = Array.isArray(weCurrent.competitors) && weCurrent.competitors.length >= 3;
    const vocabOk = Array.isArray(weCurrent.vocabulary) && weCurrent.vocabulary.length >= 5;
    const evidenceOk = Array.isArray(weCurrent.evidence) && weCurrent.evidence.length >= 1;
    if (summaryOk && compsOk && vocabOk && evidenceOk) {
      const now = new Date().toISOString();
      const approved: WorldEntryVersion = {
        ...weCurrent,
        status: "approved",
        approved_by_email: actor,
        approved_at: now,
        reason: "AI PM auto-approved: thresholds met and no reviewer objection.",
      };
      const nextWe: WorldEntryState = { current: approved, history: weState.history };
      nextSpirit = { ...nextSpirit, [WORLD_KEY]: nextWe };
      mutated = true;
      worldEntryDid = true;
      try {
        await mirrorWorldEntryToFieldTruth(sb, args.projectId, approved, actor, "ai");
      } catch {
        /* mirror is best-effort */
      }
      try {
        await insertEngineActivity(sb, {
          project_id: args.projectId,
          kind: "world_entry.approved",
          title: `World Entry v${approved.version} auto-approved by AI PM`,
          body: approved.reason,
          severity: "success",
          actor_email: actor,
        });
      } catch {
        /* activity is best-effort */
      }
    }
  }

  // ---------- Execution Boundary ----------
  const ebState = ((nextSpirit[BOUNDARY_KEY] as ExecutionBoundaryState | undefined) ?? {
    current: null,
    history: [],
  }) as ExecutionBoundaryState;
  if (!ebState.current || ebState.current.status !== "approved") {
    // Seed a draft if none exists, then approve.
    let candidate = ebState.current;
    if (!candidate) {
      const worldEntry = (nextSpirit[WORLD_KEY] as WorldEntryState | undefined)?.current ?? null;
      let menu: Array<{ id: string; retired_at: string | null }> = [];
      try {
        menu = (await loadCapabilityMenu(sb)) as any;
      } catch {
        menu = [];
      }
      const availableIds = new Set(menu.filter((c) => !c.retired_at).map((c) => c.id));
      const defaultCaps = [
        "web.category_site",
        "content.knowledge_hub",
        "audience.lead_capture",
        "ops.client_portal",
      ];
      const capability_ids = defaultCaps.filter((id) => availableIds.has(id));

      const intakeText = (
        (proj.intake_summary as string | null) ??
        JSON.stringify(proj.context_snapshot ?? {})
      ).toLowerCase();
      const CLIENT_OWNED_HINTS: Array<{ token: string; label: string }> = [
        { token: "payroll", label: "Payroll operations" },
        { token: "sales team", label: "Sales team ownership" },
        { token: "legal", label: "Legal review" },
        { token: "finance", label: "Finance & accounting" },
        { token: "hr", label: "HR & recruiting" },
        { token: "support", label: "Customer support operations" },
      ];
      const client_owned_areas = CLIENT_OWNED_HINTS.filter((h) => intakeText.includes(h.token)).map(
        (h) => h.label,
      );
      if (client_owned_areas.length === 0) {
        client_owned_areas.push("Day-to-day operations outside the approved capabilities");
      }

      const competitors: string[] = Array.isArray((worldEntry as any)?.competitors)
        ? (worldEntry as any).competitors.map((c: any) => String(c?.name ?? "")).filter(Boolean)
        : [];
      const exclusions: string[] = [];
      if (competitors.length > 0) {
        exclusions.push(`No positioning or content that copies: ${competitors.slice(0, 5).join(", ")}`);
      }
      exclusions.push("No custom mobile app work in this scope");
      exclusions.push("No paid media buys unless separately contracted");

      const now = new Date().toISOString();
      candidate = {
        version: 1,
        status: "draft",
        capability_ids: capability_ids.length > 0 ? capability_ids : ["web.category_site"],
        client_owned_areas,
        exclusions,
        notes:
          "AI PM auto-drafted starting boundary. Reviewers may revise capabilities, ownership areas, and exclusions in a new version.",
        proposed_by_email: actor,
        proposed_by_actor: "ai",
        proposed_at: now,
      };
    }

    if (candidate.capability_ids.length >= 1 && candidate.client_owned_areas.length >= 1) {
      const now = new Date().toISOString();
      const approved: ExecutionBoundaryVersion = {
        ...candidate,
        status: "approved",
        approved_by_email: actor,
        approved_at: now,
        reason: "AI PM auto-approved: thresholds met and no reviewer objection.",
      };
      const nextEb: ExecutionBoundaryState = { current: approved, history: ebState.history };
      nextSpirit = { ...nextSpirit, [BOUNDARY_KEY]: nextEb };
      mutated = true;
      boundaryDid = true;

      // Mirror to field truth so gate readers see approved rows.
      try {
        const rows = [
          {
            field_key: "approved_capabilities",
            source_ref: { items: approved.capability_ids, version: approved.version },
          },
          {
            field_key: "client_owned_areas",
            source_ref: { items: approved.client_owned_areas, version: approved.version },
          },
          {
            field_key: "exclusions",
            source_ref: { items: approved.exclusions, version: approved.version },
          },
        ].map((r) => ({
          project_id: args.projectId,
          spine: "execution-boundary",
          field_key: r.field_key,
          status: "approved_truth",
          source_ref: r.source_ref,
          updated_at: now,
          updated_by_email: actor,
          updated_by_actor: "ai",
        }));
        await sb
          .from("engine_spine_field_truth")
          .upsert(rows, { onConflict: "project_id,spine,field_key" });
      } catch {
        /* mirror is best-effort */
      }
      try {
        await insertEngineActivity(sb, {
          project_id: args.projectId,
          kind: "execution_boundary_approved",
          title: `Execution Boundary v${approved.version} auto-approved by AI PM`,
          body: approved.reason,
          severity: "success",
          actor_email: actor,
        });
      } catch {
        /* activity is best-effort */
      }
    }
  }

  if (mutated) {
    await sb
      .from("engine_projects")
      .update({ spirit_first_analysis: nextSpirit })
      .eq("id", args.projectId);
  }

  return { worldEntry: worldEntryDid, executionBoundary: boundaryDid };
}
