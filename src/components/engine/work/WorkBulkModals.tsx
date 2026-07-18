import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, PlayCircle, History, AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  resumePausedWork,
  bulkReassignWorkItems,
  bulkResolveBlockers,
  listWorkItemAuditTrail,
  listPausedWork,
  type PausedWorkRow,
  type WorkAuditEvent,
} from "@/lib/engine-work-actions.functions";

function useInvalidateWork(projectId: string) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["engine", "work", projectId] });
    qc.invalidateQueries({ queryKey: ["engine", "paused-work", projectId] });
    qc.invalidateQueries({ queryKey: ["engine", "work-evidence", projectId] });
    qc.invalidateQueries({ queryKey: ["ops", "notifications"] });
  };
}

// ===================== Paused Work Banner =====================

export function PausedWorkBanner({
  projectId,
  isAdmin,
}: {
  projectId: string;
  isAdmin: boolean;
}) {
  const fetchPaused = useServerFn(listPausedWork);
  const { data } = useQuery({
    queryKey: ["engine", "paused-work", projectId],
    queryFn: () => fetchPaused({ data: { projectId } }),
    refetchInterval: 30000,
  });
  const [open, setOpen] = useState(false);
  const rows = (data ?? []) as PausedWorkRow[];
  if (rows.length === 0) return null;

  return (
    <>
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <div className="font-semibold text-amber-900">
                {rows.length} task{rows.length === 1 ? "" : "s"} paused by packet compare
              </div>
              <Badge variant="outline" className="border-amber-400 text-amber-800">
                Awaiting change assessment
              </Badge>
            </div>
            <p className="mt-1 text-sm text-amber-800">
              Downstream build is halted until a scope-change assessment is approved.
            </p>
            <ul className="mt-2 space-y-1 text-sm text-amber-900">
              {rows.slice(0, 4).map((r) => (
                <li key={r.task_id} className="flex flex-wrap gap-x-2">
                  <span className="font-medium">{r.name}</span>
                  <span className="text-amber-700">— {r.reason}</span>
                </li>
              ))}
              {rows.length > 4 && (
                <li className="text-xs text-amber-700">+{rows.length - 4} more</li>
              )}
            </ul>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="border-amber-400 bg-white text-amber-900 hover:bg-amber-100"
            disabled={!isAdmin}
            onClick={() => setOpen(true)}
          >
            <PlayCircle className="mr-1.5 h-4 w-4" />
            Resume
          </Button>
        </div>
      </div>
      <ResumePausedWorkModal
        open={open}
        onOpenChange={setOpen}
        projectId={projectId}
        rows={rows}
      />
    </>
  );
}

