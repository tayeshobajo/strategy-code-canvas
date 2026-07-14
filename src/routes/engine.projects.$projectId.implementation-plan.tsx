import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import {
  Sparkles,
  Loader2,
  ShieldCheck,
  ArrowUpCircle,
  CheckCircle2,
  Archive,
  AlertTriangle,
  ClipboardCheck,
  Bot,
  HelpCircle,
  ListChecks,
  ShieldAlert,
  Users,
  Database,
  KeyRound,
  Monitor,
  Cable,
  Flag,
  Boxes,
  Wrench,
  GitBranch,
  Copy,
} from "lucide-react";
import {
  getProjectImplementationPlan,
  generateProjectImplementationPlan,
  submitProjectImplementationPlanToReview,
  approveProjectImplementationPlan,
  archiveProjectImplementationPlan,
  saveProjectImplementationPlanDraft,
  type ImplementationPlanState,
  type ImplPlanRow,
  type ImplPlanStatus,
  type ImplPriority,
  type ImplStepType,
  type ImplementationPayload,
} from "@/lib/engine-implementation-plan.functions";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Pencil } from "lucide-react";

export const Route = createFileRoute(
  "/engine/projects/$projectId/implementation-plan",
)({
  component: ImplementationPlanPage,
  errorComponent: ({ error }) => (
    <div
      role="alert"
      className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800"
    >
      Failed to load Implementation Plan: {(error as Error).message}
    </div>
  ),
  notFoundComponent: () => (
    <div className="rounded border border-border bg-card p-4 text-sm text-ink/70">
      Implementation Plan not available for this project.
    </div>
  ),
});

const planQueryOptions = (
  projectId: string,
  fn: (input: { data: { projectId: string } }) => Promise<unknown>,
) =>
  queryOptions({
    queryKey: ["engine", "implementation-plan", projectId],
    queryFn: () => fn({ data: { projectId } }),
    staleTime: 10_000,
  });

function ImplementationPlanPage() {
  const { projectId } = Route.useParams();
  const qc = useQueryClient();
  const fn = useServerFn(getProjectImplementationPlan);
  const genFn = useServerFn(generateProjectImplementationPlan);
  const submitFn = useServerFn(submitProjectImplementationPlanToReview);
  const approveFn = useServerFn(approveProjectImplementationPlan);
  const archiveFn = useServerFn(archiveProjectImplementationPlan);
  const saveDraftFn = useServerFn(saveProjectImplementationPlanDraft);
  const [editOpen, setEditOpen] = useState(false);

  const { data, isPending, isError, error, refetch } = useQuery(
    planQueryOptions(
      projectId,
      fn as unknown as (i: { data: { projectId: string } }) => Promise<unknown>,
    ),
  );
  const [busy, setBusy] = useState<
    null | "generate" | "submit" | "approve" | "archive"
  >(null);
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["engine", "implementation-plan", projectId] });

  const state = data as ImplementationPlanState | undefined;

  const onGenerate = async () => {
    setBusy("generate");
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = (await (genFn as any)({ data: { projectId } })) as {
        ok: boolean;
        message?: string;
        missing_inputs?: Array<{ label: string }>;
      };
      if (!res.ok) {
        toast.error(res.message ?? "Missing inputs", {
          description: res.missing_inputs?.map((m) => m.label).join(", "),
        });
      } else {
        toast.success("Implementation plan draft generated");
      }
      invalidate();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const onSubmit = async (planId: string) => {
    setBusy("submit");
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (submitFn as any)({ data: { projectId, planId } });
      toast.success("Implementation plan submitted to review");
      invalidate();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const onApprove = async (planId: string) => {
    setBusy("approve");
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (approveFn as any)({ data: { projectId, planId } });
      toast.success("Implementation plan approved");
      invalidate();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const onArchive = async (planId: string) => {
    if (!confirm("Archive this implementation plan? Archived plans cannot be edited."))
      return;
    setBusy("archive");
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (archiveFn as any)({ data: { projectId, planId } });
      toast.success("Implementation plan archived");
      invalidate();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (isPending) {
    return (
      <div
        className="rounded-xl border border-border bg-card p-8 text-sm text-ink/60"
        data-qa-state="impl-loading"
      >
        <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Loading Implementation
        Plan…
      </div>
    );
  }
  if (isError || !state) {
    return (
      <div
        role="alert"
        className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-800"
      >
        Failed to load Implementation Plan:{" "}
        {(error as Error | null)?.message ?? "unknown error"}
        <button className="ml-3 underline" onClick={() => void refetch()}>
          retry
        </button>
      </div>
    );
  }

  const latest = state.latest;

  return (
    <div
      className="grid grid-cols-1 xl:grid-cols-3 gap-5"
      data-qa-state="impl-loaded"
      data-project-id={projectId}
    >
      <div className="xl:col-span-2 space-y-5">
        <HeaderCard
          state={state}
          busy={busy}
          onGenerate={onGenerate}
          onSubmit={onSubmit}
          onApprove={onApprove}
          onArchive={onArchive}
          onEdit={() => setEditOpen(true)}
        />
        <EditDraftDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          plan={latest}
          projectId={projectId}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          saveFn={saveDraftFn as any}
          onSaved={() => {
            setEditOpen(false);
            invalidate();
          }}
        />
        {latest ? (
          <>
            <OverviewCard plan={latest} />
            <PhasesSection plan={latest} />
            <BuildStepsSection plan={latest} />
            <MigrationPlanSection plan={latest} />
            <ServerFunctionPlanSection plan={latest} />
            <UiWiringSection plan={latest} />
            <PermissionRlsSection plan={latest} />
            <IntegrationSection plan={latest} />
            <QaExecutionOrderSection plan={latest} />
            <DeveloperPromptsSection plan={latest} />
            <RollbackReleaseGatesSection plan={latest} />
            <OpenDecisionsSection plan={latest} />
            <RisksSection plan={latest} />
            <HistoryCard history={state.history} />
          </>
        ) : (
          <EmptyPlanCard state={state} />
        )}
      </div>
      <div className="xl:col-span-1 space-y-5">
        <AiPmPanel state={state} />
      </div>
    </div>
  );
}

// ------------------------ presentational ------------------------

function StatusBadge({ status }: { status: ImplPlanStatus }) {
  const map: Record<ImplPlanStatus, string> = {
    draft: "bg-ink/10 text-ink",
    in_review: "bg-amber-100 text-amber-900 border-amber-300",
    approved: "bg-emerald-100 text-emerald-900 border-emerald-300",
    archived: "bg-ink/5 text-ink/60",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-widest font-mono",
        map[status],
      )}
    >
      {status.replace("_", " ")}
    </span>
  );
}

function PriorityBadge({ p }: { p: ImplPriority }) {
  const map: Record<ImplPriority, string> = {
    p0: "bg-red-100 text-red-900 border-red-300",
    p1: "bg-amber-100 text-amber-900 border-amber-300",
    p2: "bg-ink/10 text-ink/70 border-border",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] uppercase tracking-widest font-mono",
        map[p],
      )}
    >
      {p}
    </span>
  );
}

