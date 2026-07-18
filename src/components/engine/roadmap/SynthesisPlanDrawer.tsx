import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Layers,
  Loader2,
  RefreshCw,
  Sparkles,
  X,
  XCircle,
} from "lucide-react";
import {
  getRoadmapSynthesisPlan,
  runRoadmapSynthesis,
} from "@/lib/roadmap-synthesis/plan.functions";
import type {
  DoctrineGateReadiness,
  FillMode,
  SynthesisPlan,
  SynthesisStepId,
  SynthesisStepView,
} from "@/lib/roadmap-synthesis/contract";
import { HUMAN_LABEL_FOR_REASON } from "@/lib/roadmap-synthesis/contract";

type Props = {
  projectId: string;
  open: boolean;
  onClose: () => void;
  /** Optional: open with the "retry missing & failed" run auto-triggered. */
  autoRunOnOpen?: FillMode | null;
};

type ProgressState = {
  running: boolean;
  mode: FillMode | null;
  queue: SynthesisStepId[];
  currentIdx: number;
  perStep: Record<
    string,
    { status: "queued" | "running" | "succeeded" | "failed"; error?: string; endedAt?: string }
  >;
};

const emptyProgress: ProgressState = {
  running: false,
  mode: null,
  queue: [],
  currentIdx: 0,
  perStep: {},
};