export function ResumePausedWorkModal({
  open,
  onOpenChange,
  projectId,
  rows,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projectId: string;
  rows: PausedWorkRow[];
}) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(rows.map((r) => r.task_id)),
  );
  const [note, setNote] = useState("");
  const [approved, setApproved] = useState(false);
  const invalidate = useInvalidateWork(projectId);
  const resumeFn = useServerFn(resumePausedWork);
  const mutation = useMutation({
    mutationFn: (input: { taskIds: string[]; note: string }) =>
      resumeFn({
        data: {
          taskIds: input.taskIds,
          note: input.note,
          changeAssessmentApproved: true,
        },
      }),
    onSuccess: (res) => {
      toast.success(`Resumed ${res.resumed} task${res.resumed === 1 ? "" : "s"}`);
      invalidate();
      onOpenChange(false);
      setNote("");
      setApproved(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to resume"),
  });

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Resume paused work</DialogTitle>
          <DialogDescription>
            Confirm the change assessment has been approved, then resume the affected tasks.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="max-h-64 space-y-2 overflow-y-auto rounded-md border p-3">
            {rows.map((r) => (
              <label
                key={r.task_id}
                className="flex cursor-pointer items-start gap-2 text-sm"
              >
                <Checkbox
                  checked={selected.has(r.task_id)}
                  onCheckedChange={() => toggle(r.task_id)}
                />
                <div className="flex-1">
                  <div className="font-medium">{r.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {r.milestone_name ?? "—"} · {r.reason}
                  </div>
                </div>
              </label>
            ))}
          </div>
          <div>
            <Label htmlFor="resume-note">Resume note (required)</Label>
            <Textarea
              id="resume-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Change assessment CA-123 approved by client on 2026-07-18…"
              rows={3}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={approved}
              onCheckedChange={(c) => setApproved(c === true)}
            />
            I confirm the change assessment has been approved.
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={
              !approved ||
              note.trim().length < 3 ||
              selected.size === 0 ||
              mutation.isPending
            }
            onClick={() =>
              mutation.mutate({ taskIds: [...selected], note: note.trim() })
            }
          >
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Resume {selected.size} task{selected.size === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ===================== Bulk Reassign =====================

export function BulkReassignModal({
  open,
  onOpenChange,
  projectId,
  taskIds,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projectId: string;
  taskIds: string[];
}) {
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerType, setOwnerType] = useState<"agent" | "human">("human");
  const [reason, setReason] = useState("");
  const invalidate = useInvalidateWork(projectId);
  const fn = useServerFn(bulkReassignWorkItems);
  const mutation = useMutation({
    mutationFn: () =>
      fn({
        data: {
          taskIds,
          newOwnerEmail: ownerEmail.trim() || null,
          ownerType,
          reason: reason.trim(),
        },
      }),
    onSuccess: (res) => {
      toast.success(`Reassigned ${res.updated} task${res.updated === 1 ? "" : "s"}`);
      invalidate();
      onOpenChange(false);
      setOwnerEmail("");
      setReason("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Bulk reassign failed"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bulk reassign {taskIds.length} task{taskIds.length === 1 ? "" : "s"}</DialogTitle>
          <DialogDescription>
            One owner change and reason applied to every selected work item.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Owner type</Label>
            <Select value={ownerType} onValueChange={(v) => setOwnerType(v as "agent" | "human")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="human">Human</SelectItem>
                <SelectItem value="agent">Agent</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="bulk-owner">New owner email (blank = unassign)</Label>
            <Input
              id="bulk-owner"
              type="email"
              value={ownerEmail}
              onChange={(e) => setOwnerEmail(e.target.value)}
              placeholder="owner@example.com"
            />
          </div>
          <div>
            <Label htmlFor="bulk-reason">Reason (required)</Label>
            <Textarea
              id="bulk-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={reason.trim().length < 3 || mutation.isPending || taskIds.length === 0}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Reassign {taskIds.length}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ===================== Bulk Resolve Blockers =====================

export function BulkResolveBlockersModal({
  open,
  onOpenChange,
  projectId,
  reviewItemIds,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projectId: string;
  reviewItemIds: string[];
}) {
  const [resolution, setResolution] = useState<"resolved" | "wont_fix" | "escalated">(
    "resolved",
  );
  const [note, setNote] = useState("");
  const invalidate = useInvalidateWork(projectId);
  const fn = useServerFn(bulkResolveBlockers);
  const mutation = useMutation({
    mutationFn: () =>
      fn({ data: { reviewItemIds, resolution, note: note.trim() } }),
    onSuccess: (res) => {
      toast.success(`Resolved ${res.updated} blocker${res.updated === 1 ? "" : "s"}`);
      invalidate();
      onOpenChange(false);
      setNote("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Bulk resolve failed"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bulk resolve {reviewItemIds.length} blocker{reviewItemIds.length === 1 ? "" : "s"}</DialogTitle>
          <DialogDescription>
            One resolution and note applied to every selected blocker.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Resolution</Label>
            <Select value={resolution} onValueChange={(v) => setResolution(v as typeof resolution)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="wont_fix">Won't fix (admin)</SelectItem>
                <SelectItem value="escalated">Escalated (admin)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="bulk-note">Note (required)</Label>
            <Textarea
              id="bulk-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={note.trim().length < 3 || mutation.isPending || reviewItemIds.length === 0}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Apply to {reviewItemIds.length}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ===================== Work Audit Trail =====================

const KIND_LABEL: Record<string, string> = {
  "work.reassigned": "Reassigned",
  "work.created": "Created",
  "work.paused": "Paused",
  "work.resumed": "Resumed",
  "blocker.resolved": "Blocker resolved",
  "evidence.submitted": "Evidence submitted",
  "evidence.accepted": "Evidence accepted",
  "evidence.rejected": "Evidence rejected",
  "packet.scope_drift": "Scope drift",
  "packet.compare": "Packet compare",
};

function kindTone(kind: string, severity: string | null): string {
  if (severity === "warn" || kind.includes("rejected") || kind.includes("paused") || kind.includes("drift"))
    return "border-amber-300 bg-amber-50 text-amber-900";
  if (kind.includes("accepted") || kind.includes("resolved") || kind.includes("resumed"))
    return "border-emerald-300 bg-emerald-50 text-emerald-900";
  return "border-slate-200 bg-slate-50 text-slate-800";
}

export function WorkAuditTrailModal({
  open,
  onOpenChange,
  projectId,
  taskId,
  taskName,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projectId: string;
  taskId: string;
  taskName: string;
}) {
  const fetchTrail = useServerFn(listWorkItemAuditTrail);
  const { data, isLoading } = useQuery({
    queryKey: ["engine", "work-audit", projectId, taskId],
    queryFn: () => fetchTrail({ data: { projectId, taskId } }),
    enabled: open,
  });
  const events = (data ?? []) as WorkAuditEvent[];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Audit trail — {taskName}
          </DialogTitle>
          <DialogDescription>
            Every reassignment, blocker resolution, evidence review, pause, and packet compare tied to this work item.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading history…
            </div>
          ) : events.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">
              No recorded events yet. Actions taken from this point forward will appear here.
            </div>
          ) : (
            <ol className="relative space-y-3 border-l border-slate-200 pl-4">
              {events.map((e) => (
                <li key={e.id} className="relative">
                  <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-slate-400" />
                  <div className={`rounded-md border p-3 ${kindTone(e.kind, e.severity)}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium">{e.title}</div>
                      <Badge variant="outline" className="text-[10px]">
                        {KIND_LABEL[e.kind] ?? e.kind}
                      </Badge>
                    </div>
                    {e.body && <div className="mt-1 text-sm">{e.body}</div>}
                    <div className="mt-1 text-xs text-muted-foreground">
                      {new Date(e.created_at).toLocaleString()} · {e.actor_email ?? "system"}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
