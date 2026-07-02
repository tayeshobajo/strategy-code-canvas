import { createFileRoute } from "@tanstack/react-router";
import { EmptyState, SectionCard } from "@/components/engine/primitives";

export const Route = createFileRoute("/engine/execution")({
  component: () => (
    <div className="max-w-[1200px]">
      <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal">Delivery</div>
      <h1 className="font-display text-4xl text-ink mt-1 mb-6">Execution Tracker</h1>
      <SectionCard title="In execution">
        <EmptyState title="Coming in the next build" hint="Live build progress and milestones live here." />
      </SectionCard>
    </div>
  ),
});
