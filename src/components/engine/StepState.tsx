import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, CircleDashed, Eye, Loader2 } from "lucide-react";
import { setStepState, listStepEvidence, type StepEvidence } from "@/lib/engine.functions";
import { STEP_EVIDENCE_CATEGORIES, type StepState as StepStateT, type WorkspaceStepKey } from "@/lib/engine-workspace";
import { cn } from "@/lib/utils";

const LABEL: Record<StepStateT["state"], string> = {
  draft: "Draft",
  review: "In review",
  approved: "Approved",
};

const TONE: Record<StepStateT["state"], string> = {
  draft: "bg-white text-ink border-border",
  review: "bg-amber-50 text-amber-800 border-amber-300",
  approved: "bg-emerald-50 text-emerald-800 border-emerald-300",
};

export function StepStateBar({
  projectId,
  step,
  current,
}: {
  projectId: string;
  step: Exclude<WorkspaceStepKey, "intelligence">;
  current: StepStateT | undefined;
}) {
  const qc = useQueryClient();
  const fn = useServerFn(setStepState);
  const m = useMutation({
    mutationFn: (state: StepStateT["state"]) => fn({ data: { id: projectId, step, state } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["engine", "workspace", projectId] }),
  });
  const active = current?.state ?? "draft";
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
      <div className="flex items-center gap-2">
        <span className={cn("inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium", TONE[active])}>
          {active === "approved" ? <CheckCircle2 className="w-3.5 h-3.5" /> : active === "review" ? <Eye className="w-3.5 h-3.5" /> : <CircleDashed className="w-3.5 h-3.5" />}
          {LABEL[active]}
        </span>
        {current?.updated_at ? (
          <span className="text-[11px] text-ink/50">
            {current.updated_by ?? "system"} · {new Date(current.updated_at).toLocaleString()}
          </span>
        ) : (
          <span className="text-[11px] text-ink/40">No state set</span>
        )}
      </div>
      <div className="ml-auto inline-flex rounded-md border border-border bg-white p-0.5 text-[11px]">
        {(["draft", "review", "approved"] as const).map((s) => (
          <button
            key={s}
            disabled={m.isPending || active === s}
            onClick={() => m.mutate(s)}
            className={cn(
              "px-2.5 py-1 rounded-sm inline-flex items-center gap-1",
              active === s ? "bg-ink text-white" : "text-ink/70 hover:text-ink",
              m.isPending ? "opacity-60" : "",
            )}
          >
            {m.isPending && m.variables === s ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
            {LABEL[s]}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SourceEvidence({
  projectId,
  step,
}: {
  projectId: string;
  step: Exclude<WorkspaceStepKey, "intelligence">;
}) {
  const categories = STEP_EVIDENCE_CATEGORIES[step] ?? [];
  const fn = useServerFn(listStepEvidence);
  const { data, isLoading } = useQuery({
    queryKey: ["engine", "step-evidence", projectId, step, categories.join(",")],
    queryFn: () => fn({ data: { id: projectId, categories } }) as Promise<StepEvidence[]>,
  });
  if (categories.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-paper-soft p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink/50">Source Evidence</div>
        <div className="text-[10px] text-ink/40">{categories.join(" · ")}</div>
      </div>
      {isLoading ? (
        <div className="text-xs text-ink/40 inline-flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Loading…</div>
      ) : (data?.length ?? 0) === 0 ? (
        <div className="text-xs text-ink/40">No matching signals extracted yet.</div>
      ) : (
        <ul className="space-y-2 max-h-64 overflow-auto pr-1">
          {(data ?? []).map((e) => (
            <li key={e.id} className="rounded-md border border-border bg-white p-2.5">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-ink/50">
                <span className="font-mono">{e.category}</span>
                <span>·</span>
                <span>{e.confidence}%</span>
                {e.source_name ? <><span>·</span><span className="truncate max-w-[220px]">{e.source_name}</span></> : null}
              </div>
              <div className="text-sm text-ink mt-1">{e.label}</div>
              {e.detail ? <div className="text-xs text-ink/60 mt-1 line-clamp-3">{e.detail}</div> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
