import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { useWorkspace } from "@/hooks/use-workspace";
import { SectionCard } from "@/components/engine/primitives";
import { StepEditor } from "@/components/engine/StepEditor";
import { StepStateBar, SourceEvidence } from "@/components/engine/StepState";
import { listStepEvidence, type StepEvidence } from "@/lib/engine.functions";

export const Route = createFileRoute("/engine/projects/$projectId/extraction")({
  component: Extraction,
});

// Friendly labels for `engine_extracted_signals.category` — the taxonomy the
// AI pipeline actually writes (see SIGNAL_CATEGORIES in engine-ai-providers).
const CATEGORY_LABELS: Record<string, string> = {
  goal: "Goals",
  pain: "Pains",
  opportunity: "Opportunities",
  deadline: "Deadlines",
  constraint: "Constraints",
  decision_maker: "Decision makers",
  hidden_asset: "Hidden assets",
  risk: "Risks",
  required_system: "Required systems",
  milestone_candidate: "Milestone candidates",
  investment_signal: "Investment signals",
  client_language: "Client language",
  open_question: "Open questions",
  business_model: "Business model",
  current_system: "Current system",
};

function Extraction() {
  const { projectId } = Route.useParams();
  const { project } = useWorkspace(projectId);
  // Pipeline extraction module shape: { confidence, items: string[] }.
  const data = (project.extraction ?? {}) as { confidence?: number; items?: string[] };
  const items = Array.isArray(data.items) ? data.items.filter((i) => typeof i === "string") : [];

  const evidenceFn = useServerFn(listStepEvidence);
  const { data: signals, isLoading } = useQuery({
    queryKey: ["engine", "step-evidence", projectId, "extraction", "all"],
    // Empty categories → listStepEvidence returns all extracted signals.
    queryFn: () => evidenceFn({ data: { id: projectId, categories: [] } }) as Promise<StepEvidence[]>,
  });
  const grouped = new Map<string, StepEvidence[]>();
  for (const s of signals ?? []) {
    const list = grouped.get(s.category) ?? [];
    list.push(s);
    grouped.set(s.category, list);
  }

  return (
    <div className="space-y-4">
      <header>
        <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal">Step 3</div>
        <h2 className="font-display text-3xl text-ink mt-1">Signal Extraction</h2>
        <p className="text-sm text-ink/60 mt-1">Structured intelligence extracted from the Signal Room.</p>
      </header>
      <StepStateBar projectId={projectId} step="extraction" current={project.step_states?.extraction} />

      <SectionCard title={`Extraction summary${typeof data.confidence === "number" ? ` · ${Math.round(data.confidence)}% confidence` : ""}`}>
        {items.length > 0 ? (
          <ul className="space-y-1.5">
            {items.map((item, i) => (
              <li key={i} className="text-sm text-ink/80 flex gap-2">
                <span className="text-royal">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-sm text-ink/40">Not extracted yet.</div>
        )}
      </SectionCard>

      <SectionCard title="Extracted signals by category">
        {isLoading ? (
          <div className="text-xs text-ink/40 inline-flex items-center gap-1.5">
            <Loader2 className="w-3 h-3 animate-spin" /> Loading…
          </div>
        ) : grouped.size === 0 ? (
          <div className="text-sm text-ink/40">No signals extracted yet.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[...grouped.entries()].map(([category, rows]) => (
              <div key={category} className="rounded-md border border-border bg-white p-3">
                <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink/50 mb-2">
                  {CATEGORY_LABELS[category] ?? category} · {rows.length}
                </div>
                <ul className="space-y-2">
                  {rows.map((s) => (
                    <li key={s.id}>
                      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-ink/50">
                        <span>{s.confidence}%</span>
                        {s.source_name ? (
                          <>
                            <span>·</span>
                            <span className="truncate max-w-[200px]">{s.source_name}</span>
                          </>
                        ) : null}
                      </div>
                      <div className="text-sm text-ink mt-0.5">{s.label}</div>
                      {s.detail ? <div className="text-xs text-ink/60 mt-0.5 line-clamp-3">{s.detail}</div> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SourceEvidence projectId={projectId} step="extraction" />
      <SectionCard title="Edit extraction">
        <StepEditor projectId={projectId} step="extraction" data={project.extraction} />
      </SectionCard>
    </div>
  );
}
