import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  listEngineTemplates,
  listPendingTemplateClones,
  proposeEngineFromTemplate,
  approveEngineFromTemplate,
  rejectEngineFromTemplate,
  type TemplateCatalogEntry,
  type PendingCloneDetail,
} from "@/lib/engine-business-engine-templates.functions";

export const Route = createFileRoute("/admin/engine-templates")({
  component: EngineTemplatesPage,
});

function statusBadge(s: string) {
  const map: Record<string, string> = {
    active: "bg-emerald-600 text-white",
    draft: "bg-slate-500 text-white",
    proposed: "bg-amber-500 text-white",
    approved: "bg-blue-600 text-white",
    paused: "bg-orange-600 text-white",
    archived: "bg-muted text-muted-foreground",
  };
  return <Badge className={map[s] ?? "bg-muted"}>{s}</Badge>;
}

function EngineTemplatesPage() {
  const listFn = useServerFn(listEngineTemplates);
  const pendingFn = useServerFn(listPendingTemplateClones);
  const proposeFn = useServerFn(proposeEngineFromTemplate);
  const approveFn = useServerFn(approveEngineFromTemplate);
  const rejectFn = useServerFn(rejectEngineFromTemplate);
  const qc = useQueryClient();


  const [proposeState, setProposeState] = useState({ projectId: "", ownerEmail: "" });
  const [approveState, setApproveState] = useState({
    engineId: "",
    reviewItemId: "",
    ownerEmail: "",
    approverEmail: "",
  });
  const [rejectState, setRejectState] = useState({
    engineId: "",
    reviewItemId: "",
    reason: "",
  });
  const [openTemplate, setOpenTemplate] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "engine-templates"],
    queryFn: () => listFn(),
  });

  const pendingQuery = useQuery({
    queryKey: ["admin", "engine-templates", "pending-clones"],
    queryFn: () => pendingFn(),
  });

  const propose = useMutation({
    mutationFn: (templateId: TemplateCatalogEntry["id"]) =>
      proposeFn({
        data: {
          templateId,
          projectId: proposeState.projectId,
          ownerEmail: proposeState.ownerEmail || undefined,
        },
      }),
    onSuccess: (r) => {
      toast.success(
        `Draft engine ${r.engineId.slice(0, 8)} created. Review item ${r.reviewItemId.slice(0, 8)} pending.`,
      );
      qc.invalidateQueries({ queryKey: ["admin", "engine-templates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const approve = useMutation({
    mutationFn: () => approveFn({ data: approveState }),
    onSuccess: () => {
      toast.success("Engine activated.");
      setApproveState({ engineId: "", reviewItemId: "", ownerEmail: "", approverEmail: "" });
      qc.invalidateQueries({ queryKey: ["admin", "engine-templates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reject = useMutation({
    mutationFn: () => rejectFn({ data: rejectState }),
    onSuccess: () => {
      toast.success("Draft archived.");
      setRejectState({ engineId: "", reviewItemId: "", reason: "" });
      qc.invalidateQueries({ queryKey: ["admin", "engine-templates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Business Engine Templates</h1>
        <p className="text-sm text-muted-foreground">
          Canonical operating engines: Content Authority, Lead Follow-Up, Review &amp;
          Reputation, Client Success. Clone into any project as a draft, then activate
          with a separate approver.
        </p>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}

      <Card>
        <CardHeader>
          <CardTitle>Clone target</CardTitle>
          <CardDescription>Project id + optional owner email applied to every clone below.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Project ID</Label>
            <Input
              value={proposeState.projectId}
              onChange={(e) => setProposeState((s) => ({ ...s, projectId: e.target.value }))}
              placeholder="uuid"
            />
          </div>
          <div className="space-y-1">
            <Label>Owner email (optional)</Label>
            <Input
              value={proposeState.ownerEmail}
              onChange={(e) => setProposeState((s) => ({ ...s, ownerEmail: e.target.value }))}
            />
          </div>
        </CardContent>
      </Card>

      <PendingClonesSection
        items={pendingQuery.data ?? []}
        loading={pendingQuery.isLoading}
        onApprove={async (args) => {
          await approveFn({ data: args });
          toast.success("Engine activated.");
          qc.invalidateQueries({ queryKey: ["admin", "engine-templates"] });
        }}
        onReject={async (args) => {
          await rejectFn({ data: args });
          toast.success("Draft archived.");
          qc.invalidateQueries({ queryKey: ["admin", "engine-templates"] });
        }}
      />




      {data?.map((t) => {
        const open = openTemplate === t.id;
        return (
          <Card key={t.id}>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle>{t.name}</CardTitle>
                  <CardDescription>{t.summary}</CardDescription>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline">{t.cadence}</Badge>
                    {t.cronExpression && <Badge variant="outline">cron: {t.cronExpression}</Badge>}
                    <Badge variant="outline">{t.workflow.length} steps</Badge>
                    <Badge variant="outline">{t.metrics.length} metrics</Badge>
                    <Badge variant="outline">{t.exceptionRules.length} exception rules</Badge>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setOpenTemplate(open ? null : t.id)}
                  >
                    {open ? "Hide details" : "Details"}
                  </Button>
                  <Button
                    onClick={() => propose.mutate(t.id)}
                    disabled={!proposeState.projectId || propose.isPending}
                  >
                    Clone into project
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-1">
                  Outcome
                </h3>
                <p className="text-sm">{t.outcome}</p>
              </div>

              {open && (
                <>
                  <div>
                    <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-1">
                      Workflow
                    </h3>
                    <ol className="space-y-2 text-sm">
                      {t.workflow.map((s) => (
                        <li key={s.index} className="border rounded p-2">
                          <div className="flex items-center gap-2 font-medium">
                            <span className="text-muted-foreground">{s.index + 1}.</span>
                            {s.label}
                            {s.requires_approval && (
                              <Badge className="bg-amber-500 text-white">approval</Badge>
                            )}
                            {s.owner_role && (
                              <Badge variant="outline">{s.owner_role}</Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">{s.description}</p>
                        </li>
                      ))}
                    </ol>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-1">
                        Metrics
                      </h3>
                      <ul className="text-sm space-y-1">
                        {t.metrics.map((m) => (
                          <li key={m.key}>
                            <span className="font-medium">{m.label}</span>
                            {m.target && (
                              <span className="text-muted-foreground"> — target {m.target}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-1">
                        Exception rules
                      </h3>
                      <ul className="text-sm space-y-1">
                        {t.exceptionRules.map((r) => (
                          <li key={r.key}>
                            <Badge
                              className={
                                r.severity === "high"
                                  ? "bg-red-600 text-white mr-2"
                                  : r.severity === "medium"
                                    ? "bg-amber-500 text-white mr-2"
                                    : "bg-muted mr-2"
                              }
                            >
                              {r.severity}
                            </Badge>
                            <span className="font-medium">{r.condition}</span>
                            <span className="text-muted-foreground"> → {r.action}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </>
              )}

              <div>
                <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-1">
                  Instances ({t.instances.length})
                </h3>
                {t.instances.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Not yet cloned into any project.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Project</TableHead>
                        <TableHead>Engine</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Owner</TableHead>
                        <TableHead>Created by</TableHead>
                        <TableHead>Approved by</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {t.instances.map((i) => (
                        <TableRow key={i.engineId}>
                          <TableCell>
                            <div className="text-sm">{i.projectName ?? "—"}</div>
                            <div className="text-xs text-muted-foreground">
                              {i.projectId.slice(0, 8)}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs">{i.engineId.slice(0, 8)}</TableCell>
                          <TableCell>{statusBadge(i.status)}</TableCell>
                          <TableCell className="text-xs">{i.ownerEmail ?? "—"}</TableCell>
                          <TableCell className="text-xs">{i.createdBy ?? "—"}</TableCell>
                          <TableCell className="text-xs">{i.approvedBy ?? "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}

      <Card>
        <CardHeader>
          <CardTitle>Activate a draft engine</CardTitle>
          <CardDescription>
            Separate-approver enforced: your email must differ from the cloner and match
            your signed-in account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Engine ID</Label>
              <Input
                value={approveState.engineId}
                onChange={(e) => setApproveState((s) => ({ ...s, engineId: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Review item ID</Label>
              <Input
                value={approveState.reviewItemId}
                onChange={(e) =>
                  setApproveState((s) => ({ ...s, reviewItemId: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Owner email (assigned)</Label>
              <Input
                value={approveState.ownerEmail}
                onChange={(e) => setApproveState((s) => ({ ...s, ownerEmail: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Approver email (you)</Label>
              <Input
                value={approveState.approverEmail}
                onChange={(e) =>
                  setApproveState((s) => ({ ...s, approverEmail: e.target.value }))
                }
              />
            </div>
          </div>
          <Button
            onClick={() => approve.mutate()}
            disabled={
              approve.isPending ||
              !approveState.engineId ||
              !approveState.reviewItemId ||
              !approveState.ownerEmail ||
              !approveState.approverEmail
            }
          >
            {approve.isPending ? "Activating…" : "Activate engine"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reject a draft engine</CardTitle>
          <CardDescription>Archives the draft with a reason.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Engine ID</Label>
              <Input
                value={rejectState.engineId}
                onChange={(e) => setRejectState((s) => ({ ...s, engineId: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Review item ID</Label>
              <Input
                value={rejectState.reviewItemId}
                onChange={(e) =>
                  setRejectState((s) => ({ ...s, reviewItemId: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2 col-span-2">
              <Label>Reason</Label>
              <Textarea
                value={rejectState.reason}
                onChange={(e) => setRejectState((s) => ({ ...s, reason: e.target.value }))}
              />
            </div>
          </div>
          <Button
            variant="destructive"
            onClick={() => reject.mutate()}
            disabled={
              reject.isPending ||
              !rejectState.engineId ||
              !rejectState.reviewItemId ||
              rejectState.reason.length < 4
            }
          >
            {reject.isPending ? "Rejecting…" : "Reject + archive"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

type ApproveArgs = {
  engineId: string;
  reviewItemId: string;
  ownerEmail: string;
  approverEmail: string;
};
type RejectArgs = { engineId: string; reviewItemId: string; reason: string };

function PendingClonesSection({
  items,
  loading,
  onApprove,
  onReject,
}: {
  items: PendingCloneDetail[];
  loading: boolean;
  onApprove: (args: ApproveArgs) => Promise<void>;
  onReject: (args: RejectArgs) => Promise<void>;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Pending clone approvals ({items.length})</CardTitle>
        <CardDescription>
          Drafts awaiting a separate approver. Expand for full clone details, audit
          trail, and inline activate / reject controls.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!loading && items.length === 0 && (
          <p className="text-sm text-muted-foreground">No pending clones.</p>
        )}
        {items.map((p) => (
          <PendingCloneRow
            key={p.reviewItemId}
            p={p}
            expanded={openId === p.reviewItemId}
            onToggle={() => setOpenId(openId === p.reviewItemId ? null : p.reviewItemId)}
            onApprove={onApprove}
            onReject={onReject}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function PendingCloneRow({
  p,
  expanded,
  onToggle,
  onApprove,
  onReject,
}: {
  p: PendingCloneDetail;
  expanded: boolean;
  onToggle: () => void;
  onApprove: (args: ApproveArgs) => Promise<void>;
  onReject: (args: RejectArgs) => Promise<void>;
}) {
  const [mode, setMode] = useState<null | "approve" | "reject">(null);
  const [ownerEmail, setOwnerEmail] = useState(p.ownerEmail ?? "");
  const [approverEmail, setApproverEmail] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const canApprove = !!p.engineId && ownerEmail && approverEmail && !busy;
  const canReject = !!p.engineId && reason.length >= 4 && !busy;

  const runApprove = async () => {
    if (!p.engineId) return;
    setBusy(true);
    try {
      await onApprove({
        engineId: p.engineId,
        reviewItemId: p.reviewItemId,
        ownerEmail,
        approverEmail,
      });
      setMode(null);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const runReject = async () => {
    if (!p.engineId) return;
    setBusy(true);
    try {
      await onReject({ engineId: p.engineId, reviewItemId: p.reviewItemId, reason });
      setMode(null);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border rounded p-3 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-medium text-sm">
            {p.templateName ?? "Template"} → {p.projectName ?? p.projectId.slice(0, 8)}
          </div>
          <div className="text-xs text-muted-foreground">
            Requested by {p.requestedBy ?? "—"} ·{" "}
            {new Date(p.reviewCreatedAt).toLocaleString()}
          </div>
          <div className="mt-1 flex flex-wrap gap-2 text-xs">
            {p.engineStatus && <Badge variant="outline">engine: {p.engineStatus}</Badge>}
            {p.cadence && <Badge variant="outline">{p.cadence}</Badge>}
            {p.cronExpression && <Badge variant="outline">cron: {p.cronExpression}</Badge>}
            <Badge variant="outline">{p.workflowStepCount} steps</Badge>
            <Badge variant="outline">{p.metricCount} metrics</Badge>
            <Badge variant="outline">{p.exceptionRuleCount} rules</Badge>
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={onToggle}>
            {expanded ? "Hide" : "Details"}
          </Button>
          <Button
            size="sm"
            onClick={() => setMode(mode === "approve" ? null : "approve")}
            disabled={!p.engineId}
            variant={mode === "approve" ? "secondary" : "default"}
          >
            Approve
          </Button>
          <Button
            size="sm"
            variant={mode === "reject" ? "secondary" : "destructive"}
            onClick={() => setMode(mode === "reject" ? null : "reject")}
            disabled={!p.engineId}
          >
            Reject
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="mt-2 grid grid-cols-2 gap-4 text-xs">
          <div className="space-y-1">
            <div>
              <span className="text-muted-foreground">Engine ID:</span>{" "}
              <span className="font-mono">{p.engineId ?? "—"}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Review item:</span>{" "}
              <span className="font-mono">{p.reviewItemId}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Cloned by:</span>{" "}
              {p.engineCreatedBy ?? "—"}
            </div>
            <div>
              <span className="text-muted-foreground">Assigned owner:</span>{" "}
              {p.ownerEmail ?? "(unset)"}
            </div>
            <div>
              <span className="text-muted-foreground">Outcome:</span> {p.outcome ?? "—"}
            </div>
          </div>
          <div>
            <div className="font-semibold uppercase text-muted-foreground mb-1">
              Audit log ({p.auditLog.length})
            </div>
            {p.auditLog.length === 0 ? (
              <div className="text-muted-foreground">No entries yet.</div>
            ) : (
              <ul className="space-y-1">
                {p.auditLog.map((a) => (
                  <li key={a.id} className="border-l-2 pl-2">
                    <div>
                      <span className="font-mono">{a.action}</span> by{" "}
                      {a.actorEmail ?? "—"}
                    </div>
                    <div className="text-muted-foreground">
                      {new Date(a.createdAt).toLocaleString()}
                      {a.summary ? ` — ${a.summary}` : ""}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {mode === "approve" && (
        <div className="mt-2 border-t pt-2 space-y-2 bg-muted/30 rounded p-2">
          <div className="text-xs font-semibold uppercase text-muted-foreground">
            Activate engine
          </div>
          <p className="text-xs text-muted-foreground">
            Approver email must match your signed-in account and cannot equal the cloner
            ({p.engineCreatedBy ?? "unknown"}).
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Owner email</Label>
              <Input
                value={ownerEmail}
                onChange={(e) => setOwnerEmail(e.target.value)}
                placeholder="owner@company.com"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Approver email (you)</Label>
              <Input
                value={approverEmail}
                onChange={(e) => setApproverEmail(e.target.value)}
                placeholder="you@company.com"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={runApprove} disabled={!canApprove}>
              {busy ? "Activating…" : "Confirm activate"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode(null)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {mode === "reject" && (
        <div className="mt-2 border-t pt-2 space-y-2 bg-muted/30 rounded p-2">
          <div className="text-xs font-semibold uppercase text-muted-foreground">
            Reject &amp; archive draft
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Reason (min 4 chars)</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why this draft is being rejected"
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="destructive" onClick={runReject} disabled={!canReject}>
              {busy ? "Rejecting…" : "Confirm reject"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode(null)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
