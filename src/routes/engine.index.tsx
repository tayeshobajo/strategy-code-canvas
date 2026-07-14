import { type ReactNode, useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCommandCenter } from "@/lib/engine.functions";
import type { CommandCenterPayload, EngineProjectRow } from "@/lib/engine.functions";
import { formatDate, formatCents } from "@/components/engine/primitives";
import { cn } from "@/lib/utils";
import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  DollarSign,
  Flame,
  Radio,
  ShieldAlert,
  Sparkles,
  Target,
  Users,
  Zap,
} from "lucide-react";

// ─── data ────────────────────────────────────────────────────────────────────

const commandOpts = (fn: ReturnType<typeof useServerFn<typeof getCommandCenter>>) =>
  queryOptions({ queryKey: ["engine", "command-center"], queryFn: () => fn({}) });

export const Route = createFileRoute("/engine/")({
  head: () => ({ meta: [{ title: "Command Center — Trust Tai" }, { name: "robots", content: "noindex" }] }),
  component: CommandCenter,
  errorComponent: ({ error }) => (
    <div className="p-6 text-rose-300">Failed to load Command Center: {(error as Error).message}</div>
  ),
});

// ─── types ───────────────────────────────────────────────────────────────────

type Severity = "critical" | "warning" | "info";

type Decision = {
  id: string;
  kind: "approval" | "blocked" | "at_risk" | "agent_failure" | "client_decision" | "budget";
  projectId: string | null;
  projectName: string;
  clientCompany: string;
  what: string;             // headline
  why: string;              // why it matters (one line)
  owner: string;            // who owns the next step
  recommended: string;      // recommended action
  href: string;             // CTA target
  severity: Severity;
  due?: string | null;
  rank: number;             // sort key (higher = more urgent)
};

// ─── page ────────────────────────────────────────────────────────────────────

function CommandCenter() {
  const fn = useServerFn(getCommandCenter);
  const { data } = useSuspenseQuery(commandOpts(fn));

  const decisions = useMemo(() => buildDecisions(data), [data]);
  const top = decisions[0] ?? null;

  const attentionGroups = useMemo(() => buildAttentionGroups(data), [data]);
  const attentionCount = attentionGroups.reduce((n, g) => n + g.rows.length, 0);

  const criticalAlerts =
    (data.agent_ops?.failures_24h ?? 0) +
    (data.metrics.system_health === "red" ? 1 : 0) +
    decisions.filter((d) => d.severity === "critical").length;

  return (
    <div className="-mx-4 -my-7 min-h-full bg-[#0A0F1F] text-white sm:-mx-6 sm:-my-8 lg:-mx-8 lg:-my-10">
      <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <CommandStrip
          systemHealth={data.metrics.system_health}
          criticalAlerts={criticalAlerts}
          topDecision={top}
        />

        <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          {/* Main column */}
          <div className="space-y-6">
            <RequiresDecisionQueue decisions={decisions} />
            <AttentionSection groups={attentionGroups} total={attentionCount} />
          </div>

          {/* Right rail */}
          <SystemIntelligenceRail data={data} />
        </div>

        <SupportingContext data={data} />
      </div>
    </div>
  );
}

// ─── command strip ───────────────────────────────────────────────────────────

