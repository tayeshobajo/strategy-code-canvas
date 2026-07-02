import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getProject } from "@/lib/engine.functions";
import {
  SectionCard,
  EngineStatusBadge,
  EmptyState,
  formatCents,
  formatDate,
} from "@/components/engine/primitives";
import type { EngineProjectStatus } from "@/lib/engine.functions";

export const Route = createFileRoute("/engine/projects/$projectId/overview")({
  component: ProjectOverview,
});

const STEPS = [
  { key: "signal", label: "Signal" },
  { key: "diagnosis", label: "Diagnosis" },
  { key: "roadmap_drafting", label: "Roadmap" },
  { key: "review", label: "Review" },
  { key: "delivery", label: "Delivery" },
  { key: "execution", label: "Execution" },
];

function ProjectOverview() {
  const { projectId } = Route.useParams();
  const fn = useServerFn(getProject);
  const { data, isLoading, error } = useQuery({
    queryKey: ["engine", "project", projectId],
    queryFn: () => fn({ data: { id: projectId } }),
  });

  if (isLoading) return <div className="text-ink/50 text-sm">Loading…</div>;
  if (error) return <div className="text-red-700 text-sm">{(error as Error).message}</div>;
  if (!data) return null;
  const d = data as {
    project: {
      id: string;
      name: string;
      status: EngineProjectStatus;
      current_step: string;
      roadmap_version: string | null;
      approved_version: string | null;
      agent_status: string;
      agent_budget_monthly_cents: number;
      agent_spend_month_cents: number;
      open_decisions: number;
      next_action: string | null;
      engine_clients: {
        company: string;
        industry: string | null;
        owner_email: string | null;
        primary_contact: string | null;
        notes: string | null;
      } | null;
    };
    dates: Array<{ id: string; label: string; due_on: string; kind: string }>;
    signals: Array<{ id: string; source: string | null; summary: string; received_at: string; triaged: boolean }>;
    activity: Array<{ id: string; kind: string; title: string; body: string | null; severity: string; created_at: string }>;
  };
  const p = d.project;

  const activeStep = STEPS.findIndex((s) => s.key === p.current_step);

  return (
    <div className="space-y-6 max-w-[1400px]">
      <header>
        <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal">
          {p.engine_clients?.company}
        </div>
        <div className="flex items-end justify-between gap-4 mt-1">
          <h1 className="font-display text-4xl text-ink">{p.name}</h1>
          <EngineStatusBadge status={p.status} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-6 text-sm">
          <Meta label="Owner" value={p.engine_clients?.owner_email ?? "—"} />
          <Meta label="Roadmap draft" value={p.roadmap_version ?? "—"} />
          <Meta label="Approved" value={p.approved_version ?? "—"} />
          <Meta label="Agent" value={<span className="capitalize">{p.agent_status}</span>} />
          <Meta
            label="Monthly spend"
            value={`${formatCents(p.agent_spend_month_cents)} / ${formatCents(p.agent_budget_monthly_cents)}`}
          />
        </div>
      </header>

      <SectionCard title="Roadmap stage">
        <ol className="flex items-center justify-between gap-2">
          {STEPS.map((s, i) => {
            const done = i < activeStep;
            const active = i === activeStep;
            return (
              <li key={s.key} className="flex-1 flex items-center gap-2 min-w-0">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium shrink-0 ${
                    active
                      ? "bg-royal text-white"
                      : done
                        ? "bg-ink text-white"
                        : "bg-border text-ink/50"
                  }`}
                >
                  {i + 1}
                </div>
                <div className="min-w-0">
                  <div className={`text-xs ${active ? "text-ink font-medium" : "text-ink/60"}`}>
                    {s.label}
                  </div>
                </div>
                {i < STEPS.length - 1 ? (
                  <div className={`flex-1 h-px ${done ? "bg-ink/40" : "bg-border"}`} />
                ) : null}
              </li>
            );
          })}
        </ol>
      </SectionCard>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <SectionCard title="Signals">
            {d.signals.length === 0 ? (
              <EmptyState title="No signals yet" />
            ) : (
              <ul className="space-y-3">
                {d.signals.map((s) => (
                  <li key={s.id} className="border-l-2 border-royal/60 pl-3">
                    <div className="text-sm text-ink">{s.summary}</div>
                    <div className="text-[11px] text-ink/50 mt-1 font-mono uppercase tracking-wider">
                      {s.source ?? "unknown"} · {formatDate(s.received_at)} · {s.triaged ? "triaged" : "new"}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="Recent activity">
            {d.activity.length === 0 ? (
              <EmptyState title="No activity yet" />
            ) : (
              <ul className="space-y-3">
                {d.activity.map((a) => (
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
            {d.dates.length === 0 ? (
              <EmptyState title="No dates set" />
            ) : (
              <ul className="space-y-3 text-sm">
                {d.dates.map((dd) => (
                  <li key={d.id} className="flex items-baseline justify-between gap-3">
                    <span className="text-ink">{d.label}</span>
                    <span className="text-ink/60 text-xs whitespace-nowrap">{formatDate(d.due_on)}</span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="Open decisions">
            <div className="font-display text-4xl text-ink">{p.open_decisions}</div>
            <div className="text-xs text-ink/60 mt-2">
              {p.next_action ? `Next: ${p.next_action}` : "No pending decisions"}
            </div>
          </SectionCard>

          <SectionCard title="Client notes">
            <div className="text-sm text-ink/70">
              {p.engine_clients?.notes ?? "—"}
            </div>
          </SectionCard>
        </div>
      </div>

      <SectionCard title="Workspace tabs">
        <div className="text-sm text-ink/60">
          Signals · Diagnosis · Roadmap · Review · Delivery · Execution tabs land in the next build.
          Project-specific roadmap steps live here, not in the global sidebar.
        </div>
      </SectionCard>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink/50">{label}</div>
      <div className="text-ink mt-1">{value}</div>
    </div>
  );
}
