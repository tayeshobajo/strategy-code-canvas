import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Gavel,
  History,
  Loader2,
  Sparkles,
  Target,
  ThumbsDown,
  ThumbsUp,
  XCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  getMilestoneQualification,
  runMilestoneJudges,
  decideMilestoneQualification,
  listMilestoneQualificationTimeline,
  type MilestoneQualification,
  type JudgeVerdict,
  type WorldJudgeResult,
  type WowJudgeResult,
} from "@/lib/engine-milestone-qualification.functions";
import {
  getStrategicThesis,
  type StrategicThesisVersion,
} from "@/lib/engine-strategic-thesis.functions";

export const Route = createFileRoute("/engine/projects/$projectId/milestones/$milestoneId/qualify")({
  component: QualifyPage,
});

type MilestoneRow = {
  id: string;
  name: string;
  phase: string | null;
  brief_md: string | null;
  approved_by_email: string | null;
};

function QualifyPage() {
  const { projectId, milestoneId } = Route.useParams();
  const qc = useQueryClient();
  const [me, setMe] = useState<string>("");
  const [note, setNote] = useState("");
  const [milestone, setMilestone] = useState<MilestoneRow | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe((data.user?.email ?? "").toLowerCase()));
  }, []);
  useEffect(() => {
    let alive = true;
    supabase
      .from("engine_milestones")
      .select("id, name, phase, brief_md, approved_by_email")
      .eq("id", milestoneId)
      .eq("project_id", projectId)
      .maybeSingle()
      .then(({ data }) => {
        if (alive) setMilestone((data ?? null) as MilestoneRow | null);
      });
    return () => {
      alive = false;
    };
  }, [projectId, milestoneId]);

  const getFn = useServerFn(getMilestoneQualification);
  const runFn = useServerFn(runMilestoneJudges);
  const decideFn = useServerFn(decideMilestoneQualification);
  const timelineFn = useServerFn(listMilestoneQualificationTimeline);
  const thesisFn = useServerFn(getStrategicThesis);

  const q = useQuery({
    queryKey: ["milestone-qualification", projectId, milestoneId],
    queryFn: () => getFn({ data: { projectId, milestoneId } }),
    staleTime: 5_000,
  });
  const timelineQ = useQuery({
    queryKey: ["milestone-qualification-timeline", projectId, milestoneId],
    queryFn: () => timelineFn({ data: { projectId, milestoneId } }),
    staleTime: 5_000,
  });
  const thesisQ = useQuery({
    queryKey: ["strategic-thesis", projectId],
    queryFn: () => thesisFn({ data: { projectId } }),
    staleTime: 30_000,
  });

  const runMut = useMutation({
    mutationFn: () => runFn({ data: { projectId, milestoneId } }),
    onSuccess: (next) => {
      qc.setQueryData(["milestone-qualification", projectId, milestoneId], next);
      qc.invalidateQueries({ queryKey: ["milestone-qualification-timeline", projectId, milestoneId] });
    },
  });
  const decideMut = useMutation({
    mutationFn: (decision: "qualified" | "rejected") =>
      decideFn({ data: { projectId, milestoneId, decision, note: note.trim() } }),
    onSuccess: (next) => {
      qc.setQueryData(["milestone-qualification", projectId, milestoneId], next);
      qc.invalidateQueries({ queryKey: ["milestone-qualifications", projectId] });
      qc.invalidateQueries({ queryKey: ["milestone-qualification-timeline", projectId, milestoneId] });
      setNote("");
    },
  });

  const state = q.data;
  const run = state?.last_run;
  const isAuthor =
    !!milestone && !!me && (milestone.approved_by_email ?? "").toLowerCase() === me;
  const err = runMut.error ?? decideMut.error;

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6 space-y-5">
      <Link
        to="/engine/projects/$projectId/roadmap"
        params={{ projectId }}
        search={{ view: "journey" as const }}
        className="inline-flex items-center gap-1 text-xs text-ink/60 hover:text-ink"
      >
        <ArrowLeft className="w-3 h-3" /> Back to roadmap
      </Link>

      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#667085]">
            Qualification ceremony
          </div>
          <h1 className="font-display text-2xl text-ink leading-tight flex items-center gap-2">
            <Gavel className="w-5 h-5 text-[#3E68B2]" />
            {milestone?.name ?? "Milestone"}
          </h1>
          {milestone?.phase ? (
            <div className="text-xs text-ink/60 mt-1">Phase: {milestone.phase}</div>
          ) : null}
        </div>
        <QualificationStatusPill status={state?.status ?? "unqualified"} />
      </header>

      {err ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 text-rose-800 text-sm px-3 py-2">
          {(err as Error).message}
        </div>
      ) : null}

      {milestone?.brief_md ? (
        <div className="rounded-2xl border border-[#E8E1D6] bg-white p-4 shadow-sm text-sm text-ink/80 whitespace-pre-wrap">
          {milestone.brief_md.slice(0, 3000)}
        </div>
      ) : (
        <div className="rounded-md border border-amber-200 bg-amber-50 text-amber-800 text-sm px-3 py-2">
          This milestone has no brief. Add one before qualifying.
        </div>
      )}

      <StrategicThesisViewer projectId={projectId} thesis={thesisQ.data?.current ?? null} loading={thesisQ.isLoading} />

      <JudgeRubric />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded bg-[#3E68B2] px-3 py-1.5 text-sm text-white hover:bg-[#31538f] disabled:opacity-50"
          onClick={() => runMut.mutate()}
          disabled={runMut.isPending}
        >
          {runMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Gavel className="w-3.5 h-3.5" />}
          {run ? "Re-run judges" : "Run World + Wow judges"}
        </button>
        {run ? (
          <span className="text-xs text-ink/50">
            Last run {new Date(run.ran_at).toLocaleString()} · model {run.model}
          </span>
        ) : null}
      </div>

      {run ? (
        <>
          <RecommendationSummary run={run} status={state?.status ?? "unqualified"} />
          <div className="grid gap-4 md:grid-cols-2">
            <JudgeCard title="World Judge" verdict={run.world_judge.verdict}>
              <p className="text-sm text-ink/80 whitespace-pre-wrap">{run.world_judge.rationale}</p>
              {run.world_judge.cited_world_entry_sections.length > 0 ? (
                <div className="mt-2">
                  <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-ink/50 mb-1">Cited</div>
                  <div className="flex flex-wrap gap-1">
                    {run.world_judge.cited_world_entry_sections.map((c) => (
                      <span key={c} className="rounded bg-[#eef3fd] px-1.5 py-0.5 text-[11px] font-mono text-[#3E68B2]">
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </JudgeCard>
            <JudgeCard title={`Wow Judge · ${run.wow_judge.wow_score}/5`} verdict={run.wow_judge.verdict}>
              <p className="text-sm text-ink/80 whitespace-pre-wrap">{run.wow_judge.rationale}</p>
              {run.wow_judge.risks.length > 0 ? (
                <div className="mt-2">
                  <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-ink/50 mb-1">Risks</div>
                  <ul className="text-xs text-ink/70 list-disc pl-4 space-y-0.5">
                    {run.wow_judge.risks.map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                </div>
              ) : null}
            </JudgeCard>
          </div>
        </>
      ) : (
        <div className="rounded-md border border-[#E8E1D6] bg-white text-sm text-ink/60 px-3 py-4 text-center">
          Run the judges to see the World and Wow verdicts.
        </div>
      )}

      {run ? (
        <div className="rounded-2xl border border-[#E8E1D6] bg-white p-4 shadow-sm space-y-3">
          <div className="font-display text-base text-ink">Human decision</div>
          {isAuthor ? (
            <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
              You approved this milestone brief. A different admin or operator must qualify it.
            </div>
          ) : null}
          <textarea
            className="w-full min-h-[70px] rounded border border-[#E8E1D6] p-2 text-sm"
            placeholder="Note for the ceremony log (optional for qualified, required for rejected)."
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded bg-emerald-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
              disabled={isAuthor || decideMut.isPending}
              onClick={() => decideMut.mutate("qualified")}
            >
              <ThumbsUp className="w-3.5 h-3.5" /> Mark qualified
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded border border-rose-200 text-rose-700 px-3 py-1.5 text-sm hover:bg-rose-50 disabled:opacity-50"
              disabled={!note.trim() || decideMut.isPending}
              onClick={() => decideMut.mutate("rejected")}
            >
              <ThumbsDown className="w-3.5 h-3.5" /> Reject
            </button>
          </div>
          {state?.decided_by_email ? (
            <div className="text-[11px] text-ink/60">
              Last decision by <span className="font-mono">{state.decided_by_email}</span>
              {state.decided_at ? ` on ${new Date(state.decided_at).toLocaleString()}` : ""}
              {state.note ? ` — ${state.note}` : ""}
            </div>
          ) : null}
        </div>
      ) : null}

      <AuditTimeline entries={timelineQ.data ?? []} loading={timelineQ.isLoading} />
      <RunHistory state={state} />
    </div>
  );
}

// ---------- Strategic Thesis viewer ----------

function StrategicThesisViewer({
  projectId,
  thesis,
  loading,
}: {
  projectId: string;
  thesis: StrategicThesisVersion | null;
  loading: boolean;
}) {
  const [open, setOpen] = useState(true);
  return (
    <section className="rounded-2xl border border-[#E8E1D6] bg-white p-4 shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 text-left"
      >
        <div className="flex items-baseline gap-2">
          <Target className="w-4 h-4 text-[#3E68B2] self-center" />
          <span className="font-display text-base text-ink">Strategic Thesis</span>
          {thesis ? (
            <span className="text-[11px] font-mono uppercase tracking-widest text-ink/50">
              v{thesis.version} · {thesis.status}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/engine/projects/$projectId/strategic-thesis"
            params={{ projectId }}
            className="text-xs text-[#3E68B2] hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            Open thesis room
          </Link>
          {open ? <ChevronDown className="w-4 h-4 text-ink/50" /> : <ChevronRight className="w-4 h-4 text-ink/50" />}
        </div>
      </button>
      {open ? (
        <div className="mt-3 text-sm text-ink/80 space-y-3">
          {loading ? (
            <div className="text-xs text-ink/50 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Loading thesis…</div>
          ) : !thesis ? (
            <div className="text-xs text-ink/50">
              No thesis on file. Judges cannot run until the thesis is drafted and approved.
            </div>
          ) : (
            <>
              <ThesisField label="Bet" value={thesis.bet_statement} />
              <div className="grid gap-3 md:grid-cols-2">
                <ThesisField label="Why now" value={thesis.why_now} />
                <ThesisField label="Wedge" value={thesis.wedge} />
              </div>
              {thesis.proof_metrics.length > 0 ? (
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-ink/50 mb-1">Proof metrics</div>
                  <ul className="text-xs text-ink/80 space-y-1">
                    {thesis.proof_metrics.map((m) => (
                      <li key={m.id}>
                        <span className="font-medium">{m.metric}</span> → {m.target} <span className="text-[11px] text-ink/50">@ {m.horizon}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {thesis.kill_criteria.length > 0 ? (
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-ink/50 mb-1">Kill criteria</div>
                  <ul className="text-xs text-ink/80 list-disc pl-4 space-y-0.5">
                    {thesis.kill_criteria.map((k) => <li key={k.id}>{k.statement}</li>)}
                  </ul>
                </div>
              ) : null}
              {thesis.status !== "approved" ? (
                <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                  Thesis is {thesis.status}. Judges require an approved thesis to run.
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}

function ThesisField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-ink/50 mb-1">{label}</div>
      <div className="text-sm text-ink/80 whitespace-pre-wrap">{value || <span className="text-ink/40">—</span>}</div>
    </div>
  );
}

// ---------- Rubric ----------

function JudgeRubric() {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-2xl border border-[#E8E1D6] bg-white p-4 shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 text-left"
      >
        <div className="flex items-baseline gap-2">
          <BookOpen className="w-4 h-4 text-[#3E68B2] self-center" />
          <span className="font-display text-base text-ink">Judge rubric</span>
          <span className="text-[11px] text-ink/50">How the LLM judges score this milestone</span>
        </div>
        {open ? <ChevronDown className="w-4 h-4 text-ink/50" /> : <ChevronRight className="w-4 h-4 text-ink/50" />}
      </button>
      {open ? (
        <div className="mt-3 grid gap-4 md:grid-cols-2 text-sm">
          <RubricCard title="World Judge" caption="Fit for the approved world">
            <RubricRow verdict="passes" text="Advances the approved destination and uses correct vocabulary." />
            <RubricRow verdict="unclear" text="Direction is plausible but citations to World Entry are weak or missing." />
            <RubricRow verdict="fails" text="Copies competitor positioning, ignores vocabulary, or drifts from destination." />
          </RubricCard>
          <RubricCard title="Wow Judge" caption="Fit for boundary + proof metrics, scored 1–5">
            <RubricRow verdict="passes" text="Moves at least one thesis proof metric; stays inside the boundary; a client would call it real." />
            <RubricRow verdict="unclear" text="Proof metric impact is ambiguous or partial; may need scoping." />
            <RubricRow verdict="fails" text="Violates the execution boundary or has no material proof-metric impact." />
            <div className="text-[11px] text-ink/60 pt-2 border-t border-[#E8E1D6]">
              Score 1 (marginal) → 5 (definitively wow). Ceremony requires human sign-off regardless of score.
            </div>
          </RubricCard>
        </div>
      ) : null}
    </section>
  );
}

function RubricCard({ title, caption, children }: { title: string; caption: string; children: React.ReactNode }) {
  return (
    <div className="rounded border border-[#E8E1D6] p-3 space-y-2">
      <div>
        <div className="font-display text-sm text-ink">{title}</div>
        <div className="text-[11px] text-ink/60">{caption}</div>
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function RubricRow({ verdict, text }: { verdict: JudgeVerdict; text: string }) {
  return (
    <div className="flex items-start gap-2 text-xs text-ink/80">
      <VerdictBadge verdict={verdict} />
      <span className="flex-1">{text}</span>
    </div>
  );
}

// ---------- Recommendation ----------

function RecommendationSummary({
  run,
  status,
}: {
  run: NonNullable<MilestoneQualification["last_run"]>;
  status: MilestoneQualification["status"];
}) {
  const rec = useMemo(() => recommend(run.world_judge.verdict, run.wow_judge.verdict, run.wow_judge.wow_score), [run]);
  const tone =
    rec.tier === "qualify"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : rec.tier === "hold"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : "border-rose-200 bg-rose-50 text-rose-900";
  const Icon = rec.tier === "qualify" ? Sparkles : rec.tier === "hold" ? ClipboardList : XCircle;
  return (
    <section className={`rounded-2xl border p-4 shadow-sm ${tone}`}>
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <Icon className="w-4 h-4 self-center" />
          <span className="font-display text-base">Recommendation: {rec.label}</span>
        </div>
        <span className="text-[11px] font-mono uppercase tracking-widest opacity-80">
          Current status: {status}
        </span>
      </div>
      <p className="text-sm mt-2">{rec.reason}</p>
      {rec.actions.length > 0 ? (
        <ul className="text-xs mt-2 list-disc pl-4 space-y-0.5 opacity-90">
          {rec.actions.map((a) => <li key={a}>{a}</li>)}
        </ul>
      ) : null}
    </section>
  );
}

function recommend(
  world: JudgeVerdict,
  wow: JudgeVerdict,
  wowScore: number,
): { tier: "qualify" | "hold" | "reject"; label: string; reason: string; actions: string[] } {
  if (world === "fails" || wow === "fails") {
    return {
      tier: "reject",
      label: "Reject and rework",
      reason:
        "At least one judge failed. The milestone as briefed cannot pass the ceremony without rework.",
      actions: [
        world === "fails" ? "Re-anchor the brief to the approved World Entry (destination, vocabulary)." : "",
        wow === "fails" ? "Restore alignment with the Execution Boundary or a thesis proof metric." : "",
        "Log the rejection reason so downstream synthesis learns from this fail.",
      ].filter(Boolean),
    };
  }
  if (world === "passes" && wow === "passes" && wowScore >= 4) {
    return {
      tier: "qualify",
      label: "Qualify",
      reason: `Both judges pass and the Wow score is ${wowScore}/5. Meets the ceremony bar.`,
      actions: ["Confirm with a second reviewer and mark qualified."],
    };
  }
  return {
    tier: "hold",
    label: "Hold for review",
    reason: `Verdicts are World=${world}, Wow=${wow} (${wowScore}/5). Judges did not converge on pass; human judgment required.`,
    actions: [
      world === "unclear" ? "Tighten World Entry citations in the brief." : "",
      wow === "unclear" ? "Sharpen the proof-metric impact statement." : "",
      "Discuss with the second reviewer before deciding.",
    ].filter(Boolean),
  };
}

// ---------- Timeline ----------

type TimelineEntry = {
  id: string;
  at: string;
  actor: string | null;
  kind: string;
  title: string;
  body: string | null;
  severity: string | null;
};

function AuditTimeline({ entries, loading }: { entries: TimelineEntry[]; loading: boolean }) {
  return (
    <section className="rounded-2xl border border-[#E8E1D6] bg-white p-4 shadow-sm">
      <div className="flex items-baseline gap-2 mb-2">
        <History className="w-4 h-4 text-[#3E68B2] self-center" />
        <span className="font-display text-base text-ink">Audit timeline</span>
        <span className="text-[11px] text-ink/50">Every ceremony action, by time and actor</span>
      </div>
      {loading ? (
        <div className="text-xs text-ink/50 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Loading…</div>
      ) : entries.length === 0 ? (
        <div className="text-xs text-ink/50">No ceremony activity yet.</div>
      ) : (
        <ol className="space-y-2">
          {entries.map((e) => (
            <li key={e.id} className="border-l-2 border-[#E8E1D6] pl-3">
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="font-mono text-ink">{new Date(e.at).toLocaleString()}</span>
                <span className="text-ink/50">{e.actor ?? "system"}</span>
              </div>
              <div className="text-sm text-ink flex items-baseline gap-2">
                <KindDot kind={e.kind} />
                <span>{e.title}</span>
              </div>
              {e.body ? (
                <div className="text-[11px] text-ink/60 mt-0.5 whitespace-pre-wrap">
                  {stripMarker(e.body)}
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function KindDot({ kind }: { kind: string }) {
  const cls = kind.endsWith(".qualified")
    ? "bg-emerald-500"
    : kind.endsWith(".rejected")
      ? "bg-rose-500"
      : "bg-[#3E68B2]";
  return <span className={`inline-block w-2 h-2 rounded-full ${cls}`} aria-hidden />;
}

function stripMarker(body: string): string {
  return body.replace(/\[milestone:[^\]]+\]\s*—?\s*/g, "").trim();
}

// ---------- Shared ----------

function QualificationStatusPill({ status }: { status: MilestoneQualification["status"] }) {
  const map = {
    unqualified: { cls: "border-[#E8E1D6] text-ink/70", label: "Not qualified" },
    qualified: { cls: "border-emerald-200 bg-emerald-50 text-emerald-800", label: "Qualified" },
    rejected: { cls: "border-rose-200 bg-rose-50 text-rose-800", label: "Rejected" },
  } as const;
  const { cls, label } = map[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-mono uppercase tracking-widest ${cls}`}>
      {label}
    </span>
  );
}

function VerdictBadge({ verdict }: { verdict: JudgeVerdict }) {
  const map = {
    passes: { cls: "bg-emerald-50 text-emerald-800 border-emerald-200", icon: CheckCircle2, label: "Passes" },
    fails: { cls: "bg-rose-50 text-rose-800 border-rose-200", icon: XCircle, label: "Fails" },
    unclear: { cls: "bg-amber-50 text-amber-800 border-amber-200", icon: Gavel, label: "Unclear" },
  } as const;
  const { cls, icon: Icon, label } = map[verdict];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-mono uppercase tracking-widest ${cls}`}>
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}

function JudgeCard({ title, verdict, children }: { title: string; verdict: JudgeVerdict; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[#E8E1D6] bg-white p-4 shadow-sm">
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <div className="font-display text-base text-ink">{title}</div>
        <VerdictBadge verdict={verdict} />
      </div>
      {children}
    </div>
  );
}

function RunHistory({ state }: { state: MilestoneQualification | undefined }) {
  if (!state || state.history.length <= 1) return null;
  return (
    <div className="rounded-2xl border border-[#E8E1D6] bg-white p-4 shadow-sm">
      <div className="font-display text-base text-ink mb-2">Judge run history</div>
      <ul className="space-y-2">
        {state.history.slice(0, 10).map((r) => (
          <li key={r.id} className="border-t border-[#E8E1D6] pt-2 first:border-t-0 first:pt-0 text-xs">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-mono">{new Date(r.ran_at).toLocaleString()}</span>
              <span className="text-ink/50">by {r.ran_by_email}</span>
            </div>
            <div className="flex flex-wrap gap-2 mt-1">
              <span>World: <VerdictInline v={r.world_judge} /></span>
              <span>Wow: <VerdictInline v={r.wow_judge} /> · {r.wow_judge.wow_score}/5</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function VerdictInline({ v }: { v: WorldJudgeResult | WowJudgeResult }) {
  return <span className="font-mono uppercase text-[10px]">{v.verdict}</span>;
}
