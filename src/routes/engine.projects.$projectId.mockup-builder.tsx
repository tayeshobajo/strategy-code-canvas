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
  Layers,
  LayoutGrid,
  MousePointer2,
  Smartphone,
  ListChecks,
  HelpCircle,
  Users,
  Bot,
} from "lucide-react";
import {
  getProjectMockupBuilder,
  generateProjectMockups,
  submitProjectMockupToReview,
  approveProjectMockup,
  archiveProjectMockup,
  type MockupBuilderState,
  type MockupRow,
  type MockupPage,
  type MockupPriority,
  type MockupStatus,
} from "@/lib/engine-mockup-builder.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/engine/projects/$projectId/mockup-builder")({
  component: MockupBuilderPage,
  errorComponent: ({ error }) => (
    <div role="alert" className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      Failed to load Mockup Builder: {(error as Error).message}
    </div>
  ),
  notFoundComponent: () => (
    <div className="rounded border border-border bg-card p-4 text-sm text-ink/70">
      Mockup Builder not available for this project.
    </div>
  ),
});

const mockupQueryOptions = (
  projectId: string,
  fn: (input: { data: { projectId: string } }) => Promise<unknown>,
) =>
  queryOptions({
    queryKey: ["engine", "mockup-builder", projectId],
    queryFn: () => fn({ data: { projectId } }),
    staleTime: 10_000,
  });

function MockupBuilderPage() {
  const { projectId } = Route.useParams();
  const qc = useQueryClient();
  const fn = useServerFn(getProjectMockupBuilder);
  const genFn = useServerFn(generateProjectMockups);
  const submitFn = useServerFn(submitProjectMockupToReview);
  const approveFn = useServerFn(approveProjectMockup);
  const archiveFn = useServerFn(archiveProjectMockup);

  const { data, isPending, isError, error, refetch } = useQuery(
    mockupQueryOptions(
      projectId,
      fn as unknown as (i: { data: { projectId: string } }) => Promise<unknown>,
    ),
  );
  const [busy, setBusy] = useState<null | "generate" | "submit" | "approve" | "archive">(null);

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["engine", "mockup-builder", projectId] });

  const state = data as MockupBuilderState | undefined;

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
        toast.success("Mockup draft generated");
      }
      invalidate();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const onSubmit = async (mockupId: string) => {
    setBusy("submit");
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (submitFn as any)({ data: { projectId, mockupId } });
      toast.success("Mockup submitted to review");
      invalidate();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const onApprove = async (mockupId: string) => {
    setBusy("approve");
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (approveFn as any)({ data: { projectId, mockupId } });
      toast.success("Mockup approved");
      invalidate();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const onArchive = async (mockupId: string) => {
    if (!confirm("Archive this mockup? Archived mockups cannot be edited.")) return;
    setBusy("archive");
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (archiveFn as any)({ data: { projectId, mockupId } });
      toast.success("Mockup archived");
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
        data-qa-state="mockup-loading"
      >
        <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Loading Mockup Builder…
      </div>
    );
  }
  if (isError || !state) {
    return (
      <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">
        Failed to load Mockup Builder: {(error as Error | null)?.message ?? "unknown error"}
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
      data-qa-state="mockup-loaded"
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
            <OverviewCard mockup={latest} state={state} />
            <PagesSection pages={latest.payload.pages ?? []} />
            <GlobalComponentsSection mockup={latest} />
            <InteractionModelSection mockup={latest} />
            <ResponsiveStrategySection mockup={latest} />
            <QaSection mockup={latest} />
            <OpenDecisionsSection mockup={latest} />
            <HistoryCard history={state.history} />
          </>
        ) : (
          <EmptyMockupCard state={state} />
        )}
      </div>
      <div className="xl:col-span-1 space-y-5">
        <AiPmPanel state={state} />
      </div>
    </div>
  );
}

// ------------------------ presentational ------------------------