function CommandStrip({
  systemHealth,
  criticalAlerts,
  topDecision,
}: {
  systemHealth: "green" | "amber" | "red";
  criticalAlerts: number;
  topDecision: Decision | null;
}) {
  const now = new Date();
  const healthTone =
    systemHealth === "red"
      ? "border-rose-500/40 bg-rose-500/10 text-rose-200"
      : systemHealth === "amber"
        ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
        : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  const healthLabel = systemHealth === "green" ? "Nominal" : systemHealth === "amber" ? "Elevated" : "Critical";

  return (
    <header className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.28em] text-white/50">
            <Radio className="h-3 w-3 text-emerald-400" /> Today’s Command Center
          </div>
          <h1 className="mt-1 font-display text-2xl leading-tight text-white sm:text-[28px]">
            {now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            <span className="ml-2 text-white/40">
              · {now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
            </span>
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
            <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5", healthTone)}>
              <span className="h-1.5 w-1.5 rounded-full bg-current" /> System {healthLabel}
            </span>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5",
                criticalAlerts > 0
                  ? "border-rose-500/40 bg-rose-500/10 text-rose-200"
                  : "border-white/10 bg-white/5 text-white/60",
              )}
            >
              <AlertOctagon className="h-3 w-3" /> {criticalAlerts} critical alert{criticalAlerts === 1 ? "" : "s"}
            </span>
          </div>
        </div>

        {topDecision ? (
          <Link
            to={topDecision.href}
            className="group inline-flex max-w-full items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-left text-amber-100 transition hover:bg-amber-500/20"
          >
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-widest text-amber-300/80">
                Review highest-priority decision
              </div>
              <div className="mt-0.5 truncate text-sm font-medium">{topDecision.what}</div>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 transition group-hover:translate-x-0.5" />
          </Link>
        ) : (
          <div className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-emerald-200">
            <CheckCircle2 className="h-4 w-4" />
            <span className="text-sm">No decisions waiting. All clear.</span>
          </div>
        )}
      </div>
    </header>
  );
}

// ─── requires decision queue ─────────────────────────────────────────────────

function RequiresDecisionQueue({ decisions }: { decisions: Decision[] }) {
  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.02]">
      <SectionHeader
        icon={<Target className="h-4 w-4" />}
        title="Requires decision"
        subtitle={`${decisions.length} open`}
        right={
          <Link
            to="/engine/approvals"
            className="text-[11px] uppercase tracking-widest text-white/50 hover:text-white"
          >
            Open queue →
          </Link>
        }
      />
      {decisions.length === 0 ? (
        <EmptyState icon={<CheckCircle2 className="h-5 w-5 text-emerald-400" />}>
          Nothing awaiting a decision. Healthy silence.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-white/5">
          {decisions.slice(0, 8).map((d) => (
            <DecisionRow key={d.id} d={d} />
          ))}
        </ul>
      )}
    </section>
  );
}

function DecisionRow({ d }: { d: Decision }) {
  const tone = severityTone(d.severity);
  return (
    <li className="grid grid-cols-1 items-start gap-3 px-5 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:gap-6">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className={cn("inline-flex items-center gap-1 rounded border px-1.5 py-0.5 uppercase tracking-widest", tone.badge)}>
            {tone.icon}
            {d.severity === "critical" ? "Critical" : d.severity === "warning" ? "Risk" : "Review"}
          </span>
          <span className="text-white/50">{kindLabel(d.kind)}</span>
          <span className="text-white/30">·</span>
          <span className="truncate text-white/70">{d.clientCompany}</span>
          <span className="text-white/30">·</span>
          <span className="truncate text-white/50">{d.projectName}</span>
          {d.due && (
            <span className="ml-auto inline-flex items-center gap-1 text-white/50">
              <Clock className="h-3 w-3" /> Due {formatDate(d.due)}
            </span>
          )}
        </div>
        <div className="mt-2 text-sm font-medium text-white">{d.what}</div>
        <div className="mt-1 text-xs text-white/60">
          <span className="text-white/40">Why:</span> {d.why}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span className="text-white/50">
            <span className="text-white/40">Owner:</span> {d.owner}
          </span>
          <span className="text-white/70">
            <span className="text-white/40">Recommended action:</span> {d.recommended}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2 md:pt-1">
        <Link
          to={d.href}
          className="inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/10"
        >
          {ctaLabel(d.kind)} <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </li>
  );
}

// ─── projects needing attention ──────────────────────────────────────────────

type AttentionGroup = {
  key: string;
  label: string;
  tone: "critical" | "warning" | "info";
  reason: (r: EngineProjectRow) => string;
  rows: EngineProjectRow[];
};

