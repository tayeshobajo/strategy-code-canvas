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
  Workflow,
  Database,
  ListChecks,
  HelpCircle,
  Users,
  Bot,
} from "lucide-react";
import {
  getProjectFrameBuilder,
  generateProjectFrame,
  submitProjectFrameToReview,
  approveProjectFrame,
  archiveProjectFrame,
  type FrameBuilderState,
  type FrameRow,
  type FramePage,
  type FramePagePriority,
  type FrameStatus,
} from "@/lib/engine-frame-builder.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/engine/projects/$projectId/frame-builder")({
  component: FrameBuilderPage,
  errorComponent: ({ error }) => (
    <div role="alert" className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      Failed to load Frame Builder: {(error as Error).message}
    </div>
  ),
  notFoundComponent: () => (
    <div className="rounded border border-border bg-card p-4 text-sm text-ink/70">
      Frame Builder not available for this project.
    </div>
  ),
});

const frameQueryOptions = (
  projectId: string,
  fn: (input: { data: { projectId: string } }) => Promise<unknown>,
) =>
  queryOptions({
    queryKey: ["engine", "frame-builder", projectId],
    queryFn: () => fn({ data: { projectId } }),
    staleTime: 10_000,
  });

function FrameBuilderPage() {
  const { projectId } = Route.useParams();
  const qc = useQueryClient();
  const fn = useServerFn(getProjectFrameBuilder);
  const genFn = useServerFn(generateProjectFrame);
  const submitFn = useServerFn(submitProjectFrameToReview);
  const approveFn = useServerFn(approveProjectFrame);
  const archiveFn = useServerFn(archiveProjectFrame);

  const { data, isPending, isError, error, refetch } = useQuery(
    frameQueryOptions(projectId, fn as unknown as (i: { data: { projectId: string } }) => Promise<unknown>),
  );
  const [busy, setBusy] = useState<null | "generate" | "submit" | "approve" | "archive">(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["engine", "frame-builder", projectId] });

  const state = data as FrameBuilderState | undefined;

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
        toast.success("Frame draft generated");
      }
      invalidate();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const onSubmit = async (frameId: string) => {
    setBusy("submit");
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (submitFn as any)({ data: { projectId, frameId } });
      toast.success("Frame submitted to review");
      invalidate();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const onApprove = async (frameId: string) => {
    setBusy("approve");
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (approveFn as any)({ data: { projectId, frameId } });
      toast.success("Frame approved");
      invalidate();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const onArchive = async (frameId: string) => {
    if (!confirm("Archive this frame? Archived frames cannot be edited.")) return;
    setBusy("archive");
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (archiveFn as any)({ data: { projectId, frameId } });
      toast.success("Frame archived");
      invalidate();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (isPending) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-sm text-ink/60" data-qa-state="frame-loading">
        <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Loading Frame Builder…
      </div>
    );
  }
  if (isError || !state) {
    return (
      <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">
        Failed to load Frame Builder: {(error as Error | null)?.message ?? "unknown error"}
        <button className="ml-3 underline" onClick={() => void refetch()}>retry</button>
      </div>
    );
  }

  const latest = state.latest;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-5" data-qa-state="frame-loaded" data-project-id={projectId}>
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
            <OverviewCard frame={latest} />
            <PagesSection pages={latest.payload.pages ?? []} />
            <FlowsSection flows={latest.payload.flows ?? []} />
            <DataBackendSection frame={latest} />
            <QaSection frame={latest} />
            <OpenDecisionsSection frame={latest} />
            <HistoryCard history={state.history} />
          </>
        ) : (
          <EmptyFrameCard readiness={state.readiness} />
        )}
      </div>
      <div className="xl:col-span-1 space-y-5">
        <AiPmPanel state={state} />
      </div>
    </div>
  );
}

// ------------------------ presentational ------------------------

