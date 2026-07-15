import { createFileRoute, Link } from "@tanstack/react-router";
import { Wrench, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/engine/projects/$projectId/work")({
  component: WorkTab,
});

function WorkTab() {
  const { projectId } = Route.useParams();
  return (
    <div className="space-y-4" data-qa-tab-view="work">
      <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-2 text-ink">
          <Wrench className="w-4 h-4" />
          <h2 className="font-display text-xl">Work</h2>
        </div>
        <p className="text-sm text-ink/60 mt-2 max-w-2xl">
          Milestones in planning, design, build, and QA. Milestone Workspaces (Brief, Plan &
          Acceptance, Mockups, Build & Execution, QA & Evidence, History) arrive in a later
          phase. Today this tab links to the existing execution surfaces.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            to="/engine/projects/$projectId/build-execution"
            params={{ projectId }}
            className="inline-flex items-center gap-1.5 rounded-md bg-ink px-3 py-2 text-sm text-white hover:bg-ink/90"
          >
            Build Execution <ArrowRight className="w-3.5 h-3.5" />
          </Link>
          <Link
            to="/engine/projects/$projectId/implementation-plan"
            params={{ projectId }}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-white px-3 py-2 text-sm text-ink hover:border-ink/40"
          >
            Implementation Plan
          </Link>
          <Link
            to="/engine/projects/$projectId/frame-builder"
            params={{ projectId }}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-white px-3 py-2 text-sm text-ink hover:border-ink/40"
          >
            Frames
          </Link>
          <Link
            to="/engine/projects/$projectId/mockup-builder"
            params={{ projectId }}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-white px-3 py-2 text-sm text-ink hover:border-ink/40"
          >
            Mockups
          </Link>
          <Link
            to="/engine/projects/$projectId/agent/tasks"
            params={{ projectId }}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-white px-3 py-2 text-sm text-ink hover:border-ink/40"
          >
            Agent Tasks
          </Link>
        </div>
      </section>
    </div>
  );
}
