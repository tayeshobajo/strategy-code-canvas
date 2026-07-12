import { createFileRoute } from "@tanstack/react-router";
import { useWorkspace } from "@/hooks/use-workspace";
import { StepAiPanelFor } from "@/components/engine/StepAiPanelFor";
import { SectionCard } from "@/components/engine/primitives";
import { StepEditor } from "@/components/engine/StepEditor";
import { StepStateBar, SourceEvidence } from "@/components/engine/StepState";
import { EpistemicStatusChip } from "@/components/engine/EpistemicStatusChip";
import type { EpistemicStatus, SourceRef } from "@/lib/engine-epistemic.functions";

export const Route = createFileRoute("/engine/projects/$projectId/point-b")({
  component: PointB,
});

const SECTIONS: Array<{ key: string; label: string }> = [
  { key: "24_month_destination", label: "24-month destination" },
  { key: "10_year_position", label: "10-year position" },
  { key: "client_outcome", label: "Client outcome" },
  { key: "customer_outcome", label: "Customer outcome" },
  { key: "operational_outcome", label: "Operational outcome" },
  { key: "revenue_outcome", label: "Revenue outcome" },
  { key: "brand_position", label: "Brand position" },
];

function PointB() {
  const { projectId } = Route.useParams();
  const { project } = useWorkspace(projectId);
  const data = (project.point_b ?? {}) as Record<string, string | undefined>;
  const statusMap = ((project as unknown as { point_b_status?: Record<string, { status: EpistemicStatus; source_ref?: SourceRef }> }).point_b_status) ?? {};

  return (
    <div className="space-y-4">
      <header>
        <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal">Step 5</div>
        <h2 className="font-display text-3xl text-ink mt-1">Point B Definition</h2>
        <p className="text-sm text-ink/60 mt-1">Where the business is headed and what "there" looks like.</p>
      </header>
      <StepStateBar projectId={projectId} step="point-b" current={project.step_states?.["point-b"]} />
      <StepAiPanelFor step="point-b" data={project.point_b} />
      <SourceEvidence projectId={projectId} step="point-b" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {SECTIONS.map((s) => {
          const st = statusMap[s.key];
          return (
            <SectionCard
              key={s.key}
              title={s.label}
              actions={<EpistemicStatusChip status={st?.status} sourceRef={st?.source_ref} />}
            >
              <p className="text-sm text-ink/80">{data[s.key] ?? <span className="text-ink/40">Not defined yet.</span>}</p>
            </SectionCard>
          );
        })}
      </div>
      <SectionCard title="Edit Point B">
        <StepEditor projectId={projectId} step="point-b" data={project.point_b} expectedUpdatedAt={project.updated_at} />
      </SectionCard>
    </div>
  );
}
