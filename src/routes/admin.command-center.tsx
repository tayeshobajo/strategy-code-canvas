import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  getCommandCenterExceptions,
  resolveEngineException,
  triggerEngineTick,
  type CommandCenterException,
  type EngineTickResult,
} from "@/lib/engine-command-center.functions";
import { AlertOctagon, AlertTriangle, Info, Zap, Loader2, CheckCircle2, Clock, PlayCircle } from "lucide-react";

export const Route = createFileRoute("/admin/command-center")({
  head: () => ({
    meta: [
      { title: "Command Center — Admin" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CommandCenterPage,
});

const SEVERITY = {
  critical: { icon: AlertOctagon, cls: "text-rose-300 bg-rose-500/10 border-rose-500/30" },
  high:     { icon: AlertTriangle, cls: "text-amber-300 bg-amber-500/10 border-amber-500/30" },
  medium:   { icon: Zap, cls: "text-sky-300 bg-sky-500/10 border-sky-500/30" },
  low:      { icon: Info, cls: "text-white/60 bg-white/5 border-white/10" },
} as const;

function fmtDate(d: string | null) {
  if (!d) return "—";
  try { return new Date(d).toLocaleString(); } catch { return d; }
}

function CommandCenterPage() {
  const fetchFeed = useServerFn(getCommandCenterExceptions);
  const resolveFn = useServerFn(resolveEngineException);
  const tickFn = useServerFn(triggerEngineTick);
  const qc = useQueryClient();
  const [note, setNote] = useState<Record<string, string>>({});
  const [lastTick, setLastTick] = useState<EngineTickResult | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin", "command-center"],
    queryFn: () => fetchFeed({ data: { limit: 100 } }),
    refetchInterval: 30_000,
  });

  const resolveMut = useMutation({
    mutationFn: (v: { id: string; note?: string }) =>
      resolveFn({ data: { exceptionId: v.id, resolutionNote: v.note } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "command-center"] }),
  });

  const exceptions = (data?.exceptions ?? []) as CommandCenterException[];

  return (
    <div className="px-6 py-8 max-w-6xl">
      <header className="mb-6">
        <div className="text-xs uppercase tracking-widest text-amber-400">Admin</div>
        <h1 className="text-2xl font-semibold text-white mt-1">Command Center</h1>
        <p className="text-white/60 text-sm mt-1">
          Live exception feed across every business engine. Only open items requiring a decision or action.
        </p>
      </header>

      {isLoading && (
        <div className="text-white/60 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading feed…</div>
      )}
      {isError && (
        <div className="text-rose-300 text-sm">Failed to load: {(error as Error)?.message ?? "unknown"}</div>
      )}

      {!isLoading && !isError && exceptions.length === 0 && (
        <div className="border border-white/10 bg-white/5 rounded-lg p-8 text-center">
          <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
          <div className="text-white font-medium">No open exceptions</div>
          <div className="text-white/60 text-sm mt-1">All engines nominal. Silence is signal.</div>
        </div>
      )}

      <div className="space-y-3">
        {exceptions.map((e) => {
          const sev = SEVERITY[e.severity] ?? SEVERITY.low;
          const Icon = sev.icon;
          return (
            <div key={e.id} className={`border rounded-lg p-4 ${sev.cls}`}>
              <div className="flex items-start gap-3">
                <Icon className="w-5 h-5 mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] uppercase tracking-widest px-1.5 py-0.5 rounded bg-black/30 border border-white/10">
                      {e.severity}
                    </span>
                    {e.client_risk && (
                      <span className="text-[10px] uppercase tracking-widest px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-200 border border-rose-500/30">
                        Client risk
                      </span>
                    )}
                    <span className="text-[10px] text-white/50">{e.kind}</span>
                    <span className="text-[10px] text-white/40 ml-auto">
                      Urgency {e.urgency_score} · Impact {e.impact_score}
                    </span>
                  </div>
                  <div className="text-white font-medium mt-2">{e.summary}</div>
                  <div className="text-white/60 text-xs mt-1">
                    {e.project_name ?? e.project_id.slice(0, 8)} · {e.engine_name ?? "—"}
                    {e.deadline_at && (
                      <span className="ml-3 inline-flex items-center gap-1">
                        <Clock className="w-3 h-3" /> due {fmtDate(e.deadline_at)}
                      </span>
                    )}
                    <span className="ml-3">opened {fmtDate(e.created_at)}</span>
                  </div>
                  {e.next_action && (
                    <div className="mt-2 text-sm text-white/80">
                      <span className="text-white/50 text-xs">Next action:</span> {e.next_action}
                      {e.next_action_owner && <span className="text-white/50"> ({e.next_action_owner})</span>}
                    </div>
                  )}
                  <div className="mt-3 flex items-center gap-2">
                    <input
                      className="flex-1 rounded border border-white/10 bg-black/30 text-white text-sm px-3 py-1.5"
                      placeholder="Resolution note (optional)"
                      value={note[e.id] ?? ""}
                      onChange={(ev) => setNote((n) => ({ ...n, [e.id]: ev.target.value }))}
                    />
                    <button
                      type="button"
                      className="rounded bg-emerald-500/20 border border-emerald-500/30 text-emerald-200 text-sm px-3 py-1.5 hover:bg-emerald-500/30 disabled:opacity-50"
                      disabled={resolveMut.isPending}
                      onClick={() => resolveMut.mutate({ id: e.id, note: note[e.id] })}
                    >
                      Resolve
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
