import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getEngineRunDetail } from "@/lib/engine-command-center.functions";
import { ArrowLeft, Loader2 } from "lucide-react";

export const Route = createFileRoute("/engine/projects/$projectId/engines/runs/$runId")({
  head: () => ({
    meta: [
      { title: "Engine run detail" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RunDetailPage,
});

function fmt(d: string | null) {
  if (!d) return "—";
  try { return new Date(d).toLocaleString(); } catch { return d; }
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-white/40">{label}</div>
      <div className={`text-white/90 ${mono ? "font-mono text-xs" : ""}`}>{value}</div>
    </div>
  );
}

function Section({ title, json }: { title: string; json: unknown }) {
  const s = JSON.stringify(json ?? {}, null, 2);
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-white/40 mb-1">{title}</div>
      <pre className="text-[11px] text-white/80 bg-black/50 border border-white/10 rounded p-3 overflow-x-auto max-h-96">{s}</pre>
    </div>
  );
}

function RunDetailPage() {
  const { projectId, runId } = Route.useParams();
  const getRun = useServerFn(getEngineRunDetail);
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["engine-run-detail", runId],
    queryFn: () => getRun({ data: { runId } }),
  });
  const r = data?.run;

  return (
    <div className="space-y-4">
      <div>
        <Link
          to="/engine/projects/$projectId/engines"
          params={{ projectId }}
          className="inline-flex items-center gap-1 text-xs text-white/60 hover:text-white"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to engines
        </Link>
      </div>

      <header>
        <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal">Engine run</div>
        <h2 className="font-display text-3xl text-ink mt-1 font-mono">{runId.slice(0, 12)}…</h2>
      </header>

      {isLoading && (
        <div className="text-white/60 text-sm flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      )}
      {isError && <div className="text-rose-300 text-sm">{(error as Error)?.message}</div>}

      {r && (
        <div className="space-y-4 text-sm border border-white/10 bg-black/20 rounded-lg p-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Field label="Status" value={r.status} />
            <Field label="Cycle key" value={r.cycle_key} mono />
            <Field label="Engine" value={r.engine_id} mono />
            <Field label="Scheduled" value={fmt(r.scheduled_for)} />
            <Field label="Started" value={fmt(r.started_at)} />
            <Field label="Completed" value={fmt(r.completed_at)} />
            <Field label="Actor" value={r.actor_email ?? "—"} />
            <Field label="Model" value={r.model ?? "—"} />
            <Field label="Cost" value={r.cost_cents != null ? `${r.cost_cents}¢` : "—"} />
            <Field label="Latency" value={r.latency_ms != null ? `${r.latency_ms}ms` : "—"} />
            <Field label="Tokens" value={`${r.tokens_input ?? 0} in / ${r.tokens_output ?? 0} out`} />
            <Field label="Created" value={fmt(r.created_at)} />
          </div>
          {r.error && (
            <div className="border border-rose-500/30 bg-rose-500/10 text-rose-200 text-sm p-3 rounded">
              {r.error}
            </div>
          )}
          <Section title="Inputs" json={r.inputs} />
          <Section title="Outputs" json={r.outputs} />
          <Section title="Decisions" json={r.decisions} />
          {(r.evidence_ids.length + r.proposal_ids.length + r.approval_ids.length) > 0 && (
            <div className="text-xs text-white/60">
              Evidence {r.evidence_ids.length} · Proposals {r.proposal_ids.length} · Approvals {r.approval_ids.length}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
