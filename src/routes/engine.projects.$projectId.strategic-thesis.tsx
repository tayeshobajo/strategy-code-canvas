import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock, Loader2, Plus, Sparkles, Target, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  getStrategicThesis,
  proposeStrategicThesis,
  approveStrategicThesis,
  rejectStrategicThesis,
  type StrategicThesisState,
  type StrategicThesisVersion,
  type ProofMetric,
  type KillCriterion,
  type ThesisAssumption,
} from "@/lib/engine-strategic-thesis.functions";
import { aiDraftStrategicThesis } from "@/lib/engine-strategic-thesis-ai.functions";

export const Route = createFileRoute("/engine/projects/$projectId/strategic-thesis")({
  component: StrategicThesisPage,
});

type Draft = {
  bet_statement: string;
  why_now: string;
  wedge: string;
  proof_metrics: ProofMetric[];
  kill_criteria: KillCriterion[];
  assumptions: ThesisAssumption[];
  notes: string;
};

function emptyDraft(): Draft {
  return {
    bet_statement: "",
    why_now: "",
    wedge: "",
    proof_metrics: [],
    kill_criteria: [],
    assumptions: [],
    notes: "",
  };
}

function fromState(s: StrategicThesisState | undefined): Draft {
  const c = s?.current;
  if (!c) return emptyDraft();
  return {
    bet_statement: c.bet_statement ?? "",
    why_now: c.why_now ?? "",
    wedge: c.wedge ?? "",
    proof_metrics: c.proof_metrics ?? [],
    kill_criteria: c.kill_criteria ?? [],
    assumptions: c.assumptions ?? [],
    notes: c.notes ?? "",
  };
}

function shortId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

