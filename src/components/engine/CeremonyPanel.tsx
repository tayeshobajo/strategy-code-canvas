/**
 * Phase 2 + 2B — Internal ceremony panel.
 *
 * Operator-only surface. Renders on the Point A / Point B workspace routes.
 * Does NOT ship to the client portal — the doctrine forbids exposing
 * epistemic review, contradiction handling, operator overrides, or approval
 * controls to clients.
 *
 * Composition:
 *   - Ceremony header (status, open/complete/abandon controls)
 *   - Per-field table (allowlist × current truth chip × decision + reverse)
 *   - Decision history (append-only)
 *   - Invalidation history (Phase 2B)
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Loader2,
  Play,
  Check,
  XCircle,
  Undo2,
  ShieldAlert,
  RotateCcw,
  History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { EpistemicStatusChip } from "@/components/engine/EpistemicStatusChip";
import { useEngineRole } from "@/hooks/useEngineRole";
import {
  startCeremony,
  listCeremonyFields,
  completeCeremony,
  abandonCeremony,
  recordCeremonyDecision,
} from "@/lib/engine-spine-ceremonies.functions";
import {
  reverseFieldApproval,
  invalidatePointACeremony,
  reopenCeremony,
  listCeremonyInvalidations,
} from "@/lib/engine-spine-invalidation.functions";
import type { FieldStatusEntry } from "@/lib/engine-epistemic.functions";

type Spine = "point-a" | "point-b";

type CeremonyRow = {
  id: string;
  project_id: string;
  spine: Spine;
  status: "in_progress" | "completed" | "abandoned";
  opened_by_email: string;
  opened_at: string;
  completed_at: string | null;
  completed_by_email: string | null;
  abandoned_at: string | null;
  abandoned_by_email: string | null;
  abandon_reason: string | null;
  stale_reason: string | null;
  stale_since: string | null;
  re_review_required: boolean;
};

type FieldEntry = {
  fieldKey: string;
  entry: (FieldStatusEntry & { ceremony_id: string | null }) | null;
};

type InvalidationRow = {
  id: string;
  ceremony_id: string;
  reason: string;
  reversed_field_keys: string[];
  created_by_email: string;
  created_at: string;
  resolved_at: string | null;
};

export function CeremonyPanel({
  projectId,
  spine,
}: {
  projectId: string;
  spine: Spine;
}) {
  const role = useEngineRole();
  const canWrite = role.canApprove || role.isAdmin || role.isOperator;
  const qc = useQueryClient();

  const startFn = useServerFn(startCeremony);
  const listFn = useServerFn(listCeremonyFields);
  const completeFn = useServerFn(completeCeremony);
  const abandonFn = useServerFn(abandonCeremony);
  const decideFn = useServerFn(recordCeremonyDecision);
  const reverseFn = useServerFn(reverseFieldApproval);
  const invalidateFn = useServerFn(invalidatePointACeremony);
  const reopenFn = useServerFn(reopenCeremony);
  const listInvalidationsFn = useServerFn(listCeremonyInvalidations);

  const [activeCeremonyId, setActiveCeremonyId] = useState<string | null>(null);

  const ceremonyQuery = useQuery({
    queryKey: ["engine", "ceremony", projectId, spine, activeCeremonyId],
    enabled: !!activeCeremonyId,
    queryFn: async () => {
      const res = await listFn({ data: { ceremonyId: activeCeremonyId! } });
      return res as { ceremony: CeremonyRow; fields: FieldEntry[] };
    },
  });

  const invalidationsQuery = useQuery({
    queryKey: ["engine", "invalidations", projectId],
    queryFn: async () => {
      const res = await listInvalidationsFn({ data: { projectId } });
      return (res as { invalidations: InvalidationRow[] }).invalidations;
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["engine", "ceremony", projectId, spine] });
    qc.invalidateQueries({ queryKey: ["engine", "spine-status", projectId, spine] });
    qc.invalidateQueries({ queryKey: ["engine", "invalidations", projectId] });
  };

  const startMut = useMutation({
    mutationFn: async () => {
      const res = await startFn({ data: { projectId, spine } });
      return (res as { ceremony: CeremonyRow }).ceremony;
    },
    onSuccess: (cer) => {
      setActiveCeremonyId(cer.id);
      toast.success(cer.status === "in_progress" ? "Ceremony opened" : "Loaded ceremony");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const completeMut = useMutation({
    mutationFn: async () => completeFn({ data: { ceremonyId: activeCeremonyId! } }),
    onSuccess: () => {
      toast.success("Ceremony completed");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!canWrite) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 text-sm text-ink/60">
        Ceremony controls require admin or operator access.
      </div>
    );
  }

  if (!activeCeremonyId) {
    return (
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-royal">
              {spine === "point-a" ? "Point A" : "Point B"} Ceremony
            </div>
            <div className="font-display text-xl text-ink mt-1">
              Approval walkthrough
            </div>
            <p className="text-sm text-ink/60 mt-1 max-w-lg">
              Open a ceremony to walk every allowlisted field, promote them
              toward approved truth, and audit the trail. Completion is
              blocked until every field is terminal and no contradictions
              remain.
            </p>
          </div>
          <Button
            onClick={() => startMut.mutate()}
            disabled={startMut.isPending}
          >
            {startMut.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Play className="w-4 h-4 mr-2" />
            )}
            Open ceremony
          </Button>
        </div>
        <InvalidationHistory rows={invalidationsQuery.data ?? []} />
      </div>
    );
  }

  const cer = ceremonyQuery.data?.ceremony;
  const fields = ceremonyQuery.data?.fields ?? [];

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-royal">
            {spine === "point-a" ? "Point A" : "Point B"} Ceremony
          </div>
          <div className="font-display text-xl text-ink mt-1">
            {cer ? statusLabel(cer.status) : "Loading…"}
          </div>
          {cer ? (
            <div className="text-xs text-ink/60 mt-1">
              Opened by {cer.opened_by_email} · {fmtDate(cer.opened_at)}
              {cer.stale_since ? (
                <span className="ml-2 inline-flex items-center gap-1 text-[#a4283c]">
                  <ShieldAlert className="w-3 h-3" /> Stale — {cer.stale_reason}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setActiveCeremonyId(null)}
          >
            Close
          </Button>
          {cer?.status === "in_progress" ? (
            <>
              <AbandonDialog
                ceremonyId={cer.id}
                onDone={() => {
                  setActiveCeremonyId(null);
                  invalidate();
                }}
                abandonFn={abandonFn}
              />
              <Button
                size="sm"
                onClick={() => completeMut.mutate()}
                disabled={completeMut.isPending}
              >
                {completeMut.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Check className="w-4 h-4 mr-2" />
                )}
                Complete
              </Button>
            </>
          ) : null}
          {cer?.status === "completed" && cer.spine === "point-a" ? (
            <InvalidateDialog
              ceremony={cer}
              invalidateFn={invalidateFn}
              reopenFn={reopenFn}
              onDone={() => invalidate()}
            />
          ) : null}
        </div>
      </div>

      {ceremonyQuery.isLoading ? (
        <div className="text-sm text-ink/60 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading fields…
        </div>
      ) : (
        <FieldTable
          projectId={projectId}
          spine={spine}
          ceremonyId={activeCeremonyId}
          fields={fields}
          ceremonyStatus={cer?.status ?? "in_progress"}
          decideFn={decideFn}
          reverseFn={reverseFn}
          onChange={invalidate}
        />
      )}

      <InvalidationHistory rows={invalidationsQuery.data ?? []} />
    </div>
  );
}

// ---------- Field table ----------

function FieldTable({
  projectId,
  spine,
  ceremonyId,
  fields,
  ceremonyStatus,
  decideFn,
  reverseFn,
  onChange,
}: {
  projectId: string;
  spine: Spine;
  ceremonyId: string;
  fields: FieldEntry[];
  ceremonyStatus: "in_progress" | "completed" | "abandoned";
  decideFn: ReturnType<typeof useServerFn<typeof recordCeremonyDecision>>;
  reverseFn: ReturnType<typeof useServerFn<typeof reverseFieldApproval>>;
  onChange: () => void;
}) {
  const editable = ceremonyStatus === "in_progress";

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-paper-soft">
          <tr className="text-left text-[11px] uppercase tracking-wider text-ink/60 font-mono">
            <th className="px-3 py-2">Field</th>
            <th className="px-3 py-2">Current status</th>
            <th className="px-3 py-2">Updated</th>
            <th className="px-3 py-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {fields.length === 0 ? (
            <tr>
              <td colSpan={4} className="px-3 py-6 text-center text-ink/50">
                No allowlisted fields for this spine.
              </td>
            </tr>
          ) : (
            fields.map(({ fieldKey, entry }) => (
              <tr key={fieldKey} className="border-t border-border">
                <td className="px-3 py-2 font-mono text-xs text-ink">{fieldKey}</td>
                <td className="px-3 py-2">
                  <EpistemicStatusChip
                    status={entry?.status}
                    sourceRef={entry?.source_ref}
                    projectId={projectId}
                    spine={spine}
                    fieldKey={fieldKey}
                    fieldLabel={fieldKey}
                  />
                </td>
                <td className="px-3 py-2 text-xs text-ink/60">
                  {entry ? fmtDate(entry.updated_at) : "—"}
                </td>
                <td className="px-3 py-2 text-right space-x-2 whitespace-nowrap">
                  {editable ? (
                    <ApproveButton
                      ceremonyId={ceremonyId}
                      fieldKey={fieldKey}
                      currentStatus={entry?.status}
                      decideFn={decideFn}
                      onDone={onChange}
                    />
                  ) : null}
                  {entry?.status === "approved_truth" ? (
                    <ReverseButton
                      projectId={projectId}
                      spine={spine}
                      fieldKey={fieldKey}
                      reverseFn={reverseFn}
                      onDone={onChange}
                    />
                  ) : null}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

// ---------- Approve control ----------

function ApproveButton({
  ceremonyId,
  fieldKey,
  currentStatus,
  decideFn,
  onDone,
}: {
  ceremonyId: string;
  fieldKey: string;
  currentStatus: string | undefined;
  decideFn: ReturnType<typeof useServerFn<typeof recordCeremonyDecision>>;
  onDone: () => void;
}) {
  const mut = useMutation({
    mutationFn: async () =>
      decideFn({
        data: {
          ceremonyId,
          fieldKey,
          newStatus: "approved_truth",
          // Server enriches with approval_kind='ceremony', ceremony_id,
          // operator_confirmed_by, timestamp.
          sourceRef: { kind: "operator_note" },
        },
      }),
    onSuccess: () => {
      toast.success(`${fieldKey} approved`);
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (currentStatus === "approved_truth") {
    return <span className="text-xs text-ink/50">Approved</span>;
  }

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() => mut.mutate()}
      disabled={mut.isPending}
    >
      {mut.isPending ? (
        <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
      ) : (
        <Check className="w-3.5 h-3.5 mr-1" />
      )}
      Approve
    </Button>
  );
}

// ---------- Reverse control ----------

function ReverseButton({
  projectId,
  spine,
  fieldKey,
  reverseFn,
  onDone,
}: {
  projectId: string;
  spine: Spine;
  fieldKey: string;
  reverseFn: ReturnType<typeof useServerFn<typeof reverseFieldApproval>>;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  const mut = useMutation({
    mutationFn: async () =>
      reverseFn({ data: { projectId, spine, fieldKey, reason } }),
    onSuccess: () => {
      toast.success(`${fieldKey} reversed — downstream Point B marked stale`);
      setOpen(false);
      setReason("");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="text-[#a4283c]">
          <Undo2 className="w-3.5 h-3.5 mr-1" /> Reverse
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reverse approval for {fieldKey}</DialogTitle>
          <DialogDescription>
            Flips this field from approved_truth back to needs_confirmation.
            {spine === "point-a"
              ? " All Point B ceremonies and truth rows for this project will be marked stale."
              : ""}
          </DialogDescription>
        </DialogHeader>
        <Textarea
          placeholder="Reason (required, min 4 chars)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
        />
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => mut.mutate()}
            disabled={mut.isPending || reason.trim().length < 4}
          >
            {mut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Reverse
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Abandon ----------

function AbandonDialog({
  ceremonyId,
  abandonFn,
  onDone,
}: {
  ceremonyId: string;
  abandonFn: ReturnType<typeof useServerFn<typeof abandonCeremony>>;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const mut = useMutation({
    mutationFn: async () => abandonFn({ data: { ceremonyId, reason } }),
    onSuccess: () => {
      toast.success("Ceremony abandoned");
      setOpen(false);
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <XCircle className="w-4 h-4 mr-1" /> Abandon
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Abandon ceremony</DialogTitle>
          <DialogDescription>
            Ceremonies are never deleted. Abandoning requires a reason and is
            preserved in the audit trail.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          placeholder="Reason (required)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
        />
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            variant="destructive"
            onClick={() => mut.mutate()}
            disabled={mut.isPending || reason.trim().length === 0}
          >
            {mut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Abandon
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Invalidate (Phase 2B) ----------

function InvalidateDialog({
  ceremony,
  invalidateFn,
  reopenFn,
  onDone,
}: {
  ceremony: CeremonyRow;
  invalidateFn: ReturnType<typeof useServerFn<typeof invalidatePointACeremony>>;
  reopenFn: ReturnType<typeof useServerFn<typeof reopenCeremony>>;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [andReopen, setAndReopen] = useState(true);

  const mut = useMutation({
    mutationFn: async () => {
      await invalidateFn({
        data: { ceremonyId: ceremony.id, reason, reversedFieldKeys: [] },
      });
      if (andReopen) {
        await reopenFn({ data: { ceremonyId: ceremony.id } });
      }
    },
    onSuccess: () => {
      toast.success(
        andReopen
          ? "Ceremony invalidated and reopened — Point B marked stale"
          : "Invalidation recorded — reopen when ready",
      );
      setOpen(false);
      setReason("");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="text-[#a4283c] border-[#f3ced5]">
          <RotateCcw className="w-4 h-4 mr-1" /> Invalidate
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invalidate Point A ceremony</DialogTitle>
          <DialogDescription>
            Records a formal invalidation of this completed Point A ceremony.
            All Point B ceremonies and truth rows for this project will be
            marked stale (re-review required). This unlock is required before
            the ceremony can be reopened when downstream Point B state
            exists.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          placeholder="Reason (required, min 4 chars)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
        />
        <label className="flex items-center gap-2 text-sm text-ink/80">
          <input
            type="checkbox"
            checked={andReopen}
            onChange={(e) => setAndReopen(e.target.checked)}
          />
          Reopen ceremony immediately
        </label>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            variant="destructive"
            onClick={() => mut.mutate()}
            disabled={mut.isPending || reason.trim().length < 4}
          >
            {mut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Invalidate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Invalidation history ----------

function InvalidationHistory({ rows }: { rows: InvalidationRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="mt-4 border-t border-border pt-4">
      <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-ink/60 mb-2">
        <History className="w-3.5 h-3.5" /> Invalidation history
      </div>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li
            key={r.id}
            className="text-xs text-ink/80 border border-border rounded-md px-3 py-2 bg-paper-soft"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-ink">{r.reason}</span>
              <span
                className={
                  r.resolved_at
                    ? "text-[10px] font-mono uppercase text-ink/50"
                    : "text-[10px] font-mono uppercase text-[#a4283c]"
                }
              >
                {r.resolved_at ? "Resolved" : "Active"}
              </span>
            </div>
            <div className="text-[11px] text-ink/60 mt-1">
              By {r.created_by_email} · {fmtDate(r.created_at)}
              {r.reversed_field_keys.length > 0 ? (
                <> · Fields: {r.reversed_field_keys.join(", ")}</>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------- utils ----------

function statusLabel(s: CeremonyRow["status"]): string {
  if (s === "in_progress") return "In progress";
  if (s === "completed") return "Completed";
  return "Abandoned";
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
