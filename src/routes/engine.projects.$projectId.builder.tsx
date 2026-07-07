import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDown, ArrowUp, Loader2, ExternalLink } from "lucide-react";
import { useWorkspace } from "@/hooks/use-workspace";
import { SectionCard, EmptyState } from "@/components/engine/primitives";
import { StepEditor } from "@/components/engine/StepEditor";
import { StepStateBar, SourceEvidence } from "@/components/engine/StepState";
import { listMilestonesLive, reorderMilestone, type LiveMilestone } from "@/lib/engine.functions";

export const Route = createFileRoute("/engine/projects/$projectId/builder")({
  component: Builder,
});

type MilestoneJson = {
  name: string;
  purpose?: string;
  related_gap?: string;
  related_asset?: string;
  system_node?: string;
  phase?: string;
  dependency?: string;
  deadline_relevance?: string;
  risk?: string;
  success_metric?: string;
  client_facing?: string;
  internal_notes?: string;
};

function Builder() {
  const { projectId } = Route.useParams();
  const { project } = useWorkspace(projectId);
  const fn = useServerFn(listMilestonesLive);
  const { data: live } = useSuspenseQuery({
    queryKey: ["engine", "milestones-live", projectId],
    queryFn: () => fn({ data: { id: projectId } }) as Promise<LiveMilestone[]>,
  });

  const legacy = ((project.roadmap as { milestones?: MilestoneJson[] })?.milestones) ?? [];

  return (
    <div className="space-y-4">
      <header>
        <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal">Step 9</div>
        <h2 className="font-display text-3xl text-ink mt-1">Roadmap Builder</h2>
        <p className="text-sm text-ink/60 mt-1">
          Live milestones from <code>engine_milestones</code>. Reorder emits a draft change and audit entry.
        </p>
      </header>
      <StepStateBar projectId={projectId} step="builder" current={project.step_states?.builder} />

      {live.length === 0 && legacy.length === 0 ? (
        <SectionCard title="Milestones">
          <EmptyState title="No milestones yet" hint="Add milestones through the JSON editor below or run the AI pipeline." />
        </SectionCard>
      ) : live.length > 0 ? (
        <div className="space-y-3">
          {live.map((m, i) => (
            <LiveRow key={m.id} m={m} index={i} total={live.length} projectId={projectId} />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Showing legacy milestones from roadmap JSON. Persist them into <code>engine_milestones</code> to unlock reorder + evidence.
          </div>
          {legacy.map((m, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-wider text-ink/50">
                    Milestone {i + 1} · {m.phase ?? "Unphased"}
                  </div>
                  <div className="font-display text-lg text-ink">{m.name}</div>
                </div>
                {m.system_node ? <span className="text-xs text-royal">{m.system_node}</span> : null}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 text-xs">
                <Field label="Purpose" v={m.purpose} />
                <Field label="Related gap" v={m.related_gap} />
                <Field label="Related asset" v={m.related_asset} />
                <Field label="Dependency" v={m.dependency} />
                <Field label="Deadline relevance" v={m.deadline_relevance} />
                <Field label="Risk" v={m.risk} />
                <Field label="Success metric" v={m.success_metric} />
                <Field label="Client-facing" v={m.client_facing} />
              </div>
              {m.internal_notes ? (
                <div className="mt-3 text-xs text-ink/60 border-t border-border pt-2">
                  <span className="font-mono uppercase tracking-wider text-ink/40">Internal:</span> {m.internal_notes}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      <SourceEvidence projectId={projectId} step="builder" />

      <SectionCard title="Edit roadmap (JSON)">
        <StepEditor projectId={projectId} step="builder" data={project.roadmap} expectedUpdatedAt={project.updated_at} />
      </SectionCard>
    </div>
  );
}

function LiveRow({
  m,
  index,
  total,
  projectId,
}: {
  m: LiveMilestone;
  index: number;
  total: number;
  projectId: string;
}) {
  const qc = useQueryClient();
  const reorder = useServerFn(reorderMilestone);
  const move = useMutation({
    mutationFn: (direction: "up" | "down") =>
      reorder({ data: { projectId, milestoneId: m.id, direction } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["engine", "milestones-live", projectId] });
      qc.invalidateQueries({ queryKey: ["engine", "workspace", projectId] });
    },
  });

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="font-mono text-[10px] uppercase tracking-wider text-ink/50">
            #{index + 1} · {m.phase ?? "Unphased"} · {m.status}
          </div>
          <div className="font-display text-lg text-ink truncate">{m.name}</div>
        </div>
        <div className="flex items-center gap-1">
          <button
            aria-label="Move up"
            disabled={index === 0 || move.isPending}
            onClick={() => move.mutate("up")}
            className="p-1.5 rounded-md border border-border bg-white hover:bg-paper-soft disabled:opacity-40"
          >
            {move.isPending && move.variables === "up" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowUp className="w-3.5 h-3.5" />}
          </button>
          <button
            aria-label="Move down"
            disabled={index === total - 1 || move.isPending}
            onClick={() => move.mutate("down")}
            className="p-1.5 rounded-md border border-border bg-white hover:bg-paper-soft disabled:opacity-40"
          >
            {move.isPending && move.variables === "down" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowDown className="w-3.5 h-3.5" />}
          </button>
          <Link
            to="/engine/projects/$projectId/milestones/$milestoneId/brief"
            params={{ projectId, milestoneId: m.id }}
            className="ml-1 inline-flex items-center gap-1 text-[11px] text-royal hover:underline"
          >
            Brief <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 text-xs">
        <Field label="Approval" v={m.approval_status} />
        <Field label="Due" v={m.due_date} />
        <Field label="Deadline relevance" v={m.deadline_relevance} />
        <Field label="Related gap" v={m.related_gap} />
        <Field label="Related asset" v={m.related_hidden_asset} />
        <Field label="System node" v={m.related_system_node} />
      </div>
      {m.source_evidence?.length ? (
        <div className="mt-3 border-t border-border pt-2">
          <div className="font-mono text-[10px] uppercase tracking-wider text-ink/40 mb-1">
            Source evidence ({m.source_evidence.length})
          </div>
          <ul className="space-y-1 text-xs text-ink/70">
            {m.source_evidence.slice(0, 4).map((e, i) => (
              <li key={i} className="line-clamp-2">
                {e.category ? <span className="font-mono text-[10px] uppercase text-ink/40 mr-1">{e.category}</span> : null}
                {e.snippet}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function Field({ label, v }: { label: string; v?: string | null }) {
  return (
    <div>
      <div className="font-mono text-[9px] uppercase tracking-wider text-ink/40">{label}</div>
      <div className="text-ink/80 mt-0.5">{v ?? "—"}</div>
    </div>
  );
}
