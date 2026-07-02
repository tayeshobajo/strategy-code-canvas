import { createFileRoute } from "@tanstack/react-router";
import { EmptyState, SectionCard } from "@/components/engine/primitives";

export const Route = createFileRoute("/engine/review")({
  component: () => (
    <div className="max-w-[1200px]">
      <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal">Workflow</div>
      <h1 className="font-display text-4xl text-ink mt-1 mb-6">Review &amp; Approvals</h1>
      <SectionCard title="Review queue">
        <EmptyState title="Coming in the next build" hint="Roadmap review, comment, and approval flow lands here." />
      </SectionCard>
    </div>
  ),
});
