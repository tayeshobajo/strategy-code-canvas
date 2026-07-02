import { createFileRoute } from "@tanstack/react-router";
import { EmptyState, SectionCard } from "@/components/engine/primitives";

export const Route = createFileRoute("/engine/intelligence")({
  component: () => (
    <div className="max-w-[1200px]">
      <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal">Memory</div>
      <h1 className="font-display text-4xl text-ink mt-1 mb-6">Intelligence Memory</h1>
      <SectionCard title="Institutional memory">
        <EmptyState title="Coming in the next build" hint="Patterns, playbooks, and reusable client insight will live here." />
      </SectionCard>
    </div>
  ),
});
