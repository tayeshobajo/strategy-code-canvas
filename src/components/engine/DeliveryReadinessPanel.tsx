import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Truck,
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
  PackageCheck,
  ClipboardCheck,
} from "lucide-react";
import {
  getDeliveryReadiness,
  generateDeliveryReadinessReview,
  saveDeliveryReadinessReviewDraft,
  submitDeliveryReadinessReview,
  approveDeliveryReadinessReview,
  rejectDeliveryReadinessReview,
  archiveDeliveryReadinessReview,
  type DeliveryReadinessState,
  type DeliveryReadinessRow,
  type DeliveryReadinessPayload,
  type DeliveryReadiness,
  type DeliveryReadinessRecommendation,
} from "@/lib/engine-delivery-readiness.functions";
import { prepareDeliveryPackage } from "@/lib/engine-completion.functions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const call = (fn: unknown, data: unknown) => (fn as any)({ data });

const READINESS_TONE: Record<DeliveryReadiness, string> = {
  not_ready: "bg-neutral-100 text-neutral-700 border-neutral-300",
  needs_review: "bg-sky-100 text-sky-800 border-sky-300",
  ready_for_delivery_package: "bg-emerald-100 text-emerald-800 border-emerald-300",
  blocked: "bg-red-100 text-red-800 border-red-300",
};
const REC_TONE: Record<DeliveryReadinessRecommendation, string> = {
  hold: "bg-neutral-100 text-neutral-700 border-neutral-300",
  request_more_work: "bg-amber-100 text-amber-800 border-amber-300",
  prepare_delivery_package: "bg-emerald-100 text-emerald-800 border-emerald-300",
  escalate_to_operator: "bg-red-100 text-red-800 border-red-300",
};
const STATUS_TONE: Record<string, string> = {
  draft: "bg-neutral-100 text-neutral-700 border-neutral-300",
  in_review: "bg-sky-100 text-sky-800 border-sky-300",
  approved: "bg-emerald-100 text-emerald-800 border-emerald-300",
  rejected: "bg-red-100 text-red-800 border-red-300",
  archived: "bg-neutral-200 text-neutral-600 border-neutral-300",
};