function RiskBadge({ r }: { r: "low" | "medium" | "high" }) {
  const map = {
    high: "bg-red-100 text-red-900 border-red-300",
    medium: "bg-amber-100 text-amber-900 border-amber-300",
    low: "bg-ink/10 text-ink/70 border-border",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] uppercase tracking-widest font-mono",
        map[r],
      )}
    >
      {r} risk
    </span>
  );
}

function HeaderCard({
  state,
  busy,
  onGenerate,
  onSubmit,
  onApprove,
  onArchive,
}: {
  state: ImplementationPlanState;
  busy: string | null;
  onGenerate: () => void;
  onSubmit: (id: string) => void;
  onApprove: (id: string) => void;
  onArchive: (id: string) => void;
}) {
  const latest = state.latest;
  const backend = state.approved_backend_plan;
  const qa = state.approved_qa_plan;
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-ink/50">
            Implementation Plan
          </div>
          <h1 className="text-xl font-semibold mt-1">
            {latest?.title ?? "No implementation plan yet"}
          </h1>
          <div className="text-xs text-ink/60 mt-1">
            {state.project.client_company} · {state.project.current_step} ·{" "}
            {state.project.status}
          </div>
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            {latest ? <StatusBadge status={latest.status} /> : null}
            {backend ? (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300 px-2 py-0.5 text-[10px] uppercase tracking-widest font-mono"
                data-qa="badge-approved-backend"
              >
                <ShieldCheck className="w-3 h-3" /> Backend approved
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 text-[10px] uppercase tracking-widest font-mono">
                <AlertTriangle className="w-3 h-3" /> Backend not approved
              </span>
            )}
            {qa ? (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300 px-2 py-0.5 text-[10px] uppercase tracking-widest font-mono"
                data-qa="badge-approved-qa"
              >
                <ShieldCheck className="w-3 h-3" /> QA approved
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 text-[10px] uppercase tracking-widest font-mono">
                <AlertTriangle className="w-3 h-3" /> QA not approved
              </span>
            )}
            {latest ? (
              <span className="text-[10px] uppercase tracking-widest text-ink/50">
                {latest.generated_by} ·{" "}
                {new Date(latest.updated_at).toLocaleString()}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={onGenerate}
            disabled={!state.capabilities.canGenerate || busy === "generate"}
            className="inline-flex items-center gap-1.5 rounded-md bg-royal text-white text-xs px-3 py-1.5 hover:bg-royal/90 disabled:opacity-50"
            title={
              !state.capabilities.canGenerate
                ? "Approve a backend plan AND a QA plan before generating."
                : ""
            }
            data-qa="btn-generate-impl"
          >
            {busy === "generate" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            Generate Implementation Plan
          </button>
          {latest?.status === "draft" ? (
            <button
              onClick={() => onSubmit(latest.id)}
              disabled={busy === "submit"}
              className="inline-flex items-center gap-1.5 rounded-md border border-border text-xs px-3 py-1.5 hover:border-royal/50 disabled:opacity-50"
              data-qa="btn-submit-impl"
            >
              <ArrowUpCircle className="w-3.5 h-3.5" /> Submit to Review
            </button>
          ) : null}
          {latest?.status === "in_review" && state.capabilities.canApprove ? (
            <button
              onClick={() => onApprove(latest.id)}
              disabled={busy === "approve"}
              className="inline-flex items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 text-emerald-900 text-xs px-3 py-1.5 hover:bg-emerald-100 disabled:opacity-50"
              data-qa="btn-approve-impl"
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> Approve
            </button>
          ) : null}
          {latest && latest.status !== "archived" && state.capabilities.canArchive ? (
            <button
              onClick={() => onArchive(latest.id)}
              disabled={busy === "archive"}
              className="inline-flex items-center gap-1.5 rounded-md border border-border text-xs px-3 py-1.5 text-ink/60 hover:border-red-300 hover:text-red-700 disabled:opacity-50"
              data-qa="btn-archive-impl"
            >
              <Archive className="w-3.5 h-3.5" /> Archive
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function EmptyPlanCard({ state }: { state: ImplementationPlanState }) {
  return (
    <div
      className="rounded-xl border border-dashed border-border bg-card p-8 text-center"
      data-qa="empty-impl"
    >
      <ClipboardCheck className="w-8 h-8 mx-auto text-ink/40" />
      <div className="mt-3 text-sm font-medium">No implementation plan yet</div>
      <div className="text-xs text-ink/60 mt-1 max-w-md mx-auto">
        Implementation Plan turns the <strong>approved backend plan</strong> and{" "}
        <strong>approved QA plan</strong> (plus the approved mockup, frame, and
        spine) into a structured build sequence — phases, ordered build steps,
        migration plan, server function plan, UI wiring plan, RLS/permission
        plan, QA execution order, developer prompts, rollback strategy, release
        gates, risks, and open decisions. It does not apply migrations, write
        code, deploy, mark tests passed, or mark the project delivered.
      </div>
      {!state.readiness.ready ? (
        <div
          className="mt-4 rounded border border-amber-200 bg-amber-50 p-3 text-left text-xs text-amber-900"
          data-qa="impl-missing-inputs"
        >
          <div className="font-semibold mb-1 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" /> Missing inputs
          </div>
          <ul className="list-disc list-inside space-y-0.5">
            {state.readiness.missing.map((m) => (
              <li key={m.key}>
                <strong>{m.label}</strong> — {m.recommendation}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function countBy<T extends string>(items: string[], keys: T[]): Record<T, number> {
  const out = Object.fromEntries(keys.map((k) => [k, 0])) as Record<T, number>;
  for (const k of items) if ((keys as readonly string[]).includes(k)) out[k as T]++;
  return out;
}

function OverviewCard({ plan }: { plan: ImplPlanRow }) {
  const p = plan.payload;
  const priorities = countBy(
    p.build_steps.map((s) => s.priority),
    ["p0", "p1", "p2"],
  );
  const highRisk = p.build_steps.filter((s) => s.risk_level === "high").length;
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-ink/50">
        Overview
      </div>
      {plan.summary ? <p className="text-sm text-ink mt-2">{plan.summary}</p> : null}
      {p.implementation_goal ? (
        <p className="text-xs text-ink/70 mt-2">
          <span className="font-semibold">Goal:</span> {p.implementation_goal}
        </p>
      ) : null}
      {p.build_strategy ? (
        <p className="text-xs text-ink/70 mt-1">
          <span className="font-semibold">Strategy:</span> {p.build_strategy}
        </p>
      ) : null}
      {p.source_backend_summary ? (
        <p className="text-xs text-ink/60 mt-1 italic">
          Backend source: {p.source_backend_summary}
        </p>
      ) : null}
      {p.source_qa_summary ? (
        <p className="text-xs text-ink/60 mt-0.5 italic">
          QA source: {p.source_qa_summary}
        </p>
      ) : null}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 mt-4">
        <MetricTile label="Phases" value={p.phases.length} />
        <MetricTile label="Steps" value={p.build_steps.length} />
        <MetricTile label="P0" value={priorities.p0} />
        <MetricTile label="P1" value={priorities.p1} />
        <MetricTile label="High risk" value={highRisk} />
        <MetricTile label="Open dec." value={p.open_decisions.length} />
      </div>
    </div>
  );
}

function MetricTile({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded border border-border bg-white/40 p-2">
      <div className="text-lg font-semibold capitalize">{value}</div>
      <div className="text-[10px] uppercase tracking-widest text-ink/50">{label}</div>
    </div>
  );
}

function SectionCard({
  icon,
  title,
  children,
  qa,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  qa?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm" data-qa={qa}>
      <div className="flex items-center gap-2">
        {icon}
        <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-ink/50">
          {title}
        </div>
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function PhasesSection({ plan }: { plan: ImplPlanRow }) {
  const phases = [...plan.payload.phases].sort((a, b) => a.sequence - b.sequence);
  return (
    <SectionCard
      icon={<Boxes className="w-4 h-4 text-royal" />}
      title="Build Phases"
      qa="section-phases"
    >
      {phases.length === 0 ? (
        <div className="text-xs text-ink/50">No phases captured.</div>
      ) : (
        <ol className="space-y-3">
          {phases.map((ph) => (
            <li
              key={ph.id}
              className="rounded border border-border bg-white/50 p-3 text-xs"
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-ink/40">
                  {ph.id} · #{ph.sequence}
                </span>
                <span className="font-semibold text-sm text-ink">
                  {ph.title || "—"}
                </span>
              </div>
              {ph.goal ? <div className="mt-1 text-ink/70">{ph.goal}</div> : null}
              {ph.depends_on.length ? (
                <div className="mt-1 text-ink/60">
                  <span className="font-mono text-[9px] uppercase text-ink/40">
                    Depends on:{" "}
                  </span>
                  {ph.depends_on.join(", ")}
                </div>
              ) : null}
              <ChipList label="Deliverables" items={ph.deliverables} />
              <ChipList label="Acceptance gates" items={ph.acceptance_gates} />
              <ChipList label="QA gates" items={ph.qa_gates} />
              <ChipList label="Rollback notes" items={ph.rollback_notes} />
            </li>
          ))}
        </ol>
      )}
    </SectionCard>
  );
}

function ChipList({ label, items }: { label: string; items: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="mt-1 text-ink/70">
      <span className="font-mono text-[9px] uppercase text-ink/40">{label}: </span>
      {items.join(" · ")}
    </div>
  );
}

const STEP_TYPE_LABEL: Record<ImplStepType, string> = {
  migration: "Migration",
  server_function: "Server fn",
  ui_wiring: "UI wiring",
  integration: "Integration",
  permission: "Permission",
  data_seed: "Data seed",
  qa: "QA",
  documentation: "Docs",
  cleanup: "Cleanup",
};

function BuildStepsSection({ plan }: { plan: ImplPlanRow }) {
  const [type, setType] = useState<ImplStepType | "all">("all");
  const [priority, setPriority] = useState<ImplPriority | "all">("all");
  const [phaseId, setPhaseId] = useState<string | "all">("all");
  const steps = plan.payload.build_steps;
  const phases = plan.payload.phases;

  const filtered = useMemo(
    () =>
      steps.filter(
        (s) =>
          (type === "all" || s.type === type) &&
          (priority === "all" || s.priority === priority) &&
          (phaseId === "all" || s.phase_id === phaseId),
      ),
    [steps, type, priority, phaseId],
  );

  return (
    <SectionCard
      icon={<ListChecks className="w-4 h-4 text-royal" />}
      title="Build Steps"
      qa="section-build-steps"
    >
      <div className="flex flex-wrap gap-2 mb-3 text-[11px]">
        <select
          value={phaseId}
          onChange={(e) => setPhaseId(e.target.value)}
          className="rounded border border-border bg-white px-2 py-1"
          data-qa="filter-phase"
        >
          <option value="all">All phases</option>
          {phases.map((ph) => (
            <option key={ph.id} value={ph.id}>
              {ph.id} · {ph.title || "—"}
            </option>
          ))}
        </select>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as ImplStepType | "all")}
          className="rounded border border-border bg-white px-2 py-1"
          data-qa="filter-type"
        >
          <option value="all">All types</option>
          {(Object.keys(STEP_TYPE_LABEL) as ImplStepType[]).map((t) => (
            <option key={t} value={t}>
              {STEP_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as ImplPriority | "all")}
          className="rounded border border-border bg-white px-2 py-1"
          data-qa="filter-priority"
        >
          <option value="all">All priorities</option>
          <option value="p0">P0</option>
          <option value="p1">P1</option>
          <option value="p2">P2</option>
        </select>
        <span className="text-ink/50 py-1">
          {filtered.length} / {steps.length} shown
        </span>
      </div>
      {filtered.length === 0 ? (
        <div className="text-xs text-ink/50">No steps match filters.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map((s) => (
            <div
              key={s.id}
              className="rounded-lg border border-border bg-white/50 p-3 text-xs space-y-1"
            >
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <div className="font-semibold text-sm text-ink">
                    <span className="font-mono text-ink/50 mr-1">{s.id}</span>
                    {s.title || "—"}
                  </div>
                  <div className="text-ink/60">
                    {STEP_TYPE_LABEL[s.type]} · {s.phase_id || "—"}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-wrap">
                  <PriorityBadge p={s.priority} />
                  <RiskBadge r={s.risk_level} />
                  {s.requires_human_review ? (
                    <span className="rounded-full bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-0.5 text-[9px] uppercase tracking-widest font-mono">
                      human review
                    </span>
                  ) : null}
                </div>
              </div>
              {s.goal ? <div className="text-ink/70">{s.goal}</div> : null}
              <ChipList label="Inputs" items={s.inputs} />
              <ChipList label="Outputs" items={s.outputs} />
              <ChipList label="Files/surfaces" items={s.files_or_surfaces} />
              <ChipList label="Depends on" items={s.dependencies} />
              <ChipList label="Impl notes" items={s.implementation_notes} />
              <ChipList label="QA checks" items={s.qa_checks} />
              <ChipList label="Acceptance" items={s.acceptance_criteria} />
              <ChipList label="Rollback" items={s.rollback_plan} />
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function MigrationPlanSection({ plan }: { plan: ImplPlanRow }) {
  const items = [...plan.payload.migration_plan].sort((a, b) => a.sequence - b.sequence);
  return (
    <SectionCard
      icon={<Database className="w-4 h-4 text-royal" />}
      title="Migration Plan"
      qa="section-migration-plan"
    >
      {items.length === 0 ? (
        <div className="text-xs text-ink/50">No migrations planned.</div>
      ) : (
        <ol className="space-y-2 text-xs">
          {items.map((m) => (
            <li key={m.id} className="rounded border border-border bg-white/50 p-3">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-ink/40">
                  {m.id} · #{m.sequence}
                </span>
                <span className="font-semibold text-sm text-ink">
                  {m.title || "—"}
                </span>
              </div>
              <ChipList label="Table changes" items={m.table_changes} />
              <ChipList label="RLS / grants" items={m.rls_grants} />
              <ChipList label="Triggers" items={m.triggers} />
              <ChipList label="Seed data" items={m.seed_data} />
              <ChipList label="Rollback" items={m.rollback_notes} />
              <ChipList label="Safety" items={m.safety_checks} />
            </li>
          ))}
        </ol>
      )}
    </SectionCard>
  );
}

function ServerFunctionPlanSection({ plan }: { plan: ImplPlanRow }) {
  const items = [...plan.payload.server_function_plan].sort(
    (a, b) => a.sequence - b.sequence,
  );
  return (
    <SectionCard
      icon={<Wrench className="w-4 h-4 text-royal" />}
      title="Server Function Plan"
      qa="section-server-fn-plan"
    >
      {items.length === 0 ? (
        <div className="text-xs text-ink/50">No server functions planned.</div>
      ) : (
        <ol className="space-y-2 text-xs">
          {items.map((f) => (
            <li key={f.id} className="rounded border border-border bg-white/50 p-3">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-ink/40">
                  {f.id} · #{f.sequence}
                </span>
                <span className="font-semibold text-sm text-ink">
                  {f.name || "—"}
                </span>
              </div>
              <ChipList label="Inputs" items={f.inputs} />
              <ChipList label="Outputs" items={f.outputs} />
              <ChipList label="Permissions" items={f.permissions} />
              <ChipList label="Audit events" items={f.audit_events} />
              <ChipList label="Failure modes" items={f.failure_modes} />
              <ChipList label="QA tests" items={f.qa_tests} />
            </li>
          ))}
        </ol>
      )}
    </SectionCard>
  );
}

function UiWiringSection({ plan }: { plan: ImplPlanRow }) {
  const items = plan.payload.ui_wiring_plan;
  return (
    <SectionCard
      icon={<Monitor className="w-4 h-4 text-royal" />}
      title="UI Wiring Plan"
      qa="section-ui-wiring"
    >
      {items.length === 0 ? (
        <div className="text-xs text-ink/50">No UI wiring captured.</div>
      ) : (
        <ul className="space-y-2 text-xs">
          {items.map((u) => (
            <li key={u.id} className="rounded border border-border bg-white/50 p-3">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-ink/40">{u.id}</span>
                <span className="font-semibold text-sm text-ink">{u.route || "—"}</span>
              </div>
              <ChipList label="Components" items={u.components} />
              <ChipList label="Data deps" items={u.data_dependencies} />
              <ChipList label="Handlers" items={u.action_handlers} />
              {u.loading_state ? (
                <div className="mt-1 text-ink/70">
                  <span className="font-mono text-[9px] uppercase text-ink/40">
                    Loading:{" "}
                  </span>
                  {u.loading_state}
                </div>
              ) : null}
              {u.empty_state ? (
                <div className="text-ink/70">
                  <span className="font-mono text-[9px] uppercase text-ink/40">
                    Empty:{" "}
                  </span>
                  {u.empty_state}
                </div>
              ) : null}
              {u.error_state ? (
                <div className="text-ink/70">
                  <span className="font-mono text-[9px] uppercase text-ink/40">
                    Error:{" "}
                  </span>
                  {u.error_state}
                </div>
              ) : null}
              <ChipList label="Responsive" items={u.responsive_notes} />
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function PermissionRlsSection({ plan }: { plan: ImplPlanRow }) {
  const items = plan.payload.permission_rls_plan;
  return (
    <SectionCard
      icon={<KeyRound className="w-4 h-4 text-royal" />}
      title="Permission / RLS Plan"
      qa="section-permission-rls"
    >
      {items.length === 0 ? (
        <div className="text-xs text-ink/50">No permission rules captured.</div>
      ) : (
        <ul className="space-y-2 text-xs">
          {items.map((p, i) => (
            <li key={i} className="rounded border border-border bg-white/50 p-3">
              <div className="font-semibold text-sm text-ink">{p.surface || "—"}</div>
              <ChipList label="Roles" items={p.roles} />
              <ChipList label="Access rules" items={p.access_rules} />
              <ChipList label="Server fn gates" items={p.server_function_gates} />
              {p.direct_write_prevention ? (
                <div className="mt-1 text-ink/70">
                  <span className="font-mono text-[9px] uppercase text-ink/40">
                    Direct-write prevention:{" "}
                  </span>
                  {p.direct_write_prevention}
                </div>
              ) : null}
              {p.cross_project_isolation ? (
                <div className="text-ink/70">
                  <span className="font-mono text-[9px] uppercase text-ink/40">
                    Cross-project:{" "}
                  </span>
                  {p.cross_project_isolation}
                </div>
              ) : null}
              {p.portal_boundary ? (
                <div className="text-ink/70">
                  <span className="font-mono text-[9px] uppercase text-ink/40">
                    Portal boundary:{" "}
                  </span>
                  {p.portal_boundary}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function IntegrationSection({ plan }: { plan: ImplPlanRow }) {
  const items = plan.payload.integration_plan;
  return (
    <SectionCard
      icon={<Cable className="w-4 h-4 text-royal" />}
      title="Integration Plan"
      qa="section-integration"
    >
      {items.length === 0 ? (
        <div className="text-xs text-ink/50">No integrations planned.</div>
      ) : (
        <ul className="space-y-2 text-xs">
          {items.map((it, i) => (
            <li key={i} className="rounded border border-border bg-white/50 p-3">
              <div className="font-semibold text-sm text-ink">{it.system || "—"}</div>
              {it.purpose ? <div className="text-ink/70">{it.purpose}</div> : null}
              <ChipList label="Secrets required" items={it.secrets_required} />
              <ChipList label="Safety notes" items={it.safety_notes} />
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function QaExecutionOrderSection({ plan }: { plan: ImplPlanRow }) {
  const items = plan.payload.qa_execution_order;
  return (
    <SectionCard
      icon={<GitBranch className="w-4 h-4 text-royal" />}
      title="QA Execution Order"
      qa="section-qa-execution-order"
    >
      {items.length === 0 ? (
        <div className="text-xs text-ink/50">No QA execution order captured.</div>
      ) : (
        <ol className="space-y-2 text-xs">
          {items.map((q, i) => (
            <li key={i} className="rounded border border-border bg-white/50 p-3">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-ink/40">
                  after {q.after_step_id || "—"}
                </span>
                {q.blocking ? (
                  <span className="rounded-full bg-red-100 text-red-900 border border-red-300 px-1.5 py-0.5 text-[9px] uppercase tracking-widest font-mono">
                    blocking
                  </span>
                ) : null}
              </div>
              <ChipList label="Run tests" items={q.run_tests} />
              <ChipList label="Evidence" items={q.evidence_required} />
              {q.notes ? <div className="mt-1 text-ink/70">{q.notes}</div> : null}
            </li>
          ))}
        </ol>
      )}
    </SectionCard>
  );
}

function DeveloperPromptsSection({ plan }: { plan: ImplPlanRow }) {
  const items = plan.payload.developer_prompts;
  const copy = (text: string) => {
    void navigator.clipboard.writeText(text);
    toast.success("Prompt copied");
  };
  return (
    <SectionCard
      icon={<Bot className="w-4 h-4 text-royal" />}
      title="Developer Prompts"
      qa="section-developer-prompts"
    >
      {items.length === 0 ? (
        <div className="text-xs text-ink/50">No prompts captured.</div>
      ) : (
        <div className="grid grid-cols-1 gap-3 text-xs">
          {items.map((d, i) => (
            <div
              key={i}
              className="rounded border border-border bg-white/50 p-3 space-y-1"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold text-sm text-ink">
                    {d.title || "—"}
                  </div>
                  <div className="text-ink/60">Target: {d.target}</div>
                </div>
                <button
                  className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest font-mono rounded border border-border px-2 py-1 hover:border-royal/50"
                  onClick={() => copy(d.prompt)}
                >
                  <Copy className="w-3 h-3" /> Copy
                </button>
              </div>
              {d.prompt ? (
                <pre className="whitespace-pre-wrap rounded bg-ink/5 p-2 text-[11px] text-ink/80 font-mono">
                  {d.prompt}
                </pre>
              ) : null}
              {d.expected_output ? (
                <div className="text-ink/70">
                  <span className="font-mono text-[9px] uppercase text-ink/40">
                    Expected output:{" "}
                  </span>
                  {d.expected_output}
                </div>
              ) : null}
              <ChipList label="Acceptance" items={d.acceptance_criteria} />
              <ChipList label="Safety" items={d.safety_notes} />
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function RollbackReleaseGatesSection({ plan }: { plan: ImplPlanRow }) {
  const rollback = plan.payload.rollback_strategy;
  const gates = plan.payload.release_gates;
  const par = plan.payload.parallelization;
  return (
    <SectionCard
      icon={<Flag className="w-4 h-4 text-royal" />}
      title="Rollback + Release Gates + Parallelization"
      qa="section-rollback-gates"
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
        <div className="rounded border border-border bg-white/50 p-3">
          <div className="font-mono text-[9px] uppercase tracking-widest text-ink/40">
            Rollback strategy
          </div>
          {rollback.length === 0 ? (
            <div className="text-ink/50 mt-1">None captured.</div>
          ) : (
            <ul className="mt-1 space-y-2">
              {rollback.map((r, i) => (
                <li key={i}>
                  <div className="font-semibold text-ink">
                    {r.level} · {r.target}
                  </div>
                  <ul className="list-disc list-inside text-ink/70">
                    {r.steps.map((s, j) => (
                      <li key={j}>{s}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded border border-border bg-white/50 p-3">
          <div className="font-mono text-[9px] uppercase tracking-widest text-ink/40">
            Release gates
          </div>
          {gates.length === 0 ? (
            <div className="text-ink/50 mt-1">None captured.</div>
          ) : (
            <ul className="mt-1 space-y-2">
              {gates.map((g, i) => (
                <li key={i}>
                  <div className="font-semibold text-ink">{g.gate}</div>
                  {g.criterion ? (
                    <div className="text-ink/70">{g.criterion}</div>
                  ) : null}
                  {g.no_go_conditions.length ? (
                    <div className="text-ink/60">
                      <span className="font-mono text-[9px] uppercase text-ink/40">
                        No-go:{" "}
                      </span>
                      {g.no_go_conditions.join(", ")}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded border border-border bg-white/50 p-3">
          <div className="font-mono text-[9px] uppercase tracking-widest text-ink/40">
            Parallelization
          </div>
          <ChipList label="Can parallelize" items={par.can_parallelize} />
          <ChipList label="Must sequence" items={par.must_sequence} />
          <ChipList label="Blocked until" items={par.blocked_until} />
        </div>
      </div>
    </SectionCard>
  );
}

function OpenDecisionsSection({ plan }: { plan: ImplPlanRow }) {
  const decisions = plan.payload.open_decisions;
  return (
    <SectionCard
      icon={<HelpCircle className="w-4 h-4 text-royal" />}
      title="Open Decisions"
      qa="section-open-decisions"
    >
      {decisions.length === 0 ? (
        <div className="text-xs text-ink/50">No open decisions.</div>
      ) : (
        <ul className="space-y-2 text-xs">
          {decisions.map((d, i) => (
            <li key={i} className="rounded border border-amber-200 bg-amber-50 p-3">
              <div className="font-semibold text-amber-950">{d.question}</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {d.blocks?.map((b) => (
                  <span
                    key={b}
                    className="rounded-full bg-amber-200 text-amber-950 px-2 py-0.5 text-[10px] uppercase tracking-widest"
                  >
                    blocks {b}
                  </span>
                ))}
              </div>
              <div className="mt-1 text-ink/70">
                <strong>Owner:</strong> {d.recommended_owner} ·{" "}
                <strong>Next:</strong> {d.suggested_next_action}
              </div>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function RisksSection({ plan }: { plan: ImplPlanRow }) {
  const risks = plan.payload.risks;
  return (
    <SectionCard
      icon={<ShieldAlert className="w-4 h-4 text-royal" />}
      title="Risks"
      qa="section-risks"
    >
      {risks.length === 0 ? (
        <div className="text-xs text-ink/50">No risks captured.</div>
      ) : (
        <ul className="space-y-2 text-xs">
          {risks.map((r, i) => (
            <li
              key={i}
              className={cn(
                "rounded border p-3",
                r.severity === "high"
                  ? "border-red-200 bg-red-50 text-red-900"
                  : r.severity === "medium"
                    ? "border-amber-200 bg-amber-50 text-amber-900"
                    : "border-border bg-white/50 text-ink/80",
              )}
            >
              <div className="flex items-center justify-between">
                <div className="font-semibold">{r.name}</div>
                <span className="text-[10px] uppercase tracking-widest font-mono">
                  {r.severity}
                </span>
              </div>
              {r.mitigation ? <div className="mt-1">{r.mitigation}</div> : null}
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function HistoryCard({ history }: { history: ImplementationPlanState["history"] }) {
  if (!history.length) return null;
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-ink/50">
        History
      </div>
      <ul className="mt-2 text-xs divide-y divide-border">
        {history.slice(0, 8).map((h) => (
          <li key={h.id} className="py-1.5 flex items-center justify-between gap-2">
            <div className="truncate">
              <span className="font-medium">{h.title}</span>{" "}
              <span className="text-ink/50">· {h.generated_by}</span>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={h.status} />
              <span className="text-ink/50 text-[10px]">
                {new Date(h.updated_at).toLocaleDateString()}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AiPmPanel({ state }: { state: ImplementationPlanState }) {
  const latest = state.latest;
  const knows: string[] = [];
  const covers: string[] = [];
  const missing: string[] = state.readiness.missing.map((m) => m.label);
  const recommends: string[] = [];
  const needsReview: string[] = [];
  const blocksBuild: string[] = [];
  const readyForExecution: string[] = [];

  if (state.approved_backend_plan) {
    knows.push(
      `Backend: ${state.approved_backend_plan.title} (${state.approved_backend_plan.table_count} tables, ${state.approved_backend_plan.server_function_count} server fns)`,
    );
  } else knows.push("No approved backend plan.");
  if (state.approved_qa_plan) {
    knows.push(
      `QA: ${state.approved_qa_plan.title} (${state.approved_qa_plan.test_count} tests, ${state.approved_qa_plan.blocking_count} blocking, ${state.approved_qa_plan.p0_count} P0)`,
    );
  } else knows.push("No approved QA plan.");

  if (latest) {
    const p = latest.payload;
    const pri = countBy(
      p.build_steps.map((s) => s.priority),
      ["p0", "p1", "p2"],
    );
    covers.push(`Latest: ${latest.title} (${latest.status})`);
    covers.push(
      `${p.phases.length} phases · ${p.build_steps.length} steps · ${pri.p0} P0 / ${pri.p1} P1 / ${pri.p2} P2`,
    );
    covers.push(
      `${p.migration_plan.length} migrations · ${p.server_function_plan.length} server fns · ${p.ui_wiring_plan.length} UI surfaces · ${p.integration_plan.length} integrations`,
    );
    if (latest.status === "draft") {
      recommends.push("Review draft, then submit to review.");
      needsReview.push("Implementation plan draft awaiting review.");
    }
    if (latest.status === "in_review") {
      needsReview.push("Implementation plan in review — admin approval required.");
    }
    for (const d of p.open_decisions ?? []) {
      if (d.blocks?.includes("build")) blocksBuild.push(d.question);
    }
    for (const g of p.release_gates ?? []) {
      if (g.no_go_conditions?.length) blocksBuild.push(`${g.gate}: ${g.criterion}`);
    }
    if (latest.status === "approved" && blocksBuild.length === 0) {
      readyForExecution.push(
        "Implementation plan approved with no blockers — ready for Build Execution / OpenClaw handoff.",
      );
    }
  } else if (state.readiness.ready) {
    recommends.push("Click Generate Implementation Plan to draft the build sequence.");
  } else {
    recommends.push(
      "Approve backend plan and QA plan before generating an implementation plan.",
    );
  }

  return (
    <div
      className="rounded-xl border border-border bg-card p-5 shadow-sm sticky top-4 space-y-4"
      data-qa="ai-pm-panel"
    >
      <div className="flex items-center gap-2">
        <Bot className="w-4 h-4 text-royal" />
        <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-ink/50">
          AI PM Panel
        </div>
      </div>
      <PanelList
        title="What approved backend + QA require"
        icon={<ShieldCheck className="w-3.5 h-3.5" />}
        items={knows}
        tone="info"
      />
      <PanelList
        title="What implementation plan knows"
        icon={<Sparkles className="w-3.5 h-3.5" />}
        items={covers}
        tone="info"
      />
      <PanelList
        title="What's missing"
        icon={<AlertTriangle className="w-3.5 h-3.5" />}
        items={missing}
        tone="warn"
      />
      <PanelList
        title="What blocks execution"
        icon={<AlertTriangle className="w-3.5 h-3.5" />}
        items={blocksBuild}
        tone="warn"
      />
      <PanelList
        title="Needs review"
        icon={<ShieldCheck className="w-3.5 h-3.5" />}
        items={needsReview}
        tone="warn"
      />
      <PanelList
        title="Next recommended action"
        icon={<Users className="w-3.5 h-3.5" />}
        items={recommends}
        tone="info"
      />
      <PanelList
        title="Ready for build execution"
        icon={<CheckCircle2 className="w-3.5 h-3.5" />}
        items={readyForExecution}
        tone="ok"
      />
    </div>
  );
}

function PanelList({
  title,
  icon,
  items,
  tone,
}: {
  title: string;
  icon: React.ReactNode;
  items: string[];
  tone: "info" | "warn" | "ok";
}) {
  const toneCls =
    tone === "warn"
      ? "text-amber-900"
      : tone === "ok"
        ? "text-emerald-800"
        : "text-ink/70";
  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest",
          toneCls,
        )}
      >
        {icon}
        {title}
      </div>
      {items.length === 0 ? (
        <div className="text-xs text-ink/40 mt-1">—</div>
      ) : (
        <ul className="mt-1 text-xs text-ink/80 list-disc list-inside space-y-0.5">
          {items.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
