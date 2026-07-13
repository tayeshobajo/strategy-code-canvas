import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  listSolutionsForProject,
  proposeMilestoneSolution,
  selectMilestoneSolution,
  type MilestoneSolution,
} from "@/lib/engine-solutions.functions";
import { Loader2, CheckCircle2, Plus, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

export const Route = createFileRoute("/engine/projects/$projectId/solutions")({
  component: SolutionsPage,
});

const SOLUTION_STATUSES = ["candidate", "selected", "deferred", "rejected", "superseded"] as const;
const SOL_PAGE_SIZE = 6;
type SolSortKey = "created_at" | "title" | "status" | "investment_estimate_cents";

const STATUS_CLS: Record<string, string> = {
  candidate:   "bg-sky-500/10 text-sky-300 border-sky-500/30",
  selected:    "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  deferred:    "bg-white/5 text-white/60 border-white/10",
  rejected:    "bg-rose-500/10 text-rose-300 border-rose-500/30",
  superseded:  "bg-white/5 text-white/40 border-white/10",
};

function fmtCents(c: number | null) {
  if (c == null) return "—";
  return `$${(c / 100).toLocaleString()}`;
}

function SolutionCard({ s, onSelect }: { s: MilestoneSolution; onSelect: (id: string) => void }) {
  return (
    <div className="border border-white/10 rounded-lg p-4 bg-black/20">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[10px] uppercase tracking-widest px-1.5 py-0.5 rounded border ${STATUS_CLS[s.status] ?? STATUS_CLS.candidate}`}>{s.status}</span>
            <span className="text-white font-medium">{s.title}</span>
          </div>
          {s.summary && <p className="text-white/70 text-sm mt-2">{s.summary}</p>}
          {s.rationale && <p className="text-white/50 text-sm mt-2 italic">Rationale: {s.rationale}</p>}
          <div className="text-white/40 text-xs mt-2 flex flex-wrap gap-3">
            <span>Effort: {s.effort_estimate ?? "—"}</span>
            <span>Investment: {fmtCents(s.investment_estimate_cents)}</span>
            <span>Deps: {s.depends_on_solution_ids.length + s.depends_on_milestone_ids.length}</span>
            <span>Evidence: {s.evidence_source_ids.length}</span>
          </div>
          {Array.isArray(s.assumptions) && s.assumptions.length > 0 && (
            <ul className="text-white/60 text-xs mt-2 list-disc pl-4 space-y-0.5">
              {(s.assumptions as string[]).slice(0, 4).map((a, i) => <li key={i}>{a}</li>)}
            </ul>
          )}
        </div>
        {s.status === "candidate" && (
          <button
            onClick={() => onSelect(s.id)}
            className="inline-flex items-center gap-1 rounded bg-emerald-500/20 border border-emerald-500/30 text-emerald-200 text-xs px-2.5 py-1.5"
          >
            <CheckCircle2 className="w-3.5 h-3.5" /> Select
          </button>
        )}
      </div>
    </div>
  );
}

function ProposeForm({ milestoneId, onCreated }: { milestoneId: string; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [assumptions, setAssumptions] = useState("");
  const propose = useServerFn(proposeMilestoneSolution);
  const mut = useMutation({
    mutationFn: () => propose({
      data: {
        milestoneId,
        payload: {
          title,
          summary: summary || undefined,
          assumptions: assumptions.split("\n").map(s => s.trim()).filter(Boolean),
        },
      },
    }),
    onSuccess: () => { setTitle(""); setSummary(""); setAssumptions(""); setOpen(false); onCreated(); },
  });

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1 text-xs text-white/70 hover:text-white">
        <Plus className="w-3 h-3" /> Propose candidate
      </button>
    );
  }

  return (
    <div className="border border-white/10 rounded p-3 bg-black/30 mt-2 space-y-2">
      <input className="w-full rounded bg-black/40 border border-white/10 px-2 py-1.5 text-white text-sm" placeholder="Title" value={title} onChange={e => setTitle(e.target.value)} />
      <textarea className="w-full rounded bg-black/40 border border-white/10 px-2 py-1.5 text-white text-sm" rows={2} placeholder="Summary" value={summary} onChange={e => setSummary(e.target.value)} />
      <textarea className="w-full rounded bg-black/40 border border-white/10 px-2 py-1.5 text-white text-sm" rows={2} placeholder="Assumptions (one per line)" value={assumptions} onChange={e => setAssumptions(e.target.value)} />
      {mut.isError && <div className="text-rose-300 text-xs">{(mut.error as Error).message}</div>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="rounded bg-emerald-500/20 border border-emerald-500/30 text-emerald-200 text-xs px-2.5 py-1.5 disabled:opacity-50"
          disabled={mut.isPending || !title}
          onClick={() => mut.mutate()}
        >
          {mut.isPending ? "Saving…" : "Save candidate"}
        </button>
        <button type="button" className="text-xs text-white/60" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}

function SolutionsPage() {
  const { projectId } = Route.useParams();
  const listFn = useServerFn(listSolutionsForProject);
  const selectFn = useServerFn(selectMilestoneSolution);
  const qc = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SolSortKey>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [milestonePage, setMilestonePage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["solutions", projectId],
    queryFn: () => listFn({ data: { projectId } }),
  });

  const selectMut = useMutation({
    mutationFn: (id: string) => selectFn({ data: { solutionId: id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["solutions", projectId] }),
  });

  const solutions = (data?.solutions ?? []) as MilestoneSolution[];

  const filtered = useMemo(() => {
    const f = statusFilter === "all" ? solutions : solutions.filter(s => s.status === statusFilter);
    const sorted = [...f].sort((a, b) => {
      const av = (a[sortKey] ?? "") as string | number;
      const bv = (b[sortKey] ?? "") as string | number;
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [solutions, statusFilter, sortKey, sortDir]);

  const byMilestone = useMemo(() => {
    const m = new Map<string, MilestoneSolution[]>();
    for (const s of filtered) {
      const arr = m.get(s.milestone_id) ?? [];
      arr.push(s);
      m.set(s.milestone_id, arr);
    }
    return m;
  }, [filtered]);

  const milestoneEntries = [...byMilestone.entries()];
  const totalPages = Math.max(1, Math.ceil(milestoneEntries.length / SOL_PAGE_SIZE));
  const currentPage = Math.min(milestonePage, totalPages);
  const pageEntries = milestoneEntries.slice((currentPage - 1) * SOL_PAGE_SIZE, currentPage * SOL_PAGE_SIZE);

  return (
    <div className="space-y-4">
      <header>
        <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal">Multi-Solution Decomposition</div>
        <h2 className="font-display text-3xl text-ink mt-1">Candidate solutions</h2>
        <p className="text-sm text-ink/60 mt-1">
          Every milestone can have multiple candidate solutions with explicit dependencies, assumptions, and evidence. One is selected; the rest are superseded automatically.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3 border border-white/10 bg-black/20 rounded-lg p-3">
        <label className="text-xs text-white/60">Status
          <select
            className="ml-2 rounded bg-black/40 border border-white/10 px-2 py-1 text-white text-xs"
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setMilestonePage(1); }}
          >
            <option value="all">All</option>
            {SOLUTION_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="text-xs text-white/60">Sort by
          <select
            className="ml-2 rounded bg-black/40 border border-white/10 px-2 py-1 text-white text-xs"
            value={sortKey}
            onChange={e => setSortKey(e.target.value as SolSortKey)}
          >
            <option value="created_at">Created</option>
            <option value="title">Title</option>
            <option value="status">Status</option>
            <option value="investment_estimate_cents">Investment</option>
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
          {filtered.length} of {solutions.length} solutions · {milestoneEntries.length} milestones · page {currentPage}/{totalPages}
        </div>
      </div>

      {isLoading && (
        <div className="text-white/60 text-sm flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
      )}
      {!isLoading && milestoneEntries.length === 0 && (
        <div className="border border-white/10 bg-white/5 rounded p-6 text-white/60 text-sm">
          No solutions match this filter.
        </div>
      )}

      {selectMut.isError && (
        <div className="text-rose-300 text-sm">{(selectMut.error as Error).message}</div>
      )}

      <div className="space-y-6">
        {pageEntries.map(([mid, sols]) => (
          <div key={mid} className="border border-white/10 rounded-lg p-4 bg-black/10">
            <div className="text-xs uppercase tracking-widest text-white/50 mb-3">
              Milestone <span className="font-mono">{mid.slice(0, 8)}</span> · {sols.length} candidate{sols.length === 1 ? "" : "s"}
            </div>
            <div className="space-y-2">
              {sols.map(s => <SolutionCard key={s.id} s={s} onSelect={(id) => selectMut.mutate(id)} />)}
            </div>
            <div className="mt-3">
              <ProposeForm milestoneId={mid} onCreated={() => qc.invalidateQueries({ queryKey: ["solutions", projectId] })} />
            </div>
          </div>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1 pt-2">
          <SolPagerBtn onClick={() => setMilestonePage(1)} disabled={currentPage === 1}><ChevronsLeft className="w-4 h-4" /></SolPagerBtn>
          <SolPagerBtn onClick={() => setMilestonePage(p => Math.max(1, p - 1))} disabled={currentPage === 1}><ChevronLeft className="w-4 h-4" /></SolPagerBtn>
          <span className="text-xs text-white/60 px-3">Page {currentPage} of {totalPages}</span>
          <SolPagerBtn onClick={() => setMilestonePage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}><ChevronRight className="w-4 h-4" /></SolPagerBtn>
          <SolPagerBtn onClick={() => setMilestonePage(totalPages)} disabled={currentPage === totalPages}><ChevronsRight className="w-4 h-4" /></SolPagerBtn>
        </div>
      )}
    </div>
  );
}

function SolPagerBtn({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
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
