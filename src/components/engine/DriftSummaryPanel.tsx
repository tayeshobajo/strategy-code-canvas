import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Radar } from "lucide-react";
import { getDriftSummary } from "@/lib/engine-execution-drift.functions";

/**
 * RT-6 — Compact summary panel for the persistent right rail.
 * Shows open drift counts by severity with a link into the Drift Monitor room.
 */
export function DriftSummaryPanel({
  projectId,
  executionActive = true,
}: {
  projectId: string;
  /**
   * When false, no milestone has entered execution yet — showing a
   * green "no drift" empty state would imply a health guarantee the
   * engine cannot yet support. Render an explicit "not active" state.
   */
  executionActive?: boolean;
}) {
  const summary = useServerFn(getDriftSummary);
  const query = useQuery({
    queryKey: ["drift-summary", projectId],
    queryFn: () => summary({ data: { projectId } }),
    staleTime: 30_000,
    enabled: executionActive,
  });

  const data = query.data;
  const total = data?.open ?? 0;
  const high = data?.high ?? 0;

  return (
    <section
      className="rounded-xl border border-[#E4E9F2] bg-white p-4 shadow-sm"
      aria-labelledby="drift-summary-heading"
    >
      <header className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Radar className="h-4 w-4 text-[#3E68B2]" />
          <h3 id="drift-summary-heading" className="text-sm font-semibold text-[#0A0F1F]">
            Execution drift
          </h3>
          {executionActive && high > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-800">
              <AlertTriangle className="h-3 w-3" /> {high} high
            </span>
          ) : null}
        </div>
        {executionActive ? (
          <Link
            to="/engine/projects/$projectId/drift"
            params={{ projectId }}
            className="text-[11px] text-[#3E68B2] hover:underline"
          >
            Open monitor →
          </Link>
        ) : null}
      </header>

      {!executionActive ? (
        <div className="rounded-md border border-dashed border-[#E4E9F2] bg-[#FBFBFD] px-3 py-2.5">
          <div className="text-[11px] font-semibold text-[#0A0F1F]">Not active yet</div>
          <p className="mt-0.5 text-[11px] leading-snug text-[#667085]">
            Monitoring begins once the first milestone enters execution.
          </p>
        </div>
      ) : query.isLoading ? (
        <p className="text-xs text-[#667085]">Loading…</p>
      ) : total === 0 ? (
        <p className="text-xs text-[#667085]">No open drift signals.</p>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-2 text-center">
            <SeverityCell label="High" count={data?.high ?? 0} tone="high" />
            <SeverityCell label="Medium" count={data?.medium ?? 0} tone="medium" />
            <SeverityCell label="Low" count={data?.low ?? 0} tone="low" />
          </div>
          <ul className="space-y-1 pt-1 text-[11px] text-[#667085]">
            {Object.entries(data?.byAnchor ?? {}).map(([anchor, count]) => (
              <li key={anchor} className="flex justify-between">
                <span className="capitalize">{anchor.replace("_", " ")}</span>
                <span className="font-mono">{count}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function SeverityCell({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: "high" | "medium" | "low";
}) {
  const tones: Record<typeof tone, string> = {
    high: "bg-red-50 text-red-800 border-red-100",
    medium: "bg-amber-50 text-amber-800 border-amber-100",
    low: "bg-slate-50 text-slate-700 border-slate-100",
  };
  return (
    <div className={`rounded-md border px-2 py-1.5 ${tones[tone]}`}>
      <div className="text-[10px] uppercase tracking-wide">{label}</div>
      <div className="text-lg font-semibold leading-none">{count}</div>
    </div>
  );
}