export function DeliveryReadinessPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["delivery-readiness", projectId],
    queryFn: () => call(getDeliveryReadiness, { projectId }),
  });
  const state = q.data as DeliveryReadinessState | undefined;

  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [payloadJson, setPayloadJson] = useState("");

  const genFn = useServerFn(generateDeliveryReadinessReview);
  const saveFn = useServerFn(saveDeliveryReadinessReviewDraft);
  const submitFn = useServerFn(submitDeliveryReadinessReview);
  const approveFn = useServerFn(approveDeliveryReadinessReview);
  const rejectFn = useServerFn(rejectDeliveryReadinessReview);
  const archiveFn = useServerFn(archiveDeliveryReadinessReview);
  const prepareFn = useServerFn(prepareDeliveryPackage);

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["delivery-readiness", projectId] });
  };

  const latest = state?.latest ?? null;
  const derived = state?.derived;

  useEffect(() => {
    if (latest && editing) {
      setTitle(latest.title);
      setSummary(latest.summary ?? "");
      setPayloadJson(JSON.stringify(latest.payload, null, 2));
    }
  }, [latest, editing]);

  const runWith = async (label: string, fn: () => Promise<unknown>, ok: string) => {
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

  const cap = state?.capabilities;

  const onGenerate = () =>
    runWith(
      "generate",
      () => call(genFn, { projectId }),
      "Delivery readiness review drafted",
    );

  const onSaveDraft = async () => {
    if (!latest) return;
    let payload: DeliveryReadinessPayload;
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
      () => call(submitFn, { projectId, reviewId: latest.id }),
      "Submitted for review",
    );
  };

  const onApprove = () => {
    if (!latest) return;
    const ack = window.prompt(
      "Approving delivery readiness does NOT deliver, publish, notify the client, or mark QA passed. Add an optional note:",
    );
    if (ack === null) return;
    runWith(
      "approve",
      () =>
        call(approveFn, {
          projectId,
          reviewId: latest.id,
          acknowledgement: ack || undefined,
        }),
      "Readiness approved — nothing delivered",
    );
  };

  const onReject = () => {
    if (!latest) return;
    const reason = window.prompt("Rejection reason (required):");
    if (!reason || reason.trim().length < 3) return;
    runWith(
      "reject",
      () =>
        call(rejectFn, { projectId, reviewId: latest.id, reason: reason.trim() }),
      "Readiness rejected",
    );
  };

  const onArchive = () => {
    if (!latest) return;
    if (!window.confirm("Archive this delivery readiness review?")) return;
    runWith(
      "archive",
      () => call(archiveFn, { projectId, reviewId: latest.id }),
      "Readiness archived",
    );
  };

  const showPrepareCta = useMemo(
    () =>
      latest?.status === "approved" && latest.readiness === "ready_for_delivery_package",
    [latest],
  );

  return (
    <div className="rounded-xl border border-indigo-300/60 bg-indigo-50/40 p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Truck className="w-4 h-4 text-indigo-700" />
            <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-indigo-800">
              Delivery Readiness · v1
            </div>
          </div>
          <p className="text-xs text-ink/60 mt-1 max-w-2xl">
            Assessment layer. Answers <em>"can we PREPARE a delivery package?"</em> —
            not <em>"is it delivered?"</em>. Approving readiness does <strong>not</strong>{" "}
            deliver, publish to the client portal, notify the client, or mark QA passed.
          </p>
        </div>
        <button
          onClick={refresh}
          className="text-[11px] font-mono uppercase tracking-widest text-indigo-800 inline-flex items-center gap-1 hover:opacity-80"
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
      ) : !state || !derived ? null : (
        <>
          {/* Live derived assessment (server-authoritative) */}
          <div className="rounded-lg border border-indigo-300 bg-white/70 p-3 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-mono uppercase tracking-widest text-indigo-800">
                Live assessment (server-derived):
              </span>
              <Badge tone={READINESS_TONE[derived.readiness]}>
                {derived.readiness.replace(/_/g, " ")}
              </Badge>
              <Badge tone={REC_TONE[derived.recommendation]}>
                {derived.recommendation.replace(/_/g, " ")}
              </Badge>
              <span className="text-[10px] uppercase tracking-widest text-ink/60">
                confidence: {derived.confidence}
              </span>
            </div>
            <p className="text-xs text-ink/80">{derived.payload.readiness_summary}</p>
            <div className="grid gap-2 sm:grid-cols-4 text-[11px]">
              <MiniStat
                label="Total packets"
                value={derived.payload.packet_readiness.total_packets}
              />
              <MiniStat
                label="Accepted"
                value={derived.payload.packet_readiness.accepted_packets}
                tone="ok"
              />
              <MiniStat
                label="Missing acceptance"
                value={derived.payload.packet_readiness.missing_acceptance.length}
                tone={
                  derived.payload.packet_readiness.missing_acceptance.length > 0
                    ? "warn"
                    : "ok"
                }
              />
              <MiniStat
                label="Rejected"
                value={derived.payload.packet_readiness.rejected_packets}
                tone={
                  derived.payload.packet_readiness.rejected_packets > 0 ? "warn" : "ok"
                }
              />
              <MiniStat
                label="Approved reviews"
                value={derived.payload.qa_evidence_readiness.approved_reviews}
                tone="ok"
              />
              <MiniStat
                label="Missing reviews"
                value={derived.payload.qa_evidence_readiness.missing_reviews.length}
                tone={
                  derived.payload.qa_evidence_readiness.missing_reviews.length > 0
                    ? "warn"
                    : "ok"
                }
              />
              <MiniStat
                label="Critical monitor"
                value={derived.payload.monitor_findings.critical_events.length}
                tone={
                  derived.payload.monitor_findings.critical_events.length > 0
                    ? "warn"
                    : "ok"
                }
              />
              <MiniStat
                label="Blockers"
                value={derived.payload.blockers.length}
                tone={derived.payload.blockers.length > 0 ? "warn" : "ok"}
              />
            </div>
            {derived.payload.blockers.length > 0 ? (
              <ul className="list-disc pl-5 text-[11px] text-red-800">
                {derived.payload.blockers.slice(0, 8).map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            ) : null}
          </div>

          {latest ? (
            <ReviewCard row={latest} />
          ) : (
            <div className="rounded border border-dashed border-indigo-400/50 bg-white/40 p-3 text-xs text-ink/70">
              No delivery readiness review yet. Generate one to record the current
              assessment.
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {cap?.canGenerate ? (
              <ActionButton
                icon={<Sparkles className="w-3.5 h-3.5" />}
                label="Generate readiness review"
                busy={busy === "generate"}
                onClick={onGenerate}
              />
            ) : null}
            {latest && latest.status === "draft" && cap?.canSaveDraft ? (
              <ActionButton
                icon={<ClipboardCheck className="w-3.5 h-3.5" />}
                label={editing ? "Cancel edit" : "Edit draft"}
                onClick={() => setEditing((v) => !v)}
              />
            ) : null}
            {latest && latest.status === "draft" && cap?.canSubmitReview ? (
              <ActionButton
                icon={<Send className="w-3.5 h-3.5" />}
                label="Submit for review"
                busy={busy === "submit"}
                onClick={onSubmit}
              />
            ) : null}
            {latest && latest.status === "in_review" && cap?.canApprove ? (
              <ActionButton
                icon={<ShieldCheck className="w-3.5 h-3.5" />}
                label="Approve readiness"
                tone="ok"
                busy={busy === "approve"}
                onClick={onApprove}
              />
            ) : null}
            {latest && latest.status === "in_review" && cap?.canReject ? (
              <ActionButton
                icon={<XCircle className="w-3.5 h-3.5" />}
                label="Reject readiness"
                tone="danger"
                busy={busy === "reject"}
                onClick={onReject}
              />
            ) : null}
            {latest && latest.status !== "archived" && cap?.canArchive ? (
              <ActionButton
                icon={<Archive className="w-3.5 h-3.5" />}
                label="Archive"
                tone="ghost"
                busy={busy === "archive"}
                onClick={onArchive}
              />
            ) : null}
          </div>

          <div className="rounded border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-900 flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>
              Approving delivery readiness does not deliver the project, publish to
              portal, notify the client, or mark QA passed.
            </span>
          </div>

          {showPrepareCta ? (
            <div className="rounded border border-emerald-300 bg-emerald-50 p-3 flex items-start gap-3">
              <PackageCheck className="w-4 h-4 text-emerald-700 mt-0.5" />
              <div className="flex-1">
                <div className="text-xs font-semibold text-emerald-900">
                  Ready to prepare delivery package
                </div>
                <p className="text-[11px] text-emerald-800/80">
                  Publishes the approved roadmap to the client portal. Does NOT send
                  a client notification and does NOT mark the project delivered.
                </p>
              </div>
              <button
                onClick={() => {
                  if (
                    !window.confirm(
                      "Prepare delivery package?\n\nThis will publish the approved roadmap to the client portal. It will NOT notify the client and will NOT mark the project delivered.",
                    )
                  )
                    return;
                  runWith(
                    "prepare",
                    () => call(prepareFn, { projectId }),
                    "Delivery package prepared — portal published, client not notified",
                  );
                }}
                disabled={busy === "prepare"}
                className="inline-flex items-center gap-1.5 rounded border border-emerald-500 bg-emerald-600 px-2.5 py-1 text-[11px] font-mono uppercase tracking-widest text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {busy === "prepare" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <PackageCheck className="w-3.5 h-3.5" />
                )}
                Prepare Delivery Package
              </button>
            </div>
          ) : null}

          {editing && latest ? (
            <div className="rounded border border-indigo-300 bg-white/70 p-3 space-y-2">
              <div className="font-mono text-[10px] uppercase tracking-widest text-indigo-800">
                Edit draft
              </div>
              <label className="block text-[11px] text-ink/70">Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded border border-indigo-300 bg-white p-1.5 text-xs"
              />
              <label className="block text-[11px] text-ink/70">Summary</label>
              <textarea
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                rows={2}
                className="w-full rounded border border-indigo-300 bg-white p-1.5 text-xs"
              />
              <label className="block text-[11px] text-ink/70">
                Payload (JSON — client-facing checklist / notes are editable; derived
                counts are overwritten on save)
              </label>
              <textarea
                value={payloadJson}
                onChange={(e) => setPayloadJson(e.target.value)}
                rows={14}
                className="w-full rounded border border-indigo-300 bg-white p-1.5 text-[11px] font-mono"
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
            <details className="rounded border border-indigo-200 bg-white/50 p-2">
              <summary className="cursor-pointer text-[11px] font-mono uppercase tracking-widest text-indigo-800">
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
                      className={`inline-flex items-center rounded border px-1.5 ${READINESS_TONE[h.readiness] ?? ""}`}
                    >
                      {h.readiness.replace(/_/g, " ")}
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

function ReviewCard({ row }: { row: DeliveryReadinessRow }) {
  const p = row.payload;
  const cfr = p.client_facing_readiness;
  const checks: Array<[string, boolean]> = [
    ["Client-safe summary", cfr.client_safe_summary_ready],
    ["Screenshots / evidence bundle", cfr.screenshots_ready],
    ["Change summary", cfr.change_summary_ready],
    ["Known limitations", cfr.known_limitations_ready],
    ["Handoff notes", cfr.handoff_notes_ready],
  ];
  return (
    <div className="rounded-lg border border-indigo-300 bg-white/80 p-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={STATUS_TONE[row.status] ?? ""}>{row.status}</Badge>
        <Badge tone={READINESS_TONE[row.readiness] ?? ""}>
          {row.readiness.replace(/_/g, " ")}
        </Badge>
        <Badge tone={REC_TONE[row.recommendation] ?? ""}>
          {row.recommendation.replace(/_/g, " ")}
        </Badge>
        <span className="text-[10px] uppercase tracking-widest text-ink/50">
          confidence: {row.confidence} · {row.generated_by}
        </span>
      </div>
      <div>
        <div className="text-sm font-semibold">{row.title}</div>
        {row.summary ? (
          <p className="text-xs text-ink/70 mt-1 whitespace-pre-wrap">{row.summary}</p>
        ) : null}
      </div>
      {row.rejected_reason ? (
        <div className="rounded border border-red-300 bg-red-50 p-2 text-[11px] text-red-800">
          <strong>Rejected:</strong> {row.rejected_reason}
        </div>
      ) : null}

      <Section title="Client-facing checklist">
        <ul className="grid gap-1 sm:grid-cols-2 text-[11px]">
          {checks.map(([label, ok]) => (
            <li key={label} className="flex items-center gap-1.5">
              {ok ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
              ) : (
                <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
              )}
              <span className={ok ? "text-emerald-900" : "text-amber-900"}>
                {label}
              </span>
            </li>
          ))}
        </ul>
        {cfr.blocked_items.length > 0 ? (
          <ul className="list-disc pl-5 text-[11px] text-ink/70 mt-1">
            {cfr.blocked_items.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        ) : null}
      </Section>

      {p.qa_plan_alignment.length > 0 ? (
        <Section title={`QA plan alignment (${p.qa_plan_alignment.length})`}>
          <ul className="space-y-1 text-[11px]">
            {p.qa_plan_alignment.slice(0, 12).map((a, i) => (
              <li key={i} className="flex flex-wrap items-start gap-1">
                <span
                  className={`rounded border px-1 ${
                    a.status === "satisfied"
                      ? "border-emerald-300 text-emerald-800"
                      : a.status === "partial"
                      ? "border-amber-300 text-amber-800"
                      : "border-red-300 text-red-800"
                  }`}
                >
                  {a.status}
                </span>
                <span>{a.qa_item}</span>
                {a.blocking ? (
                  <span className="text-[9px] uppercase text-red-700">blocking</span>
                ) : null}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {p.implementation_gate_alignment.length > 0 ? (
        <Section
          title={`Implementation gates (${p.implementation_gate_alignment.length})`}
        >
          <ul className="space-y-1 text-[11px]">
            {p.implementation_gate_alignment.slice(0, 12).map((a, i) => (
              <li key={i} className="flex flex-wrap items-start gap-1">
                <span
                  className={`rounded border px-1 ${
                    a.status === "satisfied"
                      ? "border-emerald-300 text-emerald-800"
                      : a.status === "partial"
                      ? "border-amber-300 text-amber-800"
                      : "border-red-300 text-red-800"
                  }`}
                >
                  {a.status}
                </span>
                <span>{a.gate}</span>
                <span className="text-ink/50 font-mono text-[9px]">{a.source}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {p.blockers.length > 0 ? (
        <Section title="Blockers">
          <ul className="list-disc pl-5 text-[11px] text-red-800">
            {p.blockers.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </Section>
      ) : null}

      {p.open_decisions.length > 0 ? (
        <Section title="Open decisions">
          <ul className="list-disc pl-5 text-[11px]">
            {p.open_decisions.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        </Section>
      ) : null}

      {p.missing_artifacts.length > 0 ? (
        <Section title="Missing artifacts">
          <ul className="list-disc pl-5 text-[11px] text-amber-800">
            {p.missing_artifacts.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="Delivery package inputs (draft)">
        <div className="text-[11px] text-ink/80 space-y-1">
          <div>
            Accepted packets:{" "}
            <strong>{p.delivery_package_inputs.accepted_packet_ids.length}</strong>
          </div>
          <div>
            Approved QA reviews:{" "}
            <strong>{p.delivery_package_inputs.qa_review_ids.length}</strong>
          </div>
          <div>
            Screenshots:{" "}
            <strong>{p.delivery_package_inputs.screenshots.length}</strong>
          </div>
          {p.delivery_package_inputs.change_summary ? (
            <div className="text-ink/70">
              <em>Change summary:</em> {p.delivery_package_inputs.change_summary}
            </div>
          ) : null}
        </div>
      </Section>

      {p.reminders.length > 0 ? (
        <div className="rounded border border-indigo-300 bg-indigo-100/60 p-2 text-[11px]">
          <div className="font-mono text-[10px] uppercase tracking-widest text-indigo-800 mb-1">
            Reminders
          </div>
          <ul className="list-disc pl-5 space-y-0.5">
            {p.reminders.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="text-[10px] text-ink/50 flex items-center gap-1">
        <Info className="w-3 h-3" /> Recommended next action: {p.recommended_next_action}
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-widest text-indigo-800 mb-1">
        {title}
      </div>
      {children}
    </div>
  );
}

function Badge({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded border px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest ${tone}`}
    >
      {children}
    </span>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "ok" | "warn";
}) {
  return (
    <div
      className={`rounded border px-2 py-1 flex items-center gap-2 ${
        tone === "warn"
          ? "border-amber-300 bg-amber-50/50 text-amber-900"
          : tone === "ok"
          ? "border-emerald-300 bg-emerald-50/40 text-emerald-900"
          : "border-indigo-200 bg-white/60 text-ink/80"
      }`}
    >
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
      : "border-indigo-400 text-indigo-900 bg-white hover:bg-indigo-100";
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
