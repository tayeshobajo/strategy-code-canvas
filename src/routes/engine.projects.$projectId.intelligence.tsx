import { createFileRoute } from "@tanstack/react-router";
import { SectionCard } from "@/components/engine/primitives";

export const Route = createFileRoute("/engine/projects/$projectId/intelligence")({
  component: () => (
    <div className="space-y-4">
      <StepHeader step={1} title="Intelligence Layer" caption="Institutional memory & AI context for this project." />
      <SectionCard title="Context">
        <p className="text-sm text-ink/70">
          Patterns, playbooks, and reusable insight surfaced from prior clients and this project's own memory land here.
          Wire the LLM retrieval layer next; this page is the surface for what it already knows.
        </p>
      </SectionCard>
    </div>
  ),
});

function StepHeader({ step, title, caption }: { step: number; title: string; caption: string }) {
  return (
    <header>
      <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal">Step {step}</div>
      <h2 className="font-display text-3xl text-ink mt-1">{title}</h2>
      <p className="text-sm text-ink/60 mt-1">{caption}</p>
    </header>
  );
}
