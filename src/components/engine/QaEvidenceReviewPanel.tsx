import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ClipboardCheck,
  Loader2,
  Sparkles,
  Send,
  ShieldCheck,
  XCircle,
  Archive,
  RefreshCw,
  AlertTriangle,
  Info,
  CheckCircle2,
} from "lucide-react";
import {
  getQaEvidenceReview,
  generateQaEvidenceReview,
  saveQaEvidenceReviewDraft,
  submitQaEvidenceReview,
  approveQaEvidenceReview,
  rejectQaEvidenceReview,
  archiveQaEvidenceReview,
  type QaEvidenceReviewState,
  type QaEvidenceReviewRow,
  type QaEvidenceReviewPayload,
  type QaEvidenceReviewVerdict,
} from "@/lib/engine-qa-evidence.functions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const call = (fn: unknown, data: unknown) => (fn as any)({ data });

const VERDICT_TONE: Record<QaEvidenceReviewVerdict, string> = {
  pending: "bg-neutral-100 text-neutral-700 border-neutral-300",
  evidence_sufficient: "bg-emerald-100 text-emerald-800 border-emerald-300",
  needs_more_evidence: "bg-amber-100 text-amber-800 border-amber-300",
  needs_owner_decision: "bg-sky-100 text-sky-800 border-sky-300",
  insufficient: "bg-red-100 text-red-800 border-red-300",
};

const STATUS_TONE: Record<string, string> = {
  draft: "bg-neutral-100 text-neutral-700 border-neutral-300",
  in_review: "bg-sky-100 text-sky-800 border-sky-300",
  approved: "bg-emerald-100 text-emerald-800 border-emerald-300",
  rejected: "bg-red-100 text-red-800 border-red-300",
  archived: "bg-neutral-200 text-neutral-600 border-neutral-300",
};

