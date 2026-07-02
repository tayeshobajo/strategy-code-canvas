import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getEmailStats,
  listEmailDlq,
  listEmailFailures,
  retryEmailFromDlq,
  type DlqMessage,
  type EmailLogRow,
  type EmailStats,
} from "@/lib/email-admin.functions";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Loader2, RefreshCw, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/ops/emails")({
  component: EmailsDashboard,
});

const WINDOWS = [
  { label: "24h", hours: 24 },
  { label: "7d", hours: 168 },
  { label: "30d", hours: 720 },
];

function StatCard({
  label,
  value,
  tone = "default",
  hint,
}: {
  label: string;
  value: string | number;
  tone?: "default" | "danger" | "warn" | "ok";
  hint?: string;
}) {
  const toneCls = {
    default: "border-[#e7e6df] bg-white",
    danger: "border-red-200 bg-red-50",
    warn: "border-amber-200 bg-amber-50",
    ok: "border-emerald-200 bg-emerald-50",
  }[tone];
  return (
    <div className={cn("rounded-lg border p-4", toneCls)}>
      <div className="text-[11px] uppercase tracking-[0.18em] text-[#5d6079]">{label}</div>
      <div className="mt-2 text-2xl font-serif text-[#171c38]">{value}</div>
      {hint ? <div className="mt-1 text-xs text-[#5d6079]">{hint}</div> : null}
    </div>
  );
}

