import { createFileRoute } from "@tanstack/react-router";
import { useWorkspace } from "@/hooks/use-workspace";
import { SectionCard, EmptyState } from "@/components/engine/primitives";
import { StepEditor } from "@/components/engine/StepEditor";
import { StepStateBar, SourceEvidence } from "@/components/engine/StepState";

export const Route = createFileRoute("/engine/projects/$projectId/blueprint")({
  component: Blueprint,
});

const GROUP_TONE: Record<string, string> = {
  front: "border-[#cdd6f3] bg-[#e9eefb]",
  learning: "border-[#c4e6d2] bg-[#e6f5ec]",
  institution: "border-[#dccdf3] bg-[#efe9fb]",
  intelligence: "border-[#f1e3b9] bg-[#fbf3e0]",
  commercial: "border-[#f3ced5] bg-[#fbe9ec]",
  ops: "border-[#d6d8df] bg-[#ecedf0]",
};

function Blueprint() {
  const { projectId } = Route.useParams();
  const { project } = useWorkspace(projectId);
  const nodes = ((project.blueprint as { nodes?: Array<{ id: string; name: string; group: string }> })?.nodes) ?? [];
  return (
    <div className="space-y-4">
      <header>
        <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal">Step 8</div>
        <h2 className="font-display text-3xl text-ink mt-1">System Blueprint</h2>
        <p className="text-sm text-ink/60 mt-1">The future operating system, node by node.</p>
      </header>
      <StepStateBar projectId={projectId} step="blueprint" current={project.step_states?.["blueprint"]} />
      <SourceEvidence projectId={projectId} step="blueprint" />

      {nodes.length === 0 ? (
        <SectionCard title="Blueprint"><EmptyState title="No blueprint yet" /></SectionCard>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
          {nodes.map((n) => (
            <div key={n.id} className={`rounded-xl border-2 p-3 shadow-sm ${GROUP_TONE[n.group] ?? "border-border bg-card"}`}>
              <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink/50">{n.group}</div>
              <div className="font-medium text-ink mt-1 text-sm">{n.name}</div>
            </div>
          ))}
        </div>
      )}
      <SectionCard title="Edit blueprint">
        <StepEditor projectId={projectId} step="blueprint" data={project.blueprint} expectedUpdatedAt={project.updated_at} />
      </SectionCard>
    </div>
  );
}
