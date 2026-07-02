import { createFileRoute } from "@tanstack/react-router";
import { EmptyState, SectionCard } from "@/components/engine/primitives";

export const Route = createFileRoute("/engine/templates")({
  component: () => (
    <div className="max-w-[1200px]">
      <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal">Library</div>
      <h1 className="font-display text-4xl text-ink mt-1 mb-6">Templates</h1>
      <SectionCard title="Roadmap templates">
        <EmptyState title="Coming in the next build" hint="Reusable roadmap and diagnosis templates will live here." />
      </SectionCard>
    </div>
  ),
});
