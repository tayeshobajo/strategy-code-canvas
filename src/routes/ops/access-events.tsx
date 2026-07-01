import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  adminListAccessEvents,
  type PortalAccessEventRow,
} from "@/lib/ops-access-events.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/ops/access-events")({
  component: AccessEventsPage,
});

const EVENT_TYPES = [
  "",
  "missing_workspace",
  "unknown_email",
  "missing_email_claim",
] as const;

function AccessEventsPage() {
  const list = useServerFn(adminListAccessEvents);
  const [email, setEmail] = useState("");
  const [eventType, setEventType] = useState<string>("");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [rows, setRows] = useState<PortalAccessEventRow[]>([]);

  const load = useMutation({
    mutationFn: () =>
      list({
        data: {
          email: email.trim() || undefined,
          event_type: eventType || undefined,
          from: from ? new Date(from).toISOString() : undefined,
          to: to ? new Date(to).toISOString() : undefined,
          limit: 200,
        },
      }),
    onSuccess: (res) => setRows(res.rows),
  });

  const summary = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) counts.set(r.event_type, (counts.get(r.event_type) ?? 0) + 1);
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [rows]);

  return (
    <div className="px-6 py-8 max-w-6xl mx-auto">
      <header className="mb-6">
        <h1 className="font-serif text-2xl text-[#171c38]">Access events</h1>
        <p className="text-sm text-[#5d6079] mt-1">
          Every time a signed-in user hits the portal without a matching workspace, we log
          a row here. Filter to diagnose why a specific client is stuck.
        </p>
      </header>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-[#e7e6df] bg-white p-4">
        <label className="flex flex-col text-xs text-[#5d6079]">
          Email contains
          <Input
            className="mt-1 w-56"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tai@"
          />
        </label>
        <label className="flex flex-col text-xs text-[#5d6079]">
          Event type
          <select
            className="mt-1 h-9 w-48 rounded-md border border-input bg-background px-2 text-sm"
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
          >
            {EVENT_TYPES.map((t) => (
              <option key={t || "all"} value={t}>
                {t || "All"}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-xs text-[#5d6079]">
          From
          <Input
            type="datetime-local"
            className="mt-1 w-52"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="flex flex-col text-xs text-[#5d6079]">
          To
          <Input
            type="datetime-local"
            className="mt-1 w-52"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <Button
          onClick={() => load.mutate()}
          disabled={load.isPending}
          className="bg-[#0c1130] text-white hover:bg-[#171c38]"
        >
          {load.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Load
        </Button>
      </div>

      {load.error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {(load.error as Error).message}
        </div>
      )}

      {rows.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2 text-xs text-[#5d6079]">
          <span>{rows.length} rows</span>
          {summary.map(([t, n]) => (
            <span
              key={t}
              className="rounded-full border border-[#e7e6df] bg-white px-2 py-0.5"
            >
              {t}: {n}
            </span>
          ))}
        </div>
      )}

      <div className="mt-4 overflow-x-auto rounded-lg border border-[#e7e6df] bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-[#f6f6f3] text-left text-[11px] uppercase tracking-wider text-[#5d6079]">
            <tr>
              <th className="px-3 py-2">When</th>
              <th className="px-3 py-2">Event</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Access</th>
              <th className="px-3 py-2">Permission</th>
              <th className="px-3 py-2">Correlation</th>
              <th className="px-3 py-2">Metadata</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !load.isPending && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-[#5d6079]">
                  No rows loaded yet. Set filters and press Load.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-[#eeece5] align-top">
                <td className="px-3 py-2 whitespace-nowrap text-xs text-[#5d6079]">
                  {new Date(r.created_at).toLocaleString()}
                </td>
                <td className="px-3 py-2">
                  <span className="rounded bg-[#eff1fb] px-1.5 py-0.5 text-xs text-[#171c38]">
                    {r.event_type}
                  </span>
                </td>
                <td className="px-3 py-2">{r.email ?? "—"}</td>
                <td className="px-3 py-2 text-xs">
                  {r.has_client_access === null
                    ? "—"
                    : r.has_client_access
                      ? "yes"
                      : "no"}
                </td>
                <td className="px-3 py-2 text-xs">
                  {r.has_permission === null ? "—" : r.has_permission ? "yes" : "no"}
                </td>
                <td className="px-3 py-2 font-mono text-[11px] text-[#5d6079]">
                  {r.correlation_id ?? "—"}
                </td>
                <td className="px-3 py-2 font-mono text-[11px] text-[#5d6079]">
                  <pre className="max-w-md whitespace-pre-wrap break-all">
                    {r.metadata_json ?? "—"}
                  </pre>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
