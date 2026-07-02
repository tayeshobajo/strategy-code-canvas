import { createFileRoute, Link } from "@tanstack/react-router";
import { useWorkspace } from "@/hooks/use-workspace";
import { SectionCard, EmptyState, formatDate, formatCents } from "@/components/engine/primitives";
import { BrainCircuit, Layers, Eye, PackageCheck } from "lucide-react";

export const Route = createFileRoute("/engine/projects/$projectId/overview")({
  component: ProjectOverview,
});

function ProjectOverview() {
  const { projectId } = Route.useParams();
  const { project: p, dates, activity } = useWorkspace(projectId);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Roadmap Draft" value={p.roadmap_version ?? "—"} />
            <Stat label="Approved" value={p.approved_version ?? "—"} />
            <Stat label="Agent" value={<span className="capitalize">{p.agent_status}</span>} />
            <Stat
              label="Monthly Spend"
              value={`${formatCents(p.agent_spend_month_cents)} / ${formatCents(p.agent_budget_monthly_cents)}`}
            />
          </div>

          <SectionCard title="Next best action">
            <div className="text-ink text-lg">
              {p.next_action ?? "Nothing waiting — advance to the next step when ready."}
            </div>
            <div className="text-xs text-ink/60 mt-2">
              {p.open_decisions} open {p.open_decisions === 1 ? "decision" : "decisions"} · Current step {p.current_step_num} of 14
            </div>
          </SectionCard>

          <SectionCard title="Recent activity">
            {activity.length === 0 ? (
              <EmptyState title="No activity yet" />
            ) : (
              <ul className="space-y-3">
                {activity.map((a) => (
                  <li key={a.id}>
                    <div className="text-sm font-medium text-ink">{a.title}</div>
                    {a.body ? <div className="text-xs text-ink/60 mt-0.5">{a.body}</div> : null}
                    <div className="text-[11px] text-ink/40 mt-1 font-mono uppercase tracking-wider">
                      {a.kind} · {formatDate(a.created_at)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>

        <div className="space-y-6">
          <SectionCard title="Critical dates">
            {dates.length === 0 ? (
              <EmptyState title="No dates set" />
            ) : (
              <ul className="space-y-3 text-sm">
                {dates.map((d) => (
                  <li key={d.id} className="flex items-baseline justify-between gap-3">
                    <span className="text-ink">{d.label}</span>
                    <span className="text-ink/60 text-xs whitespace-nowrap">
                      {formatDate(d.due_on)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="Roadmap health">
            <div className="font-display text-5xl text-ink">{p.health_score}</div>
            <div className="text-xs text-ink/60 mt-1">Out of 100</div>
          </SectionCard>

          <SectionCard title="Shortcuts">
            <div className="grid grid-cols-2 gap-2">
              <Shortcut projectId={projectId} to="/engine/projects/$projectId/intelligence" icon={<BrainCircuit className="w-4 h-4" />} label="Intelligence" />
              <Shortcut projectId={projectId} to="/engine/projects/$projectId/builder" icon={<Layers className="w-4 h-4" />} label="Roadmap Builder" />
              <Shortcut projectId={projectId} to="/engine/projects/$projectId/preview" icon={<Eye className="w-4 h-4" />} label="Client Preview" />
              <Shortcut projectId={projectId} to="/engine/projects/$projectId/delivery" icon={<PackageCheck className="w-4 h-4" />} label="Delivery Prep" />
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink/50">{label}</div>
      <div className="text-ink font-display text-xl mt-1">{value}</div>
    </div>
  );
}

function Shortcut({
  projectId,
  to,
  icon,
  label,
}: {
  projectId: string;
  to:
    | "/engine/projects/$projectId/intelligence"
    | "/engine/projects/$projectId/builder"
    | "/engine/projects/$projectId/preview"
    | "/engine/projects/$projectId/delivery";
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      to={to}
      params={{ projectId }}
      className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-ink hover:border-royal/50 hover:bg-paper-soft transition"
    >
      {icon}
      {label}
    </Link>
  );
}
