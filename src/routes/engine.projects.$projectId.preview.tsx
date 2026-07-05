import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { z } from "zod";
import { useWorkspace } from "@/hooks/use-workspace";
import { SectionCard } from "@/components/engine/primitives";
import { StepEditor } from "@/components/engine/StepEditor";
import { StepStateBar, SourceEvidence } from "@/components/engine/StepState";
import { OperatorLockNotice } from "@/components/engine/OperatorLockNotice";
import { useEngineRole } from "@/hooks/useEngineRole";
import { FileText, Presentation } from "lucide-react";
import { exportClientRoadmapPdf } from "@/lib/roadmap-pdf";
import { PresentationMode } from "@/components/engine/PresentationMode";

export const Route = createFileRoute("/engine/projects/$projectId/preview")({
  component: ClientPreview,
  validateSearch: z.object({ present: z.string().optional() }),
});

function ClientPreview() {
  const { projectId } = Route.useParams();
  const { project } = useWorkspace(projectId);
  const search = useSearch({ from: "/engine/projects/$projectId/preview" });
  const navigate = useNavigate();
  const { canEditClientPreview, adminOnlyReason } = useEngineRole();
  const isPresenting = search.present === "1";
  const point_a = project.point_a as { key_diagnosis?: string };
  const point_b = project.point_b as Record<string, string | undefined>;
  const phases = ((project.investment as { phases?: Array<{ name: string; outcome?: string; timeline?: string; range?: string }> })?.phases) ?? [];
  const nodes = ((project.blueprint as { nodes?: Array<{ name: string; group: string }> })?.nodes) ?? [];

  return (
    <div className="space-y-4">
      {isPresenting ? (
        <PresentationMode
          project={project}
          onClose={() => navigate({ to: ".", search: {}, replace: true })}
        />
      ) : null}
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal">Step 13</div>
          <h2 className="font-display text-3xl text-ink mt-1">Client-Facing Roadmap Preview</h2>
          <p className="text-sm text-ink/60 mt-1">The clean, client-safe roadmap. Internal notes are hidden.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => exportClientRoadmapPdf(project)}
            className="inline-flex items-center gap-1.5 text-xs border border-border rounded-md px-3 py-1.5 text-ink hover:border-royal/50"
          >
            <FileText className="w-3.5 h-3.5" /> Download PDF
          </button>
          <button
            onClick={() => navigate({ to: ".", search: { present: "1" }, replace: false })}
            className="inline-flex items-center gap-1.5 text-xs bg-ink text-white rounded-md px-3 py-1.5 hover:bg-ink/90"
          >
            <Presentation className="w-3.5 h-3.5" /> Presentation mode
          </button>
        </div>
      </header>
      <StepStateBar projectId={projectId} step="preview" current={project.step_states?.["preview"]} />
      <SourceEvidence projectId={projectId} step="preview" />


      <div className="rounded-xl border border-border bg-paper-soft p-8 shadow-sm space-y-8">
        <section>
          <div className="font-mono text-[11px] uppercase tracking-[0.24em] text-royal">Executive Summary</div>
          <h1 className="font-display text-3xl text-ink mt-1">{project.name} · Roadmap</h1>
          <p className="text-ink/80 mt-3 max-w-3xl">{point_a.key_diagnosis ?? "—"}</p>
        </section>

        <section>
          <div className="font-mono text-[11px] uppercase tracking-[0.24em] text-royal">Point A → Point B</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
            <div className="rounded-lg bg-white border border-border p-4">
              <div className="text-xs text-ink/60">Today</div>
              <p className="text-ink mt-1 text-sm">{point_a.key_diagnosis ?? "—"}</p>
            </div>
            <div className="rounded-lg bg-white border border-border p-4">
              <div className="text-xs text-ink/60">Where we're headed</div>
              <p className="text-ink mt-1 text-sm">{point_b["24_month_destination"] ?? "—"}</p>
            </div>
          </div>
        </section>

        <section>
          <div className="font-mono text-[11px] uppercase tracking-[0.24em] text-royal">Phased Roadmap</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
            {phases.map((p) => (
              <div key={p.name} className="rounded-lg bg-white border border-border p-4">
                <div className="font-medium text-ink">{p.name}</div>
                <div className="text-xs text-ink/60 mt-1">{p.timeline}</div>
                <div className="text-sm text-ink/80 mt-2">{p.outcome}</div>
                <div className="text-royal text-sm mt-2">{p.range}</div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <div className="font-mono text-[11px] uppercase tracking-[0.24em] text-royal">System Blueprint</div>
          <div className="flex flex-wrap gap-2 mt-2">
            {nodes.map((n) => (
              <span key={n.name} className="text-xs border border-border bg-white rounded-full px-3 py-1 text-ink/80">{n.name}</span>
            ))}
          </div>
        </section>

        <section>
          <div className="font-mono text-[11px] uppercase tracking-[0.24em] text-royal">Investment Summary</div>
          <div className="text-sm text-ink/80 mt-2">
            {phases.length} phases · Ranges shown above · Full breakdown available on request.
          </div>
        </section>
      </div>

      <SectionCard title="Edit preview overrides" right={!canEditClientPreview ? <OperatorLockNotice message={adminOnlyReason} /> : undefined}>
        {canEditClientPreview ? (
          <StepEditor projectId={projectId} step="preview" data={project.client_preview} />
        ) : (
          <p className="text-sm text-ink/60">Client-facing preview content is admin-only. Operators can view the preview and export the PDF, but cannot edit what the client sees.</p>
        )}
      </SectionCard>
    </div>
  );
}
