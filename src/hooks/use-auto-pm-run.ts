import { useCallback, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { runRoadmapSynthesis } from "@/lib/roadmap-synthesis/plan.functions";
import { canAutoRun, runPmInBackground } from "@/lib/engine-pm-status";

type Mode = "repair" | "refresh" | "rebuild_draft";

/**
 * Proactively runs the AI Product Manager whenever Spine readiness is below
 * 100%. Also returns a `runNow` callback so a button can force a manual
 * retry that bypasses the cooldown but still respects the in-flight guard.
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

  const invalidate = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["engine", "project-spine", projectId] });
    void qc.invalidateQueries({ queryKey: ["engine", "spine-readiness", projectId] });
    void qc.invalidateQueries({ queryKey: ["engine", "work", projectId] });
  }, [qc, projectId]);

  useEffect(() => {
    if (!enabled) return;
    if (readinessRatio === null) return;
    if (readinessRatio >= 1) return;
    if (!canAutoRun(projectId)) return;

    runPmInBackground(
      projectId,
      runFn as unknown as (i: {
        data: { projectId: string; mode: Mode };
      }) => Promise<unknown>,
      { step: "Filling missing Spine fields…", mode: "repair", onSettled: invalidate },
    );
  }, [enabled, readinessRatio, projectId, runFn, invalidate]);

  const runNow = useCallback(
    (mode: Mode = "refresh") =>
      runPmInBackground(
        projectId,
        runFn as unknown as (i: { data: { projectId: string; mode: Mode } }) => Promise<unknown>,
        {
          step: mode === "refresh" ? "Refreshing intelligence…" : "Re-running missing steps…",
          mode,
          force: true,
          onSettled: invalidate,
        },
      ),
    [projectId, runFn, invalidate],
  );

  return { runNow };
}

