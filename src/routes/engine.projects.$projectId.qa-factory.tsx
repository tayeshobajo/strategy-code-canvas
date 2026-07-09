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
  Route as RouteIcon,
  Database,
  KeyRound,
  GitBranch,
  Monitor,
  Cable,
  FileCheck2,
  Flag,
} from "lucide-react";
import {
  getProjectQaFactory,
  generateProjectQaPlan,
  submitProjectQaPlanToReview,
  approveProjectQaPlan,
  archiveProjectQaPlan,
  type QaFactoryState,
  type QaPlanRow,
  type QaPlanStatus,
  type QaTest,
  type QaTestCategory,
  type QaPriority,
} from "@/lib/engine-qa-factory.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/engine/projects/$projectId/qa-factory")({
  component: QaFactoryPage,
  errorComponent: ({ error }) => (
    <div role="alert" className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      Failed to load QA Factory: {(error as Error).message}
    </div>
  ),
  notFoundComponent: () => (
    <div className="rounded border border-border bg-card p-4 text-sm text-ink/70">
      QA Factory not available for this project.
    </div>
  ),
});

const planQueryOptions = (
  projectId: string,
  fn: (input: { data: { projectId: string } }) => Promise<unknown>,
) =>
  queryOptions({
    queryKey: ["engine", "qa-factory", projectId],
    queryFn: () => fn({ data: { projectId } }),
    staleTime: 10_000,
  });