export function QaEvidenceReviewPanel({
  projectId,
  packetId,
  onChanged,
}: {
  projectId: string;
  packetId: string;
  onChanged?: () => void;
}) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["qa-evidence-review", projectId, packetId],
    queryFn: () => call(getQaEvidenceReview, { projectId, packetId }),
  });
  const state = q.data as QaEvidenceReviewState | undefined;

  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [payloadJson, setPayloadJson] = useState("");

  const genFn = useServerFn(generateQaEvidenceReview);
  const saveFn = useServerFn(saveQaEvidenceReviewDraft);
  const submitFn = useServerFn(submitQaEvidenceReview);
  const approveFn = useServerFn(approveQaEvidenceReview);
  const rejectFn = useServerFn(rejectQaEvidenceReview);
  const archiveFn = useServerFn(archiveQaEvidenceReview);

  const refresh = async () => {
    await qc.invalidateQueries({
      queryKey: ["qa-evidence-review", projectId, packetId],
    });
    await qc.invalidateQueries({ queryKey: ["engine", "build-execution", projectId] });
    onChanged?.();
  };

  const latest = state?.latest ?? null;

  useEffect(() => {
    if (latest && editing) {
      setTitle(latest.title);
      setSummary(latest.summary ?? "");
      setPayloadJson(JSON.stringify(latest.payload, null, 2));
    }
  }, [latest, editing]);

  const runWith = async (
    label: string,
    fn: () => Promise<unknown>,
    ok: string,
  ) => {
    setBusy(label);
    try {
      await fn();
      toast.success(ok);
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const capabilities = state?.capabilities;

  const onGenerate = () =>
    runWith(
      "generate",
      () => call(genFn, { projectId, packetId }),
      "QA evidence review draft generated",
    );

  const onSaveDraft = async () => {
    if (!latest) return;
    let payload: QaEvidenceReviewPayload;
    try {
      payload = JSON.parse(payloadJson);
    } catch {
      toast.error("Payload is not valid JSON");
      return;
    }
    await runWith(
      "save",
      () =>
        call(saveFn, {
          projectId,
          packetId,
          reviewId: latest.id,
          title: title.trim() || latest.title,
          summary: summary.trim(),
          payload,
        }),
      "Draft saved",
    );
    setEditing(false);
  };

  const onSubmit = () => {
    if (!latest) return;
    runWith(
      "submit",
      () => call(submitFn, { projectId, packetId, reviewId: latest.id }),
      "Submitted for review",
    );
  };

  const onApprove = () => {
    if (!latest) return;
    const ack = window.prompt(
      "Approving this QA evidence review does NOT accept the packet. Add an optional note:",
    );
    if (ack === null) return;
    runWith(
      "approve",
      () =>
        call(approveFn, {
          projectId,
          packetId,
          reviewId: latest.id,
          acknowledgement: ack || undefined,
        }),
      "Review approved — packet not accepted",
    );
  };

  const onReject = () => {
    if (!latest) return;
    const reason = window.prompt("Rejection reason (required):");
    if (!reason || reason.trim().length < 3) return;
    runWith(
      "reject",
      () =>
        call(rejectFn, {
          projectId,
          packetId,
          reviewId: latest.id,
          reason: reason.trim(),
        }),
      "Review rejected",
    );
  };

  const onArchive = () => {
    if (!latest) return;
    if (!window.confirm("Archive this QA evidence review?")) return;
    runWith(
      "archive",
      () => call(archiveFn, { projectId, packetId, reviewId: latest.id }),
      "Review archived",
    );
  };

  const missingAlignments = useMemo(
    () =>
      (latest?.payload?.qa_alignment ?? []).filter(
        (a) => a.evidence_status === "missing",
      ).length,
    [latest],
  );
  const gaps = latest?.payload?.evidence_gaps?.length ?? 0;

  return (
    <div className="rounded-xl border border-emerald-300/60 bg-emerald-50/40 p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4 text-emerald-700" />
            <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-emerald-800">
              QA Evidence Review · v1
            </div>
          </div>
          <p className="text-xs text-ink/60 mt-1 max-w-2xl">
            Advisory review of the evidence bundle for this packet. Approving a
            review is <strong>not</strong> the same as accepting the packet, marking
            QA passed, or delivering. Output is not proof. Evidence is not
            acceptance. Review is not delivery.
          </p>
        </div>
        <button
          onClick={refresh}
          className="text-[11px] font-mono uppercase tracking-widest text-emerald-800 inline-flex items-center gap-1 hover:opacity-80"
        >
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>

      {q.isLoading ? (
        <div className="flex items-center gap-2 text-xs text-ink/60">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
        </div>
      ) : q.error ? (
        <div className="text-xs text-red-700">
          Failed to load: {(q.error as Error).message}
        </div>
      ) : !state ? null : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="rounded border border-emerald-300 bg-white/60 px-2 py-0.5">
              {state.openclaw_runs.length} OpenClaw run
              {state.openclaw_runs.length === 1 ? "" : "s"}
            </span>
            <span className="rounded border border-emerald-300 bg-white/60 px-2 py-0.5">
              {state.build_evidence_count} build evidence
            </span>
            {state.latest_approved ? (
              <span className="rounded border border-emerald-300 bg-emerald-100/70 px-2 py-0.5 inline-flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" />
                Latest approved review: {state.latest_approved.verdict.replace(/_/g, " ")}
              </span>
            ) : null}
          </div>

          {latest ? (
            <ReviewCard
              row={latest}
              missingAlignments={missingAlignments}
              gapsCount={gaps}
            />
          ) : (
            <div className="rounded border border-dashed border-emerald-400/50 bg-white/40 p-3 text-xs text-ink/70">
              No QA evidence review has been generated for this packet yet.
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {capabilities?.canGenerate ? (
              <ActionButton
                icon={<Sparkles className="w-3.5 h-3.5" />}
                label="Generate AI draft"
                busy={busy === "generate"}
                onClick={onGenerate}
              />
            ) : null}
            {latest && latest.status === "draft" && capabilities?.canSaveDraft ? (
              <ActionButton
                icon={<ClipboardCheck className="w-3.5 h-3.5" />}
                label={editing ? "Cancel edit" : "Edit draft"}
                onClick={() => setEditing((v) => !v)}
              />
            ) : null}
            {latest &&
            latest.status === "draft" &&
            capabilities?.canSubmitReview ? (
              <ActionButton
                icon={<Send className="w-3.5 h-3.5" />}
                label="Submit for review"
                busy={busy === "submit"}
                onClick={onSubmit}
              />
            ) : null}
            {latest &&
            latest.status === "in_review" &&
            capabilities?.canApprove ? (
              <ActionButton
                icon={<ShieldCheck className="w-3.5 h-3.5" />}
                label="Approve review"
                tone="ok"
                busy={busy === "approve"}
                onClick={onApprove}
              />
            ) : null}
            {latest &&
            latest.status === "in_review" &&
            capabilities?.canReject ? (
              <ActionButton
                icon={<XCircle className="w-3.5 h-3.5" />}
                label="Reject review"
                tone="danger"
                busy={busy === "reject"}
                onClick={onReject}
              />
            ) : null}
            {latest &&
            latest.status !== "archived" &&
            capabilities?.canArchive ? (
              <ActionButton
                icon={<Archive className="w-3.5 h-3.5" />}
                label="Archive"
                tone="ghost"
                busy={busy === "archive"}
                onClick={onArchive}
              />
            ) : null}
          </div>

          {editing && latest ? (
            <div className="rounded border border-emerald-300 bg-white/70 p-3 space-y-2">
              <div className="font-mono text-[10px] uppercase tracking-widest text-emerald-800">
                Edit draft
              </div>
              <label className="block text-[11px] text-ink/70">Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded border border-emerald-300 bg-white p-1.5 text-xs"
              />
              <label className="block text-[11px] text-ink/70">Summary</label>
              <textarea
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                rows={2}
                className="w-full rounded border border-emerald-300 bg-white p-1.5 text-xs"
              />
              <label className="block text-[11px] text-ink/70">
                Payload (JSON)
              </label>
              <textarea
                value={payloadJson}
                onChange={(e) => setPayloadJson(e.target.value)}
                rows={12}
                className="w-full rounded border border-emerald-300 bg-white p-1.5 text-[11px] font-mono"
              />
              <div className="flex justify-end">
                <ActionButton
                  icon={<ClipboardCheck className="w-3.5 h-3.5" />}
                  label="Save draft"
                  tone="ok"
                  busy={busy === "save"}
                  onClick={onSaveDraft}
                />
              </div>
            </div>
          ) : null}

          {state.history.length > 1 ? (
            <details className="rounded border border-emerald-200 bg-white/50 p-2">
              <summary className="cursor-pointer text-[11px] font-mono uppercase tracking-widest text-emerald-800">
                History ({state.history.length})
              </summary>
              <ul className="mt-2 space-y-1">
                {state.history.map((h) => (
                  <li key={h.id} className="text-[11px] text-ink/70 flex flex-wrap gap-2">
                    <span
                      className={`inline-flex items-center rounded border px-1.5 ${STATUS_TONE[h.status] ?? ""}`}
                    >
                      {h.status}
                    </span>
                    <span
                      className={`inline-flex items-center rounded border px-1.5 ${VERDICT_TONE[h.verdict] ?? ""}`}
                    >
                      {h.verdict.replace(/_/g, " ")}
                    </span>
                    <span>{h.title.slice(0, 80)}</span>
                    <span className="text-ink/50">
                      {new Date(h.updated_at).toLocaleString()} · {h.generated_by} ·{" "}
                      {h.created_by_email ?? "—"}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </>
      )}
    </div>
  );
}

function ReviewCard({
  row,
  missingAlignments,
  gapsCount,
}: {
  row: QaEvidenceReviewRow;
  missingAlignments: number;
  gapsCount: number;
}) {
  const p = row.payload;
  return (
    <div className="rounded-lg border border-emerald-300 bg-white/80 p-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center rounded border px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest ${STATUS_TONE[row.status] ?? ""}`}
        >
          {row.status}
        </span>
        <span
          className={`inline-flex items-center rounded border px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest ${VERDICT_TONE[row.verdict] ?? ""}`}
        >
          Verdict: {row.verdict.replace(/_/g, " ")}
        </span>
        <span className="text-[10px] uppercase tracking-widest text-ink/50">
          {row.generated_by}
        </span>
      </div>
      <div>
        <div className="text-sm font-semibold">{row.title}</div>
        {row.summary ? (
          <p className="text-xs text-ink/70 mt-1 whitespace-pre-wrap">
            {row.summary}
          </p>
        ) : null}
      </div>
      {row.rejected_reason ? (
        <div className="rounded border border-red-300 bg-red-50 p-2 text-[11px] text-red-800">
          <strong>Rejected:</strong> {row.rejected_reason}
        </div>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-3 text-[11px]">
        <MiniStat
          icon={<AlertTriangle className="w-3 h-3" />}
          label="Missing coverage"
          value={missingAlignments}
          tone={missingAlignments > 0 ? "warn" : "ok"}
        />
        <MiniStat
          icon={<Info className="w-3 h-3" />}
          label="Evidence gaps"
          value={gapsCount}
          tone={gapsCount > 0 ? "warn" : "ok"}
        />
        <MiniStat
          icon={<CheckCircle2 className="w-3 h-3" />}
          label="Open questions"
          value={p.open_questions?.length ?? 0}
          tone={(p.open_questions?.length ?? 0) > 0 ? "warn" : "ok"}
        />
      </div>

      <PayloadSection title="Recommended next step">
        <p className="text-xs">
          {p.recommended_next_step.replace(/_/g, " ")} —{" "}
          <span className="text-ink/60">advisory only, not an action</span>
        </p>
      </PayloadSection>

      {p.qa_alignment && p.qa_alignment.length > 0 ? (
        <PayloadSection title={`QA alignment (${p.qa_alignment.length})`}>
          <ul className="space-y-1 text-[11px]">
            {p.qa_alignment.slice(0, 20).map((a) => (
              <li key={a.test_id} className="flex flex-wrap items-start gap-1">
                <span
                  className={`rounded border px-1 ${a.evidence_status === "covered" ? "border-emerald-300 text-emerald-800" : a.evidence_status === "partial" ? "border-amber-300 text-amber-800" : "border-red-300 text-red-800"}`}
                >
                  {a.evidence_status}
                </span>
                <span className="font-mono text-[10px] text-ink/60">
                  {a.test_id}
                </span>
                <span>{a.title}</span>
                {a.notes ? <span className="text-ink/60">— {a.notes}</span> : null}
              </li>
            ))}
          </ul>
        </PayloadSection>
      ) : null}

      {p.evidence_present && p.evidence_present.length > 0 ? (
        <PayloadSection title={`Evidence present (${p.evidence_present.length})`}>
          <ul className="space-y-1 text-[11px]">
            {p.evidence_present.slice(0, 20).map((e, i) => (
              <li key={`${e.title}-${i}`} className="text-ink/80">
                <span className="font-mono text-[10px] text-ink/60">{e.kind}</span>{" "}
                <strong>{e.title}</strong>{" "}
                <span className="text-ink/60">({e.source})</span>
                {e.summary ? <div className="text-ink/70">{e.summary}</div> : null}
              </li>
            ))}
          </ul>
        </PayloadSection>
      ) : null}

      {p.evidence_gaps && p.evidence_gaps.length > 0 ? (
        <PayloadSection title="Evidence gaps">
          <ul className="list-disc pl-5 text-[11px] space-y-0.5">
            {p.evidence_gaps.map((g, i) => (
              <li key={i}>{g}</li>
            ))}
          </ul>
        </PayloadSection>
      ) : null}

      {p.operator_decisions_required && p.operator_decisions_required.length > 0 ? (
        <PayloadSection title="Operator decisions required">
          <ul className="list-disc pl-5 text-[11px] space-y-0.5">
            {p.operator_decisions_required.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        </PayloadSection>
      ) : null}

      {p.risks && p.risks.length > 0 ? (
        <PayloadSection title="Risks">
          <ul className="space-y-1 text-[11px]">
            {p.risks.map((r, i) => (
              <li key={i}>
                <span className="font-semibold">{r.name}</span>{" "}
                <span className="text-ink/60">({r.severity})</span>
                {r.mitigation ? <div className="text-ink/70">{r.mitigation}</div> : null}
              </li>
            ))}
          </ul>
        </PayloadSection>
      ) : null}

      {p.reminders && p.reminders.length > 0 ? (
        <div className="rounded border border-emerald-300 bg-emerald-100/60 p-2 text-[11px]">
          <div className="font-mono text-[10px] uppercase tracking-widest text-emerald-800 mb-1">
            Reminders
          </div>
          <ul className="list-disc pl-5 space-y-0.5">
            {p.reminders.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function PayloadSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-widest text-emerald-800 mb-1">
        {title}
      </div>
      {children}
    </div>
  );
}

function MiniStat({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "ok" | "warn";
}) {
  return (
    <div
      className={`rounded border px-2 py-1 flex items-center gap-2 ${tone === "warn" ? "border-amber-300 bg-amber-50/50 text-amber-900" : "border-emerald-300 bg-emerald-50/40 text-emerald-900"}`}
    >
      {icon}
      <span className="font-semibold">{value}</span>
      <span className="text-ink/70">{label}</span>
    </div>
  );
}

function ActionButton({
  icon,
  label,
  busy,
  onClick,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  busy?: boolean;
  onClick: () => void;
  tone?: "ok" | "danger" | "ghost";
}) {
  const cls =
    tone === "ok"
      ? "border-emerald-400 text-emerald-900 bg-emerald-100 hover:bg-emerald-200"
      : tone === "danger"
      ? "border-red-400 text-red-800 bg-red-50 hover:bg-red-100"
      : tone === "ghost"
      ? "border-neutral-300 text-ink/70 bg-white hover:bg-neutral-100"
      : "border-emerald-400 text-emerald-900 bg-white hover:bg-emerald-100";
  return (
    <button
      onClick={onClick}
      disabled={!!busy}
      className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-[11px] font-mono uppercase tracking-widest disabled:opacity-60 ${cls}`}
    >
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : icon}
      {label}
    </button>
  );
}