function EmailsDashboard() {
  const statsFn = useServerFn(getEmailStats);
  const dlqFn = useServerFn(listEmailDlq);
  const failuresFn = useServerFn(listEmailFailures);
  const retryFn = useServerFn(retryEmailFromDlq);
  const qc = useQueryClient();
  const [hours, setHours] = useState(24);

  const stats = useQuery({
    queryKey: ["email-stats", hours],
    queryFn: () => statsFn({ data: { hours } }),
    refetchInterval: 30_000,
  });
  const dlq = useQuery({
    queryKey: ["email-dlq"],
    queryFn: () => dlqFn({ data: {} }),
    refetchInterval: 30_000,
  });
  const failures = useQuery({
    queryKey: ["email-failures", hours],
    queryFn: () => failuresFn({ data: { hours, status: "failed", limit: 100 } }),
    refetchInterval: 30_000,
  });

  const retry = useMutation({
    mutationFn: (m: DlqMessage) => retryFn({ data: { dlq: m.queue, msg_id: m.msg_id } }),
    onSuccess: () => {
      toast.success("Re-queued email for delivery");
      qc.invalidateQueries({ queryKey: ["email-dlq"] });
      qc.invalidateQueries({ queryKey: ["email-stats"] });
      qc.invalidateQueries({ queryKey: ["email-failures"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Retry failed"),
  });

  const s: EmailStats | undefined = stats.data;
  const alerts = useMemo(() => {
    const out: string[] = [];
    if (!s) return out;
    if (s.dlqDepth.transactional + s.dlqDepth.auth > 0) {
      out.push(`${s.dlqDepth.transactional + s.dlqDepth.auth} message(s) in dead-letter queue.`);
    }
    if (s.failureRate >= 10) {
      out.push(`Failure rate ${s.failureRate}% over last ${s.windowHours}h — investigate.`);
    }
    return out;
  }, [s]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl text-[#171c38]">Email health</h1>
          <p className="mt-1 text-sm text-[#5d6079]">
            Transactional and auth email queue status, failure alerts, and dead-letter retry.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {WINDOWS.map((w) => (
            <button
              key={w.hours}
              onClick={() => setHours(w.hours)}
              className={cn(
                "rounded-md border px-3 py-1.5 text-xs",
                hours === w.hours
                  ? "border-[#171c38] bg-[#171c38] text-white"
                  : "border-[#e7e6df] bg-white text-[#171c38]",
              )}
            >
              {w.label}
            </button>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              stats.refetch();
              dlq.refetch();
              failures.refetch();
            }}
          >
            <RefreshCw className="mr-1 h-3.5 w-3.5" /> Refresh
          </Button>
        </div>
      </header>

      {alerts.length > 0 ? (
        <div className="mb-6 rounded-lg border border-red-300 bg-red-50 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-red-800">
            <AlertTriangle className="h-4 w-4" /> Delivery alerts
          </div>
          <ul className="mt-2 list-inside list-disc text-sm text-red-900">
            {alerts.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-6">
        <StatCard label="Unique emails" value={s?.totalUnique ?? "—"} hint={`Last ${hours}h`} />
        <StatCard label="Sent" value={s?.sent ?? "—"} tone="ok" />
        <StatCard label="Failed" value={s?.failed ?? "—"} tone={s && s.failed > 0 ? "warn" : "default"} />
        <StatCard label="Dead-lettered" value={s?.dlq ?? "—"} tone={s && s.dlq > 0 ? "danger" : "default"} />
        <StatCard label="Suppressed" value={s?.suppressed ?? "—"} />
        <StatCard label="Failure rate" value={`${s?.failureRate ?? 0}%`} tone={s && s.failureRate >= 10 ? "danger" : "default"} />
      </section>

      <section className="mb-8 grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-[#e7e6df] bg-white p-4">
          <h2 className="font-serif text-sm uppercase tracking-[0.2em] text-[#5d6079]">
            DLQ depth (live)
          </h2>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <StatCard
              label="Transactional"
              value={s?.dlqDepth.transactional ?? "—"}
              tone={s && s.dlqDepth.transactional > 0 ? "danger" : "ok"}
            />
            <StatCard
              label="Auth"
              value={s?.dlqDepth.auth ?? "—"}
              tone={s && s.dlqDepth.auth > 0 ? "danger" : "ok"}
            />
          </div>
        </div>
        <div className="rounded-lg border border-[#e7e6df] bg-white p-4">
          <h2 className="font-serif text-sm uppercase tracking-[0.2em] text-[#5d6079]">
            Top errors (root causes)
          </h2>
          {s?.topErrors.length ? (
            <ul className="mt-3 space-y-2 text-sm">
              {s.topErrors.map((e) => (
                <li key={e.error} className="flex items-start justify-between gap-3">
                  <span className="text-[#171c38]">{e.error}</span>
                  <span className="shrink-0 rounded bg-[#f6f6f3] px-2 py-0.5 text-xs">
                    ×{e.count}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-[#5d6079]">No failures in window.</p>
          )}
        </div>
      </section>

      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-serif text-lg text-[#171c38]">Dead-letter queue</h2>
          <span className="text-xs text-[#5d6079]">
            Retry after fixing unsubscribe token, template, or recipient. Retry re-mints
            missing tokens automatically.
          </span>
        </div>
        <div className="overflow-x-auto rounded-lg border border-[#e7e6df] bg-white">
          <table className="w-full text-sm">
            <thead className="bg-[#f6f6f3] text-left text-[11px] uppercase tracking-[0.18em] text-[#5d6079]">
              <tr>
                <th className="px-3 py-2">Queue</th>
                <th className="px-3 py-2">Recipient</th>
                <th className="px-3 py-2">Template</th>
                <th className="px-3 py-2">Subject</th>
                <th className="px-3 py-2">Token?</th>
                <th className="px-3 py-2">Enqueued</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {dlq.isLoading ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-[#5d6079]">
                    <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                  </td>
                </tr>
              ) : !dlq.data?.length ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-[#5d6079]">
                    Empty — no dead-lettered emails.
                  </td>
                </tr>
              ) : (
                dlq.data.map((m) => (
                  <tr key={`${m.queue}-${m.msg_id}`} className="border-t border-[#f0efe9]">
                    <td className="px-3 py-2 text-xs text-[#5d6079]">
                      {m.queue.replace("_dlq", "")}
                    </td>
                    <td className="px-3 py-2 text-[#171c38]">{m.recipient ?? "—"}</td>
                    <td className="px-3 py-2 text-[#171c38]">{m.template ?? "—"}</td>
                    <td className="px-3 py-2 text-[#5d6079]">{m.subject ?? "—"}</td>
                    <td className="px-3 py-2">
                      {m.has_unsubscribe_token ? (
                        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-800">
                          yes
                        </span>
                      ) : (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">
                          missing
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-[#5d6079]">
                      {new Date(m.enqueued_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={retry.isPending}
                        onClick={() => retry.mutate(m)}
                      >
                        {retry.isPending && retry.variables?.msg_id === m.msg_id ? (
                          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RotateCw className="mr-1 h-3.5 w-3.5" />
                        )}
                        Retry
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-serif text-lg text-[#171c38]">Recent failures (log)</h2>
        <div className="overflow-x-auto rounded-lg border border-[#e7e6df] bg-white">
          <table className="w-full text-sm">
            <thead className="bg-[#f6f6f3] text-left text-[11px] uppercase tracking-[0.18em] text-[#5d6079]">
              <tr>
                <th className="px-3 py-2">Time</th>
                <th className="px-3 py-2">Template</th>
                <th className="px-3 py-2">Recipient</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Error</th>
              </tr>
            </thead>
            <tbody>
              {failures.isLoading ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-[#5d6079]">
                    <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                  </td>
                </tr>
              ) : !failures.data?.length ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-[#5d6079]">
                    No recent failures.
                  </td>
                </tr>
              ) : (
                failures.data.map((row: EmailLogRow) => (
                  <tr key={row.id} className="border-t border-[#f0efe9]">
                    <td className="px-3 py-2 text-xs text-[#5d6079]">
                      {new Date(row.created_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-2">{row.template_name}</td>
                    <td className="px-3 py-2">{row.recipient_email}</td>
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5 text-xs",
                          row.status === "dlq"
                            ? "bg-red-100 text-red-800"
                            : "bg-amber-100 text-amber-800",
                        )}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-[#5d6079]">{row.error_message ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
