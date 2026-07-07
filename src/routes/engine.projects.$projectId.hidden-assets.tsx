import { createFileRoute } from "@tanstack/react-router";
import { useWorkspace } from "@/hooks/use-workspace";
import { SectionCard, EmptyState } from "@/components/engine/primitives";
import { StepEditor } from "@/components/engine/StepEditor";
import { StepStateBar, SourceEvidence } from "@/components/engine/StepState";

export const Route = createFileRoute("/engine/projects/$projectId/hidden-assets")({
  component: HiddenAssets,
});

function HiddenAssets() {
  const { projectId } = Route.useParams();
  const { project } = useWorkspace(projectId);
  const cats = ((project.hidden_assets as { categories?: Array<{ name: string; items: string[] }> })?.categories) ?? [];
  return (
    <div className="space-y-4">
      <header>
        <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal">Step 6</div>
        <h2 className="font-display text-3xl text-ink mt-1">Hidden Asset Map</h2>
        <p className="text-sm text-ink/60 mt-1">What they already own that can become leverage.</p>
      </header>
      <StepStateBar projectId={projectId} step="hidden-assets" current={project.step_states?.["hidden-assets"]} />
      <SourceEvidence projectId={projectId} step="hidden-assets" />

      {cats.length === 0 ? (
        <SectionCard title="Assets"><EmptyState title="No assets mapped yet" /></SectionCard>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {cats.map((c) => (
            <div key={c.name} className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink/50">{c.name}</div>
              <ul className="mt-2 space-y-1 text-sm text-ink/80 list-disc list-inside">
                {c.items.map((it, i) => <li key={i}>{it}</li>)}
              </ul>
            </div>
          ))}
        </div>
      )}
      <SectionCard title="Edit hidden assets">
        <StepEditor projectId={projectId} step="hidden-assets" data={project.hidden_assets} expectedUpdatedAt={project.updated_at} />
      </SectionCard>
    </div>
  );
}
