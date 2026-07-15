import { createFileRoute, Link } from "@tanstack/react-router";
import { Eye, ArrowRight, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/engine/projects/$projectId/client-view")({
  component: ClientViewTab,
});

function ClientViewTab() {
  const { projectId } = Route.useParams();
  return (
    <div className="space-y-4" data-qa-tab-view="client-view">
      <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-2 text-ink">
          <Eye className="w-4 h-4" />
          <h2 className="font-display text-xl">Client View</h2>
        </div>
        <p className="text-sm text-ink/60 mt-2 max-w-2xl">
          What the client sees. The Client Roadmap Studio — narrative generation, branded
          templates, PDF export, and completeness gate — arrives in a later phase. Today this
          tab links to the existing preview and publish history.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            to="/engine/projects/$projectId/preview"
            params={{ projectId }}
            className="inline-flex items-center gap-1.5 rounded-md bg-ink px-3 py-2 text-sm text-white hover:bg-ink/90"
          >
            Client Preview <ArrowRight className="w-3.5 h-3.5" />
          </Link>
          <Link
            to="/engine/projects/$projectId/publish-history"
            params={{ projectId }}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-white px-3 py-2 text-sm text-ink hover:border-ink/40"
          >
            Publish History
          </Link>
          <a
            href="/portal"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-white px-3 py-2 text-sm text-ink hover:border-ink/40"
          >
            Open Client Portal <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </section>
    </div>
  );
}
