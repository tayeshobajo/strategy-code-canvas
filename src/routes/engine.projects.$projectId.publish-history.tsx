/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { History, RotateCcw, Undo2, ArchiveRestore } from "lucide-react";
import { SectionCard } from "@/components/engine/primitives";
import { getProjectPortalLink } from "@/lib/engine-ops.functions";
import {
  getPortalPublicationHistory,
  rollbackPortalPublication,
  retractPortalPublication,
  restorePortalPublication,
  type PortalPublicationHistoryEvent,
} from "@/lib/portal-publication.functions";

export const Route = createFileRoute("/engine/projects/$projectId/publish-history")({
  component: PublishHistoryPage,
  errorComponent: ({ error }) => (
    <div className="text-red-700 text-sm">Failed: {(error as Error).message}</div>
  ),
});

function fmt(ts: string | null | undefined) {
  if (!ts) return "—";
  try { return new Date(ts).toLocaleString(); } catch { return ts; }
}

function eventBadge(type: string) {
  const map: Record<string, string> = {
    published:   "bg-[#e6f5ec] text-[#1f6b3b] border-[#c4e6d2]",
    superseded:  "bg-[#f2f2f2] text-[#3a3a3a] border-[#dcdcdc]",
    rolled_back: "bg-[#fff3cd] text-[#8a6d3b] border-[#f6e0a3]",
    retracted:   "bg-[#fdecea] text-[#8a1c13] border-[#f5b4ab]",
    restored:    "bg-[#e6f0fa] text-[#1e4a82] border-[#b8d1f0]",
    acknowledged:"bg-[#eef0ff] text-[#3a3e91] border-[#c3c8f2]",
  };
  const cls = map[type] ?? "bg-white text-ink/70 border-border";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}>
      {type}
    </span>
  );
}

