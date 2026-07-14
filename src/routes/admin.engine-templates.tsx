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
  proposeEngineFromTemplate,
  approveEngineFromTemplate,
  rejectEngineFromTemplate,
  type TemplateCatalogEntry,
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
