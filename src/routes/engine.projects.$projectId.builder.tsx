import { createFileRoute } from "@tanstack/react-router";
import { useWorkspace } from "@/hooks/use-workspace";
import { SectionCard, EmptyState } from "@/components/engine/primitives";
import { StepEditor } from "@/components/engine/StepEditor";
import { StepStateBar, SourceEvidence } from "@/components/engine/StepState";

export const Route = createFileRoute("/engine/projects/$projectId/builder")({
  component: Builder,
});

type Milestone = {
  name: string;
  purpose?: string;
  related_gap?: string;
  related_asset?: string;
  system_node?: string;
  phase?: string;
  dependency?: string;
  deadline_relevance?: string;
  risk?: string;
  success_metric?: string;
  client_facing?: string;
  internal_notes?: string;
};

function Builder() {
  const { projectId } = Route.useParams();
  const { project } = useWorkspace(projectId);
  const ms = ((project.roadmap as { milestones?: Milestone[] })?.milestones) ?? [];

  return (
    <div className="space-y-4">
      <header>
        <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal">Step 9</div>
        <h2 className="font-display text-3xl text-ink mt-1">Roadmap Builder</h2>
        <p className="text-sm text-ink/60 mt-1">Blueprint nodes become ordered, dependency-aware milestones.</p>
      </header>
      <StepStateBar projectId={projectId} step="builder" current={project.step_states?.["builder"]} />
      <SourceEvidence projectId={projectId} step="builder" />

      {ms.length === 0 ? (
        <SectionCard title="Milestones"><EmptyState title="No milestones yet" hint="Add milestones through the JSON editor below." /></SectionCard>
      ) : (
        <div className="space-y-3">
          {ms.map((m, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-wider text-ink/50">Milestone {i + 1} · {m.phase ?? "Unphased"}</div>
                  <div className="font-display text-lg text-ink">{m.name}</div>
                </div>
                {m.system_node ? <span className="text-xs text-royal">{m.system_node}</span> : null}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 text-xs">
                <Field label="Purpose" v={m.purpose} />
                <Field label="Related gap" v={m.related_gap} />
                <Field label="Related asset" v={m.related_asset} />
                <Field label="Dependency" v={m.dependency} />
                <Field label="Deadline relevance" v={m.deadline_relevance} />
                <Field label="Risk" v={m.risk} />
                <Field label="Success metric" v={m.success_metric} />
                <Field label="Client-facing" v={m.client_facing} />
              </div>
              {m.internal_notes ? (
                <div className="mt-3 text-xs text-ink/60 border-t border-border pt-2">
                  <span className="font-mono uppercase tracking-wider text-ink/40">Internal:</span> {m.internal_notes}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
      <SectionCard title="Edit roadmap">
        <StepEditor projectId={projectId} step="builder" data={project.roadmap} />
      </SectionCard>
    </div>
  );
}

function Field({ label, v }: { label: string; v?: string }) {
  return (
    <div>
      <div className="font-mono text-[9px] uppercase tracking-wider text-ink/40">{label}</div>
      <div className="text-ink/80 mt-0.5">{v ?? "—"}</div>
    </div>
  );
}