function buildAttentionGroups(data: CommandCenterPayload): AttentionGroup[] {
  const rows = data.active_projects ?? [];
  const overBudget = rows.filter(
    (r) => r.agent_budget_monthly_cents > 0 && r.agent_spend_month_cents / r.agent_budget_monthly_cents > 0.85,
  );
  const waitingClient = rows.filter((r) => r.open_decisions > 0);

  const groups: AttentionGroup[] = [
    {
      key: "blocked",
      label: "Blocked",
      tone: "critical",
      reason: (r) => r.next_action ?? "Blocked — unblock or reassign.",
      rows: rows.filter((r) => r.status === "blocked"),
    },
    {
      key: "at_risk",
      label: "At risk",
      tone: "warning",
      reason: (r) => r.next_action ?? "Signals of slippage detected.",
      rows: rows.filter((r) => r.status === "needs_review" && (r.open_decisions > 0 || r.next_critical_date)),
    },
    {
      key: "needs_review",
      label: "Needs review",
      tone: "warning",
      reason: (r) => r.next_action ?? "Draft awaiting operator review.",
      rows: rows.filter((r) => r.status === "needs_review"),
    },
    {
      key: "waiting_client",
      label: "Waiting on client",
      tone: "info",
      reason: (r) => `${r.open_decisions} open decision${r.open_decisions === 1 ? "" : "s"} on client side.`,
      rows: waitingClient,
    },
    {
      key: "over_budget",
      label: "Over budget",
      tone: "warning",
      reason: (r) => `Spend ${formatCents(r.agent_spend_month_cents)} of ${formatCents(r.agent_budget_monthly_cents)}.`,
      rows: overBudget,
    },
  ];

  // dedupe blocked from needs_review; needs_review keeps only those not already in at_risk
  const seen = new Set<string>();
  return groups
    .map((g) => ({
      ...g,
      rows: g.rows.filter((r) => {
        const k = `${g.key}:${r.id}`;
        if (seen.has(k)) return false;
        seen.add(k);
        // avoid duplicate same project in later groups
        const anyKey = `p:${r.id}`;
        if (seen.has(anyKey)) return false;
        seen.add(anyKey);
        return true;
      }),
    }))
    .filter((g) => g.rows.length > 0);
}

