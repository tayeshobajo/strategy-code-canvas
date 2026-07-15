import { createFileRoute, Link } from "@tanstack/react-router";
import { Database } from "lucide-react";
import { WORKSPACE_STEPS } from "@/lib/engine-workspace";

export const Route = createFileRoute("/engine/projects/$projectId/sources")({
  component: SourcesHub,
});

const GROUPS: Array<{ heading: string; steps: number[] }> = [
  { heading: "Intelligence",          steps: [1, 2, 3] },
  { heading: "Diagnosis",             steps: [4, 5, 6, 7, 8] },
  { heading: "Roadmap Construction",  steps: [9, 10, 11, 12] },
  { heading: "Delivery Prep",         steps: [13, 14] },
];

function SourcesHub() {
  const { projectId } = Route.useParams();
  return (
    <div className="space-y-6" data-qa-tab-view="sources">
      <div>
        <div className="flex items-center gap-2 text-ink">
          <Database className="w-4 h-4" />
          <h2 className="font-display text-2xl">Sources &amp; Intelligence</h2>
        </div>
        <p className="text-sm text-ink/60 mt-2 max-w-2xl">
          The 14 processing rooms behind the Spine. Raw information, drafts, extraction, and
          reasoning live here. Approved conclusions are promoted into the Spine.
        </p>
      </div>

      {GROUPS.map((group) => (
        <section key={group.heading}>
          <h3 className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink/50 mb-2">
            {group.heading}
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.steps.map((num) => {
              const step = WORKSPACE_STEPS.find((s) => s.num === num);
              if (!step) return null;
              const suffix = step.to.split("/").pop() ?? "";
              const to =
                `/engine/projects/$projectId/${suffix}` as unknown as "/engine/projects/$projectId/spine";
              return (
                <Link
                  key={step.key}
                  to={to}
                  params={{ projectId }}
                  className="rounded-xl border border-border bg-card p-4 shadow-sm hover:border-ink/40 transition-colors"
                  data-qa-source-step={step.key}
                >
                  <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink/50">
                    Step {step.num}
                  </div>
                  <div className="mt-1 font-display text-base text-ink">{step.label}</div>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
