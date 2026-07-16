import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, CircleDashed, XCircle, HelpCircle } from "lucide-react";
import { SPINE_READINESS_CHECKS } from "@/lib/spine-contract";
import { evaluateProjectSpineReadiness } from "@/lib/engine-spine-readiness-eval.functions";
import type { SpineReadinessCheckResult } from "@/lib/spine-readiness-evaluator";

/**
 * Phase 1A (Spine 2.0) — Live Spine Readiness panel.
 *
 * When `projectId` is provided, the panel evaluates the 14 canonical
 * checks from §4 of doctrine/PROJECT_SPINE_CONTRACT.md against the
 * project's current Supabase state and renders per-check pass / fail /
 * unknown chips plus an overall banner.
 *
 * When no `projectId` is provided the panel falls back to the frozen
 * contract listing — useful when the read model isn't in scope
 * (docs, storybook, etc.).
 */
export function SpineReadinessPanel({ projectId }: { projectId?: string }) {
  const fn = useServerFn(evaluateProjectSpineReadiness);
  const enabled = Boolean(projectId);
  const query = useQuery({
    queryKey: ["engine", "spine-readiness", projectId ?? "none"],
    queryFn: () => fn({ data: { projectId: projectId as string } }),
    enabled,
    staleTime: 30_000,
  });

  const result = query.data?.result;
  const checks: Array<SpineReadinessCheckResult | { id: string; label: string; state: "advisory" }> =
    result?.checks ?? SPINE_READINESS_CHECKS.map((c) => ({ id: c.id, label: c.label, state: "advisory" as const }));

  return (
    <section
      aria-labelledby="spine-readiness-heading"
      className="rounded-xl border border-border bg-card p-5 shadow-sm"
      data-qa-role="spine-readiness"
      data-qa-ready={result ? String(result.ready) : "advisory"}
    >
      <div className="flex items-baseline justify-between gap-4 mb-3">
        <h2
          id="spine-readiness-heading"
          className="font-display text-lg text-ink leading-tight"
        >
          Spine Readiness
        </h2>
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink/50">
          {enabled
            ? query.isLoading
              ? "Evaluating…"
              : result
                ? `${result.passed}/${result.total} passing · ${result.blockers.length} blocker${result.blockers.length === 1 ? "" : "s"}`
                : "Unable to evaluate"
            : "Advisory · pass a projectId to evaluate"}
        </span>
      </div>
      {enabled && result ? (
        <div
          className={
            "text-xs mb-3 rounded-md px-3 py-2 border " +
            (result.ready
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-amber-200 bg-amber-50 text-amber-800")
          }
        >
          {result.ready
            ? "All 14 checks pass — the Spine is ready. No important uncertainty is hiding."
            : "The Spine is not yet ready. Address the failing / unknown checks below to unlock detailed milestone planning."}
        </div>
      ) : (
        <p className="text-xs text-ink/60 mb-4 max-w-2xl">
          The Spine is ready when no important uncertainty is hiding — not when every unknown is
          gone. This panel shows the fourteen canonical checks from the frozen Spine Contract.
        </p>
      )}
      <ul className="grid gap-2 md:grid-cols-2">
        {checks.map((check) => {
          const state = (check as SpineReadinessCheckResult).state ?? "advisory";
          const Icon =
            state === "pass" ? CheckCircle2
              : state === "fail" ? XCircle
              : state === "unknown" ? HelpCircle
              : CircleDashed;
          const iconClass =
            state === "pass" ? "text-emerald-600"
              : state === "fail" ? "text-rose-600"
              : state === "unknown" ? "text-amber-600"
              : "text-ink/40";
          const rowClass =
            state === "fail" ? "border-rose-200 bg-rose-50/60"
              : state === "unknown" ? "border-amber-200 bg-amber-50/50"
              : state === "pass" ? "border-emerald-200 bg-emerald-50/50"
              : "border-border bg-paper-soft/40";
          const note = (check as SpineReadinessCheckResult).note;
          return (
            <li
              key={check.id}
              className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm text-ink/80 ${rowClass}`}
              data-qa-check={check.id}
              data-qa-state={state}
            >
              <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${iconClass}`} />
              <div className="min-w-0">
                <div>{check.label}</div>
                {note ? <div className="text-[11px] text-ink/60 mt-0.5">{note}</div> : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
