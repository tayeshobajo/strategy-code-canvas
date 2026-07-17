/**
 * In-app banner surfacing engine_activity schema-drift alerts.
 * Poll every 60s. Silent when there are no drift events in the last 24h.
 */
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle } from "lucide-react";
import { listActivityDriftAlerts } from "@/lib/engine-activity";

export function ActivityDriftBanner() {
  const fetchAlerts = useServerFn(listActivityDriftAlerts);
  const { data } = useQuery({
    queryKey: ["engine-activity-drift-alerts"],
    queryFn: () => fetchAlerts(),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const alerts = data?.alerts ?? [];
  if (alerts.length === 0) return null;
  const latest = alerts[0];

  return (
    <div
      role="alert"
      className="border-b border-amber-300 bg-amber-50 text-amber-950"
    >
      <div className="mx-auto flex max-w-7xl items-start gap-3 px-4 py-2.5 lg:px-6">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-amber-700" />
        <div className="min-w-0 flex-1 text-sm">
          <div className="font-semibold">
            engine_activity write rejected — schema drift detected
            {alerts.length > 1 ? ` (${alerts.length} recent)` : ""}
          </div>
          <div className="mt-0.5 text-amber-900/90 truncate">
            {latest.body ?? latest.title}
          </div>
          <div className="mt-0.5 font-mono text-[11px] uppercase tracking-wider text-amber-800/70">
            Latest {new Date(latest.created_at).toLocaleString()} — check logs
            for the failing payload.
          </div>
        </div>
      </div>
    </div>
  );
}
