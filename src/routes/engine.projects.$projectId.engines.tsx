import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  listBusinessEngines,
  createBusinessEngine,
  activateBusinessEngine,
  pauseBusinessEngine,
  listEngineRuns,
  type BusinessEngine,
} from "@/lib/engine-business-engines.functions";
import { getSpineReadiness, type SpineReadiness } from "@/lib/engine-spine-readiness.functions";
import { Loader2, PlayCircle, PauseCircle, Plus, ChevronDown, ChevronRight, ShieldAlert, CheckCircle2, ChevronLeft, ChevronsLeft, ChevronsRight, Search, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/engine/projects/$projectId/engines")({
  component: EnginesPage,
});

const ENGINE_STATUSES = ["draft", "proposed", "approved", "active", "paused", "retired"] as const;
const PAGE_SIZE = 10;

function fmt(d: string | null) {
  if (!d) return "—";
  try { return new Date(d).toLocaleString(); } catch { return d; }
}

function ReadinessBanner({ r }: { r: SpineReadiness | null }) {
  if (!r) return null;
  if (r.ready) {
    return (
      <div className="border border-emerald-500/30 bg-emerald-500/10 rounded p-3 text-emerald-200 text-sm flex items-center gap-2">
        <CheckCircle2 className="w-4 h-4" /> Spine ready — Point A + Point B fully approved, no active contradictions.
      </div>
    );
  }
  return (
    <div className="border border-amber-500/30 bg-amber-500/10 rounded p-3 text-amber-100 text-sm">
      <div className="flex items-center gap-2 font-medium">
        <ShieldAlert className="w-4 h-4" /> Governance gate blocks engine approval
      </div>
      {r.has_active_contradictions && (
        <div className="mt-2">• Active contradictions must be resolved.</div>
      )}
      {r.point_a.missing.length > 0 && (
        <div className="mt-2">• Point A missing approved truth on: <span className="font-mono text-xs">{r.point_a.missing.join(", ")}</span></div>
      )}
      {r.point_b.missing.length > 0 && (
        <div className="mt-2">• Point B missing approved truth on: <span className="font-mono text-xs">{r.point_b.missing.join(", ")}</span></div>
      )}
    </div>
  );
}

