/**
 * Phase 2 (Top-10 sweep) — Portal view logger hook.
 *
 * Fires exactly one `viewed` activity per mount for a given portal surface.
 * Silent on failure (telemetry only — never blocks the page). Skips when
 * projectId is missing so route loaders that resolve async don't emit
 * partial events.
 */
import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  logPortalActivity,
  type PortalActivityKind,
} from "@/lib/portal-activity.functions";

export function usePortalViewLogger(params: {
  projectId: string | undefined | null;
  subjectType: string;
  subjectId?: string | null;
  kind?: PortalActivityKind;
  summary?: string;
  metadata?: Record<string, unknown>;
}) {
  const { projectId, subjectType, subjectId, kind = "viewed", summary, metadata } = params;
  const log = useServerFn(logPortalActivity);
  const firedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    const key = `${projectId}::${subjectType}::${subjectId ?? "_"}::${kind}`;
    if (firedRef.current === key) return;
    firedRef.current = key;
    log({
      data: {
        project_id: projectId,
        kind,
        subject_type: subjectType,
        subject_id: subjectId ?? subjectType,
        summary,
        metadata,
      },
    }).catch(() => {
      // Telemetry only.
    });
  }, [log, projectId, subjectType, subjectId, kind, summary, metadata]);
}
