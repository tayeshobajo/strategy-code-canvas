import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Plus, X, ArrowRight } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  reassignWorkItem,
  resolveBlocker,
  createWorkItem,
  compareBuildPackets,
  uploadWorkEvidence,
  reviewWorkEvidence,
  listMilestonesForWork,
  listPacketsForMilestone,
  listWorkEvidenceForProject,
  type WorkEvidenceRow,
  type PacketCompareResult,
} from "@/lib/engine-work-actions.functions";

type Fn<I, O> = (input: { data: I }) => Promise<O>;

function useInvalidate(projectId: string) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["engine", "work", projectId] });
    qc.invalidateQueries({ queryKey: ["engine", "work-evidence", projectId] });
  };
}

// ===================== Reassign =====================

export function ReassignWorkItemModal({
  open,
  onOpenChange,
  projectId,
  taskId,
  taskName,
  currentOwner,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projectId: string;
  taskId: string;
  taskName: string;
  currentOwner: string | null;
}) {
  const invalidate = useInvalidate(projectId);
  const fn = useServerFn(reassignWorkItem) as Fn<
    {
      taskId: string;
      newOwnerEmail: string | null;
      ownerType: "human" | "agent";
      reason: string;
    },
    { ok: true }
  >;
  const [owner, setOwner] = useState(currentOwner ?? "");
  const [ownerType, setOwnerType] = useState<"human" | "agent">("human");
  const [reason, setReason] = useState("");
  const m = useMutation({
    mutationFn: () =>
      fn({
        data: {
          taskId,
          newOwnerEmail: owner.trim() || null,
          ownerType,
          reason: reason.trim(),
        },
      }),
    onSuccess: () => {
      toast.success("Owner updated");
      invalidate();
      onOpenChange(false);
      setReason("");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reassign work item</DialogTitle>
          <DialogDescription className="truncate">{taskName}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="rw-owner">Owner email (leave blank to unassign)</Label>
            <Input
              id="rw-owner"
              placeholder="owner@company.com"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              maxLength={320}
            />
          </div>
          <div>
            <Label>Owner type</Label>
            <Select value={ownerType} onValueChange={(v) => setOwnerType(v as "human" | "agent")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="human">Human</SelectItem>
                <SelectItem value="agent">Agent</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="rw-reason">Reason (required, saved to audit trail)</Label>
            <Textarea
              id="rw-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="Why is this changing?"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => m.mutate()}
            disabled={m.isPending || reason.trim().length < 3}
          >
            {m.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ===================== Resolve blocker =====================

export function ResolveBlockerModal({
  open,
  onOpenChange,
  projectId,
  reviewItemId,
  title,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projectId: string;
  reviewItemId: string;
  title: string;
}) {
  const invalidate = useInvalidate(projectId);
  const fn = useServerFn(resolveBlocker) as Fn<
    { reviewItemId: string; resolution: "resolved" | "wont_fix" | "escalated"; note: string },
    { ok: true }
  >;
  const [resolution, setResolution] = useState<"resolved" | "wont_fix" | "escalated">("resolved");
  const [note, setNote] = useState("");
  const m = useMutation({
    mutationFn: () => fn({ data: { reviewItemId, resolution, note: note.trim() } }),
    onSuccess: () => {
      toast.success("Blocker closed");
      invalidate();
      onOpenChange(false);
      setNote("");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Resolve blocker</DialogTitle>
          <DialogDescription className="truncate">{title}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Resolution</Label>
            <Select
              value={resolution}
              onValueChange={(v) => setResolution(v as typeof resolution)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="wont_fix">Won&apos;t fix (admin only)</SelectItem>
                <SelectItem value="escalated">Escalated (admin only)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="rb-note">Resolution note</Label>
            <Textarea
              id="rb-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              maxLength={2000}
              placeholder="What was done? Who signed off?"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => m.mutate()}
            disabled={m.isPending || note.trim().length < 3}
          >
            {m.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
            Close blocker
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ===================== Add work =====================

export function AddWorkItemModal({
  open,
  onOpenChange,
  projectId,
  defaultMilestoneId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projectId: string;
  defaultMilestoneId?: string | null;
}) {
  const invalidate = useInvalidate(projectId);
  const listFn = useServerFn(listMilestonesForWork) as Fn<
    { projectId: string },
    Array<{ id: string; name: string; phase: string | null }>
  >;
  const createFn = useServerFn(createWorkItem) as Fn<
    {
      projectId: string;
      milestoneId: string;
      name: string;
      purpose: string;
      expectedArtifact: string;
      acceptanceCriteria: string[];
      priority: "critical" | "high" | "medium" | "low";
      ownerEmail?: string | null;
      dueDate?: string | null;
    },
    { ok: true; taskId: string }
  >;
  const milestonesQ = useQuery(
    queryOptions({
      queryKey: ["engine", "work", "milestones", projectId],
      queryFn: () => listFn({ data: { projectId } }),
      enabled: open,
    }),
  );
  const [milestoneId, setMilestoneId] = useState(defaultMilestoneId ?? "");
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [artifact, setArtifact] = useState("");
  const [criteriaText, setCriteriaText] = useState("");
  const [priority, setPriority] = useState<"critical" | "high" | "medium" | "low">("medium");
  const [owner, setOwner] = useState("");
  const [dueDate, setDueDate] = useState("");

  const criteria = useMemo(
    () => criteriaText.split("\n").map((l) => l.trim()).filter(Boolean),
    [criteriaText],
  );

  const m = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          projectId,
          milestoneId,
          name: name.trim(),
          purpose: purpose.trim(),
          expectedArtifact: artifact.trim(),
          acceptanceCriteria: criteria,
          priority,
          ownerEmail: owner.trim() || null,
          dueDate: dueDate || null,
        },
      }),
    onSuccess: () => {
      toast.success("Work item created");
      invalidate();
      onOpenChange(false);
      setName("");
      setPurpose("");
      setArtifact("");
      setCriteriaText("");
      setOwner("");
      setDueDate("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canSubmit =
    milestoneId && name.trim().length >= 3 && artifact.trim().length >= 3 && criteria.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Add work item</DialogTitle>
          <DialogDescription>
            New tasks must trace to an approved milestone with an artifact and acceptance criteria.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-1">
          <div>
            <Label>Milestone</Label>
            <Select value={milestoneId} onValueChange={setMilestoneId}>
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    milestonesQ.isPending ? "Loading milestones…" : "Select an approved milestone"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {(milestonesQ.data ?? []).map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                    {m.phase ? ` · ${m.phase}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="aw-name">Name</Label>
            <Input
              id="aw-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={200}
              placeholder="What needs to be done?"
            />
          </div>
          <div>
            <Label htmlFor="aw-artifact">Expected artifact</Label>
            <Input
              id="aw-artifact"
              value={artifact}
              onChange={(e) => setArtifact(e.target.value)}
              maxLength={500}
              placeholder="Working feature, doc, report, decision…"
            />
          </div>
          <div>
            <Label htmlFor="aw-criteria">Acceptance criteria (one per line, required)</Label>
            <Textarea
              id="aw-criteria"
              value={criteriaText}
              onChange={(e) => setCriteriaText(e.target.value)}
              rows={4}
              placeholder={"User can log in with Google\nErrors surface a toast\nSession persists"}
            />
            <div className="text-[11px] text-ink/50 mt-1">{criteria.length} criteria</div>
          </div>
          <div>
            <Label htmlFor="aw-purpose">Purpose (optional)</Label>
            <Textarea
              id="aw-purpose"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              rows={2}
              maxLength={2000}
              placeholder="Why does this matter?"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Priority</Label>
              <Select
                value={priority}
                onValueChange={(v) => setPriority(v as typeof priority)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="aw-due">Due date</Label>
              <Input
                id="aw-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="aw-owner">Owner email (optional)</Label>
            <Input
              id="aw-owner"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              maxLength={320}
              placeholder="owner@company.com"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => m.mutate()} disabled={!canSubmit || m.isPending}>
            {m.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Plus className="w-3 h-3 mr-1" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ===================== Compare packets (scope drift) =====================

export function ComparePacketsModal({
  open,
  onOpenChange,
  projectId,
  milestoneId,
  milestoneName,
  isAdmin,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projectId: string;
  milestoneId: string;
  milestoneName: string;
  isAdmin: boolean;
}) {
  const invalidate = useInvalidate(projectId);
  const listFn = useServerFn(listPacketsForMilestone) as Fn<
    { milestoneId: string },
    Array<{ id: string; title: string; status: string; sequence_number: number }>
  >;
  const cmpFn = useServerFn(compareBuildPackets) as Fn<
    { basePacketId: string; candidatePacketId: string; pauseDownstream: boolean },
    PacketCompareResult
  >;
  const packetsQ = useQuery(
    queryOptions({
      queryKey: ["engine", "work", "packets", milestoneId],
      queryFn: () => listFn({ data: { milestoneId } }),
      enabled: open,
    }),
  );
  const [baseId, setBaseId] = useState("");
  const [candId, setCandId] = useState("");
  const [pauseDownstream, setPauseDownstream] = useState(false);
  const [result, setResult] = useState<PacketCompareResult | null>(null);
  const m = useMutation({
    mutationFn: () =>
      cmpFn({
        data: {
          basePacketId: baseId,
          candidatePacketId: candId,
          pauseDownstream: pauseDownstream && isAdmin,
        },
      }),
    onSuccess: (r) => {
      setResult(r);
      if (r.paused_task_ids.length > 0)
        toast.warning(`Paused ${r.paused_task_ids.length} downstream task(s)`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setResult(null);
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Compare build packets</DialogTitle>
          <DialogDescription className="truncate">{milestoneName}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Base (accepted)</Label>
              <Select value={baseId} onValueChange={setBaseId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select base packet" />
                </SelectTrigger>
                <SelectContent>
                  {(packetsQ.data ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      #{p.sequence_number} · {p.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Candidate (proposed)</Label>
              <Select value={candId} onValueChange={setCandId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select candidate packet" />
                </SelectTrigger>
                <SelectContent>
                  {(packetsQ.data ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      #{p.sequence_number} · {p.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {isAdmin ? (
            <label className="flex items-center gap-2 text-xs text-ink/70">
              <input
                type="checkbox"
                checked={pauseDownstream}
                onChange={(e) => setPauseDownstream(e.target.checked)}
              />
              Pause downstream work if scope drift is detected
            </label>
          ) : (
            <p className="text-[11px] text-ink/50">
              Admin required to pause downstream work on drift.
            </p>
          )}
          {result ? <PacketCompareResultView r={result} /> : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            onClick={() => m.mutate()}
            disabled={!baseId || !candId || baseId === candId || m.isPending}
          >
            {m.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
            Compare
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PacketCompareResultView({ r }: { r: PacketCompareResult }) {
  const tone = r.scope_drift
    ? "border-amber-200 bg-amber-50/70"
    : "border-emerald-200 bg-emerald-50/70";
  return (
    <div className={`rounded-md border p-3 text-xs ${tone}`}>
      <div className="flex items-center gap-2">
        <span className="font-medium text-ink">
          {r.scope_drift ? "Scope drift detected" : "No scope drift"}
        </span>
        <span className="text-ink/60">· drift score {r.drift_score}</span>
      </div>
      <div className="mt-2 text-ink/70">
        {r.fields_changed.length} field change{r.fields_changed.length === 1 ? "" : "s"} · +
        {r.criteria_added.length}/-{r.criteria_removed.length} criteria
        {r.paused_task_ids.length > 0
          ? ` · paused ${r.paused_task_ids.length} task(s)`
          : ""}
      </div>
      {r.criteria_added.length > 0 ? (
        <div className="mt-2">
          <div className="text-[10px] uppercase tracking-wider text-emerald-800">Added criteria</div>
          <ul className="list-disc pl-4 text-ink/80">
            {r.criteria_added.map((c) => (
              <li key={`a-${c}`}>{c}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {r.criteria_removed.length > 0 ? (
        <div className="mt-2">
          <div className="text-[10px] uppercase tracking-wider text-red-800">Removed criteria</div>
          <ul className="list-disc pl-4 text-ink/80">
            {r.criteria_removed.map((c) => (
              <li key={`r-${c}`}>{c}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {r.fields_changed.length > 0 ? (
        <div className="mt-2">
          <div className="text-[10px] uppercase tracking-wider text-ink/60">Field changes</div>
          <ul className="text-ink/80 space-y-0.5 mt-0.5">
            {r.fields_changed.slice(0, 8).map((f) => (
              <li key={f.field}>
                <span className="font-mono text-[10px] text-ink/60">{f.field}</span> · {f.drift}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="mt-3 border-t border-black/5 pt-2">
        <div className="text-[10px] uppercase tracking-wider text-ink/60">Captain recommendation</div>
        <div className="text-ink mt-0.5">{r.recommendation}</div>
        <div className="text-ink/60 text-[11px] mt-1">{r.captain_note}</div>
      </div>
    </div>
  );
}

// ===================== Evidence modal =====================

export function WorkEvidenceModal({
  open,
  onOpenChange,
  projectId,
  taskId,
  taskName,
  isAdmin,
  currentUserEmail,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projectId: string;
  taskId: string;
  taskName: string;
  isAdmin: boolean;
  currentUserEmail: string | null;
}) {
  const invalidate = useInvalidate(projectId);
  const qc = useQueryClient();
  const listFn = useServerFn(listWorkEvidenceForProject) as Fn<
    { projectId: string },
    WorkEvidenceRow[]
  >;
  const uploadFn = useServerFn(uploadWorkEvidence) as Fn<
    {
      taskId: string;
      evidenceType: "link" | "screenshot" | "video" | "note" | "artifact";
      title: string;
      summary: string;
      url?: string | null;
    },
    { ok: true; evidenceId: string }
  >;
  const reviewFn = useServerFn(reviewWorkEvidence) as Fn<
    { evidenceId: string; verdict: "accepted" | "rejected"; note: string },
    { ok: true }
  >;
  const evQ = useQuery(
    queryOptions({
      queryKey: ["engine", "work-evidence", projectId],
      queryFn: () => listFn({ data: { projectId } }),
      enabled: open,
    }),
  );
  const taskEvidence = (evQ.data ?? []).filter((e) => e.task_id === taskId);

  const [evType, setEvType] = useState<"link" | "screenshot" | "video" | "note" | "artifact">(
    "link",
  );
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [url, setUrl] = useState("");

  const uploadM = useMutation({
    mutationFn: () =>
      uploadFn({
        data: {
          taskId,
          evidenceType: evType,
          title: title.trim(),
          summary: summary.trim(),
          url: url.trim() ? url.trim() : null,
        },
      }),
    onSuccess: () => {
      toast.success("Evidence submitted");
      qc.invalidateQueries({ queryKey: ["engine", "work-evidence", projectId] });
      invalidate();
      setTitle("");
      setSummary("");
      setUrl("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reviewM = useMutation({
    mutationFn: (args: { evidenceId: string; verdict: "accepted" | "rejected"; note: string }) =>
      reviewFn({ data: args }),
    onSuccess: () => {
      toast.success("Review recorded");
      qc.invalidateQueries({ queryKey: ["engine", "work-evidence", projectId] });
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canSubmit =
    title.trim().length >= 3 && (evType !== "link" || url.trim().length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Evidence — {taskName}</DialogTitle>
          <DialogDescription>
            Attach proof before this task can complete. Reviewers must be a different admin than
            the submitter (no self-approval).
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-ink/50">
              Upload
            </div>
            <div>
              <Label>Type</Label>
              <Select value={evType} onValueChange={(v) => setEvType(v as typeof evType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="link">Link</SelectItem>
                  <SelectItem value="screenshot">Screenshot</SelectItem>
                  <SelectItem value="video">Video</SelectItem>
                  <SelectItem value="note">Note</SelectItem>
                  <SelectItem value="artifact">Artifact</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="ev-title">Title</Label>
              <Input
                id="ev-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
              />
            </div>
            <div>
              <Label htmlFor="ev-url">URL {evType === "link" ? "(required)" : "(optional)"}</Label>
              <Input
                id="ev-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                maxLength={2000}
                placeholder="https://…"
              />
            </div>
            <div>
              <Label htmlFor="ev-summary">Summary</Label>
              <Textarea
                id="ev-summary"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                rows={3}
                maxLength={2000}
              />
            </div>
            <Button
              size="sm"
              onClick={() => uploadM.mutate()}
              disabled={!canSubmit || uploadM.isPending}
            >
              {uploadM.isPending ? (
                <Loader2 className="w-3 h-3 animate-spin mr-1" />
              ) : (
                <Plus className="w-3 h-3 mr-1" />
              )}
              Submit evidence
            </Button>
          </div>
          <div className="space-y-2">
            <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-ink/50">
              Existing ({taskEvidence.length})
            </div>
            <div className="max-h-[50vh] overflow-y-auto space-y-2 pr-1">
              {taskEvidence.length === 0 ? (
                <div className="text-xs text-ink/60">No evidence attached yet.</div>
              ) : (
                taskEvidence.map((e) => (
                  <EvidenceReviewRow
                    key={e.id}
                    ev={e}
                    isAdmin={isAdmin}
                    canReview={
                      isAdmin && !(currentUserEmail && e.created_by_email === currentUserEmail)
                    }
                    onDecision={(verdict, note) =>
                      reviewM.mutate({ evidenceId: e.id, verdict, note })
                    }
                    pending={reviewM.isPending}
                  />
                ))
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EvidenceReviewRow({
  ev,
  isAdmin,
  canReview,
  onDecision,
  pending,
}: {
  ev: WorkEvidenceRow;
  isAdmin: boolean;
  canReview: boolean;
  onDecision: (verdict: "accepted" | "rejected", note: string) => void;
  pending: boolean;
}) {
  const [note, setNote] = useState("");
  const verdictTone =
    ev.verdict === "accepted"
      ? "bg-emerald-100 text-emerald-800"
      : ev.verdict === "rejected"
        ? "bg-red-100 text-red-800"
        : "bg-amber-100 text-amber-900";
  return (
    <div className="rounded-md border border-border bg-white p-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-medium text-ink truncate">{ev.title}</div>
          <div className="text-[10px] text-ink/50">
            {ev.evidence_type} · {ev.created_by_email ?? "unknown"} ·{" "}
            {new Date(ev.created_at).toLocaleString()}
          </div>
        </div>
        <span className={`text-[10px] rounded px-1.5 py-0.5 ${verdictTone}`}>{ev.verdict}</span>
      </div>
      {ev.url ? (
        <a
          href={ev.url}
          target="_blank"
          rel="noreferrer"
          className="text-[11px] text-primary hover:underline break-all inline-flex items-center gap-1"
        >
          {ev.url} <ArrowRight className="w-2.5 h-2.5" />
        </a>
      ) : null}
      {ev.summary ? <div className="text-[11px] text-ink/70 mt-1">{ev.summary}</div> : null}
      {ev.review_note ? (
        <div className="text-[11px] text-ink/60 mt-1">
          Review: {ev.review_note} — {ev.reviewed_by_email}
        </div>
      ) : null}
      {ev.verdict === "pending" && isAdmin ? (
        canReview ? (
          <div className="mt-2 space-y-1.5">
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={2000}
              placeholder="Review note (optional)"
              className="text-xs"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => onDecision("rejected", note.trim())}
                disabled={pending}
              >
                <X className="w-3 h-3 mr-1" />
                Reject
              </Button>
              <Button
                size="sm"
                onClick={() => onDecision("accepted", note.trim())}
                disabled={pending}
              >
                {pending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                Accept
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-[11px] text-amber-800 mt-1">
            You submitted this evidence — another admin must review it.
          </div>
        )
      ) : null}
    </div>
  );
}
