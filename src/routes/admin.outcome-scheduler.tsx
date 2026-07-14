import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import {
  runOutcomeCheckins,
  getRecentOutcomeCheckins,
  type OutcomeSchedulerRunResult,
} from "@/lib/engine-outcome-scheduler.functions";

export const Route = createFileRoute("/admin/outcome-scheduler")({
  component: OutcomeSchedulerPage,
});

function OutcomeSchedulerPage() {
  const runFn = useServerFn(runOutcomeCheckins);
  const recentFn = useServerFn(getRecentOutcomeCheckins);
  const [lastRun, setLastRun] = useState<OutcomeSchedulerRunResult | null>(null);

  const recent = useQuery({
    queryKey: ["outcome-checkins-recent"],
    queryFn: () => recentFn(),
  });

  const runDry = useMutation({
    mutationFn: () => runFn({ data: { dryRun: true } }),
    onSuccess: (r) => {
      setLastRun(r);
      toast.success(`Dry-run: ${r.summary.emitted} would emit · ${r.summary.deduped} deduped.`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const runLive = useMutation({
    mutationFn: () => runFn({ data: { dryRun: false } }),
    onSuccess: (r) => {
      setLastRun(r);
      toast.success(`Emitted ${r.summary.emitted} check-ins.`);
      void recent.refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Outcome Scheduler</h1>
        <p className="text-sm text-muted-foreground">
          Broadens outcome feedback beyond delivered projects. Scans delivered projects,
          completed milestones, active engines, and cost-resumed projects on their
          respective cadences and emits governance review items so the approvals queue
          picks them up. Idempotent within a 24h window per (project, title).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Manual run</CardTitle>
          <CardDescription>
            "Preview next cadence" is a dry-run: it computes exactly which outcome
            check-ins would be generated on the next cron tick — grouped by trigger
            and window — without inserting review items or activity events. Use
            "Run now" to commit the same result.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Button variant="outline" onClick={() => runDry.mutate()} disabled={runDry.isPending}>
            {runDry.isPending ? "Scanning…" : "Preview next cadence"}
          </Button>
          <Button onClick={() => runLive.mutate()} disabled={runLive.isPending}>
            {runLive.isPending ? "Running…" : "Run now"}
          </Button>
        </CardContent>
      </Card>

      {lastRun && lastRun.emissions.some((e) => e.status === "emitted") && (
        <Card>
          <CardHeader>
            <CardTitle>Preview — what would be generated</CardTitle>
            <CardDescription>
              Grouped by trigger. Deduped items are hidden here (see the full run
              breakdown below).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(["delivered_project", "completed_milestone", "active_business_engine", "cost_resumed_project"] as const).map(
              (kind) => {
                const items = lastRun.emissions.filter(
                  (e) => e.status === "emitted" && e.triggerKind === kind,
                );
                if (items.length === 0) return null;
                return (
                  <div key={kind}>
                    <div className="text-xs font-semibold uppercase text-muted-foreground mb-1">
                      {kind.replace(/_/g, " ")} ({items.length})
                    </div>
                    <ul className="text-sm space-y-1">
                      {items.map((e, i) => (
                        <li key={`${kind}-${i}`} className="flex items-center gap-2">
                          <Badge variant="outline">{e.window}</Badge>
                          <span>{e.subjectName}</span>
                          <span className="font-mono text-xs opacity-60">
                            {e.subjectId.slice(0, 8)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              },
            )}
          </CardContent>
        </Card>
      )}


      {lastRun && (
        <Card>
          <CardHeader>
            <CardTitle>Last run — {new Date(lastRun.ranAt).toLocaleString()}</CardTitle>
            <CardDescription>
              Scanned {lastRun.scanned.deliveredProjects} delivered ·{" "}
              {lastRun.scanned.completedMilestones} milestones ·{" "}
              {lastRun.scanned.activeEngines} active engines ·{" "}
              {lastRun.scanned.costResumedProjects} cost-resumed. Emitted{" "}
              {lastRun.summary.emitted} · deduped {lastRun.summary.deduped}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {lastRun.emissions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No check-ins fired this run.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {lastRun.emissions.map((e, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <Badge
                      className={
                        e.status === "emitted"
                          ? "bg-emerald-600 text-white"
                          : "bg-slate-500 text-white"
                      }
                    >
                      {e.status === "emitted" ? "NEW" : "DEDUP"}
                    </Badge>
                    <span>
                      <span className="font-mono text-xs opacity-70">
                        [{e.triggerKind}/{e.window}]
                      </span>{" "}
                      {e.title}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Recent outcome check-ins</CardTitle>
          <CardDescription>
            Last 50 outcome_checkin review items across the workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recent.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (recent.data?.items ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing yet.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {(recent.data?.items ?? []).map((r: any) => (
                <li key={r.id} className="flex items-start gap-2">
                  <Badge variant="outline">{r.status}</Badge>
                  <span className="opacity-70 text-xs">
                    {new Date(r.created_at).toLocaleString()}
                  </span>
                  <span>{r.title}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
