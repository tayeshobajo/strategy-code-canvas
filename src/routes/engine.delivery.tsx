import { createFileRoute } from "@tanstack/react-router";
import { EmptyState, SectionCard } from "@/components/engine/primitives";

export const Route = createFileRoute("/engine/delivery")({
  component: () => (
    <div className="max-w-[1200px]">
      <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal">Handoff</div>
      <h1 className="font-display text-4xl text-ink mt-1 mb-6">Delivery Room</h1>
      <SectionCard title="Deliveries">
        <EmptyState title="Coming in the next build" hint="Approved roadmaps ready to hand off appear here." />
      </SectionCard>
    </div>
  ),
});
