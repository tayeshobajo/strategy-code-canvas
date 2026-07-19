import { useSyncExternalStore } from "react";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { getPmState, subscribePm } from "@/lib/engine-pm-status";
import { cn } from "@/lib/utils";

/**
 * User-initiated "Run AI PM Now" — re-fetches missing information and
 * retries safely (repair mode never touches approved truth). Disabled
 * while a run is already in flight so we don't stack calls.
 *
 * The status chip (AiPmStatusChip) shows live progress; this button
 * just triggers and surfaces a toast on completion.
 */
export function RunAiPmButton({
  projectId,
  runNow,
  className,
  variant = "default",
}: {
  projectId: string;
  runNow: (mode?: "repair" | "refresh" | "rebuild_draft") => boolean;
  className?: string;
  variant?: "default" | "subtle";
}) {
  const state = useSyncExternalStore(
    subscribePm,
    () => getPmState(projectId),
    () => getPmState(projectId),
  );

  const running = state.running;

  const handle = () => {
    const started = runNow("refresh");
    if (!started) {
      toast.info("AI PM is already running.");
      return;
    }
    toast.loading("AI PM is drafting missing artifacts…", {
      id: `pm-run-${projectId}`,
      duration: 60_000,
    });
    // Watch the store once for the transition back to idle to emit
    // a success/error toast without another subscription elsewhere.
    const unsub = subscribePm(() => {
      const s = getPmState(projectId);
      if (s.running) return;
      unsub();
      if (s.lastError) {
        toast.error(`AI PM run failed: ${s.lastError}`, { id: `pm-run-${projectId}` });
      } else {
        toast.success("AI PM finished. Spine refreshed.", { id: `pm-run-${projectId}` });
      }
    });
  };

  return (
    <button
      type="button"
      onClick={handle}
      disabled={running}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors",
        variant === "default"
          ? "border border-primary/30 bg-primary text-primary-foreground hover:bg-primary/90"
          : "border border-primary/25 bg-primary/5 text-primary hover:bg-primary/10",
        running && "opacity-70 cursor-not-allowed",
        className,
      )}
      title="Re-fetch missing information and retry any failed steps. Approved truth is never overwritten."
    >
      {running ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <RefreshCw className="w-3.5 h-3.5" />
      )}
      <Sparkles className="w-3.5 h-3.5" />
      {running ? "AI PM running…" : "Run AI PM now"}
    </button>
  );
}