function CreateEngineForm({ projectId, onCreated }: { projectId: string; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [outcome, setOutcome] = useState("");
  const [kind, setKind] = useState<"intake" | "delivery" | "learning" | "sales" | "ops" | "reporting" | "custom">("ops");
  const [cadence, setCadence] = useState<"daily" | "weekly" | "biweekly" | "monthly" | "quarterly" | "ad_hoc">("weekly");
  const createFn = useServerFn(createBusinessEngine);
  const mut = useMutation({
    mutationFn: () => createFn({ data: { projectId, name, outcome, kind, cadence } }),
    onSuccess: () => {
      setName(""); setOutcome(""); setOpen(false); onCreated();
    },
  });

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-2 text-sm rounded border border-white/10 bg-white/5 hover:bg-white/10 px-3 py-1.5 text-white">
        <Plus className="w-4 h-4" /> New engine
      </button>
    );
  }

  return (
    <div className="border border-white/10 rounded-lg p-4 bg-black/20 space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="text-sm text-white/70">Name
          <input className="mt-1 w-full rounded bg-black/40 border border-white/10 px-2 py-1.5 text-white" value={name} onChange={e => setName(e.target.value)} />
        </label>
        <label className="text-sm text-white/70">Outcome
          <input className="mt-1 w-full rounded bg-black/40 border border-white/10 px-2 py-1.5 text-white" value={outcome} onChange={e => setOutcome(e.target.value)} />
        </label>
        <label className="text-sm text-white/70">Kind
          <select className="mt-1 w-full rounded bg-black/40 border border-white/10 px-2 py-1.5 text-white" value={kind} onChange={e => setKind(e.target.value as typeof kind)}>
            <option>intake</option><option>delivery</option><option>learning</option><option>sales</option><option>ops</option><option>reporting</option><option>custom</option>
          </select>
        </label>
        <label className="text-sm text-white/70">Cadence
          <select className="mt-1 w-full rounded bg-black/40 border border-white/10 px-2 py-1.5 text-white" value={cadence} onChange={e => setCadence(e.target.value as typeof cadence)}>
            <option>daily</option><option>weekly</option><option>biweekly</option><option>monthly</option><option>quarterly</option><option>ad_hoc</option>
          </select>
        </label>
      </div>
      {mut.isError && <div className="text-rose-300 text-sm">{(mut.error as Error).message}</div>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="rounded bg-emerald-500/20 border border-emerald-500/30 text-emerald-200 text-sm px-3 py-1.5 disabled:opacity-50"
          disabled={mut.isPending || !name || !outcome}
          onClick={() => mut.mutate()}
        >
          {mut.isPending ? "Creating…" : "Create"}
        </button>
        <button type="button" className="text-sm text-white/60 hover:text-white" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}


function EngineRow({ engine, readiness, onChange, projectId }: { engine: BusinessEngine; readiness: SpineReadiness | null; onChange: () => void; projectId: string }) {
  const [ownerEmail, setOwnerEmail] = useState(engine.owner_email ?? "");
  const [expanded, setExpanded] = useState(false);
  const activateFn = useServerFn(activateBusinessEngine);
  const pauseFn = useServerFn(pauseBusinessEngine);
  const listRuns = useServerFn(listEngineRuns);

  const activate = useMutation({
    mutationFn: () => activateFn({ data: { engineId: engine.id, ownerEmail } }),
    onSuccess: onChange,
  });
  const pause = useMutation({
    mutationFn: () => pauseFn({ data: { engineId: engine.id } }),
    onSuccess: onChange,
  });
  const { data: runsData } = useQuery({
    queryKey: ["engine-runs", engine.id],
    queryFn: () => listRuns({ data: { engineId: engine.id, limit: 20 } }),
    enabled: expanded,
  });

  const canActivate = (readiness?.ready ?? false) && ownerEmail.length > 3;

  return (
    <div className="border border-white/10 rounded-lg bg-black/20">
      <div className="p-4">
        <div className="flex items-start gap-3">
          <button onClick={() => setExpanded(v => !v)} className="text-white/60 hover:text-white mt-0.5">
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-white font-medium">{engine.name}</span>
              <span className="text-[10px] uppercase tracking-widest px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-white/70">{engine.status}</span>
              <span className="text-[10px] uppercase tracking-widest px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-white/60">{engine.kind}</span>
              <span className="text-[10px] uppercase tracking-widest px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-white/60">{engine.cadence}</span>
            </div>
            <div className="text-white/60 text-sm mt-1">{engine.outcome}</div>
            <div className="text-white/40 text-xs mt-1">
              Owner: {engine.owner_email ?? "—"} · Last run: {fmt(engine.last_run_at)} · Next run: {fmt(engine.next_run_at)}
            </div>
          </div>
        </div>

        {engine.status !== "active" && (
          <div className="mt-3 flex items-center gap-2">
            <input
              className="flex-1 rounded bg-black/40 border border-white/10 px-2 py-1.5 text-white text-sm"
              placeholder="owner@email"
              value={ownerEmail}
              onChange={e => setOwnerEmail(e.target.value)}
            />
            <button
              type="button"
              disabled={!canActivate || activate.isPending}
              onClick={() => activate.mutate()}
              className="inline-flex items-center gap-1 rounded bg-emerald-500/20 border border-emerald-500/30 text-emerald-200 text-sm px-3 py-1.5 disabled:opacity-50"
            >
              <PlayCircle className="w-4 h-4" /> Activate
            </button>
          </div>
        )}
        {engine.status === "active" && (
          <div className="mt-3">
            <button
              type="button"
              disabled={pause.isPending}
              onClick={() => pause.mutate()}
              className="inline-flex items-center gap-1 rounded bg-amber-500/20 border border-amber-500/30 text-amber-200 text-sm px-3 py-1.5"
            >
              <PauseCircle className="w-4 h-4" /> Pause
            </button>
          </div>
        )}
        {activate.isError && <div className="text-rose-300 text-xs mt-2">{(activate.error as Error).message}</div>}
      </div>

      {expanded && (
        <div className="border-t border-white/10 p-4">
          <div className="text-xs uppercase tracking-widest text-white/50 mb-2">Run history</div>
          {(runsData?.runs ?? []).length === 0 ? (
            <div className="text-white/50 text-sm">No runs yet.</div>
          ) : (
            <div className="space-y-2">
              {(runsData?.runs ?? []).map(r => (
                <Link
                  key={r.id}
                  to="/engine/projects/$projectId/engines/runs/$runId"
                  params={{ projectId, runId: r.id }}
                  className="block w-full text-left text-sm border border-white/5 hover:border-white/20 rounded p-2 bg-black/30"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] uppercase tracking-widest px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-white/70">{r.status}</span>
                    <span className="text-white/60 text-xs">cycle {r.cycle_key}</span>
                    <span className="text-white/40 text-xs ml-auto inline-flex items-center gap-1">
                      {fmt(r.completed_at ?? r.started_at ?? r.created_at)} <ExternalLink className="w-3 h-3" />
                    </span>
                  </div>
                  {r.model && <div className="text-white/50 text-xs mt-1">model: {r.model} · cost: {r.cost_cents ?? 0}¢ · latency: {r.latency_ms ?? 0}ms</div>}
                  {r.error && <div className="text-rose-300 text-xs mt-1">{r.error}</div>}
                  <div className="text-white/40 text-[10px] mt-1">Open detail page →</div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type SortKey = "created_at" | "name" | "last_run_at" | "next_run_at" | "status";

function EnginesPage() {
  const { projectId } = Route.useParams();
  const listFn = useServerFn(listBusinessEngines);
  const readinessFn = useServerFn(getSpineReadiness);
  const qc = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");

  const { data: enginesData, isLoading } = useQuery({
    queryKey: ["business-engines", projectId],
    queryFn: () => listFn({ data: { projectId } }),
  });
  const { data: readinessData } = useQuery({
    queryKey: ["spine-readiness", projectId],
    queryFn: () => readinessFn({ data: { projectId } }),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["business-engines", projectId] });
    qc.invalidateQueries({ queryKey: ["spine-readiness", projectId] });
  };

  const engines = enginesData?.engines ?? [];
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let f = statusFilter === "all" ? engines : engines.filter(e => e.status === statusFilter);
    if (q) {
      f = f.filter(e =>
        (e.name ?? "").toLowerCase().includes(q) ||
        (e.outcome ?? "").toLowerCase().includes(q) ||
        (e.kind ?? "").toLowerCase().includes(q) ||
        (e.status ?? "").toLowerCase().includes(q) ||
        (e.owner_email ?? "").toLowerCase().includes(q) ||
        e.project_id.toLowerCase().includes(q),
      );
    }
    const sorted = [...f].sort((a, b) => {
      const av = (a[sortKey] ?? "") as string;
      const bv = (b[sortKey] ?? "") as string;
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [engines, statusFilter, sortKey, sortDir, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div className="space-y-4">
      <header>
        <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal">Business Engines</div>
        <h2 className="font-display text-3xl text-ink mt-1">Recurring engines</h2>
        <p className="text-sm text-ink/60 mt-1">
          Define the recurring workflows that keep the business running: owner, cadence, triggers, approval rules, metrics.
        </p>
      </header>

      <ReadinessBanner r={readinessData?.readiness ?? null} />

      <div className="flex flex-wrap items-center gap-3 border border-white/10 bg-black/20 rounded-lg p-3">
        <label className="text-xs text-white/60">Status
          <select
            className="ml-2 rounded bg-black/40 border border-white/10 px-2 py-1 text-white text-xs"
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          >
            <option value="all">All</option>
            {ENGINE_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="text-xs text-white/60">Sort by
          <select
            className="ml-2 rounded bg-black/40 border border-white/10 px-2 py-1 text-white text-xs"
            value={sortKey}
            onChange={e => setSortKey(e.target.value as SortKey)}
          >
            <option value="created_at">Created</option>
            <option value="name">Name</option>
            <option value="status">Status</option>
            <option value="last_run_at">Last run</option>
            <option value="next_run_at">Next run</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => setSortDir(d => d === "asc" ? "desc" : "asc")}
          className="text-xs rounded bg-black/40 border border-white/10 px-2 py-1 text-white/80 hover:bg-white/5"
        >
          {sortDir === "asc" ? "↑ Asc" : "↓ Desc"}
        </button>
        <div className="ml-auto text-xs text-white/60">
          {filtered.length} of {engines.length} · page {currentPage}/{totalPages}
        </div>
        <CreateEngineForm projectId={projectId} onCreated={refresh} />
      </div>

      {isLoading && (
        <div className="text-white/60 text-sm flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
      )}

      <div className="space-y-3">
        {pageItems.map(e => (
          <EngineRow
            key={e.id}
            engine={e}
            readiness={readinessData?.readiness ?? null}
            onChange={refresh}
            onOpenRun={setOpenRunId}
          />
        ))}
        {!isLoading && pageItems.length === 0 && (
          <div className="text-white/50 text-sm border border-white/10 bg-white/5 rounded p-6 text-center">
            No engines match this filter.
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1 pt-2">
          <PagerBtn onClick={() => setPage(1)} disabled={currentPage === 1}><ChevronsLeft className="w-4 h-4" /></PagerBtn>
          <PagerBtn onClick={() => setPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}><ChevronLeft className="w-4 h-4" /></PagerBtn>
          <span className="text-xs text-white/60 px-3">Page {currentPage} of {totalPages}</span>
          <PagerBtn onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}><ChevronRight className="w-4 h-4" /></PagerBtn>
          <PagerBtn onClick={() => setPage(totalPages)} disabled={currentPage === totalPages}><ChevronsRight className="w-4 h-4" /></PagerBtn>
        </div>
      )}

      {openRunId && <RunDetailModal runId={openRunId} onClose={() => setOpenRunId(null)} />}
    </div>
  );
}

function PagerBtn({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded border border-white/10 bg-black/30 text-white/80 p-1.5 hover:bg-white/10 disabled:opacity-40"
    >
      {children}
    </button>
  );
}