function StrategicThesisPage() {
  const { projectId } = Route.useParams();
  const qc = useQueryClient();
  const [me, setMe] = useState<string>("");
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe((data.user?.email ?? "").toLowerCase()));
  }, []);

  const getFn = useServerFn(getStrategicThesis);
  const proposeFn = useServerFn(proposeStrategicThesis);
  const approveFn = useServerFn(approveStrategicThesis);
  const rejectFn = useServerFn(rejectStrategicThesis);
  const aiFn = useServerFn(aiDraftStrategicThesis);

  const stateQuery = useQuery({
    queryKey: ["strategic-thesis", projectId],
    queryFn: () => getFn({ data: { projectId } }),
    staleTime: 15_000,
  });

  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [initialized, setInitialized] = useState(false);
  useEffect(() => {
    if (!initialized && stateQuery.data) {
      setDraft(fromState(stateQuery.data));
      setInitialized(true);
    }
  }, [initialized, stateQuery.data]);

  const state = stateQuery.data;
  const current = state?.current ?? null;
  const isProposer = !!current && me && current.proposed_by_email.toLowerCase() === me;
  const canApprove = current?.status === "proposed" && !isProposer;

  const proposeMut = useMutation({
    mutationFn: (submit: boolean) =>
      proposeFn({ data: { projectId, ...draft, submit_for_review: submit } }),
    onSuccess: (next) => {
      qc.setQueryData(["strategic-thesis", projectId], next);
      qc.invalidateQueries({ queryKey: ["engine", "spine-readiness", projectId] });
    },
  });
  const approveMut = useMutation({
    mutationFn: (reason: string | undefined) =>
      approveFn({ data: { projectId, version: current!.version, reason } }),
    onSuccess: (next) => {
      qc.setQueryData(["strategic-thesis", projectId], next);
      qc.invalidateQueries({ queryKey: ["engine", "spine-readiness", projectId] });
    },
  });
  const rejectMut = useMutation({
    mutationFn: (reason: string) =>
      rejectFn({ data: { projectId, version: current!.version, reason } }),
    onSuccess: (next) => qc.setQueryData(["strategic-thesis", projectId], next),
  });
  const aiMut = useMutation({
    mutationFn: () => aiFn({ data: { projectId } }),
    onSuccess: (next) => {
      qc.setQueryData(["strategic-thesis", projectId], next);
      setDraft(fromState(next));
    },
  });

  const err = proposeMut.error ?? approveMut.error ?? rejectMut.error ?? aiMut.error;

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-6 space-y-5">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#667085]">
            Doctrine gate · RT-4
          </div>
          <h1 className="font-display text-2xl text-ink leading-tight flex items-center gap-2">
            <Target className="w-5 h-5 text-[#3E68B2]" />
            Strategic Thesis
          </h1>
          <p className="text-sm text-ink/70 max-w-2xl mt-1">
            The testable bet that turns the approved World Entry and Execution Boundary into
            direction. Requires two-reviewer approval before milestones can be qualified.
          </p>
        </div>
        <StatusPill current={current} />
      </header>

      {err ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 text-rose-800 text-sm px-3 py-2">
          {(err as Error).message}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <section className="space-y-4">
          <Card title="The bet">
            <textarea
              className="w-full min-h-[80px] rounded border border-[#E8E1D6] p-2 text-sm"
              placeholder="One-sentence bet: what we believe and will act on."
              value={draft.bet_statement}
              onChange={(e) => setDraft((d) => ({ ...d, bet_statement: e.target.value }))}
            />
          </Card>
          <div className="grid gap-4 md:grid-cols-2">
            <Card title="Why now">
              <textarea
                className="w-full min-h-[100px] rounded border border-[#E8E1D6] p-2 text-sm"
                placeholder="Timing rationale — why this bet works today."
                value={draft.why_now}
                onChange={(e) => setDraft((d) => ({ ...d, why_now: e.target.value }))}
              />
            </Card>
            <Card title="Wedge">
              <textarea
                className="w-full min-h-[100px] rounded border border-[#E8E1D6] p-2 text-sm"
                placeholder="The specific entry wedge tied to the destination."
                value={draft.wedge}
                onChange={(e) => setDraft((d) => ({ ...d, wedge: e.target.value }))}
              />
            </Card>
          </div>

          <ProofMetricsEditor
            items={draft.proof_metrics}
            onChange={(items) => setDraft((d) => ({ ...d, proof_metrics: items }))}
          />
          <ListEditor
            title="Kill criteria"
            hint="What would prove this bet wrong — the falsifiers."
            items={draft.kill_criteria.map((k) => k.statement)}
            onChange={(items) =>
              setDraft((d) => ({
                ...d,
                kill_criteria: items.map((s, i) => ({
                  id: d.kill_criteria[i]?.id ?? shortId("kc"),
                  statement: s,
                })),
              }))
            }
          />
          <AssumptionsEditor
            items={draft.assumptions}
            onChange={(items) => setDraft((d) => ({ ...d, assumptions: items }))}
          />
          <Card title="Notes">
            <textarea
              className="w-full min-h-[80px] rounded border border-[#E8E1D6] p-2 text-sm"
              placeholder="Context, caveats, links reviewers should see."
              value={draft.notes}
              onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
            />
          </Card>
        </section>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-[#E8E1D6] bg-white p-4 shadow-sm space-y-3">
            <div className="font-display text-base text-ink">Actions</div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded border border-[#E8E1D6] px-3 py-1.5 text-sm hover:bg-[#eef3fd]"
                onClick={() => aiMut.mutate()}
                disabled={aiMut.isPending}
              >
                {aiMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                AI draft
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded border border-[#E8E1D6] px-3 py-1.5 text-sm hover:bg-[#eef3fd]"
                onClick={() => proposeMut.mutate(false)}
                disabled={proposeMut.isPending}
              >
                Save draft
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded bg-[#3E68B2] px-3 py-1.5 text-sm text-white hover:bg-[#31538f]"
                onClick={() => proposeMut.mutate(true)}
                disabled={proposeMut.isPending}
              >
                Propose for approval
              </button>
            </div>
            {current?.status === "proposed" ? (
              <div className="border-t border-[#E8E1D6] pt-3 space-y-2">
                <div className="text-xs text-ink/70">
                  Proposed by <span className="font-mono">{current.proposed_by_email}</span>
                  {current.proposed_by_actor === "ai" ? " (AI-drafted)" : ""}
                </div>
                {isProposer ? (
                  <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                    You proposed this version. A different admin or operator must approve.
                  </div>
                ) : null}
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded bg-emerald-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                    disabled={!canApprove || approveMut.isPending}
                    onClick={() => approveMut.mutate(undefined)}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded border border-rose-200 text-rose-700 px-3 py-1.5 text-sm hover:bg-rose-50"
                    disabled={rejectMut.isPending}
                    onClick={() => {
                      const reason = window.prompt("Reason for rejection?");
                      if (reason && reason.trim()) rejectMut.mutate(reason.trim());
                    }}
                  >
                    Reject
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          {current ? <LinkedVersions v={current} /> : null}
          <VersionHistory state={state} />
        </aside>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[#E8E1D6] bg-white p-4 shadow-sm">
      <div className="font-display text-base text-ink mb-2">{title}</div>
      {children}
    </div>
  );
}

function StatusPill({ current }: { current: StrategicThesisVersion | null }) {
  if (!current) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E8E1D6] px-3 py-1 text-xs font-mono uppercase tracking-widest text-ink/60">
        No thesis yet
      </span>
    );
  }
  const map: Record<StrategicThesisVersion["status"], { icon: typeof CheckCircle2; cls: string; label: string }> = {
    draft: { icon: Clock, cls: "border-[#E8E1D6] text-ink/70", label: "Draft" },
    proposed: { icon: Clock, cls: "border-amber-200 bg-amber-50 text-amber-800", label: "Proposed" },
    approved: { icon: CheckCircle2, cls: "border-emerald-200 bg-emerald-50 text-emerald-800", label: "Approved" },
    superseded: { icon: Clock, cls: "border-[#E8E1D6] text-ink/50", label: "Superseded" },
  };
  const { icon: Icon, cls, label } = map[current.status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-mono uppercase tracking-widest ${cls}`}>
      <Icon className="w-3.5 h-3.5" />
      v{current.version} · {label}
    </span>
  );
}

function LinkedVersions({ v }: { v: StrategicThesisVersion }) {
  return (
    <div className="rounded-2xl border border-[#E8E1D6] bg-white p-4 shadow-sm text-xs">
      <div className="font-display text-base text-ink mb-2">Linked artifacts</div>
      <ul className="space-y-1 text-ink/70">
        <li>World Entry: v{v.linked_world_entry_version ?? "—"}</li>
        <li>Execution Boundary: v{v.linked_execution_boundary_version ?? "—"}</li>
      </ul>
    </div>
  );
}

function ProofMetricsEditor({
  items,
  onChange,
}: {
  items: ProofMetric[];
  onChange: (next: ProofMetric[]) => void;
}) {
  const [row, setRow] = useState({ metric: "", target: "", horizon: "" });
  return (
    <div className="rounded-2xl border border-[#E8E1D6] bg-white p-4 shadow-sm">
      <div className="font-display text-base text-ink mb-1">Proof metrics</div>
      <div className="text-xs text-ink/60 mb-3">How we'll know it's working.</div>
      <ul className="space-y-1.5 mb-2">
        {items.length === 0 ? (
          <li className="text-xs text-ink/40">No metrics yet.</li>
        ) : (
          items.map((it) => (
            <li key={it.id} className="flex items-baseline gap-2 text-sm border-t border-[#E8E1D6] pt-1.5 first:border-t-0 first:pt-0">
              <span className="flex-1"><span className="font-medium">{it.metric}</span> → <span className="text-ink/70">{it.target}</span> <span className="text-[11px] text-ink/50">@ {it.horizon}</span></span>
              <button type="button" aria-label="Remove" onClick={() => onChange(items.filter((x) => x.id !== it.id))} className="text-ink/50 hover:text-ink">
                <X className="w-3 h-3" />
              </button>
            </li>
          ))
        )}
      </ul>
      <div className="grid grid-cols-3 gap-2">
        <input className="rounded border border-[#E8E1D6] px-2 py-1 text-sm" placeholder="Metric" value={row.metric} onChange={(e) => setRow((r) => ({ ...r, metric: e.target.value }))} />
        <input className="rounded border border-[#E8E1D6] px-2 py-1 text-sm" placeholder="Target" value={row.target} onChange={(e) => setRow((r) => ({ ...r, target: e.target.value }))} />
        <input className="rounded border border-[#E8E1D6] px-2 py-1 text-sm" placeholder="Horizon" value={row.horizon} onChange={(e) => setRow((r) => ({ ...r, horizon: e.target.value }))} />
      </div>
      <button
        type="button"
        onClick={() => {
          if (!row.metric.trim() || !row.target.trim() || !row.horizon.trim()) return;
          onChange([...items, { id: shortId("pm"), metric: row.metric.trim(), target: row.target.trim(), horizon: row.horizon.trim() }]);
          setRow({ metric: "", target: "", horizon: "" });
        }}
        className="mt-2 inline-flex items-center gap-1 rounded border border-[#E8E1D6] px-3 py-1 text-sm hover:bg-[#eef3fd]"
      >
        <Plus className="w-3.5 h-3.5" /> Add metric
      </button>
    </div>
  );
}

function AssumptionsEditor({
  items,
  onChange,
}: {
  items: ThesisAssumption[];
  onChange: (next: ThesisAssumption[]) => void;
}) {
  const [row, setRow] = useState<{ statement: string; confidence: "low" | "medium" | "high" }>({ statement: "", confidence: "medium" });
  return (
    <div className="rounded-2xl border border-[#E8E1D6] bg-white p-4 shadow-sm">
      <div className="font-display text-base text-ink mb-1">Assumptions</div>
      <div className="text-xs text-ink/60 mb-3">What must be true for the bet to hold.</div>
      <ul className="space-y-1.5 mb-2">
        {items.length === 0 ? (
          <li className="text-xs text-ink/40">No assumptions yet.</li>
        ) : (
          items.map((it) => (
            <li key={it.id} className="flex items-baseline gap-2 text-sm border-t border-[#E8E1D6] pt-1.5 first:border-t-0 first:pt-0">
              <span className={`text-[10px] font-mono uppercase rounded px-1.5 py-0.5 ${it.confidence === "high" ? "bg-emerald-50 text-emerald-800" : it.confidence === "low" ? "bg-rose-50 text-rose-800" : "bg-amber-50 text-amber-800"}`}>{it.confidence}</span>
              <span className="flex-1">{it.statement}</span>
              <button type="button" aria-label="Remove" onClick={() => onChange(items.filter((x) => x.id !== it.id))} className="text-ink/50 hover:text-ink">
                <X className="w-3 h-3" />
              </button>
            </li>
          ))
        )}
      </ul>
      <div className="flex gap-2">
        <input className="flex-1 rounded border border-[#E8E1D6] px-2 py-1 text-sm" placeholder="Assumption" value={row.statement} onChange={(e) => setRow((r) => ({ ...r, statement: e.target.value }))} />
        <select className="rounded border border-[#E8E1D6] px-2 py-1 text-sm" value={row.confidence} onChange={(e) => setRow((r) => ({ ...r, confidence: e.target.value as "low" | "medium" | "high" }))}>
          <option value="low">low</option>
          <option value="medium">medium</option>
          <option value="high">high</option>
        </select>
        <button
          type="button"
          onClick={() => {
            if (!row.statement.trim()) return;
            onChange([...items, { id: shortId("as"), statement: row.statement.trim(), confidence: row.confidence }]);
            setRow({ statement: "", confidence: "medium" });
          }}
          className="inline-flex items-center gap-1 rounded border border-[#E8E1D6] px-3 py-1 text-sm hover:bg-[#eef3fd]"
        >
          <Plus className="w-3.5 h-3.5" /> Add
        </button>
      </div>
    </div>
  );
}

function ListEditor({
  title,
  hint,
  items,
  onChange,
}: {
  title: string;
  hint: string;
  items: string[];
  onChange: (next: string[]) => void;
}) {
  const [entry, setEntry] = useState("");
  return (
    <div className="rounded-2xl border border-[#E8E1D6] bg-white p-4 shadow-sm">
      <div className="font-display text-base text-ink mb-1">{title}</div>
      <div className="text-xs text-ink/60 mb-3">{hint}</div>
      <ul className="space-y-1.5 mb-2">
        {items.length === 0 ? (
          <li className="text-xs text-ink/40">Nothing added.</li>
        ) : (
          items.map((it, i) => (
            <li key={`${i}-${it}`} className="flex items-baseline gap-2 text-sm border-t border-[#E8E1D6] pt-1.5 first:border-t-0 first:pt-0">
              <span className="flex-1">{it}</span>
              <button type="button" aria-label="Remove" onClick={() => onChange(items.filter((_, idx) => idx !== i))} className="text-ink/50 hover:text-ink">
                <X className="w-3 h-3" />
              </button>
            </li>
          ))
        )}
      </ul>
      <div className="flex gap-2">
        <input
          className="flex-1 rounded border border-[#E8E1D6] px-2 py-1 text-sm"
          value={entry}
          onChange={(e) => setEntry(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              const t = entry.trim();
              if (!t) return;
              onChange([...items, t]);
              setEntry("");
            }
          }}
          placeholder="Add and press Enter"
        />
        <button
          type="button"
          onClick={() => {
            const t = entry.trim();
            if (!t) return;
            onChange([...items, t]);
            setEntry("");
          }}
          className="inline-flex items-center gap-1 rounded border border-[#E8E1D6] px-3 py-1 text-sm hover:bg-[#eef3fd]"
        >
          <Plus className="w-3.5 h-3.5" /> Add
        </button>
      </div>
    </div>
  );
}

function VersionHistory({ state }: { state: StrategicThesisState | undefined }) {
  const versions = useMemo(() => {
    const all: StrategicThesisVersion[] = [];
    if (state?.current) all.push(state.current);
    for (const h of state?.history ?? []) all.push(h);
    return all.sort((a, b) => b.version - a.version);
  }, [state]);
  return (
    <div className="rounded-2xl border border-[#E8E1D6] bg-white p-4 shadow-sm">
      <div className="font-display text-base text-ink mb-2">Version history</div>
      {versions.length === 0 ? (
        <div className="text-xs text-ink/50">No versions yet.</div>
      ) : (
        <ul className="space-y-2">
          {versions.map((v) => (
            <li key={v.version} className="border-t border-[#E8E1D6] pt-2 first:border-t-0 first:pt-0">
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="font-mono text-ink">v{v.version}</span>
                <span className="uppercase tracking-widest text-ink/50">{v.status}</span>
              </div>
              <div className="text-[11px] text-ink/60">
                {v.proposed_by_actor === "ai" ? "AI-drafted" : "Human-drafted"} by{" "}
                <span className="font-mono">{v.proposed_by_email}</span>
                {v.approved_by_email ? (
                  <> · approved by <span className="font-mono">{v.approved_by_email}</span></>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
