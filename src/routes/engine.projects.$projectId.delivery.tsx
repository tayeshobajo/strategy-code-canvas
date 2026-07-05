import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Send, CheckCircle2, Loader2, Rocket, Clock } from "lucide-react";
import { useWorkspace } from "@/hooks/use-workspace";
import { SectionCard } from "@/components/engine/primitives";
import { StepEditor } from "@/components/engine/StepEditor";
import { StepStateBar, SourceEvidence } from "@/components/engine/StepState";
import { OperatorLockNotice } from "@/components/engine/OperatorLockNotice";
import { useEngineRole } from "@/hooks/useEngineRole";
import {
  sendProjectDelivery,
  saveDeliveryChecklist,
  getPortalHandoffState,
  startExecutionEngagement,
} from "@/lib/engine-execution.functions";
import { markPortalFollowUpNeeded } from "@/lib/portal.functions";


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
            <StepEditor projectId={projectId} step="delivery" data={project.delivery} />
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


