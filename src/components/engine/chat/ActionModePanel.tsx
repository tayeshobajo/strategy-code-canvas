import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ShieldAlert, Power, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { getActionMode, setActionModeEnabled } from "@/lib/engine-chat-actions.functions";

type Props = {
  projectId: string;
  isAdmin: boolean;
};

export function ActionModePanel({ projectId, isAdmin }: Props) {
  const qc = useQueryClient();
  const getFn = useServerFn(getActionMode);
  const setFn = useServerFn(setActionModeEnabled);

  const q = useQuery({
    queryKey: ["engine", "chat", "action-mode", projectId],
    queryFn: () => getFn({ data: { projectId } }),
    staleTime: 30_000,
  });
  const state = q.data as { enabled: boolean; updatedAt: string | null; updatedBy: string | null } | undefined;
  const enabled = state?.enabled ?? false;

  const toggle = useMutation({
    mutationFn: async () => {
      const res = await setFn({ data: { projectId, enabled: !enabled } });
      return res as { enabled: boolean };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["engine", "chat", "action-mode", projectId] });
      qc.invalidateQueries({ queryKey: ["engine", "chat", "capabilities", projectId] });
    },
  });

  return (
    <div
      className={cn(
        "rounded-lg border p-3 space-y-2",
        enabled ? "border-amber-300 bg-amber-50" : "border-border bg-card",
      )}
      data-qa-role="action-mode-panel"
      data-qa-action-mode={enabled ? "on" : "off"}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-ink/60">
          <ShieldAlert className="w-3 h-3" />
          Action Mode
        </div>
        <span
          className={cn(
            "text-[10px] rounded-full border px-2 py-0.5 font-mono uppercase tracking-wider",
            enabled
              ? "border-amber-300 bg-white text-amber-800"
              : "border-border bg-white text-ink/60",
          )}
        >
          {enabled ? "on" : "off"}
        </span>
      </div>
      <p className="text-[11px] text-ink/70 leading-relaxed">
        Action Mode lets Project Chat run a small set of approved internal actions (create suggested
        tasks, save artifacts, submit review items). It cannot approve roadmaps, publish to the
        client, mark tasks complete, send messages, or change investment terms.
      </p>
      {isAdmin ? (
        <button
          type="button"
          onClick={() => toggle.mutate()}
          disabled={toggle.isPending || q.isPending}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px]",
            enabled
              ? "border-amber-400 bg-amber-100 text-amber-900 hover:bg-amber-200"
              : "border-border bg-white text-ink/80 hover:border-royal/50",
            "disabled:opacity-50",
          )}
          data-qa-action="action-mode-toggle"
        >
          {toggle.isPending ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Power className="w-3 h-3" />
          )}
          {enabled ? "Disable Action Mode" : "Enable Action Mode"}
        </button>
      ) : (
        <div className="text-[10px] text-ink/50">Only admins can change Action Mode.</div>
      )}
      {state?.updatedAt && (
        <div className="text-[10px] text-ink/50">
          Last change: {new Date(state.updatedAt).toLocaleString()} · {state.updatedBy ?? "unknown"}
        </div>
      )}
    </div>
  );
}
