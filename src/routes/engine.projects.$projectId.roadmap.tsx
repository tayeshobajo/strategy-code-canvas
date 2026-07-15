import { createFileRoute, Link } from "@tanstack/react-router";
import { Map, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/engine/projects/$projectId/roadmap")({
  component: RoadmapTab,
});

function RoadmapTab() {
  const { projectId } = Route.useParams();
  return (
    <div className="space-y-4" data-qa-tab-view="roadmap">
      <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-2 text-ink">
          <Map className="w-4 h-4" />
          <h2 className="font-display text-xl">Business Roadmap</h2>
        </div>
        <p className="text-sm text-ink/60 mt-2 max-w-2xl">
          Phase and milestone architecture for this project. The rich Spine 2.0 roadmap view
          arrives in a later phase; today this tab links to the underlying builder and
          sequencing tools.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            to="/engine/projects/$projectId/builder"
            params={{ projectId }}
            className="inline-flex items-center gap-1.5 rounded-md bg-ink px-3 py-2 text-sm text-white hover:bg-ink/90"
          >
            Open Roadmap Builder <ArrowRight className="w-3.5 h-3.5" />
          </Link>
          <Link
            to="/engine/projects/$projectId/sequencing"
            params={{ projectId }}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-white px-3 py-2 text-sm text-ink hover:border-ink/40"
          >
            Sequencing
          </Link>
          <Link
            to="/engine/projects/$projectId/deadlines"
            params={{ projectId }}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-white px-3 py-2 text-sm text-ink hover:border-ink/40"
          >
            Deadlines
          </Link>
          <Link
            to="/engine/projects/$projectId/investment"
            params={{ projectId }}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-white px-3 py-2 text-sm text-ink hover:border-ink/40"
          >
            Investment
          </Link>
        </div>
      </section>
    </div>
  );
}
