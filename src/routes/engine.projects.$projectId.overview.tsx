import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useWorkspace } from "@/hooks/use-workspace";
import { SectionCard, EmptyState, formatDate, formatCents } from "@/components/engine/primitives";
import { AuditTrailCard } from "@/components/engine/AuditTrail";
import { BrainCircuit, Layers, Eye, PackageCheck, AlertCircle } from "lucide-react";
import { getVersionCompareData } from "@/lib/engine-execution.functions";
import { getNextBestAction } from "@/lib/engine.functions";

export const Route = createFileRoute("/engine/projects/$projectId/overview")({
  component: ProjectOverview,
});

function ProjectOverview() {
  const { projectId } = Route.useParams();
  const { project: p, dates, activity } = useWorkspace(projectId);

  const compareFn = useServerFn(getVersionCompareData);
  const compareQ = useQuery({
    queryKey: ["engine", "versions-compare", projectId],
    queryFn: () => compareFn({ data: { projectId } }),
    staleTime: 30_000,
  });
  const modulesNeedingReview: { key: string; label: string; count: number }[] =
    ((compareQ.data as { modules?: { key: string; label: string; changes: unknown[] }[] } | undefined)?.modules ?? [])
      .filter((m) => m.changes.length > 0)
      .map((m) => ({ key: m.key, label: m.label, count: m.changes.length }));

  const nbaFn = useServerFn(getNextBestAction);
  const nbaQ = useQuery({
    queryKey: ["engine", "next-best-action", projectId],
    queryFn: () => nbaFn({ data: { projectId } }),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

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
            {nbaQ.isLoading ? (
              <div className="text-sm text-ink/50">Computing…</div>
            ) : nbaQ.data ? (
              <div>
                <div className="flex items-start gap-2">
                  <span
                    className={`mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full ${
                      nbaQ.data.severity === "critical"
                        ? "bg-red-500"
                        : nbaQ.data.severity === "warning"
                        ? "bg-amber-500"
                        : "bg-emerald-500"
                    }`}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    {nbaQ.data.href ? (
                      <Link to={nbaQ.data.href} className="text-ink text-lg hover:underline">
                        {nbaQ.data.action}
                      </Link>
                    ) : (
                      <div className="text-ink text-lg">{nbaQ.data.action}</div>
                    )}
                    {nbaQ.data.reason ? (
                      <div className="text-sm text-ink/70 mt-1">{nbaQ.data.reason}</div>
                    ) : null}
                  </div>
                </div>
                <div className="text-xs text-ink/60 mt-2">
                  {p.open_decisions} open {p.open_decisions === 1 ? "decision" : "decisions"} · Current step {p.current_step_num} of 14 · Live
                </div>
              </div>
            ) : (
              <div className="text-ink text-lg">
                {p.next_action ?? "Nothing waiting — advance to the next step when ready."}
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Modules needing review"
            right={
              modulesNeedingReview.length > 0 ? (
                <Link
                  to="/engine/projects/$projectId/versions/compare"
                  params={{ projectId }}
                  className="text-royal hover:underline"
                >
                  Open version compare →
                </Link>
              ) : null
            }
          >
            {compareQ.isLoading ? (
              <div className="text-sm text-ink/50">Loading…</div>
            ) : modulesNeedingReview.length === 0 ? (
              <div className="text-sm text-ink/60">All modules are in sync with the approved roadmap.</div>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {modulesNeedingReview.map((m) => (
                  <li key={m.key}>
                    <Link
                      to="/engine/projects/$projectId/versions/compare"
                      params={{ projectId }}
                      className="inline-flex items-center gap-1.5 text-xs rounded-full border border-[#f1e3b9] bg-[#fbf3e0] text-[#8a6713] px-2.5 py-1 hover:border-royal/50"
                    >
                      <AlertCircle className="w-3 h-3" />
                      {m.label}
                      <span className="font-mono text-[10px] bg-white/70 rounded px-1">{m.count}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
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

          <SectionCard title="Audit trail">
            <AuditTrailCard projectId={projectId} limit={50} compact />
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
