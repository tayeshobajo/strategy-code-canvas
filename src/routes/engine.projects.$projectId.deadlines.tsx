import { createFileRoute } from "@tanstack/react-router";
import { useWorkspace } from "@/hooks/use-workspace";
import { SectionCard, EmptyState, formatDate } from "@/components/engine/primitives";
import { StepEditor } from "@/components/engine/StepEditor";
import { StepStateBar, SourceEvidence } from "@/components/engine/StepState";

export const Route = createFileRoute("/engine/projects/$projectId/deadlines")({
  component: Deadlines,
});

type Milestone = {
  name: string;
  due_on: string;
  must_haves?: string[];
  owners?: string;
  risks?: string[];
  fallback?: string;
  can_wait?: string[];
};

function Deadlines() {
  const { projectId } = Route.useParams();
  const { project } = useWorkspace(projectId);
  const ms = ((project.deadlines as { milestones?: Milestone[] })?.milestones) ?? [];
  return (
    <div className="space-y-4">
      <header>
        <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal">Step 11</div>
        <h2 className="font-display text-3xl text-ink mt-1">Deadline Plan</h2>
        <p className="text-sm text-ink/60 mt-1">Protect the real dates the business is counting on.</p>
      </header>
      <StepStateBar projectId={projectId} step="deadlines" current={project.step_states?.["deadlines"]} />
      <SourceEvidence projectId={projectId} step="deadlines" />

      {ms.length === 0 ? (
        <SectionCard title="Deadlines"><EmptyState title="No deadlines set" /></SectionCard>
      ) : (
        <div className="space-y-4">
          {ms.map((m) => (
            <div key={m.name} className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-wider text-royal">Milestone</div>
                  <div className="font-display text-2xl text-ink mt-1">{m.name}</div>
                  <div className="text-xs text-ink/60 mt-1">Due {formatDate(m.due_on)} · Owners: {m.owners ?? "—"}</div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <Block title="Must-have systems" items={m.must_haves} />
                <Block title="Risks" items={m.risks} />
                <Block title="Can wait" items={m.can_wait} />
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-wider text-ink/50">Fallback plan</div>
                  <p className="text-sm text-ink/80 mt-1">{m.fallback ?? "—"}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <SectionCard title="Edit deadlines">
        <StepEditor projectId={projectId} step="deadlines" data={project.deadlines} />
      </SectionCard>
    </div>
  );
}

function Block({ title, items }: { title: string; items?: string[] }) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-wider text-ink/50">{title}</div>
      {items && items.length > 0 ? (
        <ul className="mt-1 list-disc list-inside text-sm text-ink/80 space-y-0.5">
          {items.map((i, idx) => <li key={idx}>{i}</li>)}
        </ul>
      ) : (
        <div className="text-sm text-ink/40 mt-1">—</div>
      )}
    </div>
  );
}
