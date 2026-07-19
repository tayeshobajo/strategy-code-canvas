import { useSyncExternalStore } from "react";
import { Loader2, Sparkles, AlertCircle } from "lucide-react";
import { getPmState, subscribePm } from "@/lib/engine-pm-status";

/**
 * Ambient status chip that surfaces what the AI Product Manager is doing
 * right now on this project. Idle → hidden. Running → spinner + step.
 * Errored → subtle warning that clears on the next successful run.
 */
export function AiPmStatusChip({ projectId }: { projectId: string }) {
  const state = useSyncExternalStore(
    subscribePm,
    () => getPmState(projectId),
    () => getPmState(projectId),
  );

  if (state.running) {
    return (
      <div
        role="status"
        className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1 text-[11px] font-medium text-primary"
      >
        <Loader2 className="w-3 h-3 animate-spin" />
        <Sparkles className="w-3 h-3" />
        {state.step ?? "AI PM drafting…"}
      </div>
    );
  }

  if (state.lastError) {
    return (
      <div
        role="status"
        title={state.lastError}
        className="inline-flex items-center gap-1.5 rounded-full border border-[#f3ced5] bg-[#fbe9ec] px-2.5 py-1 text-[11px] font-medium text-[#a4283c]"
      >
        <AlertCircle className="w-3 h-3" />
        AI PM run failed
      </div>
    );
  }

  return null;
}
