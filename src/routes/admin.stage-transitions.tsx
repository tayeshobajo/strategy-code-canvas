import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getWorkspaceStageTransitions,
  type ProjectStageTransitionReport,
  type WorkspaceStageTransitionReport,
} from "@/lib/engine-stage-transitions.functions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/admin/stage-transitions")({
  component: AdminStageTransitionsPage,
});

function AdminStageTransitionsPage() {
  const load = useServerFn(getWorkspaceStageTransitions);
  const { data, isLoading, error } = useQuery<WorkspaceStageTransitionReport>({
    queryKey: ["admin", "stage-transitions"],
    queryFn: () => load(),
  });

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs uppercase tracking-[0.22em] text-amber-400">Admin</div>
        <h1 className="mt-2 text-2xl font-semibold text-white">Stage Transitions</h1>
        <p className="mt-2 max-w-3xl text-sm text-white/65">
          Read-only transition visibility for roadmap projects. It shows which stage is current,
          what handoff comes next, and what is blocking progress.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard
          label="Ready to Advance"
          value={data?.readyToAdvanceCount ?? 0}
          accent="border-emerald-400/30 bg-emerald-500/10"
          valueClassName="text-emerald-200"
        />
        <SummaryCard
          label="Blocked"
          value={data?.blockedCount ?? 0}
          accent="border-red-400/30 bg-red-500/10"
          valueClassName="text-red-200"
        />
        <SummaryCard
          label="Completed"
          value={data?.completedCount ?? 0}
          accent="border-sky-400/30 bg-sky-500/10"
          valueClassName="text-sky-200"
        />
      </div>

      <Card className="border-white/10 bg-white/5 text-white shadow-none">
        <CardHeader className="pb-4">
          <CardTitle>Projects</CardTitle>
          <CardDescription className="text-white/55">
            {data
              ? `${data.totalProjects} projects · generated ${new Date(data.generatedAt).toLocaleString()}`
              : "Current transition report"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && <div className="text-sm text-white/65">Loading transitions…</div>}
          {error && (
            <div className="rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">
              {(error as Error).message}
            </div>
          )}
          {data && (
            <Table>
              <TableHeader>
                <TableRow className="border-white/10 hover:bg-transparent">
                  <TableHead className="min-w-[220px] text-white/60">Project</TableHead>
                  <TableHead className="min-w-[200px] text-white/60">Current Stage</TableHead>
                  <TableHead className="min-w-[150px] text-white/60">Next Stage</TableHead>
                  <TableHead className="min-w-[140px] text-white/60">Status</TableHead>
                  <TableHead className="min-w-[130px] text-white/60">Next Actor</TableHead>
                  <TableHead className="min-w-[280px] text-white/60">Action Required</TableHead>
                  <TableHead className="min-w-[240px] text-white/60">Blockers</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.projects.map((project) => {
                  const rowStatus = getRowStatus(project);
                  return (
                    <TableRow
                      key={project.projectId}
                      className={
                        rowStatus.label === "Ready to Advance"
                          ? "border-emerald-400/20 bg-emerald-500/5 hover:bg-emerald-500/10"
                          : "border-white/10 hover:bg-white/5"
                      }
                    >
                      <TableCell>
                        <div className="font-medium text-white">{project.projectName}</div>
                        <div className="mt-1 text-xs text-white/45">{project.projectId}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm text-white">
                          {stageLabelFor(project.currentStage)}
                        </div>
                        <StageMiniBar project={project} />
                      </TableCell>
                      <TableCell className="text-sm text-white/75">
                        {project.nextStage ? stageLabelFor(project.nextStage) : "Complete"}
                      </TableCell>
                      <TableCell>
                        <Badge className={rowStatus.className}>{rowStatus.label}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-white/80">
                        {project.nextActor ? capitalize(project.nextActor) : "—"}
                      </TableCell>
                      <TableCell className="text-sm text-white/70">
                        {project.actionRequired ?? "No action required."}
                      </TableCell>
                      <TableCell>
                        {project.blockers.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {project.blockers.map((blocker) => (
                              <Badge
                                key={`${project.projectId}-${blocker}`}
                                variant="outline"
                                className="border-red-400/30 bg-red-500/10 text-red-200"
                              >
                                {blocker}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-sm text-white/45">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  accent,
  valueClassName,
}: {
  label: string;
  value: number;
  accent: string;
  valueClassName: string;
}) {
  return (
    <Card className={`border-white/10 bg-white/5 text-white shadow-none ${accent}`}>
      <CardHeader className="pb-3">
        <CardDescription className="text-white/60">{label}</CardDescription>
        <CardTitle className={`text-3xl ${valueClassName}`}>{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

function StageMiniBar({ project }: { project: ProjectStageTransitionReport }) {
  return (
    <div className="mt-3 flex gap-1">
      {project.allStages.map((stage) => (
        <div
          key={`${project.projectId}-${stage.stageName}`}
          title={`${stage.stageNum}. ${stage.stageLabel}`}
          className={`h-2 w-6 rounded-full ${
            stage.status === "complete"
              ? "bg-emerald-400"
              : stage.isCurrentStage
                ? "bg-amber-400"
                : stage.isNextStage
                  ? "bg-sky-400"
                  : "bg-white/15"
          }`}
        />
      ))}
    </div>
  );
}

function getRowStatus(project: ProjectStageTransitionReport) {
  if (project.completedStageCount === project.totalStageCount) {
    return {
      label: "Completed",
      className: "border-sky-400/30 bg-sky-500/10 text-sky-200",
    };
  }
  if (project.readyToAdvance) {
    return {
      label: "Ready to Advance",
      className: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
    };
  }
  if (project.blockers.length > 0) {
    return {
      label: "Blocked",
      className: "border-red-400/30 bg-red-500/10 text-red-200",
    };
  }
  return {
    label: "In Progress",
    className: "border-amber-400/30 bg-amber-500/10 text-amber-200",
  };
}

function stageLabelFor(stageName: string) {
  const labels: Record<string, string> = {
    intake: "Signal Intake",
    understanding: "Understanding",
    spine: "Project Spine",
    blueprint: "Blueprint",
    roadmap: "Roadmap",
    sequencing: "Sequencing",
    investment: "Investment Sign-Off",
    delivery: "Delivery",
  };
  return labels[stageName] ?? stageName;
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
