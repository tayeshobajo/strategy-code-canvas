import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Send, CheckCircle2, Loader2, Rocket, Clock, CheckSquare, Star, Save } from "lucide-react";
import { useWorkspace } from "@/hooks/use-workspace";
import { SectionCard } from "@/components/engine/primitives";
import { StepEditor } from "@/components/engine/StepEditor";
import { StepStateBar, SourceEvidence } from "@/components/engine/StepState";
import { OperatorLockNotice } from "@/components/engine/OperatorLockNotice";
import { useEngineRole } from "@/hooks/useEngineRole";
import { DeliveryReadinessPanel } from "@/components/engine/DeliveryReadinessPanel";
import {
  sendProjectDelivery,
  saveDeliveryChecklist,
  getPortalHandoffState,
  startExecutionEngagement,
} from "@/lib/engine-execution.functions";
import { markPortalFollowUpNeeded } from "@/lib/portal.functions";
import {
  completeProject,
  getProjectCompletionState,
  saveClientFeedback,
} from "@/lib/engine-completion.functions";
import { toast } from "sonner";


export const Route = createFileRoute("/engine/projects/$projectId/delivery")({
  component: DeliveryPrep,
});


const CHECKLIST = [
  "Point A verified with client",
  "Point B approved by client",
  "Investment ranges reviewed internally",
  "Roadmap version tagged",
  "Client-safe preview reviewed",
  "Recipient details confirmed",
];

