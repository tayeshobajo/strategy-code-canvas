import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  listSolutionsForProject,
  proposeMilestoneSolution,
  selectMilestoneSolution,
  type MilestoneSolution,
} from "@/lib/engine-solutions.functions";
import { Loader2, CheckCircle2, Plus } from "lucide-react";

export const Route = createFileRoute("/engine/projects/$projectId/solutions")({
  component: SolutionsPage,
});

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

  const { data, isLoading } = useQuery({
    queryKey: ["solutions", projectId],
    queryFn: () => listFn({ data: { projectId } }),
  });

  const selectMut = useMutation({
    mutationFn: (id: string) => selectFn({ data: { solutionId: id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["solutions", projectId] }),
  });

  const solutions = (data?.solutions ?? []) as MilestoneSolution[];
  const byMilestone = new Map<string, MilestoneSolution[]>();
  for (const s of solutions) {
    const arr = byMilestone.get(s.milestone_id) ?? [];
    arr.push(s);
    byMilestone.set(s.milestone_id, arr);
  }

  return (
    <div className="space-y-4">
      <header>
        <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal">Multi-Solution Decomposition</div>
        <h2 className="font-display text-3xl text-ink mt-1">Candidate solutions</h2>
        <p className="text-sm text-ink/60 mt-1">
          Every milestone can have multiple candidate solutions with explicit dependencies, assumptions, and evidence. One is selected; the rest are superseded automatically.
        </p>
      </header>

      {isLoading && (
        <div className="text-white/60 text-sm flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
      )}
      {!isLoading && byMilestone.size === 0 && (
        <div className="border border-white/10 bg-white/5 rounded p-6 text-white/60 text-sm">
          No solutions yet. Open a milestone brief to propose candidates.
        </div>
      )}

      {selectMut.isError && (
        <div className="text-rose-300 text-sm">{(selectMut.error as Error).message}</div>
      )}

      <div className="space-y-6">
        {[...byMilestone.entries()].map(([mid, sols]) => (
          <div key={mid} className="border border-white/10 rounded-lg p-4 bg-black/10">
            <div className="text-xs uppercase tracking-widest text-white/50 mb-3">
              Milestone <span className="font-mono">{mid.slice(0, 8)}</span>
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
    </div>
  );
}