function PublishHistoryPage() {
  const { projectId } = Route.useParams();
  const qc = useQueryClient();

  const linkFn = useServerFn(getProjectPortalLink);
  const link = useQuery({
    queryKey: ["engine", "portal-link", projectId],
    queryFn: () => linkFn({ data: { projectId } }),
  });
  const portalProjectId: string | null = link.data?.linked_portal_project_id ?? null;

  const historyFn = useServerFn(getPortalPublicationHistory);
  const history = useQuery({
    queryKey: ["engine", "publish-history", portalProjectId],
    queryFn: () =>
      portalProjectId
        ? historyFn({ data: { portalProjectId } })
        : Promise.resolve([] as PortalPublicationHistoryEvent[]),
    enabled: !!portalProjectId,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["engine", "publish-history", portalProjectId] });
  };

  const rollbackFn = useServerFn(rollbackPortalPublication);
  const retractFn = useServerFn(retractPortalPublication);
  const restoreFn = useServerFn(restorePortalPublication);

  const rollbackMut = useMutation({
    mutationFn: (v: { targetRoadmapId: string; reason: string }) =>
      rollbackFn({ data: { portalProjectId: portalProjectId!, ...v } }),
    onSuccess: () => { toast.success("Rolled back to previous publication."); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const retractMut = useMutation({
    mutationFn: (v: { portalRoadmapId: string; reason: string }) => retractFn({ data: v }),
    onSuccess: () => { toast.success("Publication retracted."); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const restoreMut = useMutation({
    mutationFn: (v: { portalRoadmapId: string; reason: string }) => restoreFn({ data: v }),
    onSuccess: () => { toast.success("Publication restored."); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const events = (history.data ?? []) as PortalPublicationHistoryEvent[];
  const currentPublished = useMemo(
    () => events.find((e) => e.roadmap_status === "published"),
    [events],
  );

  if (!portalProjectId) {
    return (
      <div className="p-6 space-y-3">
        <h1 className="text-xl font-semibold text-ink">Publish History</h1>
        <p className="text-sm text-ink/70">
          This engine project isn't linked to a client portal project yet. Link one first
          on the Delivery page.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2">
        <History className="w-5 h-5 text-ink/70" />
        <h1 className="text-xl font-semibold text-ink">Publish History</h1>
      </div>

      <SectionCard title="Current live publication">
        {currentPublished ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium text-ink">{currentPublished.roadmap_title ?? "Untitled"}</span>
              <span className="text-ink/60">{currentPublished.roadmap_version_label ?? ""}</span>
              {eventBadge("published")}
            </div>
            <div className="text-xs text-ink/60">
              Published {fmt(currentPublished.roadmap_published_at)}
            </div>
            <RetractControl
              roadmapId={currentPublished.portal_roadmap_id!}
              pending={retractMut.isPending}
              onSubmit={(reason) => retractMut.mutate({
                portalRoadmapId: currentPublished.portal_roadmap_id!, reason,
              })}
            />
          </div>
        ) : (
          <div className="text-sm text-ink/70">No live publication.</div>
        )}
      </SectionCard>

      <SectionCard title="Publication timeline">
        {history.isLoading ? (
          <div className="text-sm text-ink/60">Loading…</div>
        ) : events.length === 0 ? (
          <div className="text-sm text-ink/60">No publish events yet.</div>
        ) : (
          <ul className="divide-y divide-border">
            {events.map((e) => (
              <li key={e.event_id} className="py-3 flex items-start gap-3">
                <div className="pt-0.5">{eventBadge(e.event_type)}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-ink flex items-center gap-2">
                    <span className="font-medium">{e.roadmap_title ?? "—"}</span>
                    <span className="text-ink/60 text-xs">{e.roadmap_version_label ?? ""}</span>
                  </div>
                  <div className="text-xs text-ink/60">
                    {fmt(e.created_at)} · {e.actor_email ?? "system"}
                  </div>
                  {e.summary && <div className="text-xs text-ink/70 mt-1">{e.summary}</div>}
                </div>
                <div className="flex flex-col gap-1 items-end">
                  {e.roadmap_status === "superseded" && e.portal_roadmap_id && (
                    <RollbackControl
                      roadmapId={e.portal_roadmap_id}
                      pending={rollbackMut.isPending}
                      onSubmit={(reason) => rollbackMut.mutate({
                        targetRoadmapId: e.portal_roadmap_id!, reason,
                      })}
                    />
                  )}
                  {e.roadmap_status === "retracted" && e.portal_roadmap_id && (
                    <RestoreControl
                      roadmapId={e.portal_roadmap_id}
                      pending={restoreMut.isPending}
                      onSubmit={(reason) => restoreMut.mutate({
                        portalRoadmapId: e.portal_roadmap_id!, reason,
                      })}
                    />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

function ReasonAction({
  icon, label, pending, onSubmit, tone,
}: {
  icon: React.ReactNode; label: string; pending: boolean; tone: "warn" | "danger" | "info";
  onSubmit: (reason: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const toneCls =
    tone === "danger" ? "border-[#f5b4ab] text-[#8a1c13] hover:bg-[#fdecea]" :
    tone === "info"   ? "border-[#b8d1f0] text-[#1e4a82] hover:bg-[#e6f0fa]" :
                        "border-[#f6e0a3] text-[#8a6d3b] hover:bg-[#fff3cd]";
  return open ? (
    <div className="flex flex-col gap-1 items-end">
      <input
        className="text-xs border border-border rounded px-2 py-1 w-56"
        placeholder="Reason (required)"
        value={reason} onChange={(e) => setReason(e.target.value)}
      />
      <div className="flex gap-1">
        <button
          className={`text-xs px-2 py-1 rounded border ${toneCls}`}
          disabled={pending || !reason.trim()}
          onClick={() => { onSubmit(reason.trim()); setOpen(false); setReason(""); }}
        >{pending ? "Working…" : "Confirm"}</button>
        <button
          className="text-xs px-2 py-1 rounded border border-border text-ink/70 hover:bg-paper-soft"
          onClick={() => { setOpen(false); setReason(""); }}
        >Cancel</button>
      </div>
    </div>
  ) : (
    <button
      className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded border ${toneCls}`}
      onClick={() => setOpen(true)}
    >{icon}{label}</button>
  );
}

function RollbackControl(p: { roadmapId: string; pending: boolean; onSubmit: (r: string) => void }) {
  return <ReasonAction icon={<Undo2 className="w-3 h-3" />} label="Rollback to this" tone="warn" pending={p.pending} onSubmit={p.onSubmit} />;
}
function RetractControl(p: { roadmapId: string; pending: boolean; onSubmit: (r: string) => void }) {
  return <ReasonAction icon={<RotateCcw className="w-3 h-3" />} label="Retract" tone="danger" pending={p.pending} onSubmit={p.onSubmit} />;
}
function RestoreControl(p: { roadmapId: string; pending: boolean; onSubmit: (r: string) => void }) {
  return <ReasonAction icon={<ArchiveRestore className="w-3 h-3" />} label="Restore" tone="info" pending={p.pending} onSubmit={p.onSubmit} />;
}
