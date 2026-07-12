import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getWorkspaceOutcomeFeedbackReport,
  type OutcomeFeedbackSignal,
} from "@/lib/engine-outcome-feedback.functions";

export const Route = createFileRoute("/admin/outcome-feedback" as never)({
  component: OutcomeFeedbackPage,
});

function formatScore(value: number | null) {
  return value == null ? "—" : `${value}%`;
}

function scoreBadgeClass(score: number) {
  if (score >= 80) return "border-emerald-400/30 bg-emerald-500/10 text-emerald-200";
  if (score >= 60) return "border-amber-400/30 bg-amber-500/10 text-amber-200";
  return "border-red-400/30 bg-red-500/10 text-red-200";
}

function signalLabel(signal: OutcomeFeedbackSignal["signalKind"]) {
  return signal.replace(/_/g, " ");
}

function StatCard(props: { label: string; value: string; hint: string }) {
  return (
    <Card className="border-white/10 bg-white/[0.04] text-white shadow-none">
      <CardHeader className="pb-3">
        <CardDescription className="text-white/60">{props.label}</CardDescription>
        <CardTitle className="text-3xl">{props.value}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0 text-sm text-white/50">{props.hint}</CardContent>
    </Card>
  );
}

function OutcomeFeedbackPage() {
  const reportFn = useServerFn(getWorkspaceOutcomeFeedbackReport);
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "outcome-feedback"],
    queryFn: () => reportFn(),
  });

  if (isLoading) {
    return <div className="text-white/70">Loading outcome feedback…</div>;
  }

  if (error) {
    return <div className="text-red-300">Error: {(error as Error).message}</div>;
  }

  if (!data) {
    return <div className="text-white/60">No outcome feedback available.</div>;
  }

  return (
    <div className="space-y-8 p-4 lg:p-8">
      <div>
        <h1 className="text-2xl font-semibold text-white">Outcome Feedback</h1>
        <p className="mt-2 max-w-3xl text-sm text-white/60">
          Delivery outcomes now feed back into Captain&apos;s understanding layer so future projects
          inherit what the workspace has already learned.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          label="Avg Timeline Accuracy"
          value={formatScore(data.avgTimelineAccuracy)}
          hint="How close delivered timelines were to what was estimated."
        />
        <StatCard
          label="Avg Delivery Completeness"
          value={formatScore(data.avgDeliveryCompleteness)}
          hint="How often milestone plans actually reached complete status."
        />
        <StatCard
          label="Projects with Feedback"
          value={`${data.projectsWithFeedback}/${data.totalProjects}`}
          hint={`Report generated ${new Date(data.generatedAt).toLocaleString()}.`}
        />
      </div>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Synthesized Patterns</h2>
          <p className="text-sm text-white/55">
            Cross-project signals Captain should learn from before the next estimate or intake.
          </p>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          {data.syntheses.map((pattern) => (
            <Card
              key={pattern.patternKind}
              className="border-white/10 bg-white/[0.04] text-white shadow-none"
            >
              <CardHeader className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <CardTitle className="capitalize">
                    {pattern.patternKind.replace(/_/g, " ")}
                  </CardTitle>
                  <Badge className={scoreBadgeClass(pattern.avgScore)} variant="outline">
                    {pattern.avgScore}% avg
                  </Badge>
                </div>
                <CardDescription className="text-white/65">{pattern.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-white/75">
                <div>
                  <span className="text-white/45">Affected projects:</span>{" "}
                  {pattern.affectedProjectCount}
                </div>
                <div>
                  <span className="text-white/45">Recommendation:</span> {pattern.recommendation}
                </div>
              </CardContent>
            </Card>
          ))}
          {data.syntheses.length === 0 && (
            <Card className="border-white/10 bg-white/[0.04] text-white shadow-none">
              <CardContent className="pt-6 text-sm text-white/60">
                No synthesized patterns yet. Once delivery outcomes are recorded, Captain will
                surface recurring strengths and misses here.
              </CardContent>
            </Card>
          )}
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Project Signals</h2>
          <p className="text-sm text-white/55">
            Per-project outcome signals that feed the workspace-level synthesis.
          </p>
        </div>
        <Card className="border-white/10 bg-white/[0.04] text-white shadow-none">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-white/10 hover:bg-transparent">
                  <TableHead className="text-white/55">Project</TableHead>
                  <TableHead className="text-white/55">Signal Kind</TableHead>
                  <TableHead className="text-white/55">Score</TableHead>
                  <TableHead className="text-white/55">Raw Data</TableHead>
                  <TableHead className="text-white/55">Confidence</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.signals.map((signal) => (
                  <TableRow
                    key={`${signal.projectId}-${signal.signalKind}-${signal.recordedAt}`}
                    className="border-white/10 hover:bg-white/[0.03]"
                  >
                    <TableCell className="font-medium text-white">{signal.projectName}</TableCell>
                    <TableCell className="capitalize text-white/70">
                      {signalLabel(signal.signalKind)}
                    </TableCell>
                    <TableCell>
                      <Badge className={scoreBadgeClass(signal.value)} variant="outline">
                        {signal.value}%
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[520px] whitespace-pre-wrap text-sm text-white/65">
                      {signal.rawData}
                    </TableCell>
                    <TableCell className="capitalize text-white/70">{signal.confidence}</TableCell>
                  </TableRow>
                ))}
                {data.signals.length === 0 && (
                  <TableRow className="border-white/10">
                    <TableCell colSpan={5} className="py-8 text-center text-white/55">
                      No outcome signals found yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