function DeliveryPrep() {
  const { projectId } = Route.useParams();
  const { project } = useWorkspace(projectId);
  const qc = useQueryClient();
  const sendFn = useServerFn(sendProjectDelivery);
  const saveChecklistFn = useServerFn(saveDeliveryChecklist);
  const { canSendDelivery, adminOnlyReason } = useEngineRole();

  const d = (project.delivery ?? {}) as {
    recipient_name?: string;
    recipient_email?: string;
    channel?: string;
    attachments?: string[];
    personal_note?: string;
    approval_checklist?: Record<string, boolean>;
    sent_at?: string;
    sent_by_email?: string;
    client_rating?: number;
    client_feedback?: string;
    client_feedback_date?: string;
    client_feedback_recorded_at?: string;
    client_feedback_recorded_by?: string;
  };

  const [checked, setChecked] = useState<Record<string, boolean>>(d.approval_checklist ?? {});
  const [confirmedSend, setConfirmedSend] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const allChecked = CHECKLIST.every((c) => checked[c]);

  useEffect(() => {
    if (d.approval_checklist) setChecked(d.approval_checklist);
  }, [d.approval_checklist]);

  const persistChecklist = useMutation({
    mutationFn: (next: Record<string, boolean>) =>
      saveChecklistFn({ data: { projectId, checklist: next } }),
  });

  const toggle = (c: string, v: boolean) => {
    const next = { ...checked, [c]: v };
    setChecked(next);
    persistChecklist.mutate(next);
  };

  const sendMut = useMutation({
    mutationFn: () =>
      sendFn({
        data: {
          projectId,
          checklist: Object.fromEntries(CHECKLIST.map((c) => [c, !!checked[c]])),
          confirmed: true as const,
        },
      }),
    onSuccess: async () => {
      setError(null);
      setConfirmedSend(false);
      await qc.invalidateQueries({ queryKey: ["engine"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const alreadySent = !!d.sent_at;

  return (
    <div className="space-y-4">
      <header>
        <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal">Step 14</div>
        <h2 className="font-display text-3xl text-ink mt-1">Delivery Prep</h2>
        <p className="text-sm text-ink/60 mt-1">Final gate before the roadmap leaves your desk.</p>
      </header>
      <StepStateBar projectId={projectId} step="delivery" current={project.step_states?.["delivery"]} />
      <SourceEvidence projectId={projectId} step="delivery" />

      {/* Phase 6B — Delivery Completeness Gate */}
      <DeliveryReadinessPanel projectId={projectId} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <SectionCard title="Recipient">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-ink/50 text-xs">Name</dt><dd className="text-ink">{d.recipient_name ?? "—"}</dd></div>
              <div><dt className="text-ink/50 text-xs">Email</dt><dd className="text-ink">{d.recipient_email ?? project.client_owner_email ?? "—"}</dd></div>
              <div><dt className="text-ink/50 text-xs">Channel</dt><dd className="text-ink">{d.channel ?? "Email"}</dd></div>
              <div><dt className="text-ink/50 text-xs">Attachments</dt><dd className="text-ink">{(d.attachments ?? []).length} file(s)</dd></div>
            </dl>
          </SectionCard>

          <SectionCard title="Personal note">
            <p className="text-sm text-ink/80 whitespace-pre-wrap">{d.personal_note ?? "Add a short, human note here before sending."}</p>
          </SectionCard>

          <SectionCard title="Edit delivery details">
            <StepEditor projectId={projectId} step="delivery" data={project.delivery} expectedUpdatedAt={project.updated_at} />
          </SectionCard>
        </div>

        <div className="space-y-4">
          <SectionCard title="Approval checklist">
            <ul className="space-y-2">
              {CHECKLIST.map((c) => (
                <li key={c} className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={checked[c] ?? false}
                    onChange={(e) => toggle(c, e.target.checked)}
                    className="mt-1"
                  />
                  <span className="text-ink/80">{c}</span>
                </li>
              ))}
            </ul>
            {persistChecklist.isPending && (
              <div className="mt-2 text-[11px] text-ink/50">Saving…</div>
            )}
          </SectionCard>

          <SectionCard title="Approval confirmation">
            {alreadySent ? (
              <div className="flex items-center gap-2 text-[#1f6b3b] text-sm">
                <CheckCircle2 className="w-4 h-4" /> Sent {new Date(d.sent_at!).toLocaleString()}
                {d.sent_by_email ? <span className="text-ink/50 text-xs">by {d.sent_by_email}</span> : null}
              </div>
            ) : allChecked ? (
              <div className="flex items-center gap-2 text-[#1f6b3b] text-sm">
                <CheckCircle2 className="w-4 h-4" /> Ready to send.
              </div>
            ) : (
              <div className="text-sm text-ink/60">Complete the checklist to enable sending.</div>
            )}

            {!alreadySent && (
              <label className="flex items-start gap-2 text-sm text-ink/80 mt-3">
                <input
                  type="checkbox"
                  checked={confirmedSend}
                  onChange={(e) => setConfirmedSend(e.target.checked)}
                  className="mt-1 accent-royal"
                />
                <span>I confirm the approved roadmap is ready for the client.</span>
              </label>
            )}

            {canSendDelivery ? (
              <button
                disabled={alreadySent || !allChecked || !confirmedSend || sendMut.isPending}
                onClick={() => sendMut.mutate()}
                className="mt-3 w-full inline-flex items-center justify-center gap-2 bg-ink text-white text-sm rounded-md px-3 py-2 hover:bg-ink/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sendMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {alreadySent ? "Already sent" : "Send approved roadmap"}
              </button>
            ) : (
              <div className="mt-3">
                <OperatorLockNotice message={adminOnlyReason} />
              </div>
            )}

            {error && (
              <div className="mt-2 rounded-md border border-[#f3ced5] bg-[#fbe9ec] text-[#a4283c] text-xs px-3 py-2">
                {error}
              </div>
            )}
            {sendMut.isSuccess && (
              <div className="mt-2 rounded-md border border-[#c4e6d2] bg-[#e6f5ec] text-[#1f6b3b] text-xs px-3 py-2">
                Sent. Delivery Room has been updated.
              </div>
            )}
          </SectionCard>

          {alreadySent && <ExecutionHandoffCard projectId={projectId} />}
          {alreadySent && <ClientFeedbackCard projectId={projectId} delivery={d} />}
          <MarkCompleteCard projectId={projectId} />
        </div>
      </div>
    </div>
  );
}

function ExecutionHandoffCard({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const stateFn = useServerFn(getPortalHandoffState);
  const startFn = useServerFn(startExecutionEngagement);
  const flagFn = useServerFn(markPortalFollowUpNeeded);
  const [flagReason, setFlagReason] = useState("");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["engine", "portal-handoff", projectId],
    queryFn: () => stateFn({ data: { projectId } }),
    refetchInterval: (q) => {
      const d = q.state.data as { portalStatus?: string | null } | undefined;
      return d?.portalStatus === "engagement_active" ? false : 30_000;
    },
    refetchOnWindowFocus: true,
  });

  const start = useMutation({
    mutationFn: () => startFn({ data: { projectId } }),
    onSuccess: async () => {
      await Promise.all([
        refetch(),
        qc.invalidateQueries({ queryKey: ["engine"] }),
      ]);
    },
  });

  const flag = useMutation({
    mutationFn: (reason: string) => {
      const portalProjectId = (data as { portalProjectId?: string | null } | undefined)
        ?.portalProjectId;
      if (!portalProjectId) throw new Error("No linked portal workspace.");
      return flagFn({ data: { projectId: portalProjectId, reason } });
    },
    onSuccess: () => {
      setFlagReason("");
    },
  });


  if (isLoading || !data) {
    return (
      <SectionCard title="Execution handoff">
        <div className="text-sm text-ink/50 flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking client status…
        </div>
      </SectionCard>
    );
  }

  const acked = !!data.acknowledgedAt;
  const started = data.portalStatus === "engagement_active";

  return (
    <SectionCard title="Execution handoff">
      <ul className="space-y-1.5 text-sm">
        <li className="flex items-center gap-2 text-ink/80">
          {data.viewedAt ? <CheckCircle2 className="w-4 h-4 text-[#1f6b3b]" /> : <Clock className="w-4 h-4 text-ink/30" />}
          <span>Client viewed roadmap {data.viewedAt ? `· ${new Date(data.viewedAt).toLocaleString()}` : "· pending"}</span>
        </li>
        <li className="flex items-center gap-2 text-ink/80">
          {data.downloadedAt ? <CheckCircle2 className="w-4 h-4 text-[#1f6b3b]" /> : <Clock className="w-4 h-4 text-ink/30" />}
          <span>Client downloaded {data.downloadedAt ? `· ${new Date(data.downloadedAt).toLocaleString()}` : "· pending"}</span>
        </li>
        <li className="flex items-center gap-2 text-ink/80">
          {acked ? <CheckCircle2 className="w-4 h-4 text-[#1f6b3b]" /> : <Clock className="w-4 h-4 text-ink/30" />}
          <span>
            Client acknowledged{" "}
            {acked
              ? `· ${new Date(data.acknowledgedAt!).toLocaleString()}${data.acknowledgedByEmail ? ` (${data.acknowledgedByEmail})` : ""}`
              : "· pending"}
          </span>
        </li>
      </ul>

      <div className="mt-4 pt-4 border-t border-border">
        {started ? (
          <div className="flex items-center gap-2 text-sm text-[#1f6b3b]">
            <Rocket className="w-4 h-4" /> Engagement is active in the client portal.
          </div>
        ) : (
          <>
            <button
              disabled={!acked || start.isPending}
              onClick={() => start.mutate()}
              className="inline-flex items-center gap-2 bg-ink text-white text-sm rounded-md px-3 py-2 hover:bg-ink/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {start.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
              Start engagement
            </button>
            {!acked && (
              <div className="mt-2 text-xs text-ink/50">
                Enabled once the client acknowledges their roadmap.
              </div>
            )}
            {start.isError && (
              <div className="mt-2 rounded-md border border-[#f3ced5] bg-[#fbe9ec] text-[#a4283c] text-xs px-3 py-2">
                {(start.error as Error).message}
              </div>
            )}
          </>
        )}
      </div>

      <div className="mt-4 pt-4 border-t border-border">
        <div className="text-xs font-medium text-ink/70 uppercase tracking-wider mb-2">
          Flag follow-up for client
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={flagReason}
            onChange={(e) => setFlagReason(e.target.value)}
            placeholder="What do you need from the client?"
            className="flex-1 rounded-md border border-border bg-card px-3 py-2 text-sm"
            maxLength={500}
          />
          <button
            type="button"
            disabled={flag.isPending || flagReason.trim().length === 0}
            onClick={() => flag.mutate(flagReason.trim())}
            className="inline-flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 hover:bg-amber-100 disabled:opacity-50"
          >
            {flag.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            Flag follow-up
          </button>
        </div>
        {flag.isSuccess && (
          <div className="mt-2 text-xs text-[#1f6b3b]">
            Client notified in portal Messages.
          </div>
        )}
        {flag.isError && (
          <div className="mt-2 text-xs text-[#a4283c]">
            {(flag.error as Error).message}
          </div>
        )}
      </div>
    </SectionCard>
  );
}


function MarkCompleteCard({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const { isAdmin, adminOnlyReason } = useEngineRole();
  const stateFn = useServerFn(getProjectCompletionState);
  const completeFn = useServerFn(completeProject);

  const q = useQuery({
    queryKey: ["engine", "completion", projectId],
    queryFn: () => stateFn({ data: { projectId } }),
  });

  const mut = useMutation({
    mutationFn: () => completeFn({ data: { projectId } }),
    onSuccess: async () => {
      toast.success("Project marked complete");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["engine", "completion", projectId] }),
        qc.invalidateQueries({ queryKey: ["engine"] }),
      ]);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const completed = !!q.data?.completedAt;

  return (
    <SectionCard title="Project completion">
      {q.isLoading ? (
        <div className="text-sm text-ink/50 flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
        </div>
      ) : completed ? (
        <div className="flex items-start gap-2 text-sm text-[#1f6b3b]">
          <CheckCircle2 className="w-4 h-4 mt-0.5" />
          <div>
            <div className="font-medium">Completed</div>
            <div className="text-xs text-ink/60">
              {new Date(q.data!.completedAt!).toLocaleString()}
              {q.data?.completedByEmail ? ` by ${q.data.completedByEmail}` : ""}
            </div>
          </div>
        </div>
      ) : !isAdmin ? (
        <OperatorLockNotice message={adminOnlyReason} />
      ) : (
        <>
          <p className="text-xs text-ink/60 mb-3">
            Marks the project complete. Requires an approved roadmap version. This action cannot be undone.
          </p>
          <button
            disabled={mut.isPending}
            onClick={() => {
              if (
                !window.confirm(
                  "This will mark the project as complete. This action cannot be undone.",
                )
              )
                return;
              mut.mutate();
            }}
            className="inline-flex items-center gap-2 rounded-md bg-ink text-white text-sm px-3 py-2 hover:bg-ink/90 disabled:opacity-50"
          >
            {mut.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CheckSquare className="w-4 h-4" />
            )}
            Mark project complete
          </button>
        </>
      )}
    </SectionCard>
  );
}

function ClientFeedbackCard({
  projectId,
  delivery,
}: {
  projectId: string;
  delivery: {
    client_rating?: number;
    client_feedback?: string;
    client_feedback_date?: string;
    client_feedback_recorded_at?: string;
    client_feedback_recorded_by?: string;
  };
}) {
  const qc = useQueryClient();
  const { canEdit, editDeniedReason } = useEngineRole();
  const saveFn = useServerFn(saveClientFeedback);

  const [rating, setRating] = useState<number>(delivery.client_rating ?? 0);
  const [feedback, setFeedback] = useState<string>(delivery.client_feedback ?? "");
  const [feedbackDate, setFeedbackDate] = useState<string>(
    delivery.client_feedback_date ?? new Date().toISOString().slice(0, 10),
  );

  useEffect(() => {
    setRating(delivery.client_rating ?? 0);
    setFeedback(delivery.client_feedback ?? "");
    setFeedbackDate(delivery.client_feedback_date ?? new Date().toISOString().slice(0, 10));
  }, [delivery.client_rating, delivery.client_feedback, delivery.client_feedback_date]);

  const mut = useMutation({
    mutationFn: () =>
      saveFn({
        data: { projectId, rating, feedback, feedbackDate },
      }),
    onSuccess: async () => {
      toast.success("Client feedback saved");
      await qc.invalidateQueries({ queryKey: ["engine"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <SectionCard title="Client feedback (manual entry)">
      <p className="text-[11px] text-ink/50 mb-3">
        Operator-entered. Not client-facing. Not sent to the client.
      </p>

      <div className="mb-3">
        <div className="text-[10px] font-mono uppercase tracking-widest text-ink/50 mb-1">
          Rating
        </div>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => canEdit && setRating(n)}
              disabled={!canEdit}
              className="p-0.5 disabled:cursor-not-allowed"
              aria-label={`${n} star${n === 1 ? "" : "s"}`}
            >
              <Star
                className={`w-5 h-5 ${
                  n <= rating ? "text-amber-400 fill-amber-400" : "text-ink/20"
                }`}
              />
            </button>
          ))}
          <span className="ml-2 text-xs text-ink/60">{rating || "—"}/5</span>
        </div>
      </div>

      <div className="mb-3">
        <label className="block text-[10px] font-mono uppercase tracking-widest text-ink/50 mb-1">
          Feedback date
        </label>
        <input
          type="date"
          value={feedbackDate}
          onChange={(e) => setFeedbackDate(e.target.value)}
          disabled={!canEdit}
          className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-sm"
        />
      </div>

      <div className="mb-3">
        <label className="block text-[10px] font-mono uppercase tracking-widest text-ink/50 mb-1">
          Feedback
        </label>
        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          rows={4}
          disabled={!canEdit}
          maxLength={4000}
          placeholder="What did the client say?"
          className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-sm"
        />
      </div>

      {canEdit ? (
        <button
          type="button"
          disabled={rating < 1 || mut.isPending}
          onClick={() => mut.mutate()}
          className="inline-flex items-center gap-2 rounded-md bg-ink text-white text-sm px-3 py-2 hover:bg-ink/90 disabled:opacity-50"
        >
          {mut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save feedback
        </button>
      ) : (
        <OperatorLockNotice message={editDeniedReason} />
      )}

      {delivery.client_feedback_recorded_at && (
        <div className="mt-3 text-[10px] text-ink/50">
          Last saved {new Date(delivery.client_feedback_recorded_at).toLocaleString()}
          {delivery.client_feedback_recorded_by
            ? ` by ${delivery.client_feedback_recorded_by}`
            : ""}
        </div>
      )}
    </SectionCard>
  );
}