function StatusBadge({ status }: { status: MockupStatus }) {
  const map: Record<MockupStatus, string> = {
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
  state: MockupBuilderState;
  busy: string | null;
  onGenerate: () => void;
  onSubmit: (id: string) => void;
  onApprove: (id: string) => void;
  onArchive: (id: string) => void;
}) {
  const latest = state.latest;
  const frame = state.approved_frame;
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-ink/50">
            Mockup Builder
          </div>
          <h1 className="text-xl font-semibold mt-1">
            {latest?.title ?? "No mockup yet"}
          </h1>
          <div className="text-xs text-ink/60 mt-1">
            {state.project.client_company} · {state.project.current_step} · {state.project.status}
          </div>
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            {latest ? <StatusBadge status={latest.status} /> : null}
            {frame ? (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300 px-2 py-0.5 text-[10px] uppercase tracking-widest font-mono"
                data-qa="badge-approved-frame"
              >
                <ShieldCheck className="w-3 h-3" /> Frame approved
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 text-[10px] uppercase tracking-widest font-mono">
                <AlertTriangle className="w-3 h-3" /> Frame not approved
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
                ? "Approve a frame before generating mockups"
                : ""
            }
            data-qa="btn-generate-mockups"
          >
            {busy === "generate" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            Generate Mockup Set
          </button>
          {latest?.status === "draft" ? (
            <button
              onClick={() => onSubmit(latest.id)}
              disabled={busy === "submit"}
              className="inline-flex items-center gap-1.5 rounded-md border border-border text-xs px-3 py-1.5 hover:border-royal/50 disabled:opacity-50"
              data-qa="btn-submit-mockup"
            >
              <ArrowUpCircle className="w-3.5 h-3.5" /> Submit to Review
            </button>
          ) : null}
          {latest?.status === "in_review" && state.capabilities.canApprove ? (
            <button
              onClick={() => onApprove(latest.id)}
              disabled={busy === "approve"}
              className="inline-flex items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 text-emerald-900 text-xs px-3 py-1.5 hover:bg-emerald-100 disabled:opacity-50"
              data-qa="btn-approve-mockup"
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> Approve
            </button>
          ) : null}
          {latest && latest.status !== "archived" && state.capabilities.canArchive ? (
            <button
              onClick={() => onArchive(latest.id)}
              disabled={busy === "archive"}
              className="inline-flex items-center gap-1.5 rounded-md border border-border text-xs px-3 py-1.5 text-ink/60 hover:border-red-300 hover:text-red-700 disabled:opacity-50"
              data-qa="btn-archive-mockup"
            >
              <Archive className="w-3.5 h-3.5" /> Archive
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function EmptyMockupCard({ state }: { state: MockupBuilderState }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center" data-qa="empty-mockup">
      <LayoutGrid className="w-8 h-8 mx-auto text-ink/40" />
      <div className="mt-3 text-sm font-medium">No mockup yet</div>
      <div className="text-xs text-ink/60 mt-1 max-w-md mx-auto">
        Mockup Builder turns the <strong>approved frame</strong> into structured page mockups —
        layout sections, states, and responsive notes. It does not generate visual images.
      </div>
      {!state.readiness.ready ? (
        <div
          className="mt-4 rounded border border-amber-200 bg-amber-50 p-3 text-left text-xs text-amber-900"
          data-qa="mockup-missing-inputs"
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

function OverviewCard({ mockup, state }: { mockup: MockupRow; state: MockupBuilderState }) {
  const p = mockup.payload;
  const pageCount = p.pages?.length ?? 0;
  const stateCount = (p.pages ?? []).reduce((n, pg) => n + (pg.states?.length ?? 0), 0);
  const globalCount = p.global_components?.length ?? 0;
  const openCount = p.open_decisions?.length ?? 0;
  const backendReady = (p.open_decisions ?? []).filter((d) => d.blocks?.includes("backend")).length === 0;
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-ink/50">Overview</div>
      {mockup.summary ? <p className="text-sm text-ink mt-2">{mockup.summary}</p> : null}
      {p.mockup_goal ? (
        <p className="text-xs text-ink/70 mt-2">
          <span className="font-semibold">Goal:</span> {p.mockup_goal}
        </p>
      ) : null}
      {p.source_frame_summary ? (
        <p className="text-xs text-ink/60 mt-1 italic">Source frame: {p.source_frame_summary}</p>
      ) : null}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
        <MetricTile label="Pages" value={pageCount} />
        <MetricTile label="States" value={stateCount} />
        <MetricTile label="Global components" value={globalCount} />
        <MetricTile label="Open decisions" value={openCount} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-[10px] uppercase tracking-widest">
        {state.approved_frame ? (
          <span className="rounded-full bg-royal/10 text-royal px-2 py-0.5">
            Frame · {state.approved_frame.page_count} pages
          </span>
        ) : null}
        <span
          className={cn(
            "rounded-full px-2 py-0.5",
            backendReady ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900",
          )}
        >
          {backendReady ? "Backend-ready" : "Backend blocked"}
        </span>
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

function PagesSection({ pages }: { pages: MockupPage[] }) {
  const groups: Record<MockupPriority, MockupPage[]> = { must: [], should: [], later: [] };
  for (const p of pages) groups[p.priority ?? "should"].push(p);
  const labels: Record<MockupPriority, string> = {
    must: "Must build",
    should: "Should build",
    later: "Later",
  };
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <Layers className="w-4 h-4 text-royal" />
        <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-ink/50">
          Page Mockups
        </div>
      </div>
      {pages.length === 0 ? (
        <div className="text-xs text-ink/50 mt-3">No page mockups defined.</div>
      ) : (
        <div className="mt-3 space-y-4">
          {(Object.keys(groups) as MockupPriority[]).map((k) =>
            groups[k].length ? (
              <div key={k}>
                <div className="text-[10px] uppercase tracking-widest text-ink/50 mb-2">
                  {labels[k]} · {groups[k].length}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {groups[k].map((p, i) => (
                    <PageCard key={`${p.frame_page_id}-${i}`} page={p} />
                  ))}
                </div>
              </div>
            ) : null,
          )}
        </div>
      )}
    </div>
  );
}

function PageCard({ page }: { page: MockupPage }) {
  return (
    <div className="rounded-lg border border-border bg-white/50 p-3 text-xs space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold text-sm text-ink">{page.title}</div>
          <div className="text-[10px] uppercase tracking-widest text-ink/50">
            {page.primary_user || "user"}
          </div>
        </div>
        <span
          className={cn(
            "rounded-full px-1.5 py-0.5 text-[9px] uppercase tracking-widest",
            page.priority === "must"
              ? "bg-royal/10 text-royal"
              : page.priority === "should"
                ? "bg-amber-100 text-amber-900"
                : "bg-ink/5 text-ink/60",
          )}
        >
          {page.priority}
        </span>
      </div>
      {page.page_goal ? <div className="text-ink/70">{page.page_goal}</div> : null}

      {page.layout_sections?.length ? (
        <div>
          <div className="font-mono text-[9px] uppercase tracking-widest text-ink/50 mb-1">
            Layout sections
          </div>
          <ul className="space-y-1">
            {page.layout_sections.map((s, i) => (
              <li key={i} className="rounded border border-border bg-white/60 p-1.5">
                <div className="font-semibold">{s.name}</div>
                {s.purpose ? <div className="text-ink/70">{s.purpose}</div> : null}
                {s.components?.length ? (
                  <div className="text-ink/70">
                    <span className="text-[9px] uppercase text-ink/40">Components: </span>
                    {s.components.join(", ")}
                  </div>
                ) : null}
                {s.interaction_notes?.length ? (
                  <div className="text-ink/60">
                    <span className="text-[9px] uppercase text-ink/40">Interactions: </span>
                    {s.interaction_notes.join("; ")}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <StringList label="Key actions" items={page.key_actions} />

      {page.states?.length ? (
        <div>
          <div className="font-mono text-[9px] uppercase tracking-widest text-ink/50 mb-1">
            States
          </div>
          <ul className="space-y-1">
            {page.states.map((st, i) => (
              <li key={i} className="rounded border border-border bg-white/60 p-1.5">
                <div className="font-semibold">
                  {st.name}
                  {st.trigger ? (
                    <span className="text-ink/50 font-normal"> · {st.trigger}</span>
                  ) : null}
                </div>
                {st.ui_expectation ? <div className="text-ink/70">{st.ui_expectation}</div> : null}
                <div className="grid grid-cols-3 gap-1 mt-1 text-[10px]">
                  {st.empty_state ? (
                    <div className="text-ink/60">
                      <span className="uppercase text-ink/40">Empty: </span>
                      {st.empty_state}
                    </div>
                  ) : null}
                  {st.loading_state ? (
                    <div className="text-ink/60">
                      <span className="uppercase text-ink/40">Loading: </span>
                      {st.loading_state}
                    </div>
                  ) : null}
                  {st.error_state ? (
                    <div className="text-ink/60">
                      <span className="uppercase text-ink/40">Error: </span>
                      {st.error_state}
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="rounded border border-border bg-white/40 p-1.5">
        <div className="font-mono text-[9px] uppercase tracking-widest text-ink/50 mb-1">
          Responsive
        </div>
        <div className="grid grid-cols-3 gap-1 text-[10px]">
          <div>
            <span className="uppercase text-ink/40">Desktop: </span>
            {page.responsive_notes?.desktop || "—"}
          </div>
          <div>
            <span className="uppercase text-ink/40">Tablet: </span>
            {page.responsive_notes?.tablet || "—"}
          </div>
          <div>
            <span className="uppercase text-ink/40">Mobile: </span>
            {page.responsive_notes?.mobile || "—"}
          </div>
        </div>
      </div>

      <StringList label="Data dependencies" items={page.data_dependencies} />
      <StringList label="Backend dependencies" items={page.backend_dependencies} />
      <StringList label="QA checks" items={page.qa_checks} />
      {page.open_questions?.length ? (
        <div className="rounded bg-amber-50 border border-amber-200 p-1.5 text-amber-900">
          <div className="font-mono text-[9px] uppercase tracking-widest">Open</div>
          <ul className="list-disc list-inside">
            {page.open_questions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function StringList({ label, items }: { label: string; items?: string[] }) {
  if (!items?.length) return null;
  return (
    <div>
      <div className="font-mono text-[9px] uppercase tracking-widest text-ink/50">{label}</div>
      <ul className="list-disc list-inside text-ink/80">
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </div>
  );
}

function GlobalComponentsSection({ mockup }: { mockup: MockupRow }) {
  const globals = mockup.payload.global_components ?? [];
  const nav = mockup.payload.navigation_model ?? [];
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <LayoutGrid className="w-4 h-4 text-royal" />
        <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-ink/50">
          Global Components + Navigation
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3 text-xs">
        <div>
          <div className="font-mono text-[9px] uppercase tracking-widest text-ink/50 mb-1">
            Shared components
          </div>
          <ul className="list-disc list-inside text-ink/80">
            {globals.length ? (
              globals.map((g, i) => <li key={i}>{g}</li>)
            ) : (
              <li className="text-ink/50 list-none">None</li>
            )}
          </ul>
        </div>
        <div>
          <div className="font-mono text-[9px] uppercase tracking-widest text-ink/50 mb-1">
            Navigation model
          </div>
          <ul className="list-disc list-inside text-ink/80">
            {nav.length ? (
              nav.map((n, i) => <li key={i}>{n}</li>)
            ) : (
              <li className="text-ink/50 list-none">None</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}

function InteractionModelSection({ mockup }: { mockup: MockupRow }) {
  const items = mockup.payload.interaction_model ?? [];
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <MousePointer2 className="w-4 h-4 text-royal" />
        <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-ink/50">
          Interaction Model
        </div>
      </div>
      {items.length === 0 ? (
        <div className="text-xs text-ink/50 mt-3">No interactions captured.</div>
      ) : (
        <ul className="mt-3 list-disc list-inside text-xs text-ink/80 space-y-0.5">
          {items.map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ResponsiveStrategySection({ mockup }: { mockup: MockupRow }) {
  const items = mockup.payload.responsive_strategy ?? [];
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <Smartphone className="w-4 h-4 text-royal" />
        <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-ink/50">
          Responsive Strategy
        </div>
      </div>
      {items.length === 0 ? (
        <div className="text-xs text-ink/50 mt-3">No responsive notes.</div>
      ) : (
        <ul className="mt-3 list-disc list-inside text-xs text-ink/80 space-y-0.5">
          {items.map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function QaSection({ mockup }: { mockup: MockupRow }) {
  const items = mockup.payload.qa_expectations ?? [];
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <ListChecks className="w-4 h-4 text-royal" />
        <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-ink/50">
          QA Expectations
        </div>
      </div>
      {items.length === 0 ? (
        <div className="text-xs text-ink/50 mt-3">No QA expectations captured.</div>
      ) : (
        <ul className="mt-3 list-disc list-inside text-xs text-ink/80 space-y-0.5">
          {items.map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function OpenDecisionsSection({ mockup }: { mockup: MockupRow }) {
  const decisions = mockup.payload.open_decisions ?? [];
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <HelpCircle className="w-4 h-4 text-royal" />
        <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-ink/50">
          Open Decisions
        </div>
      </div>
      {decisions.length === 0 ? (
        <div className="text-xs text-ink/50 mt-3">No open decisions.</div>
      ) : (
        <ul className="mt-3 space-y-2 text-xs">
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
    </div>
  );
}

function HistoryCard({ history }: { history: MockupBuilderState["history"] }) {
  if (!history.length) return null;
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-ink/50">History</div>
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

function AiPmPanel({ state }: { state: MockupBuilderState }) {
  const latest = state.latest;
  const frameKnows: string[] = [];
  const knows: string[] = [];
  const missing: string[] = state.readiness.missing.map((m) => m.label);
  const recommends: string[] = [];
  const needsReview: string[] = [];
  const blocksBackend: string[] = [];
  const canMoveToBackend: string[] = [];

  if (state.approved_frame) {
    frameKnows.push(
      `Approved frame: ${state.approved_frame.title} (${state.approved_frame.page_count} pages, ${state.approved_frame.must_build_count} must-build)`,
    );
  } else {
    frameKnows.push("No approved frame yet — Mockup Builder is locked.");
  }

  if (latest) {
    knows.push(`Latest mockup: ${latest.title} (${latest.status})`);
    const stateCount = (latest.payload.pages ?? []).reduce(
      (n, p) => n + (p.states?.length ?? 0),
      0,
    );
    knows.push(
      `${latest.payload.pages?.length ?? 0} pages, ${stateCount} states, ${latest.payload.global_components?.length ?? 0} global components`,
    );
    if (latest.status === "draft") {
      recommends.push("Review the draft and submit to review.");
      needsReview.push("Mockup draft awaiting internal review.");
    }
    if (latest.status === "in_review") {
      needsReview.push("Mockup in review — admin approval required.");
    }
    const backendBlockers = (latest.payload.open_decisions ?? []).filter((d) =>
      d.blocks?.includes("backend"),
    );
    for (const b of backendBlockers) blocksBackend.push(b.question);
    if (latest.status === "approved" && backendBlockers.length === 0) {
      canMoveToBackend.push("Mockup approved and no backend blockers — ready for Backend Builder.");
    }
  } else if (state.readiness.ready) {
    recommends.push("Click Generate Mockup Set to draft the first mockup.");
  } else {
    recommends.push("Approve a frame in Frame Builder before generating mockups.");
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm sticky top-4 space-y-4" data-qa="ai-pm-panel">
      <div className="flex items-center gap-2">
        <Bot className="w-4 h-4 text-royal" />
        <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-ink/50">
          AI PM Panel
        </div>
      </div>
      <PanelList
        title="What the approved frame says"
        icon={<ShieldCheck className="w-3.5 h-3.5" />}
        items={frameKnows}
        tone="info"
      />
      <PanelList
        title="What mockups know"
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
        title="What blocks backend"
        icon={<AlertTriangle className="w-3.5 h-3.5" />}
        items={blocksBackend}
        tone="warn"
      />
      <PanelList
        title="Ready for backend"
        icon={<CheckCircle2 className="w-3.5 h-3.5" />}
        items={canMoveToBackend}
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
