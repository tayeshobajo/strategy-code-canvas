import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { runRoadmapSynthesis } from "@/lib/roadmap-synthesis/plan.functions";
import { canAutoRun, runPmInBackground } from "@/lib/engine-pm-status";

/**
 * Proactively runs the AI Product Manager whenever the current Spine is
 * below 100% readiness. Respects the 5-minute cooldown and never fires
 * while another run is in flight.
 *
 * `readinessRatio` is (passed / total) — pass `null` while the readiness
 * query is still loading to skip auto-run until the number is known.
 */
export function useAutoPmRun({
  projectId,
  readinessRatio,
  enabled = true,
}: {
  projectId: string;
  readinessRatio: number | null;
  enabled?: boolean;
}) {
  const qc = useQueryClient();
  const runFn = useServerFn(runRoadmapSynthesis);

  useEffect(() => {
    if (!enabled) return;
    if (readinessRatio === null) return;
    if (readinessRatio >= 1) return;
    if (!canAutoRun(projectId)) return;

    runPmInBackground(
      projectId,
      runFn as unknown as (i: {
        data: { projectId: string; mode: "repair" | "refresh" | "rebuild_draft" };
      }) => Promise<unknown>,
      {
        step: "Filling missing Spine fields…",
        mode: "repair",
        onSettled: () => {
          void qc.invalidateQueries({ queryKey: ["engine", "project-spine", projectId] });
          void qc.invalidateQueries({ queryKey: ["engine", "spine-readiness", projectId] });
          void qc.invalidateQueries({ queryKey: ["engine", "work", projectId] });
        },
      },
    );
  }, [enabled, readinessRatio, projectId, runFn, qc]);
}
