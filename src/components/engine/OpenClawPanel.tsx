import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Zap, RefreshCw, XCircle, Paperclip, Undo2, ShieldAlert } from "lucide-react";
import {
  getOpenClawConnectionStatus,
  prepareOpenClawRun,
  startOpenClawRun,
  refreshOpenClawRun,
  cancelOpenClawRun,
  attachOpenClawRunArtifact,
  markOpenClawRunReturnedForReview,
  listOpenClawRuns,
  type OpenClawRunRow,
  type OpenClawArtifactRow,
  type OpenClawRunStatus,
} from "@/lib/engine-openclaw.functions";
import type { BuildPacketRow } from "@/lib/engine-build-execution.functions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const call = (fn: unknown, data: unknown) => (fn as any)({ data });

function statusTone(s: OpenClawRunStatus): string {
  switch (s) {
    case "completed":
      return "bg-emerald-100 text-emerald-800 border-emerald-300";
    case "failed":
    case "timed_out":
      return "bg-red-100 text-red-800 border-red-300";
    case "cancelled":
      return "bg-neutral-100 text-neutral-700 border-neutral-300";
    case "returned_for_review":
      return "bg-amber-100 text-amber-800 border-amber-300";
    case "running":
    case "sent":
      return "bg-royal/10 text-royal border-royal/40";
    default:
      return "bg-neutral-100 text-neutral-700 border-neutral-300";
  }
}

function isOpenClawEligible(packet: BuildPacketRow): boolean {
  const tb = packet.payload?.target_builder ?? "";
  const builderOk =
    tb === "OpenClaw" || packet.packet_type === "openclaw" || packet.packet_type === "mixed";
  const statusOk = packet.status === "ready" || packet.status === "handed_off";
  return builderOk && statusOk;
}

