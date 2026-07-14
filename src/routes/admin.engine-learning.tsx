import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  analyzeEngineLearning,
  proposeEngineWorkflowChange,
  applyApprovedEngineWorkflowChange,
  type LearningSignal,
} from "@/lib/engine-learning-loop.functions";

export const Route = createFileRoute("/admin/engine-learning")({
  component: EngineLearningPage,
});

function trendBadge(trend: LearningSignal["trend"]) {
  if (trend === "improving") return "border-emerald-400/30 bg-emerald-500/10 text-emerald-200";
  if (trend === "degrading") return "border-red-400/30 bg-red-500/10 text-red-200";
  if (trend === "stable") return "border-white/20 bg-white/5 text-white/70";
  return "border-white/10 bg-white/5 text-white/40";
}

function rateBadge(rate: number, total: number) {
  if (total === 0) return "border-white/10 bg-white/5 text-white/40";
  if (rate >= 0.8) return "border-emerald-400/30 bg-emerald-500/10 text-emerald-200";
  if (rate >= 0.5) return "border-amber-400/30 bg-amber-500/10 text-amber-200";
  return "border-red-400/30 bg-red-500/10 text-red-200";
}

function EngineLearningPage() {
  const analyzeFn = useServerFn(analyzeEngineLearning);
  const proposeFn = useServerFn(proposeEngineWorkflowChange);
  const applyFn = useServerFn(applyApprovedEngineWorkflowChange);
  const qc = useQueryClient();
  const [proposalIdInput, setProposalIdInput] = useState("");
  const [approverEmailInput, setApproverEmailInput] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "engine-learning"],
    queryFn: () => analyzeFn({ data: { windowRuns: 20 } }),
  });

  const propose = useMutation({
    mutationFn: (s: LearningSignal) =>
      proposeFn({
        data: {
          engineId: s.engineId,
          reason: s.recommendation,
          diff: s.suggestedWorkflowDiff!,
          supportingRunIds: s.supportingRunIds,
        },
      }),
    onSuccess: (r) => {
      toast.success(`Proposal ${r.proposalId.slice(0, 8)} submitted for review.`);
      qc.invalidateQueries({ queryKey: ["admin", "engine-learning"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const apply = useMutation({
    mutationFn: (input: { proposalId: string; approverEmail: string }) =>
      applyFn({ data: input }),
    onSuccess: () => {
      toast.success("Workflow change applied to engine.");
      setProposalIdInput("");
      qc.invalidateQueries({ queryKey: ["admin", "engine-learning"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <div className="p-8 text-white/70">Analyzing engine runs…</div>;
  if (error) return <div className="p-8 text-red-300">Error: {(error as Error).message}</div>;
  if (!data) return <div className="p-8 text-white/60">No data.</div>;

  const totalEngines = data.signals.length;
  const withRuns = data.signals.filter((s) => s.totalRuns > 0).length;
  const actionable = data.signals.filter((s) => s.suggestedWorkflowDiff).length;

  return (
    <div className="space-y-8 p-4 lg:p-8">
      <div>
        <h1 className="text-2xl font-semibold text-white">Engine Learning Loop</h1>
        <p className="mt-2 max-w-3xl text-sm text-white/60">
          Continuously analyzes recent runs of every business engine. Success and failure outcomes
          are turned into workflow proposals that route through governance before any engine is
          modified. Nothing here mutates an engine directly.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-white/10 bg-white/[0.04] text-white shadow-none">
          <CardHeader className="pb-3">
            <CardDescription className="text-white/60">Engines analyzed</CardDescription>
            <CardTitle className="text-3xl">{totalEngines}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-sm text-white/50">
            {withRuns} with recorded runs.
          </CardContent>
        </Card>
        <Card className="border-white/10 bg-white/[0.04] text-white shadow-none">
          <CardHeader className="pb-3">
            <CardDescription className="text-white/60">Actionable signals</CardDescription>
            <CardTitle className="text-3xl">{actionable}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-sm text-white/50">
            Engines with a proposed workflow diff.
          </CardContent>
        </Card>
        <Card className="border-white/10 bg-white/[0.04] text-white shadow-none">
          <CardHeader className="pb-3">
            <CardDescription className="text-white/60">Generated</CardDescription>
            <CardTitle className="text-lg">
              {new Date(data.generatedAt).toLocaleString()}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-sm text-white/50">Window: last 20 runs.</CardContent>
        </Card>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">Signals</h2>
        {data.signals.length === 0 ? (
          <div className="rounded border border-white/10 bg-white/[0.02] p-6 text-sm text-white/60">
            No active engines to analyze yet.
          </div>
        ) : (
          <div className="overflow-x-auto rounded border border-white/10 bg-white/[0.02]">
            <Table>
              <TableHeader>
                <TableRow className="border-white/10 hover:bg-transparent">
                  <TableHead className="text-white/60">Engine</TableHead>
                  <TableHead className="text-white/60">Project</TableHead>
                  <TableHead className="text-white/60">Runs</TableHead>
                  <TableHead className="text-white/60">Success rate</TableHead>
                  <TableHead className="text-white/60">Trend</TableHead>
                  <TableHead className="text-white/60">Recommendation</TableHead>
                  <TableHead className="text-white/60">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.signals.map((s) => (
                  <TableRow key={s.engineId} className="border-white/10">
                    <TableCell className="font-medium text-white">{s.engineName}</TableCell>
                    <TableCell className="text-white/70">{s.projectName}</TableCell>
                    <TableCell className="text-white/70">
                      {s.successRuns}✓ / {s.failedRuns}✗ / {s.partialRuns}⋯ ({s.totalRuns})
                    </TableCell>
                    <TableCell>
                      <Badge className={rateBadge(s.successRate, s.totalRuns)}>
                        {s.totalRuns === 0 ? "—" : `${(s.successRate * 100).toFixed(0)}%`}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={trendBadge(s.trend)}>{s.trend.replace(/_/g, " ")}</Badge>
                    </TableCell>
                    <TableCell className="max-w-md text-sm text-white/70">
                      {s.recommendation}
                    </TableCell>
                    <TableCell>
                      {s.suggestedWorkflowDiff ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={propose.isPending}
                          onClick={() => propose.mutate(s)}
                        >
                          Propose change
                        </Button>
                      ) : (
                        <span className="text-xs text-white/40">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">Apply an approved proposal</h2>
        <p className="text-sm text-white/60">
          Applies an approved workflow change to its engine. The signed-in user must be different
          from the proposer (enforced here and at the database layer). Every application is logged
          to <code className="text-white/80">engine_audit_log</code> with the full before/after diff.
        </p>
        <div className="flex flex-wrap items-end gap-3 rounded border border-white/10 bg-white/[0.02] p-4">
          <div className="min-w-[280px] flex-1">
            <label className="mb-1 block text-xs uppercase tracking-widest text-white/50">
              Proposal ID
            </label>
            <input
              className="w-full rounded border border-white/10 bg-transparent px-3 py-2 text-sm text-white outline-none focus:border-white/30"
              value={proposalIdInput}
              onChange={(e) => setProposalIdInput(e.target.value)}
              placeholder="uuid…"
            />
          </div>
          <div className="min-w-[240px] flex-1">
            <label className="mb-1 block text-xs uppercase tracking-widest text-white/50">
              Your email (approver)
            </label>
            <input
              className="w-full rounded border border-white/10 bg-transparent px-3 py-2 text-sm text-white outline-none focus:border-white/30"
              value={approverEmailInput}
              onChange={(e) => setApproverEmailInput(e.target.value)}
              placeholder="you@trusttai.com"
            />
          </div>
          <Button
            disabled={apply.isPending || !proposalIdInput || !approverEmailInput}
            onClick={() =>
              apply.mutate({ proposalId: proposalIdInput, approverEmail: approverEmailInput })
            }
          >
            {apply.isPending ? "Applying…" : "Apply change"}
          </Button>
        </div>
      </section>
    </div>
  );
}
