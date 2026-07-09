import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  Sparkles,
  Loader2,
  ShieldCheck,
  ArrowUpCircle,
  CheckCircle2,
  Archive,
  AlertTriangle,
  Database,
  ServerCog,
  Users,
  Bot,
  HelpCircle,
  ListChecks,
  GitBranch,
  Cable,
  KeyRound,
  ShieldAlert,
} from "lucide-react";
import {
  getProjectBackendBuilder,
  generateProjectBackendPlan,
  submitProjectBackendPlanToReview,
  approveProjectBackendPlan,
  archiveProjectBackendPlan,
  type BackendBuilderState,
  type BackendPlanRow,
  type BackendPlanStatus,
  type BackendTable,
  type BackendServerFunction,
  type BackendPermission,
  type BackendIntegration,
  type BackendWorkflow,
} from "@/lib/engine-backend-builder.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/engine/projects/$projectId/backend-builder")({
  component: BackendBuilderPage,
  errorComponent: ({ error }) => (
    <div role="alert" className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      Failed to load Backend Builder: {(error as Error).message}
    </div>
  ),
  notFoundComponent: () => (
    <div className="rounded border border-border bg-card p-4 text-sm text-ink/70">
      Backend Builder not available for this project.
    </div>
  ),
});

const planQueryOptions = (
  projectId: string,
  fn: (input: { data: { projectId: string } }) => Promise<unknown>,
) =>
  queryOptions({
    queryKey: ["engine", "backend-builder", projectId],
    queryFn: () => fn({ data: { projectId } }),
    staleTime: 10_000,
  });