export function SynthesisPlanDrawer({ projectId, open, onClose, autoRunOnOpen }: Props) {
  const getPlan = useServerFn(getRoadmapSynthesisPlan);
  const runFn = useServerFn(runRoadmapSynthesis);
  const qc = useQueryClient();
  const [progress, setProgress] = useState<ProgressState>(emptyProgress);
  const cancelRef = useRef(false);

  const planQuery = useQuery({
    queryKey: ["engine", "synthesis-plan", projectId],
    queryFn: () => getPlan({ data: { projectId } }) as unknown as Promise<SynthesisPlan>,
    enabled: open,
    refetchOnWindowFocus: false,
    // Poll live while a run is executing so state/attempt rows refresh.
    refetchInterval: progress.running ? 2000 : false,
  });

  const invalidateAll = useCallback(async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["engine", "synthesis-plan", projectId] }),
      qc.invalidateQueries({ queryKey: ["engine", "synthesis-freshness", projectId] }),
      qc.invalidateQueries({ queryKey: ["engine", "roadmap", projectId] }),
      qc.invalidateQueries({ queryKey: ["engine", "spine", projectId] }),
      qc.invalidateQueries({ queryKey: ["engine", "spine-readiness-eval", projectId] }),
    ]);
  }, [qc, projectId]);

  const runSteps = useCallback(
    async (mode: FillMode, stepIds: SynthesisStepId[]) => {
      if (progress.running || stepIds.length === 0) return;
      cancelRef.current = false;
      setProgress({
        running: true,
        mode,
        queue: stepIds,
        currentIdx: 0,
        perStep: Object.fromEntries(stepIds.map((id) => [id, { status: "queued" as const }])),
      });
      let failures = 0;
      let ranOk = 0;
      for (let i = 0; i < stepIds.length; i += 1) {
        if (cancelRef.current) break;
        const stepId = stepIds[i];
        setProgress((p) => ({
          ...p,
          currentIdx: i,
          perStep: { ...p.perStep, [stepId]: { status: "running" } },
        }));
        try {
          const res: any = await runFn({
            data: { projectId, mode, stepIds: [stepId] as never },
          });
          const stepErr = (res?.errors ?? []).find((e: any) => e.id === stepId);
          if (stepErr) {
            failures += 1;
            setProgress((p) => ({
              ...p,
              perStep: {
                ...p.perStep,
                [stepId]: {
                  status: "failed",
                  error: stepErr.message || "Step failed",
                  endedAt: new Date().toISOString(),
                },
              },
            }));
          } else {
            ranOk += 1;
            setProgress((p) => ({
              ...p,
              perStep: {
                ...p.perStep,
                [stepId]: { status: "succeeded", endedAt: new Date().toISOString() },
              },
            }));
          }
        } catch (err) {
          failures += 1;
          setProgress((p) => ({
            ...p,
            perStep: {
              ...p.perStep,
              [stepId]: {
                status: "failed",
                error: (err as Error).message || "Step failed",
                endedAt: new Date().toISOString(),
              },
            },
          }));
        }
        // Live invalidate after each step so the plan/UI updates in place.
        await invalidateAll();
      }
      setProgress((p) => ({ ...p, running: false }));
      if (failures > 0) {
        toast.error(`${failures} step${failures === 1 ? "" : "s"} failed. Review the drawer.`);
      } else if (ranOk > 0) {
        toast.success(`Refreshed ${ranOk} synthesis step${ranOk === 1 ? "" : "s"}.`);
      } else {
        toast.info("Nothing to refresh.");
      }
    },
    [progress.running, runFn, projectId, invalidateAll],
  );

  // Auto-run once when the drawer is opened with an autoRunOnOpen mode.
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (!open) {
      autoStartedRef.current = false;
      return;
    }
    if (autoStartedRef.current || !autoRunOnOpen || !planQuery.data) return;
    autoStartedRef.current = true;
    const ids = pickTargets(planQuery.data, autoRunOnOpen);
    if (ids.length > 0) void runSteps(autoRunOnOpen, ids);
  }, [open, autoRunOnOpen, planQuery.data, runSteps]);

  if (!open) return null;

  const plan = planQuery.data;
  const percent = computePercent(progress);
  const currentStepId = progress.queue[progress.currentIdx] ?? null;
  const currentLabel = plan?.steps.find((s) => s.id === currentStepId)?.label ?? currentStepId;
  const lastError = latestError(progress);

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label="Refresh project intelligence"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-ink/40"
      />
      <div className="relative flex h-full w-full max-w-xl flex-col border-l border-border bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-ink/50">Roadmap Synthesis</div>
            <h2 className="truncate font-display text-lg text-ink">Refresh Project Intelligence</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border p-1.5 text-ink/60 hover:border-ink/40 hover:text-ink"
            aria-label="Close drawer"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
          {planQuery.isPending && <div className="text-sm text-ink/60">Loading plan…</div>}
          {planQuery.isError && (
            <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
              {(planQuery.error as Error)?.message || "Could not load synthesis plan."}
            </div>
          )}
          {plan && (
            <>
              {!plan.attempts_available && (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
                  Attempt history unavailable — pending migration. Retry works, but failed / stale
                  state is derived from artifacts only until Tai applies RT-1 tables.
                </div>
              )}

              {progress.running || progress.queue.length > 0 ? (
                <ProgressPanel
                  progress={progress}
                  percent={percent}
                  currentLabel={currentLabel}
                  lastError={lastError}
                  onCancel={() => {
                    cancelRef.current = true;
                    setProgress((p) => ({ ...p, running: false }));
                  }}
                  labelFor={(id) => plan.steps.find((s) => s.id === id)?.label ?? id}
                />
              ) : null}

              <RunControls
                plan={plan}
                running={progress.running}
                onRun={(mode) => {
                  const ids = pickTargets(plan, mode);
                  if (ids.length === 0) {
                    toast.info(
                      mode === "repair"
                        ? "Nothing missing or failed."
                        : mode === "refresh"
                          ? "Nothing stale."
                          : "Nothing to rebuild.",
                    );
                    return;
                  }
                  void runSteps(mode, ids);
                }}
              />

              <GateList gates={plan.gates} />

              <StepList
                steps={plan.steps}
                progress={progress}
                onRetry={(id) => {
                  void runSteps("repair", [id]);
                }}
              />

              <ImpactSection steps={plan.steps} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function pickTargets(plan: SynthesisPlan, mode: FillMode): SynthesisStepId[] {
  if (mode === "repair") {
    return plan.steps
      .filter((s) => (s.state === "missing" || s.state === "failed") && s.state !== ("blocked" as any))
      .map((s) => s.id);
  }
  if (mode === "refresh") {
    return plan.steps
      .filter(
        (s) =>
          (s.state === "stale" || s.state === "missing" || s.state === "failed") &&
          s.state !== ("blocked" as any),
      )
      .map((s) => s.id);
  }
  // rebuild_draft
  return plan.steps.filter((s) => !s.may_affect_approved_truth).map((s) => s.id);
}

function computePercent(p: ProgressState): number {
  const total = p.queue.length;
  if (total === 0) return 0;
  const done = p.queue.filter(
    (id) => p.perStep[id]?.status === "succeeded" || p.perStep[id]?.status === "failed",
  ).length;
  return Math.round((done / total) * 100);
}

function latestError(p: ProgressState): { stepId: string; message: string } | null {
  let best: { stepId: string; message: string; endedAt: string } | null = null;
  for (const id of p.queue) {
    const s = p.perStep[id];
    if (s?.status === "failed" && s.error) {
      const endedAt = s.endedAt ?? "";
      if (!best || endedAt > best.endedAt) best = { stepId: id, message: s.error, endedAt };
    }
  }
  return best ? { stepId: best.stepId, message: best.message } : null;
}

function ProgressPanel({
  progress,
  percent,
  currentLabel,
  lastError,
  onCancel,
  labelFor,
}: {
  progress: ProgressState;
  percent: number;
  currentLabel: string | null;
  lastError: { stepId: string; message: string } | null;
  onCancel: () => void;
  labelFor: (id: SynthesisStepId) => string;
}) {
  const done = progress.queue.filter(
    (id) => progress.perStep[id]?.status === "succeeded" || progress.perStep[id]?.status === "failed",
  ).length;
  return (
    <section className="rounded-lg border border-royal/20 bg-royal/5 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-semibold text-royal">
            {progress.running ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5" />
            )}
            {progress.running
              ? `Synthesizing ${currentLabel ?? "…"}`
              : "Run complete"}
          </div>
          <div className="mt-0.5 text-[11px] text-ink/60">
            {done} of {progress.queue.length} step{progress.queue.length === 1 ? "" : "s"} · mode{" "}
            {progress.mode ?? "—"}
          </div>
        </div>
        {progress.running && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-border bg-white px-2 py-1 text-[11px] text-ink hover:border-ink/40"
          >
            Cancel
          </button>
        )}
      </div>
      <div
        className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full bg-royal transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
      <ol className="mt-2 space-y-1">
        {progress.queue.map((id) => {
          const s = progress.perStep[id];
          return (
            <li key={id} className="flex items-center gap-2 text-[11px]">
              {s?.status === "running" ? (
                <Loader2 className="h-3 w-3 animate-spin text-royal" />
              ) : s?.status === "succeeded" ? (
                <CheckCircle2 className="h-3 w-3 text-emerald-600" />
              ) : s?.status === "failed" ? (
                <XCircle className="h-3 w-3 text-rose-600" />
              ) : (
                <Clock className="h-3 w-3 text-ink/40" />
              )}
              <span className={s?.status === "failed" ? "text-rose-800" : "text-ink"}>
                {labelFor(id)}
              </span>
              {s?.status === "failed" && s.error && (
                <span className="ml-1 truncate text-rose-700/80" title={s.error}>
                  — {s.error}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {lastError && !progress.running && (
        <p className="mt-2 rounded border border-rose-200 bg-white px-2 py-1 text-[11px] text-rose-800">
          Last error ({labelFor(lastError.stepId as SynthesisStepId)}): {lastError.message}
        </p>
      )}
    </section>
  );
}

function RunControls({
  plan,
  running,
  onRun,
}: {
  plan: SynthesisPlan;
  running: boolean;
  onRun: (mode: FillMode) => void;
}) {
  const repairCount = plan.steps.filter(
    (s) => s.state === "missing" || s.state === "failed",
  ).length;
  const gated = plan.gated;
  const staleCount = plan.steps.filter((s) => s.state === "stale").length;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onRun("repair")}
          disabled={running || gated || repairCount === 0}
          className="inline-flex items-center gap-1.5 rounded-md bg-royal px-3 py-1.5 text-xs font-medium text-white hover:bg-royal/90 disabled:cursor-not-allowed disabled:opacity-50"
          title={
            gated
              ? "A doctrine gate is unmet. Resolve it first."
              : repairCount === 0
                ? "Nothing to repair."
                : `Retry ${repairCount} missing or failed step${repairCount === 1 ? "" : "s"}. Approved truth is never touched.`
          }
        >
          {running ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Retry missing / failed ({repairCount})
        </button>
        <button
          type="button"
          onClick={() => onRun("refresh")}
          disabled={running || gated || staleCount === 0}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-white px-3 py-1.5 text-xs text-ink hover:border-ink/40 disabled:opacity-50"
          title="Regenerate stale drafts that were affected by new intelligence."
        >
          <Sparkles className="h-3.5 w-3.5" />
          Refresh with new intelligence ({staleCount})
        </button>
        <button
          type="button"
          onClick={() => {
            if (
              confirm(
                "Rebuild every draft candidate? Approved truth is never overwritten — new candidates go to the review queue.",
              )
            )
              onRun("rebuild_draft");
          }}
          disabled={running || gated}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-white px-3 py-1.5 text-xs text-ink hover:border-ink/40 disabled:opacity-50"
        >
          Rebuild drafts
        </button>
      </div>
      {gated && (
        <p className="text-[11px] text-amber-800">
          Doctrine gates are unmet — synthesis is paused. Resolve them below.
        </p>
      )}
    </div>
  );
}

function GateList({ gates }: { gates: DoctrineGateReadiness[] }) {
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink/60">
        <Layers className="h-3.5 w-3.5" /> Doctrine readiness
      </h3>
      <ul className="space-y-1.5">
        {gates.map((g) => (
          <li
            key={g.id}
            className={`rounded-md border px-3 py-2 text-xs ${
              g.satisfied ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {g.satisfied ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-700" />
                )}
                <span className="font-medium text-ink">{g.label}</span>
                {g.resolution_pending && (
                  <span className="rounded-full border border-ink/10 bg-white px-1.5 py-0.5 text-[10px] text-ink/60">
                    workspace pending
                  </span>
                )}
              </div>
              <span className="text-[11px] text-ink/60">
                {g.satisfied ? "Satisfied" : "Unmet"}
              </span>
            </div>
            {!g.satisfied && g.missing_pieces.length > 0 && (
              <ul className="mt-1.5 ml-5 list-disc space-y-0.5 text-[11px] text-amber-900">
                {g.missing_pieces.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function StepList({
  steps,
  progress,
  onRetry,
}: {
  steps: SynthesisStepView[];
  progress: ProgressState;
  onRetry: (id: SynthesisStepId) => void;
}) {
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink/60">
        <Clock className="h-3.5 w-3.5" /> Synthesis steps
      </h3>
      <ul className="space-y-1.5">
        {steps.map((s) => {
          const live = progress.perStep[s.id];
          const isRunning = live?.status === "running";
          const failedNow = live?.status === "failed";
          return (
            <li
              key={s.id}
              className="flex items-start justify-between gap-3 rounded-md border border-border bg-white px-3 py-2 text-xs"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <StateChip state={isRunning ? "running" : s.state} />
                  <span className="font-medium text-ink">{s.label}</span>
                  {s.may_affect_approved_truth && (
                    <span
                      className="rounded-full border border-ink/10 bg-muted px-1.5 py-0.5 text-[10px] text-ink/60"
                      title="A candidate is written here rather than overwriting approved truth."
                    >
                      approved-truth-safe
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[11px] text-ink/60">
                  {failedNow && live?.error
                    ? live.error
                    : s.reason_detail ||
                      (s.reason ? HUMAN_LABEL_FOR_REASON[s.reason] : "Up to date.")}
                </p>
                {s.last_attempt_at && (
                  <p className="mt-0.5 text-[10px] text-ink/40">
                    Last attempt {new Date(s.last_attempt_at).toLocaleString()}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => onRetry(s.id)}
                disabled={
                  s.state === "blocked" ||
                  s.state === "satisfied" ||
                  progress.running
                }
                className="shrink-0 rounded-md border border-border bg-white px-2 py-1 text-[11px] text-ink hover:border-ink/40 disabled:cursor-not-allowed disabled:opacity-50"
                title={
                  s.state === "blocked"
                    ? `Blocked by: ${s.blocked_by.join(", ")}`
                    : s.state === "satisfied"
                      ? "Already satisfied"
                      : "Retry this step"
                }
              >
                {isRunning ? "Running…" : "Retry"}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ImpactSection({ steps }: { steps: SynthesisStepView[] }) {
  const impacted = useMemo(
    () => steps.filter((s) => s.may_affect_approved_truth && s.state === "stale"),
    [steps],
  );
  if (impacted.length === 0) return null;
  return (
    <section className="rounded-md border border-amber-200 bg-amber-50 p-3">
      <h3 className="text-xs font-semibold text-amber-900">Impact review</h3>
      <p className="mt-1 text-[11px] text-amber-900/80">
        New intelligence may affect approved truth for {impacted.length} step
        {impacted.length === 1 ? "" : "s"}. Approved truth stays live until a candidate is
        reviewed. RT-4/RT-5 ships the reviewer UI.
      </p>
      <ul className="mt-1.5 ml-5 list-disc text-[11px] text-amber-900">
        {impacted.map((s) => (
          <li key={s.id}>{s.label}</li>
        ))}
      </ul>
    </section>
  );
}

function StateChip({ state }: { state: SynthesisStepView["state"] }) {
  const map: Record<SynthesisStepView["state"], { label: string; className: string }> = {
    satisfied: { label: "Satisfied", className: "border-emerald-200 bg-emerald-50 text-emerald-800" },
    missing: { label: "Missing", className: "border-ink/10 bg-white text-ink/70" },
    failed: { label: "Failed", className: "border-rose-200 bg-rose-50 text-rose-800" },
    stale: { label: "Stale", className: "border-amber-200 bg-amber-50 text-amber-800" },
    blocked: { label: "Blocked", className: "border-ink/10 bg-muted text-ink/60" },
    running: { label: "Running", className: "border-royal/30 bg-royal/10 text-royal" },
    candidate_ready: { label: "Candidate", className: "border-royal/30 bg-royal/10 text-royal" },
    awaiting_review: { label: "Awaiting review", className: "border-amber-200 bg-amber-50 text-amber-800" },
    superseded: { label: "Superseded", className: "border-ink/10 bg-muted text-ink/50" },
  };
  const s = map[state];
  return (
    <span
      className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${s.className}`}
    >
      {s.label}
    </span>
  );
}
