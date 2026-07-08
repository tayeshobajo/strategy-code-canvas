import { createFileRoute } from "@tanstack/react-router";
import { useWorkspace } from "@/hooks/use-workspace";
import { StepAiPanelFor } from "@/components/engine/StepAiPanelFor";
import { SectionCard, EmptyState } from "@/components/engine/primitives";
import { StepEditor } from "@/components/engine/StepEditor";
import { StepStateBar, SourceEvidence } from "@/components/engine/StepState";

export const Route = createFileRoute("/engine/projects/$projectId/gap-map")({
  component: GapMap,
});

function GapMap() {
  const { projectId } = Route.useParams();
  const { project } = useWorkspace(projectId);
  const cats = ((project.gap_map as { categories?: Array<{ name: string; items: string[] }> })?.categories) ?? [];
  return (
    <div className="space-y-4">
      <header>
        <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal">Step 7</div>
        <h2 className="font-display text-3xl text-ink mt-1">Gap Map</h2>
        <p className="text-sm text-ink/60 mt-1">What's missing between Point A and Point B.</p>
      </header>
      <StepStateBar projectId={projectId} step="gap-map" current={project.step_states?.["gap-map"]} />
      <StepAiPanelFor step="gap-map" data={project.gap_map} />
      <SourceEvidence projectId={projectId} step="gap-map" />

      {cats.length === 0 ? (
        <SectionCard title="Gaps"><EmptyState title="No gaps mapped yet" /></SectionCard>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {cats.map((c) => (
            <div key={c.name} className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#a4283c]">{c.name} GAPS</div>
              <ul className="mt-2 space-y-1 text-sm text-ink/80 list-disc list-inside">
                {c.items.map((it, i) => <li key={i}>{it}</li>)}
              </ul>
            </div>
          ))}
        </div>
      )}
      <SectionCard title="Edit gap map">
        <StepEditor projectId={projectId} step="gap-map" data={project.gap_map} expectedUpdatedAt={project.updated_at} />
      </SectionCard>
    </div>
  );
}