export function OpenClawPanel({
  projectId,
  packet,
  onChanged,
}: {
  projectId: string;
  packet: BuildPacketRow;
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const tb = packet.payload?.target_builder ?? "";
  const builderRelevant =
    tb === "OpenClaw" || packet.packet_type === "openclaw" || packet.packet_type === "mixed";

  const connQ = useQuery({
    queryKey: ["openclaw-status", projectId],
    queryFn: () => call(getOpenClawConnectionStatus, { projectId }),
    enabled: builderRelevant,
  });
  const runsQ = useQuery({
    queryKey: ["openclaw-runs", projectId, packet.id],
    queryFn: () => call(listOpenClawRuns, { projectId, packetId: packet.id }),
    enabled: builderRelevant,
  });

  const prepareFn = useServerFn(prepareOpenClawRun);
  const startFn = useServerFn(startOpenClawRun);
  const refreshFn = useServerFn(refreshOpenClawRun);
  const cancelFn = useServerFn(cancelOpenClawRun);
  const attachFn = useServerFn(attachOpenClawRunArtifact);
  const returnFn = useServerFn(markOpenClawRunReturnedForReview);

  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    request_payload?: unknown;
    do_not_send?: string[];
    reason?: string | null;
    eligible?: boolean;
  } | null>(null);

  if (!builderRelevant) return null;

  const runs = (runsQ.data as { runs: OpenClawRunRow[]; artifacts: OpenClawArtifactRow[] } | undefined)
    ?.runs ?? [];
  const artifacts = (runsQ.data as { runs: OpenClawRunRow[]; artifacts: OpenClawArtifactRow[] } | undefined)
    ?.artifacts ?? [];
  const conn = connQ.data as
    | { configured: boolean; mode: "http" | "manual_tracking"; message: string }
    | undefined;
  const eligible = isOpenClawEligible(packet);

  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["openclaw-runs", projectId, packet.id] }),
      qc.invalidateQueries({ queryKey: ["openclaw-status", projectId] }),
      qc.invalidateQueries({ queryKey: ["engine", "build-execution", projectId] }),
      qc.invalidateQueries({ queryKey: ["engine", "build-packet", packet.id] }),
      qc.invalidateQueries({ queryKey: ["engine", "build-evidence", packet.id] }),
      qc.invalidateQueries({ queryKey: ["engine", "workspace", projectId] }),
    ]);
    onChanged();
  };

  const runIt = async (label: string, fn: () => Promise<unknown>, ok: string) => {
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

  const onPrepare = async () => {
    setBusy("prepare");
    try {
      const res = (await call(prepareFn, { projectId, packetId: packet.id })) as {
        request_payload: unknown;
        do_not_send: string[];
        reason: string | null;
        eligible: boolean;
      };
      setPreview(res);
      setShowConfirm(true);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const onConfirmStart = async () => {
    if (!confirmChecked) {
      toast.error("Please confirm the acknowledgment checkbox.");
      return;
    }
    await runIt(
      "start",
      () => call(startFn, { projectId, packetId: packet.id, confirm: true }),
      "OpenClaw run started",
    );
    setShowConfirm(false);
    setConfirmChecked(false);
    setPreview(null);
  };

  return (
    <div className="rounded-xl border border-amber-300/60 bg-amber-50/40 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-700" />
          <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-amber-800">
            OpenClaw Direct Connection · v2
          </div>
        </div>
        {conn ? (
          <span className="text-[10px] font-mono uppercase tracking-widest text-amber-800/80">
            {conn.mode === "http" ? "HTTP mode" : "Manual tracking"}
          </span>
        ) : null}
      </div>

      {conn ? <p className="text-[11px] text-ink/70">{conn.message}</p> : null}

      {!eligible ? (
        <p className="text-[11px] text-ink/70 italic">
          OpenClaw controls are available only when the packet target builder is OpenClaw and
          status is <code>ready</code> or <code>handed_off</code>. Current status:{" "}
          <code>{packet.status}</code>.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          disabled={!eligible || busy !== null}
          onClick={onPrepare}
          className="inline-flex items-center gap-1.5 rounded-md border border-amber-400 bg-white text-amber-900 text-xs px-3 py-1.5 disabled:opacity-50 hover:bg-amber-100"
          data-qa="btn-openclaw-prepare"
        >
          {busy === "prepare" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldAlert className="w-3.5 h-3.5" />}
          Prepare OpenClaw Run
        </button>
      </div>

      {/* Runs list */}
      {runs.length === 0 ? (
        <p className="text-[11px] text-ink/60 italic">No OpenClaw runs for this packet yet.</p>
      ) : (
        <div className="space-y-2">
          {runs.map((run) => {
            const runArtifacts = artifacts.filter((a) => a.openclaw_run_id === run.id);
            const terminal = ["completed", "failed", "cancelled", "timed_out", "returned_for_review"].includes(
              run.status,
            );
            return (
              <div key={run.id} className="rounded-lg border border-border bg-white/70 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded border ${statusTone(run.status)}`}>
                      {run.status}
                    </span>
                    <span className="text-[10px] font-mono text-ink/50">
                      {new Date(run.started_at).toLocaleString()}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-ink/50">
                    by {run.started_by_email ?? "—"}
                  </span>
                </div>
                {run.output_summary ? (
                  <p className="text-xs text-ink/80 whitespace-pre-wrap">{run.output_summary}</p>
                ) : null}
                {run.error_message ? (
                  <p className="text-xs text-red-700 whitespace-pre-wrap">Error: {run.error_message}</p>
                ) : null}

                {runArtifacts.length > 0 ? (
                  <div className="space-y-1">
                    <div className="text-[10px] font-mono uppercase tracking-widest text-ink/50">
                      Artifacts ({runArtifacts.length})
                    </div>
                    <ul className="space-y-1">
                      {runArtifacts.map((a) => (
                        <li key={a.id} className="text-[11px] text-ink/80">
                          <span className="font-mono text-[10px] text-ink/50">[{a.artifact_type}]</span>{" "}
                          {a.title}
                          {a.summary ? <span className="text-ink/60"> — {a.summary}</span> : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {!terminal ? (
                  <div className="flex flex-wrap gap-2 pt-1">
                    <SmallBtn
                      icon={<RefreshCw className="w-3 h-3" />}
                      label="Mark running"
                      onClick={() =>
                        runIt(
                          `refresh-${run.id}`,
                          () => call(refreshFn, { projectId, runId: run.id, status: "running" }),
                          "Run marked running",
                        )
                      }
                      busy={busy === `refresh-${run.id}`}
                    />
                    <SmallBtn
                      icon={<RefreshCw className="w-3 h-3" />}
                      label="Mark completed"
                      onClick={() => {
                        const summary = window.prompt("Output summary (optional)") ?? "";
                        void runIt(
                          `refresh-${run.id}`,
                          () =>
                            call(refreshFn, {
                              projectId,
                              runId: run.id,
                              status: "completed",
                              outputSummary: summary || undefined,
                            }),
                          "Run marked completed",
                        );
                      }}
                      busy={busy === `refresh-${run.id}`}
                    />
                    <SmallBtn
                      icon={<XCircle className="w-3 h-3" />}
                      label="Mark failed"
                      tone="danger"
                      onClick={() => {
                        const msg = window.prompt("Failure message");
                        if (!msg) return;
                        void runIt(
                          `refresh-${run.id}`,
                          () =>
                            call(refreshFn, {
                              projectId,
                              runId: run.id,
                              status: "failed",
                              errorMessage: msg,
                            }),
                          "Run marked failed",
                        );
                      }}
                      busy={busy === `refresh-${run.id}`}
                    />
                    <SmallBtn
                      icon={<XCircle className="w-3 h-3" />}
                      label="Cancel"
                      tone="ghost"
                      onClick={() => {
                        const reason = window.prompt("Cancel reason (optional)") ?? undefined;
                        void runIt(
                          `cancel-${run.id}`,
                          () => call(cancelFn, { projectId, runId: run.id, reason }),
                          "Run cancelled",
                        );
                      }}
                      busy={busy === `cancel-${run.id}`}
                    />
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-2 pt-1 border-t border-border/40">
                  <SmallBtn
                    icon={<Paperclip className="w-3 h-3" />}
                    label="Attach artifact"
                    onClick={() => {
                      const title = window.prompt("Artifact title");
                      if (!title) return;
                      const summary = window.prompt("Summary (optional)") ?? undefined;
                      const asEv = window.confirm("Also add as build evidence?");
                      void runIt(
                        `attach-${run.id}`,
                        () =>
                          call(attachFn, {
                            projectId,
                            runId: run.id,
                            artifactType: "note",
                            title,
                            summary,
                            payload: {},
                            addAsEvidence: asEv,
                          }),
                        "Artifact attached",
                      );
                    }}
                    busy={busy === `attach-${run.id}`}
                  />
                  {run.status !== "returned_for_review" ? (
                    <SmallBtn
                      icon={<Undo2 className="w-3 h-3" />}
                      label="Return for review → QA"
                      onClick={() => {
                        const note = window.prompt("Return note (optional)") ?? undefined;
                        void runIt(
                          `return-${run.id}`,
                          () =>
                            call(returnFn, {
                              projectId,
                              runId: run.id,
                              movePacketTo: "qa_required",
                              note,
                            }),
                          "Run marked returned for review",
                        );
                      }}
                      busy={busy === `return-${run.id}`}
                    />
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[10px] text-ink/50">
        OpenClaw runs never auto-accept the packet, apply migrations, deploy, mark QA passed, or
        mark the project delivered. Packet acceptance remains human-gated.
      </p>

      {/* Confirmation modal */}
      {showConfirm ? (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowConfirm(false);
              setConfirmChecked(false);
            }
          }}
        >
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-card rounded-xl border border-border shadow-2xl p-5 space-y-4">
            <div>
              <h3 className="text-lg font-semibold">Confirm OpenClaw run</h3>
              <p className="text-xs text-ink/70 mt-1">
                Packet: <span className="font-medium">{packet.title}</span>
              </p>
            </div>

            {preview?.reason ? (
              <div className="rounded border border-red-300 bg-red-50 p-2 text-xs text-red-800">
                {preview.reason}
              </div>
            ) : null}

            <details open>
              <summary className="text-xs font-mono uppercase tracking-widest text-ink/60 cursor-pointer">
                What will be sent
              </summary>
              <pre className="mt-2 whitespace-pre-wrap text-[11px] bg-neutral-50 border border-border rounded p-2 max-h-64 overflow-y-auto">
                {JSON.stringify(preview?.request_payload ?? {}, null, 2)}
              </pre>
            </details>

            <div>
              <div className="text-xs font-mono uppercase tracking-widest text-ink/60 mb-1">
                What will NOT be sent
              </div>
              <ul className="text-[11px] text-ink/70 list-disc pl-4 space-y-0.5">
                {(preview?.do_not_send ?? []).map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>

            <div className="rounded border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-900">
              Reminder: sending this packet does NOT approve, deploy, publish, mark QA passed, or
              mark delivered. Nothing outside this handoff will change automatically.
            </div>

            <label className="flex items-start gap-2 text-xs text-ink/80">
              <input
                type="checkbox"
                checked={confirmChecked}
                onChange={(e) => setConfirmChecked(e.target.checked)}
                className="mt-0.5"
              />
              I understand this will send the packet to OpenClaw.
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  setShowConfirm(false);
                  setConfirmChecked(false);
                }}
                className="px-3 py-1.5 rounded border border-border text-xs hover:bg-neutral-50"
              >
                Cancel
              </button>
              <button
                onClick={onConfirmStart}
                disabled={!confirmChecked || busy === "start" || preview?.eligible === false}
                className="px-3 py-1.5 rounded bg-amber-700 text-white text-xs hover:bg-amber-800 disabled:opacity-50 inline-flex items-center gap-1.5"
                data-qa="btn-openclaw-confirm-start"
              >
                {busy === "start" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                Run with OpenClaw
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SmallBtn({
  icon,
  label,
  onClick,
  busy,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  busy: boolean;
  tone?: "danger" | "ghost";
}) {
  const cls =
    tone === "danger"
      ? "border-red-300 text-red-800 hover:bg-red-50"
      : tone === "ghost"
        ? "border-border text-ink/60 hover:border-red-300 hover:text-red-700"
        : "border-border text-ink/80 hover:border-royal/50";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={`inline-flex items-center gap-1 rounded border text-[11px] px-2 py-1 disabled:opacity-50 ${cls}`}
    >
      {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : icon}
      {label}
    </button>
  );
}
