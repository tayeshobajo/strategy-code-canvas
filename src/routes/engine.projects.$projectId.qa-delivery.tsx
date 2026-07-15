import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldCheck, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/engine/projects/$projectId/qa-delivery")({
  component: QaDeliveryTab,
});

function QaDeliveryTab() {
  const { projectId } = Route.useParams();
  return (
    <div className="space-y-4" data-qa-tab-view="qa-delivery">
      <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-2 text-ink">
          <ShieldCheck className="w-4 h-4" />
          <h2 className="font-display text-xl">QA &amp; Delivery</h2>
        </div>
        <p className="text-sm text-ink/60 mt-2 max-w-2xl">
          Evidence, automated and human QA, delivery readiness. Rich per-milestone QA surfaces
          arrive in a later phase.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            to="/engine/projects/$projectId/evidence"
            params={{ projectId }}
            className="inline-flex items-center gap-1.5 rounded-md bg-ink px-3 py-2 text-sm text-white hover:bg-ink/90"
          >
            Evidence <ArrowRight className="w-3.5 h-3.5" />
          </Link>
          <Link
            to="/engine/projects/$projectId/qa-factory"
            params={{ projectId }}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-white px-3 py-2 text-sm text-ink hover:border-ink/40"
          >
            QA Factory
          </Link>
          <Link
            to="/engine/projects/$projectId/delivery"
            params={{ projectId }}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-white px-3 py-2 text-sm text-ink hover:border-ink/40"
          >
            Delivery Prep
          </Link>
        </div>
      </section>
    </div>
  );
}