function QaFactoryPage() {
  const { projectId } = Route.useParams();
  const qc = useQueryClient();
  const fn = useServerFn(getProjectQaFactory);
  const genFn = useServerFn(generateProjectQaPlan);
  const submitFn = useServerFn(submitProjectQaPlanToReview);
  const approveFn = useServerFn(approveProjectQaPlan);
  const archiveFn = useServerFn(archiveProjectQaPlan);

  const { data, isPending, isError, error, refetch } = useQuery(
    planQueryOptions(
      projectId,
      fn as unknown as (i: { data: { projectId: string } }) => Promise<unknown>,
    ),
  );
  const [busy, setBusy] = useState<null | "generate" | "submit" | "approve" | "archive">(
    null,
  );
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["engine", "qa-factory", projectId] });

  const state = data as QaFactoryState | undefined;

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
        toast.success("QA plan draft generated");
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
      toast.success("QA plan submitted to review");
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
      toast.success("QA plan approved");
      invalidate();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const onArchive = async (planId: string) => {
    if (!confirm("Archive this QA plan? Archived plans cannot be edited.")) return;
    setBusy("archive");
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (archiveFn as any)({ data: { projectId, planId } });
      toast.success("QA plan archived");
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
        data-qa-state="qa-loading"
      >
        <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Loading QA Factory…
      </div>
    );
  }
  if (isError || !state) {
    return (
      <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">
        Failed to load QA Factory: {(error as Error | null)?.message ?? "unknown error"}
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
      data-qa-state="qa-loaded"
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
        />
        {latest ? (
          <>
            <OverviewCard plan={latest} />
            <TestMatrixSection plan={latest} />
            <RoleRouteSection plan={latest} />
            <DataRlsSection plan={latest} />
            <WorkflowSection plan={latest} />
            <UiResponsiveSection plan={latest} />
            <IntegrationAuditSection plan={latest} />
            <GoNoGoSection plan={latest} />
            <OpenDecisionsSection plan={latest} />
            <RisksSection plan={latest} />
            <EvidenceSection plan={latest} />
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

function StatusBadge({ status }: { status: QaPlanStatus }) {
  const map: Record<QaPlanStatus, string> = {
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

function PriorityBadge({ p }: { p: QaPriority }) {
  const map: Record<QaPriority, string> = {
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

function HeaderCard({
  state,
  busy,
  onGenerate,
  onSubmit,
  onApprove,
  onArchive,
}: {
  state: QaFactoryState;
  busy: string | null;
  onGenerate: () => void;
  onSubmit: (id: string) => void;
  onApprove: (id: string) => void;
  onArchive: (id: string) => void;
}) {
  const latest = state.latest;
  const backend = state.approved_backend_plan;
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-ink/50">
            QA Factory
          </div>
          <h1 className="text-xl font-semibold mt-1">
            {latest?.title ?? "No QA plan yet"}
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
                <ShieldCheck className="w-3 h-3" /> Backend plan approved
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 text-[10px] uppercase tracking-widest font-mono">
                <AlertTriangle className="w-3 h-3" /> Backend plan not approved
              </span>
            )}
            {latest ? (
              <span className="text-[10px] uppercase tracking-widest text-ink/50">
                {latest.generated_by} · {new Date(latest.updated_at).toLocaleString()}
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
                ? "Approve a backend plan before generating QA."
                : ""
            }
            data-qa="btn-generate-qa"
          >
            {busy === "generate" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            Generate QA Plan
          </button>
          {latest?.status === "draft" ? (
            <button
              onClick={() => onSubmit(latest.id)}
              disabled={busy === "submit"}
              className="inline-flex items-center gap-1.5 rounded-md border border-border text-xs px-3 py-1.5 hover:border-royal/50 disabled:opacity-50"
              data-qa="btn-submit-qa"
            >
              <ArrowUpCircle className="w-3.5 h-3.5" /> Submit to Review
            </button>
          ) : null}
          {latest?.status === "in_review" && state.capabilities.canApprove ? (
            <button
              onClick={() => onApprove(latest.id)}
              disabled={busy === "approve"}
              className="inline-flex items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 text-emerald-900 text-xs px-3 py-1.5 hover:bg-emerald-100 disabled:opacity-50"
              data-qa="btn-approve-qa"
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> Approve
            </button>
          ) : null}
          {latest && latest.status !== "archived" && state.capabilities.canArchive ? (
            <button
              onClick={() => onArchive(latest.id)}
              disabled={busy === "archive"}
              className="inline-flex items-center gap-1.5 rounded-md border border-border text-xs px-3 py-1.5 text-ink/60 hover:border-red-300 hover:text-red-700 disabled:opacity-50"
              data-qa="btn-archive-qa"
            >
              <Archive className="w-3.5 h-3.5" /> Archive
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function EmptyPlanCard({ state }: { state: QaFactoryState }) {
  return (
    <div
      className="rounded-xl border border-dashed border-border bg-card p-8 text-center"
      data-qa="empty-qa"
    >
      <ClipboardCheck className="w-8 h-8 mx-auto text-ink/40" />
      <div className="mt-3 text-sm font-medium">No QA plan yet</div>
      <div className="text-xs text-ink/60 mt-1 max-w-md mx-auto">
        QA Factory turns the <strong>approved backend plan</strong> (plus the approved
        mockup, frame, and spine) into a structured QA plan — test matrix, evidence
        plan, go/no-go criteria, open decisions, and risks. It does not execute tests
        or mark anything as delivered.
      </div>
      {!state.readiness.ready ? (
        <div
          className="mt-4 rounded border border-amber-200 bg-amber-50 p-3 text-left text-xs text-amber-900"
          data-qa="qa-missing-inputs"
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

function OverviewCard({ plan }: { plan: QaPlanRow }) {
  const p = plan.payload;
  const priorities = countBy(
    p.test_matrix.map((t) => t.priority),
    ["p0", "p1", "p2"],
  );
  const blocking = p.test_matrix.filter((t) => t.blocking).length;
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-ink/50">
        Overview
      </div>
      {plan.summary ? <p className="text-sm text-ink mt-2">{plan.summary}</p> : null}
      {p.qa_goal ? (
        <p className="text-xs text-ink/70 mt-2">
          <span className="font-semibold">Goal:</span> {p.qa_goal}
        </p>
      ) : null}
      {p.source_backend_summary ? (
        <p className="text-xs text-ink/60 mt-1 italic">
          Source backend: {p.source_backend_summary}
        </p>
      ) : null}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 mt-4">
        <MetricTile label="Readiness" value={p.overall_readiness.replace(/_/g, " ")} />
        <MetricTile label="Tests" value={p.test_matrix.length} />
        <MetricTile label="P0" value={priorities.p0} />
        <MetricTile label="P1" value={priorities.p1} />
        <MetricTile label="Blocking" value={blocking} />
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

function TestRow({ test }: { test: QaTest }) {
  return (
    <div className="rounded-lg border border-border bg-white/50 p-3 text-xs space-y-1">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <div className="font-semibold text-sm text-ink">
            <span className="font-mono text-ink/50 mr-1">{test.id}</span>
            {test.title || "—"}
          </div>
          <div className="text-ink/60">
            {test.category} · {test.source}
            {test.surface ? ` · ${test.surface}` : ""}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <PriorityBadge p={test.priority} />
          {test.blocking ? (
            <span className="rounded-full bg-red-100 text-red-900 border border-red-300 px-1.5 py-0.5 text-[9px] uppercase tracking-widest font-mono">
              blocking
            </span>
          ) : null}
          <span className="rounded-full bg-ink/10 text-ink/70 border border-border px-1.5 py-0.5 text-[9px] uppercase tracking-widest font-mono">
            {test.status.replace("_", " ")}
          </span>
        </div>
      </div>
      {test.scenario ? <div className="text-ink/70">{test.scenario}</div> : null}
      {test.steps.length ? (
        <ol className="list-decimal list-inside text-ink/70 space-y-0.5">
          {test.steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      ) : null}
      {test.expected_result ? (
        <div className="text-ink/70">
          <span className="font-mono text-[9px] uppercase text-ink/40">Expected: </span>
          {test.expected_result}
        </div>
      ) : null}
      {test.evidence_required.length ? (
        <div className="text-ink/60">
          <span className="font-mono text-[9px] uppercase text-ink/40">Evidence: </span>
          {test.evidence_required.join(", ")}
        </div>
      ) : null}
      {test.owner ? (
        <div className="text-ink/60">
          <span className="font-mono text-[9px] uppercase text-ink/40">Owner: </span>
          {test.owner}
        </div>
      ) : null}
    </div>
  );
}

const CATEGORY_LABEL: Record<QaTestCategory, string> = {
  route: "Route",
  role: "Role",
  data: "Data",
  rls: "RLS",
  workflow: "Workflow",
  ui_state: "UI State",
  responsive: "Responsive",
  integration: "Integration",
  audit: "Audit",
  regression: "Regression",
  edge_case: "Edge case",
};

function TestMatrixSection({ plan }: { plan: QaPlanRow }) {
  const [category, setCategory] = useState<QaTestCategory | "all">("all");
  const [priority, setPriority] = useState<QaPriority | "all">("all");
  const [blockingOnly, setBlockingOnly] = useState(false);
  const tests = plan.payload.test_matrix;
  const filtered = useMemo(
    () =>
      tests.filter(
        (t) =>
          (category === "all" || t.category === category) &&
          (priority === "all" || t.priority === priority) &&
          (!blockingOnly || t.blocking),
      ),
    [tests, category, priority, blockingOnly],
  );
  const categories = Object.keys(CATEGORY_LABEL) as QaTestCategory[];

  return (
    <SectionCard
      icon={<ListChecks className="w-4 h-4 text-royal" />}
      title="Test Matrix"
      qa="section-test-matrix"
    >
      <div className="flex flex-wrap gap-2 mb-3 text-[11px]">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as QaTestCategory | "all")}
          className="rounded border border-border bg-white px-2 py-1"
          data-qa="filter-category"
        >
          <option value="all">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c]}
            </option>
          ))}
        </select>
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as QaPriority | "all")}
          className="rounded border border-border bg-white px-2 py-1"
          data-qa="filter-priority"
        >
          <option value="all">All priorities</option>
          <option value="p0">P0</option>
          <option value="p1">P1</option>
          <option value="p2">P2</option>
        </select>
        <label className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border bg-white cursor-pointer">
          <input
            type="checkbox"
            checked={blockingOnly}
            onChange={(e) => setBlockingOnly(e.target.checked)}
            data-qa="filter-blocking"
          />
          Blocking only
        </label>
        <span className="text-ink/50 py-1">
          {filtered.length} / {tests.length} shown
        </span>
      </div>
      {filtered.length === 0 ? (
        <div className="text-xs text-ink/50">No tests match the current filters.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map((t) => (
            <TestRow key={t.id} test={t} />
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function TestsByCategory({
  plan,
  categories,
  icon,
  title,
  qa,
}: {
  plan: QaPlanRow;
  categories: QaTestCategory[];
  icon: React.ReactNode;
  title: string;
  qa: string;
}) {
  const items = plan.payload.test_matrix.filter((t) => categories.includes(t.category));
  return (
    <SectionCard icon={icon} title={title} qa={qa}>
      {items.length === 0 ? (
        <div className="text-xs text-ink/50">No tests in this group.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {items.map((t) => (
            <TestRow key={t.id} test={t} />
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function RoleRouteSection({ plan }: { plan: QaPlanRow }) {
  return (
    <TestsByCategory
      plan={plan}
      categories={["role", "route"]}
      icon={<RouteIcon className="w-4 h-4 text-royal" />}
      title="Role + Route Tests"
      qa="section-role-route"
    />
  );
}

function DataRlsSection({ plan }: { plan: QaPlanRow }) {
  return (
    <TestsByCategory
      plan={plan}
      categories={["data", "rls"]}
      icon={<Database className="w-4 h-4 text-royal" />}
      title="Data + RLS Tests"
      qa="section-data-rls"
    />
  );
}

function WorkflowSection({ plan }: { plan: QaPlanRow }) {
  return (
    <TestsByCategory
      plan={plan}
      categories={["workflow"]}
      icon={<GitBranch className="w-4 h-4 text-royal" />}
      title="Workflow Tests"
      qa="section-workflow"
    />
  );
}

function UiResponsiveSection({ plan }: { plan: QaPlanRow }) {
  return (
    <TestsByCategory
      plan={plan}
      categories={["ui_state", "responsive"]}
      icon={<Monitor className="w-4 h-4 text-royal" />}
      title="UI State + Responsive Tests"
      qa="section-ui-responsive"
    />
  );
}

function IntegrationAuditSection({ plan }: { plan: QaPlanRow }) {
  return (
    <TestsByCategory
      plan={plan}
      categories={["integration", "audit", "regression", "edge_case"]}
      icon={<Cable className="w-4 h-4 text-royal" />}
      title="Integration / Audit / Regression / Edge Cases"
      qa="section-integration-audit"
    />
  );
}

function GoNoGoSection({ plan }: { plan: QaPlanRow }) {
  const groups: Array<{ key: QaPlanRow["payload"]["go_no_go_criteria"][number]["gate"]; label: string; tone: string }> = [
    { key: "before_build", label: "Before build", tone: "text-royal" },
    { key: "before_delivery", label: "Before delivery", tone: "text-royal" },
    { key: "blocks_launch", label: "Blocks launch", tone: "text-red-800" },
    { key: "can_be_deferred", label: "Can be deferred", tone: "text-ink/60" },
  ];
  return (
    <SectionCard
      icon={<Flag className="w-4 h-4 text-royal" />}
      title="Go / No-Go Criteria"
      qa="section-go-no-go"
    >
      {plan.payload.go_no_go_criteria.length === 0 ? (
        <div className="text-xs text-ink/50">No go/no-go criteria captured.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          {groups.map((g) => {
            const items = plan.payload.go_no_go_criteria.filter((c) => c.gate === g.key);
            if (items.length === 0) return null;
            return (
              <div key={g.key} className="rounded border border-border bg-white/50 p-3">
                <div className={cn("font-mono text-[9px] uppercase tracking-widest", g.tone)}>
                  {g.label}
                </div>
                <ul className="mt-1 space-y-1">
                  {items.map((c, i) => (
                    <li key={i}>
                      <div className="font-semibold text-ink">{c.criterion}</div>
                      {c.detail ? <div className="text-ink/70">{c.detail}</div> : null}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}

function OpenDecisionsSection({ plan }: { plan: QaPlanRow }) {
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
                <strong>Owner:</strong> {d.recommended_owner} · <strong>Next:</strong>{" "}
                {d.suggested_next_action}
              </div>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function RisksSection({ plan }: { plan: QaPlanRow }) {
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

function EvidenceSection({ plan }: { plan: QaPlanRow }) {
  const items = plan.payload.evidence_plan;
  return (
    <SectionCard
      icon={<FileCheck2 className="w-4 h-4 text-royal" />}
      title="Evidence Plan"
      qa="section-evidence"
    >
      {items.length === 0 ? (
        <div className="text-xs text-ink/50">No evidence plan captured.</div>
      ) : (
        <ul className="space-y-2 text-xs">
          {items.map((e, i) => (
            <li key={i} className="rounded border border-border bg-white/50 p-3">
              <div className="font-semibold text-ink">{e.name}</div>
              {e.captures.length ? (
                <div className="text-ink/70">
                  <span className="font-mono text-[9px] uppercase text-ink/40">
                    Captures:{" "}
                  </span>
                  {e.captures.join(", ")}
                </div>
              ) : null}
              {e.notes ? <div className="text-ink/60 mt-0.5">{e.notes}</div> : null}
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function HistoryCard({ history }: { history: QaFactoryState["history"] }) {
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

function AiPmPanel({ state }: { state: QaFactoryState }) {
  const latest = state.latest;
  const backendKnows: string[] = [];
  const covers: string[] = [];
  const missing: string[] = state.readiness.missing.map((m) => m.label);
  const recommends: string[] = [];
  const needsReview: string[] = [];
  const blocksBuild: string[] = [];
  const blocksDelivery: string[] = [];
  const readyForBuild: string[] = [];

  if (state.approved_backend_plan) {
    backendKnows.push(
      `Approved backend plan: ${state.approved_backend_plan.title} (${state.approved_backend_plan.table_count} tables, ${state.approved_backend_plan.server_function_count} server fns, ${state.approved_backend_plan.integration_count} integrations)`,
    );
  } else {
    backendKnows.push("No approved backend plan yet — QA Factory is locked.");
  }

  if (latest) {
    const p = latest.payload;
    const priorities = countBy(
      p.test_matrix.map((t) => t.priority),
      ["p0", "p1", "p2"],
    );
    const blocking = p.test_matrix.filter((t) => t.blocking).length;
    covers.push(`Latest plan: ${latest.title} (${latest.status})`);
    covers.push(
      `${p.test_matrix.length} tests · ${priorities.p0} P0 / ${priorities.p1} P1 / ${priorities.p2} P2 · ${blocking} blocking`,
    );
    covers.push(
      `Coverage: ${p.route_tests.length} route · ${p.role_tests.length} role · ${p.data_tests.length} data · ${p.rls_tests.length} rls · ${p.workflow_tests.length} workflow · ${p.responsive_tests.length} responsive · ${p.integration_tests.length} integration · ${p.audit_tests.length} audit · ${p.regression_tests.length} regression · ${p.edge_cases.length} edge`,
    );
    if (latest.status === "draft") {
      recommends.push("Review the draft and submit to review.");
      needsReview.push("QA plan draft awaiting internal review.");
    }
    if (latest.status === "in_review") {
      needsReview.push("QA plan in review — admin approval required.");
    }
    for (const d of p.open_decisions ?? []) {
      if (d.blocks?.includes("build")) blocksBuild.push(d.question);
      if (d.blocks?.includes("delivery")) blocksDelivery.push(d.question);
    }
    for (const c of p.go_no_go_criteria ?? []) {
      if (c.gate === "before_build") blocksBuild.push(c.criterion);
      if (c.gate === "before_delivery") blocksDelivery.push(c.criterion);
    }
    if (latest.status === "approved" && blocksBuild.length === 0) {
      readyForBuild.push(
        "QA plan approved and no build blockers — ready for Implementation Plan / Build Execution.",
      );
    }
  } else if (state.readiness.ready) {
    recommends.push("Click Generate QA Plan to draft the first test matrix.");
  } else {
    recommends.push(
      "Approve a backend plan in Backend Builder before generating a QA plan.",
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
        title="What the approved backend requires"
        icon={<ShieldCheck className="w-3.5 h-3.5" />}
        items={backendKnows}
        tone="info"
      />
      <PanelList
        title="What the QA plan covers"
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
        title="What I recommend next"
        icon={<Users className="w-3.5 h-3.5" />}
        items={recommends}
        tone="info"
      />
      <PanelList
        title="Needs review"
        icon={<ShieldCheck className="w-3.5 h-3.5" />}
        items={needsReview}
        tone="warn"
      />
      <PanelList
        title="What blocks build"
        icon={<AlertTriangle className="w-3.5 h-3.5" />}
        items={blocksBuild}
        tone="warn"
      />
      <PanelList
        title="What blocks delivery"
        icon={<AlertTriangle className="w-3.5 h-3.5" />}
        items={blocksDelivery}
        tone="warn"
      />
      <PanelList
        title="Ready for build"
        icon={<CheckCircle2 className="w-3.5 h-3.5" />}
        items={readyForBuild}
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
    tone === "warn" ? "text-amber-900" : tone === "ok" ? "text-emerald-800" : "text-ink/70";
  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-1 text-[10px] uppercase tracking-widest font-mono",
          toneCls,
        )}
      >
        {icon} {title}
      </div>
      {items.length ? (
        <ul className={cn("mt-1 text-xs list-disc list-inside", toneCls)}>
          {items.map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </ul>
      ) : (
        <div className="text-xs text-ink/40 mt-1">Nothing</div>
      )}
    </div>
  );
}

// silence unused-icon lints
void KeyRound;