function StatusBadge({ status }: { status: FrameStatus }) {
  const map: Record<FrameStatus, string> = {
    draft: "bg-ink/10 text-ink",
    in_review: "bg-amber-100 text-amber-900 border-amber-300",
    approved: "bg-emerald-100 text-emerald-900 border-emerald-300",
    archived: "bg-ink/5 text-ink/60",
  };
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-widest font-mono", map[status])}>
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
  state: FrameBuilderState;
  busy: string | null;
  onGenerate: () => void;
  onSubmit: (id: string) => void;
  onApprove: (id: string) => void;
  onArchive: (id: string) => void;
}) {
  const latest = state.latest;
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-ink/50">Frame Builder</div>
          <h1 className="text-xl font-semibold mt-1">{latest?.title ?? "No frame yet"}</h1>
          <div className="text-xs text-ink/60 mt-1">
            {state.project.client_company} · {state.project.current_step} · {state.project.status}
          </div>
          {latest ? (
            <div className="mt-2 flex items-center gap-2">
              <StatusBadge status={latest.status} />
              <span className="text-[10px] uppercase tracking-widest text-ink/50">
                {latest.generated_by} · {new Date(latest.updated_at).toLocaleString()}
              </span>
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={onGenerate}
            disabled={!state.capabilities.canGenerate || busy === "generate"}
            className="inline-flex items-center gap-1.5 rounded-md bg-royal text-white text-xs px-3 py-1.5 hover:bg-royal/90 disabled:opacity-50"
            title={!state.capabilities.canGenerate ? "Not enough approved direction to generate a frame" : ""}
            data-qa="btn-generate-frame"
          >
            {busy === "generate" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            Generate Frame Set
          </button>
          {latest?.status === "draft" ? (
            <button
              onClick={() => onSubmit(latest.id)}
              disabled={busy === "submit"}
              className="inline-flex items-center gap-1.5 rounded-md border border-border text-xs px-3 py-1.5 hover:border-royal/50 disabled:opacity-50"
              data-qa="btn-submit-frame"
            >
              <ArrowUpCircle className="w-3.5 h-3.5" /> Submit to Review
            </button>
          ) : null}
          {latest?.status === "in_review" && state.capabilities.canApprove ? (
            <button
              onClick={() => onApprove(latest.id)}
              disabled={busy === "approve"}
              className="inline-flex items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 text-emerald-900 text-xs px-3 py-1.5 hover:bg-emerald-100 disabled:opacity-50"
              data-qa="btn-approve-frame"
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> Approve
            </button>
          ) : null}
          {latest && latest.status !== "archived" && state.capabilities.canArchive ? (
            <button
              onClick={() => onArchive(latest.id)}
              disabled={busy === "archive"}
              className="inline-flex items-center gap-1.5 rounded-md border border-border text-xs px-3 py-1.5 text-ink/60 hover:border-red-300 hover:text-red-700 disabled:opacity-50"
              data-qa="btn-archive-frame"
            >
              <Archive className="w-3.5 h-3.5" /> Archive
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function EmptyFrameCard({ readiness }: { readiness: FrameBuilderState["readiness"] }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
      <Layers className="w-8 h-8 mx-auto text-ink/40" />
      <div className="mt-3 text-sm font-medium">No frame yet</div>
      <div className="text-xs text-ink/60 mt-1">
        Generate a Frame Set to turn approved direction into pages, flows, and backend needs.
      </div>
      {!readiness.ready ? (
        <div className="mt-4 rounded border border-amber-200 bg-amber-50 p-3 text-left text-xs text-amber-900">
          <div className="font-semibold mb-1 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Missing inputs</div>
          <ul className="list-disc list-inside space-y-0.5">
            {readiness.missing.map((m) => (
              <li key={m.key}><strong>{m.label}</strong> — {m.recommendation}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function OverviewCard({ frame }: { frame: FrameRow }) {
  const p = frame.payload;
  const counts = [
    { label: "Pages", value: p.pages?.length ?? 0 },
    { label: "Flows", value: p.flows?.length ?? 0 },
    { label: "Roles", value: p.roles?.length ?? 0 },
    { label: "Backend reqs", value: p.backend_requirements?.length ?? 0 },
    { label: "Open decisions", value: p.open_decisions?.length ?? 0 },
  ];
  const mustCount = (p.pages ?? []).filter((pg) => pg.priority === "must").length;
  const qaReady = (p.open_decisions ?? []).filter((d) => d.blocks.includes("delivery")).length === 0;
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-ink/50">Overview</div>
      {frame.summary ? <p className="text-sm text-ink mt-2">{frame.summary}</p> : null}
      {p.frame_goal ? (
        <p className="text-xs text-ink/70 mt-2"><span className="font-semibold">Goal:</span> {p.frame_goal}</p>
      ) : null}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-4">
        {counts.map((c) => (
          <div key={c.label} className="rounded border border-border bg-white/40 p-2">
            <div className="text-lg font-semibold">{c.value}</div>
            <div className="text-[10px] uppercase tracking-widest text-ink/50">{c.label}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-[10px] uppercase tracking-widest">
        <span className="rounded-full bg-royal/10 text-royal px-2 py-0.5">{mustCount} must-build</span>
        <span className={cn("rounded-full px-2 py-0.5", qaReady ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900")}>
          {qaReady ? "QA-ready" : "QA gates unresolved"}
        </span>
      </div>
    </div>
  );
}

function PagesSection({ pages }: { pages: FramePage[] }) {
  const groups: Record<FramePagePriority, FramePage[]> = { must: [], should: [], later: [] };
  for (const p of pages) groups[p.priority ?? "should"].push(p);
  const labels: Record<FramePagePriority, string> = { must: "Must build", should: "Should build", later: "Later" };
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <Layers className="w-4 h-4 text-royal" />
        <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-ink/50">Pages / Screens</div>
      </div>
      {pages.length === 0 ? (
        <div className="text-xs text-ink/50 mt-3">No pages defined.</div>
      ) : (
        <div className="mt-3 space-y-4">
          {(Object.keys(groups) as FramePagePriority[]).map((k) => (
            groups[k].length ? (
              <div key={k}>
                <div className="text-[10px] uppercase tracking-widest text-ink/50 mb-2">
                  {labels[k]} · {groups[k].length}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {groups[k].map((p) => <PageCard key={p.id} page={p} />)}
                </div>
              </div>
            ) : null
          ))}
        </div>
      )}
    </div>
  );
}

function PageCard({ page }: { page: FramePage }) {
  return (
    <div className="rounded-lg border border-border bg-white/50 p-3 text-xs space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold text-sm text-ink">{page.title}</div>
          <div className="text-[10px] uppercase tracking-widest text-ink/50">{page.type}</div>
        </div>
        <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] uppercase tracking-widest",
          page.priority === "must" ? "bg-royal/10 text-royal" :
          page.priority === "should" ? "bg-amber-100 text-amber-900" : "bg-ink/5 text-ink/60")}>
          {page.priority}
        </span>
      </div>
      {page.goal ? <div className="text-ink/70">{page.goal}</div> : null}
      <div className="flex flex-wrap gap-1">
        {page.roles_allowed?.map((r) => (
          <span key={r} className="rounded bg-ink/5 px-1.5 py-0.5 text-[10px]">{r}</span>
        ))}
      </div>
      <StringList label="Actions" items={page.primary_actions} />
      <StringList label="States" items={page.states} />
      <StringList label="Data reads" items={page.data_reads} />
      <StringList label="Data writes" items={page.data_writes} />
      <StringList label="Backend" items={page.backend_requirements} />
      <StringList label="QA" items={page.qa_checks} />
      {page.open_questions?.length ? (
        <div className="rounded bg-amber-50 border border-amber-200 p-1.5 text-amber-900">
          <div className="font-mono text-[9px] uppercase tracking-widest">Open</div>
          <ul className="list-disc list-inside">{page.open_questions.map((q, i) => <li key={i}>{q}</li>)}</ul>
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
      <ul className="list-disc list-inside text-ink/80">{items.map((it, i) => <li key={i}>{it}</li>)}</ul>
    </div>
  );
}

function FlowsSection({ flows }: { flows: FrameRow["payload"]["flows"] }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <Workflow className="w-4 h-4 text-royal" />
        <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-ink/50">User Flows</div>
      </div>
      {flows.length === 0 ? (
        <div className="text-xs text-ink/50 mt-3">No flows defined.</div>
      ) : (
        <ol className="mt-3 space-y-3">
          {flows.map((f, i) => (
            <li key={i} className="rounded border border-border bg-white/40 p-3 text-xs">
              <div className="font-semibold text-sm text-ink">{f.title}</div>
              <div className="text-[10px] uppercase tracking-widest text-ink/50 mb-1">Actor: {f.actor}</div>
              <ol className="list-decimal list-inside text-ink/80 space-y-0.5">
                {f.steps.map((s, si) => <li key={si}>{s}</li>)}
              </ol>
              {f.success_condition ? (
                <div className="mt-2 text-emerald-800"><strong>Success:</strong> {f.success_condition}</div>
              ) : null}
              {f.edge_cases?.length ? (
                <div className="mt-1 text-amber-900"><strong>Edge cases:</strong> {f.edge_cases.join("; ")}</div>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function DataBackendSection({ frame }: { frame: FrameRow }) {
  const { data_objects, backend_requirements, permissions } = frame.payload;
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <Database className="w-4 h-4 text-royal" />
        <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-ink/50">Data + Backend</div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3 text-xs">
        <div>
          <div className="font-mono text-[9px] uppercase tracking-widest text-ink/50 mb-1">Data objects</div>
          <ul className="space-y-1">
            {data_objects?.length ? data_objects.map((d, i) => (
              <li key={i} className="rounded border border-border bg-white/40 p-2">
                <div className="font-semibold">{d.name}</div>
                <div className="text-ink/70">{d.purpose}</div>
                <div className="text-[10px] text-ink/50">Owned by: {d.owned_by}</div>
              </li>
            )) : <li className="text-ink/50">None</li>}
          </ul>
        </div>
        <div>
          <div className="font-mono text-[9px] uppercase tracking-widest text-ink/50 mb-1">Backend requirements</div>
          <ul className="list-disc list-inside space-y-0.5 text-ink/80">
            {backend_requirements?.length ? backend_requirements.map((b, i) => <li key={i}>{b}</li>) : <li className="text-ink/50 list-none">None</li>}
          </ul>
        </div>
        <div>
          <div className="font-mono text-[9px] uppercase tracking-widest text-ink/50 mb-1">Permissions</div>
          <ul className="space-y-1">
            {permissions?.length ? permissions.map((p, i) => (
              <li key={i} className="rounded border border-border bg-white/40 p-2">
                <div className="font-semibold">{p.role}</div>
                <div className="text-ink/70">{p.can.join(", ")}</div>
              </li>
            )) : <li className="text-ink/50">None</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}

function QaSection({ frame }: { frame: FrameRow }) {
  const gates = frame.payload.qa_gates ?? [];
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <ListChecks className="w-4 h-4 text-royal" />
        <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-ink/50">QA Expectations</div>
      </div>
      {gates.length === 0 ? (
        <div className="text-xs text-ink/50 mt-3">No QA gates defined.</div>
      ) : (
        <ul className="mt-3 space-y-1 text-xs">
          {gates.map((g, i) => (
            <li key={i} className="rounded border border-border bg-white/40 p-2">
              <div className="font-semibold">{g.name}</div>
              <div className="text-ink/70">{g.detail}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function OpenDecisionsSection({ frame }: { frame: FrameRow }) {
  const decisions = frame.payload.open_decisions ?? [];
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <HelpCircle className="w-4 h-4 text-royal" />
        <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-ink/50">Open Decisions</div>
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
                  <span key={b} className="rounded-full bg-amber-200 text-amber-950 px-2 py-0.5 text-[10px] uppercase tracking-widest">
                    blocks {b}
                  </span>
                ))}
              </div>
              <div className="mt-1 text-ink/70">
                <strong>Owner:</strong> {d.recommended_owner} · <strong>Next:</strong> {d.suggested_next_action}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function HistoryCard({ history }: { history: FrameBuilderState["history"] }) {
  if (!history.length) return null;
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-ink/50">History</div>
      <ul className="mt-2 text-xs divide-y divide-border">
        {history.slice(0, 8).map((h) => (
          <li key={h.id} className="py-1.5 flex items-center justify-between gap-2">
            <div className="truncate"><span className="font-medium">{h.title}</span> <span className="text-ink/50">· {h.generated_by}</span></div>
            <div className="flex items-center gap-2">
              <StatusBadge status={h.status} />
              <span className="text-ink/50 text-[10px]">{new Date(h.updated_at).toLocaleDateString()}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AiPmPanel({ state }: { state: FrameBuilderState }) {
  const latest = state.latest;
  const knows: string[] = [];
  const missing: string[] = state.readiness.missing.map((m) => m.label);
  const recommends: string[] = [];
  const needsReview: string[] = [];
  const canMoveToMockups: string[] = [];

  if (latest) {
    knows.push(`Latest frame: ${latest.title} (${latest.status})`);
    knows.push(`${latest.payload.pages?.length ?? 0} pages, ${latest.payload.flows?.length ?? 0} flows`);
    if (latest.status === "draft") {
      recommends.push("Review the draft and submit to review.");
      needsReview.push("Frame draft awaiting internal review.");
    }
    if (latest.status === "in_review") {
      needsReview.push("Frame in review — admin approval required.");
    }
    if (latest.status === "approved") {
      canMoveToMockups.push("Frame is approved — ready to move to Mockup Builder.");
    }
    const openBlockingMockups = (latest.payload.open_decisions ?? []).filter((d) => d.blocks?.includes("mockups"));
    if (openBlockingMockups.length) recommends.push(`Resolve ${openBlockingMockups.length} decision(s) blocking mockups.`);
  } else if (state.readiness.ready) {
    recommends.push("Click Generate Frame Set to draft the first frame.");
  } else {
    recommends.push("Capture missing project inputs before generating a frame.");
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm sticky top-4 space-y-4">
      <div className="flex items-center gap-2">
        <Bot className="w-4 h-4 text-royal" />
        <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-ink/50">AI PM Panel</div>
      </div>
      <PanelList title="What the frame knows" icon={<Sparkles className="w-3.5 h-3.5" />} items={knows} tone="info" />
      <PanelList title="What's missing" icon={<AlertTriangle className="w-3.5 h-3.5" />} items={missing} tone="warn" />
      <PanelList title="What I recommend next" icon={<Users className="w-3.5 h-3.5" />} items={recommends} tone="info" />
      <PanelList title="Needs review" icon={<ShieldCheck className="w-3.5 h-3.5" />} items={needsReview} tone="warn" />
      <PanelList title="Ready for mockups" icon={<CheckCircle2 className="w-3.5 h-3.5" />} items={canMoveToMockups} tone="ok" />
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
      <div className={cn("flex items-center gap-1 text-[10px] uppercase tracking-widest font-mono", toneCls)}>
        {icon} {title}
      </div>
      {items.length ? (
        <ul className={cn("mt-1 text-xs list-disc list-inside", toneCls)}>
          {items.map((it, i) => <li key={i}>{it}</li>)}
        </ul>
      ) : (
        <div className="text-xs text-ink/40 mt-1">Nothing</div>
      )}
    </div>
  );
}
