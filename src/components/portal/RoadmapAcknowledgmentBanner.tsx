// Phase 6C — Client Acknowledgment Flow
// Renders a sticky banner on the portal when the client has not yet
// acknowledged the approved roadmap. Hides permanently after ack.

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { acknowledgeRoadmap } from "@/lib/portal.functions";

type Props = {
  roadmapId: string;
  roadmapTitle: string;
  /** already acknowledged — component renders nothing */
  alreadyAcknowledged: boolean;
};

export function RoadmapAcknowledgmentBanner({
  roadmapId,
  roadmapTitle,
  alreadyAcknowledged,
}: Props) {
  const qc = useQueryClient();
  const ackFn = useServerFn(acknowledgeRoadmap);
  const [dismissed, setDismissed] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const ackMut = useMutation({
    mutationFn: () => ackFn({ data: { roadmapId } }),
    onSuccess: () => {
      setConfirmed(true);
      // Refresh portal context so acknowledged_at propagates everywhere
      qc.invalidateQueries({ queryKey: ["portal", "context"] });
      qc.invalidateQueries({ queryKey: ["portal", "roadmap"] });
    },
  });

  if (alreadyAcknowledged || dismissed) return null;

  if (confirmed) {
    return (
      <div
        className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
        data-qa-role="roadmap-ack-confirmed"
      >
        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
        <span>
          <strong>Roadmap acknowledged.</strong> Your project phases can now begin.
        </span>
      </div>
    );
  }

  return (
    <div
      className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-4 text-sm"
      data-qa-role="roadmap-ack-banner"
      data-qa-roadmap-id={roadmapId}
    >
      <div className="flex items-start gap-3">
        <FileText className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-amber-900">
            Please acknowledge your approved roadmap
          </p>
          <p className="mt-0.5 text-amber-800">
            <strong>{roadmapTitle}</strong> is ready. By acknowledging, you
            confirm you have reviewed the roadmap and are ready to begin
            execution.
          </p>
        </div>
      </div>

      {ackMut.isError && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {(ackMut.error as Error)?.message ?? "Something went wrong. Please try again."}
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => ackMut.mutate()}
          disabled={ackMut.isPending}
          data-qa-action="acknowledge-roadmap"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium",
            "bg-amber-700 text-white hover:bg-amber-800 disabled:opacity-60",
          )}
        >
          {ackMut.isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <CheckCircle2 className="w-3.5 h-3.5" />
          )}
          I acknowledge this roadmap
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          disabled={ackMut.isPending}
          className="text-xs text-amber-700 hover:text-amber-900 underline-offset-2 hover:underline"
        >
          Remind me later
        </button>
      </div>
    </div>
  );
}
