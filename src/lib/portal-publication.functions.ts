/**
 * Phase 3B — thin server-function wrappers around the atomic
 * portal-publication RPCs installed in migration 20260713123604.
 *
 * All authorization (is_engine_staff / portal permissions) is enforced
 * inside each SECURITY DEFINER PL/pgSQL function; these wrappers only
 * validate input shape and surface RPC errors through TanStack Query.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { throwGeneric } from "@/lib/engine-error";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;

export const rollbackPortalPublication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({
      portalProjectId: z.string().uuid(),
      targetRoadmapId: z.string().uuid(),
      reason: z.string().trim().min(1, "Reason required"),
    }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    const { data: eventId, error } = await sb.rpc("rollback_portal_publication", {
      _portal_project_id: data.portalProjectId,
      _target_roadmap_id: data.targetRoadmapId,
      _reason: data.reason,
    });
    if (error) throwGeneric(error, "Rollback failed");
    return { ok: true as const, event_id: eventId as string };
  });

export const retractPortalPublication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({
      portalRoadmapId: z.string().uuid(),
      reason: z.string().trim().min(1, "Reason required"),
    }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    const { data: eventId, error } = await sb.rpc("retract_portal_publication", {
      _portal_roadmap_id: data.portalRoadmapId,
      _reason: data.reason,
    });
    if (error) throwGeneric(error, "Retract failed");
    return { ok: true as const, event_id: eventId as string };
  });

export const restorePortalPublication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({
      portalRoadmapId: z.string().uuid(),
      reason: z.string().trim().min(1, "Reason required"),
    }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    const { data: eventId, error } = await sb.rpc("restore_portal_publication", {
      _portal_roadmap_id: data.portalRoadmapId,
      _reason: data.reason,
    });
    if (error) throwGeneric(error, "Restore failed");
    return { ok: true as const, event_id: eventId as string };
  });

export const acknowledgePortalRoadmap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ portalRoadmapId: z.string().uuid() }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    const { data: eventId, error } = await sb.rpc("acknowledge_portal_roadmap", {
      _portal_roadmap_id: data.portalRoadmapId,
    });
    if (error) throwGeneric(error, "Acknowledgment failed");
    return { ok: true as const, event_id: (eventId ?? null) as string | null };
  });

export type PortalPublicationHistoryEvent = {
  event_id: string;
  event_type: string;
  actor_email: string | null;
  summary: string | null;
  created_at: string;
  portal_roadmap_id: string | null;
  previous_portal_roadmap_id: string | null;
  engine_project_id: string | null;
  engine_version_id: string | null;
  roadmap_title: string | null;
  roadmap_version_label: string | null;
  roadmap_status: string | null;
  roadmap_published_at: string | null;
  roadmap_retracted_at: string | null;
  roadmap_retraction_reason: string | null;
};

export const getPortalPublicationHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ portalProjectId: z.string().uuid() }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    const { data: rows, error } = await sb.rpc("get_portal_publication_history", {
      _portal_project_id: data.portalProjectId,
    });
    if (error) throwGeneric(error, "History read failed");
    return (rows ?? []) as PortalPublicationHistoryEvent[];
  });
