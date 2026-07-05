import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getIntakeAlertReport,
  resendIntakeOperatorAlert,
} from "@/lib/intake-alerts.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, RefreshCw, RotateCw, MailCheck, MailWarning } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/intake-alerts")({
  component: IntakeAlertsPage,
});

const STATUS_TONE: Record<string, string> = {
  sent: "bg-emerald-100 text-emerald-800 border-emerald-200",
  pending: "bg-amber-100 text-amber-800 border-amber-200",
  suppressed: "bg-slate-100 text-slate-700 border-slate-200",
  failed: "bg-red-100 text-red-800 border-red-200",
  dlq: "bg-red-100 text-red-800 border-red-200",
  bounced: "bg-red-100 text-red-800 border-red-200",
  complained: "bg-red-100 text-red-800 border-red-200",
};

function IntakeAlertsPage() {
  const reportFn = useServerFn(getIntakeAlertReport);
  const resendFn = useServerFn(resendIntakeOperatorAlert);
  const qc = useQueryClient();
  const [submissionId, setSubmissionId] = useState<string>("");

  const report = useQuery({
    queryKey: ["admin", "intake-alerts", submissionId || "latest"],
    queryFn: () =>
      reportFn({
        data: submissionId ? { submission_id: submissionId } : {},
      }),
  });

  const resend = useMutation({
    mutationFn: (recipient: string) =>
      resendFn({
        data: {
          submission_id: report.data?.submission_id ?? "",
          recipient_email: recipient,
        },
      }),
    onSuccess: (r, recipient) => {
      if (r.queued) toast.success(`Queued resend for ${recipient}`);
      else if (r.reason === "duplicate_idempotency_key")
        toast.info(`Skipped — a send with the same idempotency key is already pending or sent.`);
      else if (r.reason === "email_suppressed")
        toast.warning(`${recipient} is on the suppression list.`);
      else toast.warning(`Skipped (${r.reason ?? "unknown"})`);
      qc.invalidateQueries({ queryKey: ["admin", "intake-alerts"] });
    },
    onError: (e: unknown) => toast.error(String((e as Error)?.message ?? e)),
  });

  const data = report.data;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-xs uppercase tracking-widest text-amber-400">Admin</div>
          <h1 className="mt-1 font-serif text-2xl text-white">Intake alert delivery</h1>
          <p className="mt-1 text-sm text-white/60">
            Shows which operators were targeted for the most recent intake and whether each email
            send succeeded. Use resend to retry failed rows — the idempotency key blocks
            double-sends.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => report.refetch()}
          disabled={report.isFetching}
          className="border-white/20 bg-transparent text-white hover:bg-white/10"
        >
          {report.isFetching ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Refresh
        </Button>
      </div>

      <div className="mt-6 flex items-end gap-3 rounded-lg border border-white/10 bg-white/5 p-4">
        <div className="flex-1">
          <label className="text-[11px] uppercase tracking-widest text-white/60">
            Submission ID (optional)
          </label>
          <Input
            value={submissionId}
            onChange={(e) => setSubmissionId(e.target.value.trim())}
            placeholder="Leave empty for most recent intake"
            className="mt-1 border-white/20 bg-transparent text-white placeholder:text-white/30"
          />
        </div>
        <Button
          onClick={() => report.refetch()}
          disabled={report.isFetching}
          className="bg-amber-500 text-[#0c1130] hover:bg-amber-400"
        >
          Load
        </Button>
      </div>

      {report.isLoading ? (
        <div className="mt-8 text-center text-sm text-white/60">Loading…</div>
      ) : !data || !data.submission_id ? (
        <div className="mt-8 rounded-lg border border-white/10 bg-white/5 p-8 text-center text-sm text-white/60">
          No intake notifications have been recorded yet.
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-white/80">
            <div className="text-[11px] uppercase tracking-widest text-white/60">Submission</div>
            <div className="mt-1 font-serif text-lg text-white">
              {data.submission_summary?.name ?? "(unknown)"}{" "}
              {data.submission_summary?.business ? (
                <span className="text-white/60">· {data.submission_summary.business}</span>
              ) : null}
            </div>
            <div className="mt-1 grid grid-cols-2 gap-2 text-xs text-white/60 md:grid-cols-4">
              <div>
                <div className="text-white/40">Email</div>
                <div className="text-white/80">
                  {data.submission_summary?.email ?? "—"}
                </div>
              </div>
              <div>
                <div className="text-white/40">Submitted</div>
                <div className="text-white/80">
                  {data.submission_summary?.submitted_at
                    ? new Date(data.submission_summary.submitted_at).toLocaleString()
                    : "—"}
                </div>
              </div>
              <div>
                <div className="text-white/40">Alerted at</div>
                <div className="text-white/80">
                  {data.notification_created_at
                    ? new Date(data.notification_created_at).toLocaleString()
                    : "—"}
                </div>
              </div>
              <div>
                <div className="text-white/40">Submission ID</div>
                <div className="truncate text-white/80" title={data.submission_id}>
                  {data.submission_id.slice(0, 8)}…
                </div>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-white/10 bg-white text-[#171c38]">
            <table className="w-full text-sm">
              <thead className="bg-[#f6f6f3] text-[11px] uppercase tracking-widest text-[#5d6079]">
                <tr>
                  <th className="px-4 py-2 text-left">Recipient</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-left">Attempts</th>
                  <th className="px-4 py-2 text-left">Last update</th>
                  <th className="px-4 py-2 text-left">Idempotency key</th>
                  <th className="px-4 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {data.recipients.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-[#5d6079]">
                      No operator alert rows for this submission.
                    </td>
                  </tr>
                ) : (
                  data.recipients.map((r) => {
                    const tone = STATUS_TONE[r.latest_status] ?? STATUS_TONE.pending;
                    const succeeded = r.latest_status === "sent" || r.latest_status === "pending";
                    return (
                      <tr key={r.idempotency_key} className="border-t border-[#f3f2ec]">
                        <td className="px-4 py-2">{r.recipient_email}</td>
                        <td className="px-4 py-2">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px]",
                              tone,
                            )}
                          >
                            {succeeded ? (
                              <MailCheck className="h-3 w-3" />
                            ) : (
                              <MailWarning className="h-3 w-3" />
                            )}
                            {r.latest_status}
                          </span>
                          {r.error_message ? (
                            <div className="mt-1 max-w-[220px] truncate text-[11px] text-red-700" title={r.error_message}>
                              {r.error_message}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-4 py-2 tabular-nums">{r.attempts}</td>
                        <td className="px-4 py-2">
                          {new Date(r.latest_at).toLocaleString()}
                        </td>
                        <td className="px-4 py-2">
                          <code className="rounded bg-[#f6f6f3] px-1.5 py-0.5 text-[10px] text-[#5d6079]">
                            {r.idempotency_key}
                          </code>
                        </td>
                        <td className="px-4 py-2 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={resend.isPending}
                            onClick={() => resend.mutate(r.recipient_email)}
                          >
                            <RotateCw className="mr-1 h-3.5 w-3.5" />
                            Resend
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
