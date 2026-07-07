import { createFileRoute } from "@tanstack/react-router";
import { useWorkspace } from "@/hooks/use-workspace";
import { SectionCard, EmptyState } from "@/components/engine/primitives";
import { StepEditor } from "@/components/engine/StepEditor";
import { StepStateBar, SourceEvidence } from "@/components/engine/StepState";
import { OperatorLockNotice } from "@/components/engine/OperatorLockNotice";
import { useEngineRole } from "@/hooks/useEngineRole";

export const Route = createFileRoute("/engine/projects/$projectId/investment")({
  component: Investment,
});

type Phase = {
  name: string;
  outcome?: string;
  systems?: string[];
  timeline?: string;
  range?: string;
  dependencies?: string;
  risks?: string;
  exclusions?: string;
};

function Investment() {
  const { projectId } = Route.useParams();
  const { project } = useWorkspace(projectId);
  const { canEditInvestment, adminOnlyReason } = useEngineRole();
  const phases = ((project.investment as { phases?: Phase[] })?.phases) ?? [];
  return (
    <div className="space-y-4">
      <header>
        <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal">Step 12</div>
        <h2 className="font-display text-3xl text-ink mt-1">Investment Builder</h2>
        <p className="text-sm text-ink/60 mt-1">Roadmap turned into a phased, transparent investment plan.</p>
      </header>
      <StepStateBar projectId={projectId} step="investment" current={project.step_states?.["investment"]} />
      <SourceEvidence projectId={projectId} step="investment" />

      {phases.length === 0 ? (
        <SectionCard title="Phases"><EmptyState title="No phases yet" /></SectionCard>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {phases.map((p) => (
            <div key={p.name} className="rounded-xl border border-border bg-card p-5 shadow-sm flex flex-col">
              <div className="font-display text-lg text-ink">{p.name}</div>
              <div className="text-xs text-ink/60 mt-1">{p.timeline}</div>
              <div className="font-display text-2xl text-royal mt-3">{p.range}</div>
              <div className="mt-4 space-y-3 text-sm flex-1">
                <Row label="Outcome" v={p.outcome} />
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-wider text-ink/50">Systems</div>
                  <ul className="mt-1 flex flex-wrap gap-1">
                    {(p.systems ?? []).map((s, i) => (
                      <li key={i} className="text-[11px] border border-border rounded-full px-2 py-0.5 text-ink/80">{s}</li>
                    ))}
                  </ul>
                </div>
                <Row label="Dependencies" v={p.dependencies} />
                <Row label="Risks" v={p.risks} />
                <Row label="Exclusions" v={p.exclusions} />
              </div>
            </div>
          ))}
        </div>
      )}
      <SectionCard title="Edit investment" right={!canEditInvestment ? <OperatorLockNotice message={adminOnlyReason} /> : undefined}>
        {canEditInvestment ? (
          <StepEditor projectId={projectId} step="investment" data={project.investment} expectedUpdatedAt={project.updated_at} />
        ) : (
          <p className="text-sm text-ink/60">Investment ranges are read-only in the operator view. Ask an admin to adjust phases or amounts.</p>
        )}
      </SectionCard>
    </div>
  );
}

function Row({ label, v }: { label: string; v?: string }) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-wider text-ink/50">{label}</div>
      <div className="text-ink/80 mt-0.5">{v ?? "—"}</div>
    </div>
  );
}
