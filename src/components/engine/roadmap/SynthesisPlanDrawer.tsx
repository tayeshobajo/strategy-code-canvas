import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
} from "lucide-react";
import {
  getRoadmapSynthesisPlan,
  runRoadmapSynthesis,
} from "@/lib/roadmap-synthesis/plan.functions";
import type {
  DoctrineGateReadiness,
  FillMode,
  SynthesisPlan,
  SynthesisStepView,
} from "@/lib/roadmap-synthesis/contract";
import { HUMAN_LABEL_FOR_REASON } from "@/lib/roadmap-synthesis/contract";

type Props = {
  projectId: string;
  open: boolean;
  onClose: () => void;
};

export function SynthesisPlanDrawer({ projectId, open, onClose }: Props) {
  const getPlan = useServerFn(getRoadmapSynthesisPlan);
  const runFn = useServerFn(runRoadmapSynthesis);
  const qc = useQueryClient();
  const [busyStep, setBusyStep] = useState<string | null>(null);

  const planQuery = useQuery({
    queryKey: ["engine", "synthesis-plan", projectId],
    queryFn: () => getPlan({ data: { projectId } }) as unknown as Promise<SynthesisPlan>,
    enabled: open,
    refetchOnWindowFocus: false,
  });

  const invalidateAll = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["engine", "synthesis-plan", projectId] }),
      qc.invalidateQueries({ queryKey: ["engine", "roadmap", projectId] }),
      qc.invalidateQueries({ queryKey: ["engine", "spine", projectId] }),
      qc.invalidateQueries({ queryKey: ["engine", "spine-readiness-eval", projectId] }),
    ]);
  };

  const runMutation = useMutation({
    mutationFn: async (args: { mode: FillMode; stepIds?: string[] }) =>
      runFn({ data: { projectId, mode: args.mode, ...(args.stepIds ? { stepIds: args.stepIds as never } : {}) } }),
    onSuccess: async (res: any) => {
      await invalidateAll();
      const ran = res?.ran?.length ?? 0;
      const blocked = res?.blocked?.length ?? 0;
      const errors = res?.errors?.length ?? 0;
      if (errors > 0) toast.error(`${errors} step${errors === 1 ? "" : "s"} failed. Review the drawer.`);
      else if (ran > 0) toast.success(`Refreshed ${ran} synthesis step${ran === 1 ? "" : "s"}.`);
      else if (blocked > 0) toast.info(`${blocked} step${blocked === 1 ? "" : "s"} blocked by doctrine gates.`);
      else toast.info("Nothing to refresh — all steps satisfied.");
    },
    onError: (e) => {
      toast.error((e as Error).message || "Synthesis run failed.");
    },
    onSettled: () => setBusyStep(null),
  });

  if (!open) return null;

  const plan = planQuery.data;
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

              <RunControls
                plan={plan}
                running={runMutation.isPending}
                onRun={(mode) => runMutation.mutate({ mode })}
              />

              <GateList gates={plan.gates} />

              <StepList
                steps={plan.steps}
                busyStep={busyStep}
                onRetry={(id) => {
                  setBusyStep(id);
                  runMutation.mutate({ mode: "repair", stepIds: [id] });
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

function RunControls({
  plan,
  running,
  onRun,
}: {
  plan: SynthesisPlan;
  running: boolean;
  onRun: (mode: FillMode) => void;
}) {
  const repairCount = plan.runnable_repair.length;
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
                : `Repair ${repairCount} missing or failed step${repairCount === 1 ? "" : "s"}.`
          }
        >
          {running ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Repair missing & failed ({repairCount})
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
  busyStep,
  onRetry,
}: {
  steps: SynthesisStepView[];
  busyStep: string | null;
  onRetry: (id: string) => void;
}) {
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink/60">
        <Clock className="h-3.5 w-3.5" /> Synthesis steps
      </h3>
      <ul className="space-y-1.5">
        {steps.map((s) => (
          <li
            key={s.id}
            className="flex items-start justify-between gap-3 rounded-md border border-border bg-white px-3 py-2 text-xs"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <StateChip state={s.state} />
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
                {s.reason_detail ||
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
              disabled={s.state === "blocked" || s.state === "satisfied" || busyStep === s.id}
              className="shrink-0 rounded-md border border-border bg-white px-2 py-1 text-[11px] text-ink hover:border-ink/40 disabled:cursor-not-allowed disabled:opacity-50"
              title={
                s.state === "blocked"
                  ? `Blocked by: ${s.blocked_by.join(", ")}`
                  : s.state === "satisfied"
                    ? "Already satisfied"
                    : "Retry this step"
              }
            >
              {busyStep === s.id ? "Running…" : "Retry"}
            </button>
          </li>
        ))}
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