function AttentionSection({ groups, total }: { groups: AttentionGroup[]; total: number }) {
  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.02]">
      <SectionHeader
        icon={<ShieldAlert className="h-4 w-4" />}
        title="Projects needing attention"
        subtitle={`${total} exception${total === 1 ? "" : "s"}`}
        right={
          <Link to="/engine/projects" className="text-[11px] uppercase tracking-widest text-white/50 hover:text-white">
            All projects →
          </Link>
        }
      />
      {total === 0 ? (
        <EmptyState icon={<CheckCircle2 className="h-5 w-5 text-emerald-400" />}>
          No exceptions. Every project is healthy.
        </EmptyState>
      ) : (
        <div className="divide-y divide-white/5">
          {groups.map((g) => (
            <div key={g.key} className="px-5 py-4">
              <div className="mb-2 flex items-center gap-2">
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-widest",
                    g.tone === "critical"
                      ? "border-rose-500/40 bg-rose-500/10 text-rose-200"
                      : g.tone === "warning"
                        ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
                        : "border-white/15 bg-white/5 text-white/70",
                  )}
                >
                  {g.label}
                </span>
                <span className="text-[11px] text-white/40">{g.rows.length}</span>
              </div>
              <ul className="space-y-1.5">
                {g.rows.slice(0, 5).map((r) => (
                  <li
                    key={r.id}
                    className="grid grid-cols-1 items-center gap-2 rounded border border-white/5 bg-black/20 px-3 py-2 md:grid-cols-[minmax(0,1fr)_auto]"
                  >
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-2 truncate">
                        <span className="truncate text-sm text-white">{r.name}</span>
                        <span className="truncate text-xs text-white/40">· {r.client_company}</span>
                      </div>
                      <div className="mt-0.5 truncate text-xs text-white/60">{g.reason(r)}</div>
                    </div>
                    <Link
                      to="/engine/projects/$projectId/overview"
                      params={{ projectId: r.id }}
                      className="inline-flex items-center gap-1 rounded border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white hover:bg-white/10"
                    >
                      Review <ArrowUpRight className="h-3 w-3" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ─── system intelligence rail ────────────────────────────────────────────────

function SystemIntelligenceRail({ data }: { data: CommandCenterPayload }) {
  const nba = data.next_best_actions_v2?.[0] ?? data.next_best_actions?.[0] ?? null;
  const budgetRatio = data.metrics.agent_budget_cents
    ? data.metrics.agent_spend_cents / data.metrics.agent_budget_cents
    : 0;
  const budgetTone =
    budgetRatio > 0.9 ? "critical" : budgetRatio > 0.7 ? "warning" : "info";
  const materialActivity = (data.recent_activity ?? []).filter((a) =>
    /approv|reject|block|risk|deliver|complete|escalat|fail/i.test(`${a.kind} ${a.title}`),
  ).slice(0, 4);

  return (
    <aside className="space-y-4">
      <RailCard
        icon={<Sparkles className="h-4 w-4 text-sky-300" />}
        title="Next best action"
      >
        {nba ? (
          <div>
            <div className="text-sm text-white">{nba.action}</div>
            <div className="mt-1 text-xs text-white/60">{nba.reason}</div>
            <div className="mt-2 text-[11px] text-white/50">
              {nba.client_company} · {nba.project_name}
            </div>
            <Link
              to="/engine/projects/$projectId/overview"
              params={{ projectId: nba.project_id }}
              className="mt-3 inline-flex items-center gap-1.5 text-xs text-sky-300 hover:text-sky-200"
            >
              Open project <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        ) : (
          <div className="text-xs text-white/50">Captain has no new recommendations.</div>
        )}
      </RailCard>

      <RailCard
        icon={<DollarSign className={cn("h-4 w-4", budgetTone === "critical" ? "text-rose-300" : budgetTone === "warning" ? "text-amber-300" : "text-white/60")} />}
        title="Cost / budget"
      >
        <div className="text-sm text-white">
          {formatCents(data.metrics.agent_spend_cents)}{" "}
          <span className="text-white/40">of {formatCents(data.metrics.agent_budget_cents)}</span>
        </div>
        <div className="mt-2 h-1.5 rounded bg-white/5">
          <div
            className={cn(
              "h-full rounded",
              budgetTone === "critical" ? "bg-rose-400" : budgetTone === "warning" ? "bg-amber-400" : "bg-white/40",
            )}
            style={{ width: `${Math.min(100, budgetRatio * 100)}%` }}
          />
        </div>
        {budgetTone !== "info" && (
          <div className="mt-2 text-xs text-white/60">
            {Math.round(budgetRatio * 100)}% of monthly agent spend consumed.
          </div>
        )}
      </RailCard>

      <RailCard icon={<Flame className="h-4 w-4 text-rose-300" />} title="Agent failures (24h)">
        <div className="text-2xl font-semibold text-white">{data.agent_ops?.failures_24h ?? 0}</div>
        <div className="mt-1 text-xs text-white/50">
          Runs in progress: <span className="text-white/70">{data.agent_ops?.runs_in_progress ?? 0}</span>
          {" · "}Needs attention: <span className="text-white/70">{data.agent_ops?.needs_attention ?? 0}</span>
        </div>
      </RailCard>

      <RailCard icon={<Clock className="h-4 w-4 text-amber-300" />} title="Upcoming deadlines">
        {data.upcoming_deadlines.length === 0 ? (
          <div className="text-xs text-white/50">None in the next window.</div>
        ) : (
          <ul className="space-y-2">
            {data.upcoming_deadlines.slice(0, 4).map((d) => (
              <li key={`${d.project_id}-${d.label}`} className="text-xs">
                <div className="text-white">{d.label}</div>
                <div className="text-white/50">
                  {d.project_name} · due {formatDate(d.due_on)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </RailCard>

      <RailCard icon={<Zap className="h-4 w-4 text-white/60" />} title="Recent material changes">
        {materialActivity.length === 0 ? (
          <div className="text-xs text-white/50">Nothing material since last check.</div>
        ) : (
          <ul className="space-y-2">
            {materialActivity.map((a) => (
              <li key={a.id} className="text-xs">
                <div className="text-white">{a.title}</div>
                <div className="text-white/50">
                  {a.project_name ?? "—"} · {new Date(a.created_at).toLocaleString()}
                </div>
              </li>
            ))}
          </ul>
        )}
      </RailCard>

      <RailCard icon={<Users className="h-4 w-4 text-white/60" />} title="Client actions">
        <div className="grid grid-cols-3 gap-2 text-center">
          <MiniStat label="Decisions" value={data.client_action_counts.decisions_needed} />
          <MiniStat label="Info req." value={data.client_action_counts.info_requests} />
          <MiniStat label="Feedback" value={data.client_action_counts.feedback_pending} />
        </div>
      </RailCard>
    </aside>
  );
}

// ─── supporting context (demoted) ────────────────────────────────────────────

function SupportingContext({ data }: { data: CommandCenterPayload }) {
  const total = data.stage_breakdown.reduce((n, s) => n + s.count, 0);
  const hb = data.health_breakdown;
  return (
    <section className="mt-8 rounded-lg border border-white/10 bg-white/[0.02] px-5 py-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-xs">
        <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-white/40">Portfolio context</div>
        <MutedCounter label="Total" value={total} />
        <MutedCounter label="Active" value={data.metrics.active_projects} />
        <MutedCounter label="Approved" value={data.metrics.approved} />
        <MutedCounter label="In execution" value={data.metrics.in_execution} />
        <div className="mx-2 h-4 w-px bg-white/10" />
        <HealthChip color="bg-emerald-400" label="On track" value={hb.on_track} />
        <HealthChip color="bg-amber-400" label="Needs attn" value={hb.needs_attention} />
        <HealthChip color="bg-rose-400" label="At risk" value={hb.at_risk} />
        <HealthChip color="bg-rose-500" label="Blocked" value={hb.blocked} />
        <HealthChip color="bg-white/40" label="Planning" value={hb.planning} />
        <div className="ml-auto flex items-center gap-2 text-white/40">
          <span>Stages:</span>
          {data.stage_breakdown.map((s) => (
            <span key={s.stage} className="text-white/60">
              {s.stage} <span className="text-white/40">{s.count}</span>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── small primitives ────────────────────────────────────────────────────────

function SectionHeader({
  icon,
  title,
  subtitle,
  right,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/5 px-5 py-3">
      <div className="flex items-center gap-2">
        <span className="text-white/60">{icon}</span>
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        {subtitle && <span className="text-[11px] text-white/40">· {subtitle}</span>}
      </div>
      {right}
    </div>
  );
}

function RailCard({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
      <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-widest text-white/50">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

function EmptyState({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-5 py-6 text-sm text-white/60">
      {icon}
      <span>{children}</span>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-white/10 bg-black/20 py-2">
      <div className="text-lg font-semibold text-white">{value}</div>
      <div className="text-[10px] uppercase tracking-widest text-white/50">{label}</div>
    </div>
  );
}

function MutedCounter({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-white/40">{label}</span>
      <span className="font-medium text-white">{value}</span>
    </div>
  );
}

function HealthChip({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="inline-flex items-center gap-1.5">
      <span className={cn("h-1.5 w-1.5 rounded-full", color)} />
      <span className="text-white/50">{label}</span>
      <span className="text-white">{value}</span>
    </div>
  );
}

// ─── decision building ───────────────────────────────────────────────────────

function severityTone(s: Severity) {
  if (s === "critical") {
    return {
      badge: "border-rose-500/40 bg-rose-500/10 text-rose-200",
      icon: <AlertOctagon className="h-3 w-3" />,
    };
  }
  if (s === "warning") {
    return {
      badge: "border-amber-500/40 bg-amber-500/10 text-amber-200",
      icon: <AlertTriangle className="h-3 w-3" />,
    };
  }
  return {
    badge: "border-white/15 bg-white/5 text-white/70",
    icon: <Sparkles className="h-3 w-3" />,
  };
}

function kindLabel(k: Decision["kind"]) {
  switch (k) {
    case "approval": return "Approval";
    case "blocked": return "Blocked project";
    case "at_risk": return "At-risk project";
    case "agent_failure": return "Agent failure";
    case "client_decision": return "Client decision";
    case "budget": return "Budget";
  }
}

function ctaLabel(k: Decision["kind"]) {
  switch (k) {
    case "approval": return "Review";
    case "blocked": return "Unblock";
    case "at_risk": return "Open";
    case "agent_failure": return "Investigate";
    case "client_decision": return "Escalate";
    case "budget": return "Review";
  }
}

function buildDecisions(data: CommandCenterPayload): Decision[] {
  const out: Decision[] = [];
  const projects = new Map<string, EngineProjectRow>();
  for (const p of data.active_projects ?? []) projects.set(p.id, p);
  const nbaByProject = new Map<string, string>();
  for (const n of data.next_best_actions_v2 ?? []) nbaByProject.set(n.project_id, n.action);

  // Approvals — highest impact first
  for (const item of data.approval_breakdown?.items ?? []) {
    const severity: Severity = item.impact === "high" ? "critical" : "warning";
    out.push({
      id: `approval:${item.id}`,
      kind: "approval",
      projectId: null,
      projectName: item.project_name ?? "—",
      clientCompany: item.project_name ?? "—",
      what: item.title,
      why: `${item.item_type.replace(/_/g, " ")} awaiting sign-off (${item.impact} impact).`,
      owner: "Operator",
      recommended: "Review and approve or reject.",
      href: "/engine/approvals",
      severity,
      rank: severity === "critical" ? 100 : 70,
    });
  }

  // Blocked projects
  for (const p of data.active_projects ?? []) {
    if (p.status !== "blocked") continue;
    out.push({
      id: `blocked:${p.id}`,
      kind: "blocked",
      projectId: p.id,
      projectName: p.name,
      clientCompany: p.client_company,
      what: `${p.name} is blocked`,
      why: p.next_action ?? "Blocked on a dependency or decision.",
      owner: p.open_decisions > 0 ? "Client" : "Operator",
      recommended: nbaByProject.get(p.id) ?? p.next_action ?? "Identify blocker and reassign owner.",
      href: `/engine/projects/${p.id}/overview`,
      severity: "critical",
      due: p.next_critical_date?.due_on ?? null,
      rank: 95,
    });
  }

  // Agent failures
  const failures = data.agent_ops?.failures_24h ?? 0;
  if (failures > 0) {
    out.push({
      id: "agent:failures",
      kind: "agent_failure",
      projectId: null,
      projectName: "System",
      clientCompany: "Trust Tai",
      what: `${failures} agent run${failures === 1 ? "" : "s"} failed in the last 24h`,
      why: "Automated work is not completing. Downstream deliverables may slip.",
      owner: "Operator",
      recommended: "Open Command Center exception feed and resolve.",
      href: "/admin/command-center",
      severity: failures > 3 ? "critical" : "warning",
      rank: failures > 3 ? 90 : 60,
    });
  }

  // Client decisions
  const clientDecisions = data.client_action_counts.decisions_needed;
  if (clientDecisions > 0) {
    out.push({
      id: "client:decisions",
      kind: "client_decision",
      projectId: null,
      projectName: "Portfolio",
      clientCompany: "Multiple clients",
      what: `${clientDecisions} decision${clientDecisions === 1 ? "" : "s"} waiting on clients`,
      why: "Client-side blockers stall roadmap progression.",
      owner: "Client Success",
      recommended: "Send reminders or escalate to a call.",
      href: "/engine/approvals",
      severity: clientDecisions > 3 ? "warning" : "info",
      rank: 55,
    });
  }

  // Budget overrun (portfolio)
  const budget = data.metrics.agent_budget_cents;
  const spend = data.metrics.agent_spend_cents;
  if (budget > 0 && spend / budget > 0.9) {
    out.push({
      id: "budget:portfolio",
      kind: "budget",
      projectId: null,
      projectName: "Agent budget",
      clientCompany: "Trust Tai",
      what: `Agent spend at ${Math.round((spend / budget) * 100)}% of monthly budget`,
      why: "Continued runs will exceed cap and pause automation.",
      owner: "Operator",
      recommended: "Raise cap or pause non-critical agents.",
      href: "/engine/operations",
      severity: spend / budget > 1 ? "critical" : "warning",
      rank: 65,
    });
  }

  return out.sort((a, b) => b.rank - a.rank);
}