function BackendBuilderPage() {
  const { projectId } = Route.useParams();
  const qc = useQueryClient();
  const fn = useServerFn(getProjectBackendBuilder);
  const genFn = useServerFn(generateProjectBackendPlan);
  const submitFn = useServerFn(submitProjectBackendPlanToReview);
  const approveFn = useServerFn(approveProjectBackendPlan);
  const archiveFn = useServerFn(archiveProjectBackendPlan);

  const { data, isPending, isError, error, refetch } = useQuery(
    planQueryOptions(
      projectId,
      fn as unknown as (i: { data: { projectId: string } }) => Promise<unknown>,
    ),
  );
  const [busy, setBusy] = useState<null | "generate" | "submit" | "approve" | "archive">(null);
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["engine", "backend-builder", projectId] });

  const state = data as BackendBuilderState | undefined;

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
        toast.success("Backend plan draft generated");
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
      toast.success("Backend plan submitted to review");
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
      toast.success("Backend plan approved");
      invalidate();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const onArchive = async (planId: string) => {
    if (!confirm("Archive this backend plan? Archived plans cannot be edited.")) return;
    setBusy("archive");
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (archiveFn as any)({ data: { projectId, planId } });
      toast.success("Backend plan archived");
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
        data-qa-state="backend-loading"
      >
        <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Loading Backend Builder…
      </div>
    );
  }
  if (isError || !state) {
    return (
      <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">
        Failed to load Backend Builder: {(error as Error | null)?.message ?? "unknown error"}
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
      data-qa-state="backend-loaded"
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
            <DataModelSection plan={latest} />
            <ServerFunctionsSection plan={latest} />
            <PermissionsSection plan={latest} />
            <IntegrationsSection plan={latest} />
            <WorkflowsSection plan={latest} />
            <QaSection plan={latest} />
            <ImplementationSection plan={latest} />
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

function StatusBadge({ status }: { status: BackendPlanStatus }) {
  const map: Record<BackendPlanStatus, string> = {
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

function HeaderCard({
  state,
  busy,
  onGenerate,
  onSubmit,
  onApprove,
  onArchive,
}: {
  state: BackendBuilderState;
  busy: string | null;
  onGenerate: () => void;
  onSubmit: (id: string) => void;
  onApprove: (id: string) => void;
  onArchive: (id: string) => void;
}) {
  const latest = state.latest;
  const mockup = state.approved_mockup;
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-ink/50">
            Backend Builder
          </div>
          <h1 className="text-xl font-semibold mt-1">
            {latest?.title ?? "No backend plan yet"}
          </h1>
          <div className="text-xs text-ink/60 mt-1">
            {state.project.client_company} · {state.project.current_step} · {state.project.status}
          </div>
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            {latest ? <StatusBadge status={latest.status} /> : null}
            {mockup ? (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300 px-2 py-0.5 text-[10px] uppercase tracking-widest font-mono"
                data-qa="badge-approved-mockup"
              >
                <ShieldCheck className="w-3 h-3" /> Mockup approved
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 text-[10px] uppercase tracking-widest font-mono">
                <AlertTriangle className="w-3 h-3" /> Mockup not approved
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
                ? "Approve mockups before generating a backend plan"
                : ""
            }
            data-qa="btn-generate-backend"
          >
            {busy === "generate" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            Generate Backend Plan
          </button>
          {latest?.status === "draft" ? (
            <button
              onClick={() => onSubmit(latest.id)}
              disabled={busy === "submit"}
              className="inline-flex items-center gap-1.5 rounded-md border border-border text-xs px-3 py-1.5 hover:border-royal/50 disabled:opacity-50"
              data-qa="btn-submit-backend"
            >
              <ArrowUpCircle className="w-3.5 h-3.5" /> Submit to Review
            </button>
          ) : null}
          {latest?.status === "in_review" && state.capabilities.canApprove ? (
            <button
              onClick={() => onApprove(latest.id)}
              disabled={busy === "approve"}
              className="inline-flex items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 text-emerald-900 text-xs px-3 py-1.5 hover:bg-emerald-100 disabled:opacity-50"
              data-qa="btn-approve-backend"
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> Approve
            </button>
          ) : null}
          {latest && latest.status !== "archived" && state.capabilities.canArchive ? (
            <button
              onClick={() => onArchive(latest.id)}
              disabled={busy === "archive"}
              className="inline-flex items-center gap-1.5 rounded-md border border-border text-xs px-3 py-1.5 text-ink/60 hover:border-red-300 hover:text-red-700 disabled:opacity-50"
              data-qa="btn-archive-backend"
            >
              <Archive className="w-3.5 h-3.5" /> Archive
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function EmptyPlanCard({ state }: { state: BackendBuilderState }) {
  return (
    <div
      className="rounded-xl border border-dashed border-border bg-card p-8 text-center"
      data-qa="empty-backend"
    >
      <Database className="w-8 h-8 mx-auto text-ink/40" />
      <div className="mt-3 text-sm font-medium">No backend plan yet</div>
      <div className="text-xs text-ink/60 mt-1 max-w-md mx-auto">
        Backend Builder turns the <strong>approved mockup spec</strong> into a structured
        backend blueprint — data model, server functions, RLS/permissions, integrations,
        workflows, QA plan, implementation sequence, and risks. It does not apply
        migrations or deploy code.
      </div>
      {!state.readiness.ready ? (
        <div
          className="mt-4 rounded border border-amber-200 bg-amber-50 p-3 text-left text-xs text-amber-900"
          data-qa="backend-missing-inputs"
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

function OverviewCard({ plan }: { plan: BackendPlanRow }) {
  const p = plan.payload;
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-ink/50">
        Overview
      </div>
      {plan.summary ? <p className="text-sm text-ink mt-2">{plan.summary}</p> : null}
      {p.backend_goal ? (
        <p className="text-xs text-ink/70 mt-2">
          <span className="font-semibold">Goal:</span> {p.backend_goal}
        </p>
      ) : null}
      {p.source_mockup_summary ? (
        <p className="text-xs text-ink/60 mt-1 italic">
          Source mockup: {p.source_mockup_summary}
        </p>
      ) : null}
      {p.architecture_summary ? (
        <p className="text-xs text-ink/70 mt-2">
          <span className="font-semibold">Architecture:</span> {p.architecture_summary}
        </p>
      ) : null}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-4">
        <MetricTile label="Tables" value={p.data_model.tables.length} />
        <MetricTile label="Server fns" value={p.server_functions.length} />
        <MetricTile label="Permissions" value={p.permissions.length} />
        <MetricTile label="Integrations" value={p.integrations.length} />
        <MetricTile label="Open decisions" value={p.open_decisions.length} />
      </div>
    </div>
  );
}

function MetricTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-border bg-white/40 p-2">
      <div className="text-lg font-semibold">{value}</div>
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

function StringList({ label, items }: { label: string; items?: string[] }) {
  if (!items?.length) return null;
  return (
    <div>
      <div className="font-mono text-[9px] uppercase tracking-widest text-ink/50">
        {label}
      </div>
      <ul className="list-disc list-inside text-ink/80">
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </div>
  );
}

function DataModelSection({ plan }: { plan: BackendPlanRow }) {
  const dm = plan.payload.data_model;
  return (
    <SectionCard
      icon={<Database className="w-4 h-4 text-royal" />}
      title="Data Model"
      qa="section-data-model"
    >
      {dm.tables.length === 0 ? (
        <div className="text-xs text-ink/50">No tables defined.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {dm.tables.map((t, i) => (
            <TableCard key={`${t.name}-${i}`} table={t} />
          ))}
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4 text-xs">
        <StringList label="Views" items={dm.views} />
        <StringList label="Enums" items={dm.enums} />
        <StringList label="Storage buckets" items={dm.storage_buckets} />
      </div>
    </SectionCard>
  );
}

function TableCard({ table }: { table: BackendTable }) {
  return (
    <div className="rounded-lg border border-border bg-white/50 p-3 text-xs space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold text-sm text-ink">{table.name || "—"}</div>
          {table.purpose ? <div className="text-ink/70">{table.purpose}</div> : null}
        </div>
      </div>
      {table.fields.length ? (
        <div>
          <div className="font-mono text-[9px] uppercase tracking-widest text-ink/50 mb-1">
            Fields
          </div>
          <ul className="space-y-0.5">
            {table.fields.map((f, i) => (
              <li key={i} className="flex items-baseline gap-2">
                <span className="font-mono text-ink">{f.name}</span>
                <span className="text-ink/50">{f.type}</span>
                {f.required ? (
                  <span className="text-[9px] uppercase text-amber-800">required</span>
                ) : null}
                {f.notes ? <span className="text-ink/60">— {f.notes}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <StringList label="Relationships" items={table.relationships} />
      <StringList label="Indexes" items={table.indexes} />
      <StringList label="RLS rules" items={table.rls_rules} />
      <StringList label="Audit requirements" items={table.audit_requirements} />
    </div>
  );
}

function ServerFunctionsSection({ plan }: { plan: BackendPlanRow }) {
  const fns = plan.payload.server_functions;
  return (
    <SectionCard
      icon={<ServerCog className="w-4 h-4 text-royal" />}
      title="Server Functions"
      qa="section-server-functions"
    >
      {fns.length === 0 ? (
        <div className="text-xs text-ink/50">No server functions defined.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {fns.map((f, i) => (
            <ServerFnCard key={`${f.name}-${i}`} fn={f} />
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function ServerFnCard({ fn }: { fn: BackendServerFunction }) {
  return (
    <div className="rounded-lg border border-border bg-white/50 p-3 text-xs space-y-2">
      <div className="font-semibold text-sm text-ink">{fn.name || "—"}</div>
      {fn.purpose ? <div className="text-ink/70">{fn.purpose}</div> : null}
      <StringList label="Inputs" items={fn.inputs} />
      <StringList label="Outputs" items={fn.outputs} />
      <StringList label="Permissions" items={fn.permissions} />
      <StringList label="Side effects" items={fn.side_effects} />
      <StringList label="Audit events" items={fn.audit_events} />
      <StringList label="Failure modes" items={fn.failure_modes} />
    </div>
  );
}

function PermissionsSection({ plan }: { plan: BackendPlanRow }) {
  const perms = plan.payload.permissions;
  return (
    <SectionCard
      icon={<KeyRound className="w-4 h-4 text-royal" />}
      title="Permissions / RLS"
      qa="section-permissions"
    >
      {perms.length === 0 ? (
        <div className="text-xs text-ink/50">No permission rules defined.</div>
      ) : (
        <div className="space-y-3">
          {perms.map((p, i) => (
            <PermissionCard key={`${p.role}-${i}`} perm={p} />
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function PermissionCard({ perm }: { perm: BackendPermission }) {
  return (
    <div className="rounded-lg border border-border bg-white/50 p-3 text-xs">
      <div className="font-semibold text-sm text-ink capitalize">{perm.role || "—"}</div>
      {perm.notes ? <div className="text-ink/70 mb-2">{perm.notes}</div> : null}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <StringList label="Read" items={perm.can_read} />
        <StringList label="Create" items={perm.can_create} />
        <StringList label="Update" items={perm.can_update} />
        <StringList label="Delete" items={perm.can_delete} />
      </div>
    </div>
  );
}

function IntegrationsSection({ plan }: { plan: BackendPlanRow }) {
  const items = plan.payload.integrations;
  return (
    <SectionCard
      icon={<Cable className="w-4 h-4 text-royal" />}
      title="Integrations"
      qa="section-integrations"
    >
      {items.length === 0 ? (
        <div className="text-xs text-ink/50">No integrations defined.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {items.map((it, i) => (
            <IntegrationCard key={`${it.name}-${i}`} integ={it} />
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function IntegrationCard({ integ }: { integ: BackendIntegration }) {
  return (
    <div className="rounded-lg border border-border bg-white/50 p-3 text-xs space-y-1">
      <div className="flex items-center justify-between">
        <div className="font-semibold text-sm text-ink">{integ.name || "—"}</div>
        <span className="rounded-full bg-royal/10 text-royal px-2 py-0.5 text-[10px] uppercase tracking-widest">
          {integ.direction}
        </span>
      </div>
      {integ.purpose ? <div className="text-ink/70">{integ.purpose}</div> : null}
      {integ.auth_required ? (
        <div className="text-ink/60">
          <span className="font-mono text-[9px] uppercase text-ink/40">Auth: </span>
          {integ.auth_required}
        </div>
      ) : null}
      <StringList label="Data exchanged" items={integ.data_exchanged} />
      <StringList label="Failure modes" items={integ.failure_modes} />
    </div>
  );
}

function WorkflowsSection({ plan }: { plan: BackendPlanRow }) {
  const items = plan.payload.workflows;
  const jobs = plan.payload.background_jobs;
  const notifs = plan.payload.notifications;
  const apis = plan.payload.api_endpoints;
  return (
    <SectionCard
      icon={<GitBranch className="w-4 h-4 text-royal" />}
      title="Workflows + Delivery"
      qa="section-workflows"
    >
      {items.length === 0 ? (
        <div className="text-xs text-ink/50">No workflows defined.</div>
      ) : (
        <div className="space-y-3">
          {items.map((w, i) => (
            <WorkflowCard key={`${w.name}-${i}`} wf={w} />
          ))}
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4 text-xs">
        <StringList label="Background jobs" items={jobs} />
        <StringList label="Notifications" items={notifs} />
        <StringList label="API endpoints" items={apis} />
      </div>
    </SectionCard>
  );
}

function WorkflowCard({ wf }: { wf: BackendWorkflow }) {
  return (
    <div className="rounded-lg border border-border bg-white/50 p-3 text-xs space-y-1">
      <div className="font-semibold text-sm text-ink">{wf.name || "—"}</div>
      {wf.trigger ? (
        <div className="text-ink/70">
          <span className="font-mono text-[9px] uppercase text-ink/40">Trigger: </span>
          {wf.trigger}
        </div>
      ) : null}
      <StringList label="Steps" items={wf.steps} />
      {wf.success_condition ? (
        <div className="text-ink/70">
          <span className="font-mono text-[9px] uppercase text-ink/40">Success: </span>
          {wf.success_condition}
        </div>
      ) : null}
      <StringList label="Failure modes" items={wf.failure_modes} />
    </div>
  );
}

function QaSection({ plan }: { plan: BackendPlanRow }) {
  const qa = plan.payload.qa_plan;
  const security = plan.payload.security_checks;
  return (
    <SectionCard
      icon={<ListChecks className="w-4 h-4 text-royal" />}
      title="QA Plan"
      qa="section-qa-plan"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
        <StringList label="Role tests" items={qa.role_tests} />
        <StringList label="Data tests" items={qa.data_tests} />
        <StringList label="RLS tests" items={qa.rls_tests} />
        <StringList label="Integration tests" items={qa.integration_tests} />
        <StringList label="Edge cases" items={qa.edge_cases} />
        <StringList label="Regression tests" items={qa.regression_tests} />
      </div>
      {security.length ? (
        <div className="mt-3 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <div className="font-mono text-[9px] uppercase tracking-widest flex items-center gap-1 mb-1">
            <ShieldAlert className="w-3 h-3" /> Security checks
          </div>
          <ul className="list-disc list-inside">
            {security.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </SectionCard>
  );
}

function ImplementationSection({ plan }: { plan: BackendPlanRow }) {
  const items = plan.payload.implementation_sequence;
  return (
    <SectionCard
      icon={<ListChecks className="w-4 h-4 text-royal" />}
      title="Implementation Sequence"
      qa="section-implementation-sequence"
    >
      {items.length === 0 ? (
        <div className="text-xs text-ink/50">No implementation steps captured.</div>
      ) : (
        <ol className="mt-1 list-decimal list-inside text-xs text-ink/80 space-y-1">
          {items.map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </ol>
      )}
    </SectionCard>
  );
}

function OpenDecisionsSection({ plan }: { plan: BackendPlanRow }) {
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

function RisksSection({ plan }: { plan: BackendPlanRow }) {
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

function HistoryCard({ history }: { history: BackendBuilderState["history"] }) {
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

function AiPmPanel({ state }: { state: BackendBuilderState }) {
  const latest = state.latest;
  const mockupKnows: string[] = [];
  const knows: string[] = [];
  const missing: string[] = state.readiness.missing.map((m) => m.label);
  const recommends: string[] = [];
  const needsReview: string[] = [];
  const blocksImpl: string[] = [];
  const readyForImpl: string[] = [];

  if (state.approved_mockup) {
    mockupKnows.push(
      `Approved mockup: ${state.approved_mockup.title} (${state.approved_mockup.page_count} pages, ${state.approved_mockup.must_build_count} must-build)`,
    );
  } else {
    mockupKnows.push("No approved mockup yet — Backend Builder is locked.");
  }

  if (latest) {
    knows.push(`Latest plan: ${latest.title} (${latest.status})`);
    knows.push(
      `${latest.payload.data_model.tables.length} tables, ${latest.payload.server_functions.length} server functions, ${latest.payload.permissions.length} permission rules, ${latest.payload.integrations.length} integrations`,
    );
    if (latest.status === "draft") {
      recommends.push("Review the draft and submit to review.");
      needsReview.push("Backend plan draft awaiting internal review.");
    }
    if (latest.status === "in_review") {
      needsReview.push("Backend plan in review — admin approval required.");
    }
    const implBlockers = (latest.payload.open_decisions ?? []).filter((d) =>
      d.blocks?.includes("implementation"),
    );
    for (const b of implBlockers) blocksImpl.push(b.question);
    if (latest.status === "approved" && implBlockers.length === 0) {
      readyForImpl.push(
        "Backend plan approved and no implementation blockers — ready for QA Factory / Implementation Plan.",
      );
    }
  } else if (state.readiness.ready) {
    recommends.push("Click Generate Backend Plan to draft the first blueprint.");
  } else {
    recommends.push("Approve a mockup set in Mockup Builder before generating a backend plan.");
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
        title="What the approved mockup requires"
        icon={<ShieldCheck className="w-3.5 h-3.5" />}
        items={mockupKnows}
        tone="info"
      />
      <PanelList
        title="What the backend plan knows"
        icon={<Sparkles className="w-3.5 h-3.5" />}
        items={knows}
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
        title="What blocks implementation"
        icon={<AlertTriangle className="w-3.5 h-3.5" />}
        items={blocksImpl}
        tone="warn"
      />
      <PanelList
        title="Ready for implementation"
        icon={<CheckCircle2 className="w-3.5 h-3.5" />}
        items={readyForImpl}
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
