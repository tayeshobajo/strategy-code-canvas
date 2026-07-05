import { createFileRoute } from "@tanstack/react-router";
import { useWorkspace } from "@/hooks/use-workspace";
import { SectionCard } from "@/components/engine/primitives";
import { StepEditor } from "@/components/engine/StepEditor";
import { StepStateBar, SourceEvidence } from "@/components/engine/StepState";

export const Route = createFileRoute("/engine/projects/$projectId/extraction")({
  component: Extraction,
});

const CATEGORIES = [
  { key: "what_built", label: "What they built" },
  { key: "business_model", label: "Business model" },
  { key: "current_system", label: "Current system" },
  { key: "what_heavy", label: "What feels heavy" },
  { key: "where_next", label: "Where they need to be" },
  { key: "already_tried", label: "What they already tried" },
  { key: "hidden_assets", label: "Hidden assets" },
  { key: "deadlines", label: "Deadlines" },
  { key: "risks", label: "Risks" },
  { key: "opportunities", label: "Opportunities" },
  { key: "decision_makers", label: "Decision makers" },
  { key: "buyer_psych", label: "Buyer psychology" },
];

function Extraction() {
  const { projectId } = Route.useParams();
  const { project } = useWorkspace(projectId);
  const data = (project.extraction ?? {}) as Record<string, unknown>;

  return (
    <div className="space-y-4">
      <header>
        <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal">Step 3</div>
        <h2 className="font-display text-3xl text-ink mt-1">Signal Extraction</h2>
        <p className="text-sm text-ink/60 mt-1">Structured intelligence extracted from the Signal Room.</p>
      </header>
      <StepStateBar projectId={projectId} step="extraction" current={project.step_states?.extraction} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {CATEGORIES.map((c) => (
          <SectionCard key={c.key} title={c.label}>
            {data[c.key] ? (
              <pre className="text-xs text-ink/80 whitespace-pre-wrap font-mono">{typeof data[c.key] === "string" ? String(data[c.key]) : JSON.stringify(data[c.key], null, 2)}</pre>
            ) : (
              <div className="text-sm text-ink/40">Not extracted yet.</div>
            )}
          </SectionCard>
        ))}
      </div>
      <SourceEvidence projectId={projectId} step="extraction" />
      <SectionCard title="Edit extraction">
        <StepEditor projectId={projectId} step="extraction" data={project.extraction} />
      </SectionCard>
    </div>
  );
}
