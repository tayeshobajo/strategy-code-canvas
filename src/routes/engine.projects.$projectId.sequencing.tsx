import { createFileRoute } from "@tanstack/react-router";
import { useWorkspace } from "@/hooks/use-workspace";
import { StepAiPanelFor } from "@/components/engine/StepAiPanelFor";
import { SectionCard, EmptyState } from "@/components/engine/primitives";
import { StepEditor } from "@/components/engine/StepEditor";
import { StepStateBar, SourceEvidence } from "@/components/engine/StepState";

export const Route = createFileRoute("/engine/projects/$projectId/sequencing")({
  component: Sequencing,
});

const LANES = [
  { key: "critical_path", label: "Critical path" },
  { key: "parallel", label: "Parallel workstreams" },
  { key: "dependencies", label: "Dependencies" },
  { key: "waiting", label: "Waiting on decisions" },
  { key: "can_start_now", label: "Can start now" },
  { key: "should_wait", label: "Should wait" },
  { key: "deadline_blockers", label: "Deadline blockers" },
];

function Sequencing() {
  const { projectId } = Route.useParams();
  const { project } = useWorkspace(projectId);
  const raw = (project.sequencing ?? {}) as Record<string, unknown>;
  const data: Record<string, string[]> = {};
  for (const { key } of LANES) {
    const v = raw[key];
    if (Array.isArray(v)) data[key] = v.map((x) => String(x));
    else if (typeof v === "string" && v.trim()) data[key] = [v];
    else data[key] = [];
  }
  return (
    <div className="space-y-4">
      <header>
        <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal">Step 10</div>
        <h2 className="font-display text-3xl text-ink mt-1">Sequencing View</h2>
        <p className="text-sm text-ink/60 mt-1">Why the milestones are in the right order.</p>
      </header>
      <StepStateBar projectId={projectId} step="sequencing" current={project.step_states?.["sequencing"]} />
      <StepAiPanelFor step="sequencing" data={project.sequencing} />
      <SourceEvidence projectId={projectId} step="sequencing" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {LANES.map((l) => (
          <SectionCard key={l.key} title={l.label}>
            {(data[l.key]?.length ?? 0) === 0 ? (
              <EmptyState title="Empty" />
            ) : (
              <ul className="list-disc list-inside text-sm text-ink/80 space-y-1">
                {data[l.key]!.map((v, i) => <li key={i}>{v}</li>)}
              </ul>
            )}
          </SectionCard>
        ))}
      </div>
      <SectionCard title="Edit sequencing">
        <StepEditor projectId={projectId} step="sequencing" data={project.sequencing} expectedUpdatedAt={project.updated_at} />
      </SectionCard>
    </div>
  );
}
