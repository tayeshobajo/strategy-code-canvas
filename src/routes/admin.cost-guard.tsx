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
  getCostGuardReport,
  resumeProjectAfterCostReview,
  type CostGuardRow,
} from "@/lib/engine-cost-guard.functions";

export const Route = createFileRoute("/admin/cost-guard")({
  component: CostGuardPage,
});

const fmt = (cents: number) =>
  (cents / 100).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

function statusBadge(s: CostGuardRow["status"]) {
  const color =
    s === "paused"
      ? "bg-red-600 text-white"
      : s === "over"
        ? "bg-orange-600 text-white"
        : s === "warning"
          ? "bg-amber-500 text-white"
          : "bg-emerald-600 text-white";
  return <Badge className={color}>{s.toUpperCase()}</Badge>;
}

function CostGuardPage() {
  const reportFn = useServerFn(getCostGuardReport);
  const resumeFn = useServerFn(resumeProjectAfterCostReview);
  const qc = useQueryClient();

  const [resumeState, setResumeState] = useState({
    projectId: "",
    approverEmail: "",
    reason: "",
    newBudgetCents: "",
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "cost-guard"],
    queryFn: () => reportFn(),
  });

  const resume = useMutation({
    mutationFn: () =>
      resumeFn({
        data: {
          projectId: resumeState.projectId,
          approverEmail: resumeState.approverEmail,
          reason: resumeState.reason,
          newBudgetCents: resumeState.newBudgetCents
            ? Number(resumeState.newBudgetCents)
            : undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Project resumed.");
      setResumeState({ projectId: "", approverEmail: "", reason: "", newBudgetCents: "" });
      qc.invalidateQueries({ queryKey: ["admin", "cost-guard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Cost Guard</h1>
        <p className="text-sm text-muted-foreground">
          Month-to-date agent spend per project vs monthly budget. Projects auto-pause
          when spend exceeds budget once the H1 DB trigger lands. Resume requires a
          separate approver.
        </p>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}

      {data && (
        <>
          <div className="grid grid-cols-4 gap-3">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Projects tracked</CardDescription>
                <CardTitle className="text-2xl">{data.summary.total}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Warning (≥80%)</CardDescription>
                <CardTitle className="text-2xl">{data.summary.warning}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Over budget</CardDescription>
                <CardTitle className="text-2xl">{data.summary.over}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Auto-paused</CardDescription>
                <CardTitle className="text-2xl">{data.summary.paused}</CardTitle>
              </CardHeader>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Projects</CardTitle>
              <CardDescription>
                Sorted by risk: paused first, then over-budget, then warning.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Project</TableHead>
                    <TableHead className="text-right">Budget</TableHead>
                    <TableHead className="text-right">Spend (MTD)</TableHead>
                    <TableHead className="text-right">Util</TableHead>
                    <TableHead>Paused reason</TableHead>
                    <TableHead>Last cost by</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.map((r) => (
                    <TableRow key={r.projectId}>
                      <TableCell>{statusBadge(r.status)}</TableCell>
                      <TableCell>
                        <div className="font-medium">{r.projectName}</div>
                        <div className="text-xs text-muted-foreground">
                          {r.projectId.slice(0, 8)}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{fmt(r.budgetCents)}</TableCell>
                      <TableCell className="text-right">{fmt(r.monthToDateCents)}</TableCell>
                      <TableCell className="text-right">{r.utilizationPct}%</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[300px]">
                        {r.costPausedReason ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.lastActorEmail ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Resume paused project</CardTitle>
              <CardDescription>
                Separate-approver enforced: your email must not match the actor on the
                last cost row for this project.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Project ID</Label>
                  <Input
                    value={resumeState.projectId}
                    onChange={(e) =>
                      setResumeState((s) => ({ ...s, projectId: e.target.value }))
                    }
                    placeholder="uuid"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Approver email (you)</Label>
                  <Input
                    value={resumeState.approverEmail}
                    onChange={(e) =>
                      setResumeState((s) => ({ ...s, approverEmail: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1 col-span-2">
                  <Label>Reason</Label>
                  <Textarea
                    value={resumeState.reason}
                    onChange={(e) => setResumeState((s) => ({ ...s, reason: e.target.value }))}
                    placeholder="Why is it safe to resume spending on this project?"
                  />
                </div>
                <div className="space-y-1">
                  <Label>New monthly budget (cents, optional)</Label>
                  <Input
                    value={resumeState.newBudgetCents}
                    onChange={(e) =>
                      setResumeState((s) => ({ ...s, newBudgetCents: e.target.value }))
                    }
                    placeholder="leave blank to keep current"
                  />
                </div>
              </div>
              <Button
                onClick={() => resume.mutate()}
                disabled={
                  resume.isPending ||
                  !resumeState.projectId ||
                  !resumeState.approverEmail ||
                  resumeState.reason.length < 4
                }
              >
                {resume.isPending ? "Resuming…" : "Resume project"}
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
