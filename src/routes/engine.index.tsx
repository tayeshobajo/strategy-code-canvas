import { type ReactNode, useMemo, useState, useEffect, useRef } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCommandCenter } from "@/lib/engine.functions";
import type { CommandCenterPayload, EngineProjectRow } from "@/lib/engine.functions";
import { formatDate, formatCents } from "@/components/engine/primitives";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  DollarSign,
  ExternalLink,
  Flame,
  History,
  Radio,
  ShieldAlert,
  Sparkles,
  Target,
  Timer,
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
    <div className="p-6 text-rose-600">Failed to load Command Center: {(error as Error).message}</div>
  ),
});

// ─── types ───────────────────────────────────────────────────────────────────

type Severity = "critical" | "warning" | "info";

type ChangeEntry = { id: string; title: string; at: string; kind: string };

type Decision = {
  id: string;
  kind: "approval" | "blocked" | "at_risk" | "agent_failure" | "client_decision" | "budget";
  projectId: string | null;
  projectName: string;
  clientCompany: string;
  what: string;             // headline
  why: string;              // why it matters
  owner: string;            // who owns the next step
  recommended: string;      // recommended action
  href: string;             // CTA target
  severity: Severity;
  createdAt: string;        // when the decision entered the queue
  due?: string | null;      // explicit deadline if any
  deadlineAt: string;       // effective SLA deadline (due ?? createdAt + SLA hours)
  riskDrivers: string[];    // why this needs attention (bulleted context)
  requiredFields: string[]; // what's needed to resolve
  changes: ChangeEntry[];   // material changes since last check
  rank: number;             // sort key (higher = more urgent)
};

const SLA_HOURS: Record<Decision["kind"], number> = {
  approval: 24,
  blocked: 4,
  at_risk: 24,
  agent_failure: 2,
  client_decision: 72,
  budget: 24,
};

// ─── page ────────────────────────────────────────────────────────────────────

function CommandCenter() {
  const fn = useServerFn(getCommandCenter);
  const { data } = useSuspenseQuery(commandOpts(fn));
  const lastChecked = useLastChecked();
  const now = useNowTick();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const decisions = useMemo(
    () => enrichWithChanges(buildDecisions(data), data, lastChecked),
    [data, lastChecked],
  );
  const top = decisions[0] ?? null;
  const selected = decisions.find((d) => d.id === selectedId) ?? null;

  const attentionGroups = useMemo(() => buildAttentionGroups(data), [data]);
  const attentionCount = attentionGroups.reduce((n, g) => n + g.rows.length, 0);

  const criticalAlerts =
    (data.agent_ops?.failures_24h ?? 0) +
    (data.metrics.system_health === "red" ? 1 : 0) +
    decisions.filter((d) => d.severity === "critical").length;

  const changesSinceLast = useMemo(() => {
    const cutoffMs = lastChecked ? new Date(lastChecked).getTime() : 0;
    return (data.recent_activity ?? []).filter((a) => new Date(a.created_at).getTime() > cutoffMs).length;
  }, [data.recent_activity, lastChecked]);

  return (
    <div className="-mx-4 -my-7 min-h-full bg-[#FBF9F4] text-[#0A0F1F] sm:-mx-6 sm:-my-8 lg:-mx-8 lg:-my-10">
      <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <CommandStrip
          systemHealth={data.metrics.system_health}
          criticalAlerts={criticalAlerts}
          topDecision={top}
          onOpenTop={() => top && setSelectedId(top.id)}
          changesSinceLast={changesSinceLast}
          lastChecked={lastChecked}
        />

        <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          {/* Main column */}
          <div className="space-y-6">
            <RequiresDecisionQueue decisions={decisions} now={now} onSelect={setSelectedId} />
            <AttentionSection groups={attentionGroups} total={attentionCount} />
          </div>

          {/* Right rail */}
          <SystemIntelligenceRail data={data} lastChecked={lastChecked} />
        </div>

        <SupportingContext data={data} />

        <DecisionDrawer
          decision={selected}
          now={now}
          onClose={() => setSelectedId(null)}
        />
      </div>
    </div>
  );
}

// ─── command strip ───────────────────────────────────────────────────────────

function CommandStrip({
  systemHealth,
  criticalAlerts,
  topDecision,
  onOpenTop,
  changesSinceLast,
  lastChecked,
}: {
  systemHealth: "green" | "amber" | "red";
  criticalAlerts: number;
  topDecision: Decision | null;
  onOpenTop: () => void;
  changesSinceLast: number;
  lastChecked: string | null;
}) {
  const now = new Date();
  const healthTone =
    systemHealth === "red"
      ? "border-rose-300 bg-rose-50 text-rose-700"
      : systemHealth === "amber"
        ? "border-amber-300 bg-amber-50 text-amber-800"
        : "border-emerald-300 bg-emerald-50 text-emerald-700";
  const healthLabel = systemHealth === "green" ? "Nominal" : systemHealth === "amber" ? "Elevated" : "Critical";

  return (
    <header className="rounded-xl border border-[#E8E1D6] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.28em] text-[#8A94A6]">
            <Radio className="h-3 w-3 text-emerald-600" /> Today’s Command Center
          </div>
          <h1 className="mt-1 font-display text-2xl leading-tight text-[#0A0F1F] sm:text-[28px]">
            {now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            <span className="ml-2 text-[#98A2B3]">
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
                  ? "border-rose-300 bg-rose-50 text-rose-700"
                  : "border-[#E8E1D6] bg-[#F5F1E8] text-[#667085]",
              )}
            >
              <AlertOctagon className="h-3 w-3" /> {criticalAlerts} critical alert{criticalAlerts === 1 ? "" : "s"}
            </span>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5",
                changesSinceLast > 0
                  ? "border-sky-300 bg-sky-50 text-sky-800"
                  : "border-[#E8E1D6] bg-[#F5F1E8] text-[#667085]",
              )}
              title={lastChecked ? `Since ${new Date(lastChecked).toLocaleString()}` : "First visit — no baseline yet."}
            >
              <History className="h-3 w-3" />
              {changesSinceLast} change{changesSinceLast === 1 ? "" : "s"} since last check
            </span>
          </div>
        </div>

        {topDecision ? (
          <button
            type="button"
            onClick={onOpenTop}
            className="group inline-flex max-w-full items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-left text-amber-900 transition hover:bg-amber-100"
          >
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-widest text-amber-700/80">
                Review highest-priority decision
              </div>
              <div className="mt-0.5 truncate text-sm font-medium">{topDecision.what}</div>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 transition group-hover:translate-x-0.5" />
          </button>
        ) : (
          <div className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
            <span className="text-sm">No decisions waiting. All clear.</span>
          </div>
        )}
      </div>
    </header>
  );
}

// ─── requires decision queue ─────────────────────────────────────────────────

function RequiresDecisionQueue({
  decisions,
  now,
  onSelect,
}: {
  decisions: Decision[];
  now: number;
  onSelect: (id: string) => void;
}) {
  return (
    <section className="rounded-xl border border-[#E8E1D6] bg-white">
      <SectionHeader
        icon={<Target className="h-4 w-4" />}
        title="Requires decision"
        subtitle={`${decisions.length} open`}
        right={
          <Link
            to="/engine/approvals"
            className="text-[11px] uppercase tracking-widest text-[#8A94A6] hover:text-[#0A0F1F]"
          >
            Open queue →
          </Link>
        }
      />
      {decisions.length === 0 ? (
        <EmptyState icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />}>
          Nothing awaiting a decision. Healthy silence.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-[#EFEAE0]">
          {decisions.slice(0, 8).map((d) => (
            <DecisionRow key={d.id} d={d} now={now} onSelect={onSelect} />
          ))}
        </ul>
      )}
    </section>
  );
}

function SlaBadge({ deadlineAt, now }: { deadlineAt: string; now: number }) {
  const { label, tone, overdue } = formatCountdown(deadlineAt, now);
  const cls =
    tone === "critical"
      ? "border-rose-300 bg-rose-50 text-rose-700"
      : tone === "warning"
        ? "border-amber-300 bg-amber-50 text-amber-800"
        : "border-[#E0D8C8] bg-[#F5F1E8] text-[#334155]";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-widest",
        cls,
      )}
      title={`Deadline ${new Date(deadlineAt).toLocaleString()}`}
    >
      <Timer className={cn("h-3 w-3", overdue && "animate-pulse")} />
      {label}
    </span>
  );
}

function DecisionRow({ d, now, onSelect }: { d: Decision; now: number; onSelect: (id: string) => void }) {
  const tone = severityTone(d.severity);
  const hasChanges = d.changes.length > 0;
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(d.id)}
        className="grid w-full grid-cols-1 items-start gap-3 px-5 py-4 text-left transition hover:bg-[#FBF9F4] md:grid-cols-[minmax(0,1fr)_auto] md:gap-6"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className={cn("inline-flex items-center gap-1 rounded border px-1.5 py-0.5 uppercase tracking-widest", tone.badge)}>
              {tone.icon}
              {d.severity === "critical" ? "Critical" : d.severity === "warning" ? "Risk" : "Review"}
            </span>
            <SlaBadge deadlineAt={d.deadlineAt} now={now} />
            <span className="text-[#8A94A6]">{kindLabel(d.kind)}</span>
            <span className="text-[#C8CFD9]">·</span>
            <span className="truncate text-[#334155]">{d.clientCompany}</span>
            <span className="text-[#C8CFD9]">·</span>
            <span className="truncate text-[#8A94A6]">{d.projectName}</span>
            {d.due && (
              <span className="ml-auto inline-flex items-center gap-1 text-[#8A94A6]">
                <Clock className="h-3 w-3" /> Due {formatDate(d.due)}
              </span>
            )}
          </div>
          <div className="mt-2 text-sm font-medium text-[#0A0F1F]">{d.what}</div>
          <div className="mt-1 text-xs text-[#667085]">
            <span className="text-[#98A2B3]">Why:</span> {d.why}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <span className="text-[#8A94A6]">
              <span className="text-[#98A2B3]">Owner:</span> {d.owner}
            </span>
            <span className="text-[#334155]">
              <span className="text-[#98A2B3]">Recommended action:</span> {d.recommended}
            </span>
            {hasChanges && (
              <span className="inline-flex items-center gap-1 rounded bg-sky-50 px-1.5 py-0.5 text-sky-800">
                <History className="h-3 w-3" /> {d.changes.length} new since last check
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 md:pt-1">
          <span className="inline-flex items-center gap-1.5 rounded-md border border-[#E0D8C8] bg-[#F5F1E8] px-3 py-1.5 text-xs font-medium text-[#0A0F1F]">
            Open details <ArrowUpRight className="h-3.5 w-3.5" />
          </span>
        </div>
      </button>
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
    <section className="rounded-xl border border-[#E8E1D6] bg-white">
      <SectionHeader
        icon={<ShieldAlert className="h-4 w-4" />}
        title="Projects needing attention"
        subtitle={`${total} exception${total === 1 ? "" : "s"}`}
        right={
          <Link to="/engine/projects" className="text-[11px] uppercase tracking-widest text-[#8A94A6] hover:text-[#0A0F1F]">
            All projects →
          </Link>
        }
      />
      {total === 0 ? (
        <EmptyState icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />}>
          No exceptions. Every project is healthy.
        </EmptyState>
      ) : (
        <div className="divide-y divide-[#EFEAE0]">
          {groups.map((g) => (
            <div key={g.key} className="px-5 py-4">
              <div className="mb-2 flex items-center gap-2">
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-widest",
                    g.tone === "critical"
                      ? "border-rose-300 bg-rose-50 text-rose-700"
                      : g.tone === "warning"
                        ? "border-amber-300 bg-amber-50 text-amber-800"
                        : "border-[#E0D8C8] bg-[#F5F1E8] text-[#334155]",
                  )}
                >
                  {g.label}
                </span>
                <span className="text-[11px] text-[#98A2B3]">{g.rows.length}</span>
              </div>
              <ul className="space-y-1.5">
                {g.rows.slice(0, 5).map((r) => (
                  <li
                    key={r.id}
                    className="grid grid-cols-1 items-center gap-2 rounded border border-[#EFEAE0] bg-[#FBF9F4] px-3 py-2 md:grid-cols-[minmax(0,1fr)_auto]"
                  >
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-2 truncate">
                        <span className="truncate text-sm text-[#0A0F1F]">{r.name}</span>
                        <span className="truncate text-xs text-[#98A2B3]">· {r.client_company}</span>
                      </div>
                      <div className="mt-0.5 truncate text-xs text-[#667085]">{g.reason(r)}</div>
                    </div>
                    <Link
                      to="/engine/projects/$projectId/overview"
                      params={{ projectId: r.id }}
                      className="inline-flex items-center gap-1 rounded border border-[#E8E1D6] bg-[#F5F1E8] px-2.5 py-1 text-[11px] text-[#0A0F1F] hover:bg-[#EFE9DC]"
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

function SystemIntelligenceRail({ data, lastChecked }: { data: CommandCenterPayload; lastChecked: string | null }) {
  const nba = data.next_best_actions_v2?.[0] ?? data.next_best_actions?.[0] ?? null;
  const budgetRatio = data.metrics.agent_budget_cents
    ? data.metrics.agent_spend_cents / data.metrics.agent_budget_cents
    : 0;
  const budgetTone =
    budgetRatio > 0.9 ? "critical" : budgetRatio > 0.7 ? "warning" : "info";
  const cutoffMs = lastChecked ? new Date(lastChecked).getTime() : 0;
  const materialActivity = (data.recent_activity ?? [])
    .filter((a) => /approv|reject|block|risk|deliver|complete|escalat|fail/i.test(`${a.kind} ${a.title}`))
    .slice(0, 6);


  return (
    <aside className="space-y-4">
      <RailCard
        icon={<Sparkles className="h-4 w-4 text-sky-700" />}
        title="Next best action"
      >
        {nba ? (
          <div>
            <div className="text-sm text-[#0A0F1F]">{nba.action}</div>
            <div className="mt-1 text-xs text-[#667085]">{nba.reason}</div>
            <div className="mt-2 text-[11px] text-[#8A94A6]">
              {nba.client_company} · {nba.project_name}
            </div>
            <Link
              to="/engine/projects/$projectId/overview"
              params={{ projectId: nba.project_id }}
              className="mt-3 inline-flex items-center gap-1.5 text-xs text-sky-700 hover:text-sky-800"
            >
              Open project <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        ) : (
          <div className="text-xs text-[#8A94A6]">Captain has no new recommendations.</div>
        )}
      </RailCard>

      <RailCard
        icon={<DollarSign className={cn("h-4 w-4", budgetTone === "critical" ? "text-rose-600" : budgetTone === "warning" ? "text-amber-700" : "text-[#667085]")} />}
        title="Cost / budget"
      >
        <div className="text-sm text-[#0A0F1F]">
          {formatCents(data.metrics.agent_spend_cents)}{" "}
          <span className="text-[#98A2B3]">of {formatCents(data.metrics.agent_budget_cents)}</span>
        </div>
        <div className="mt-2 h-1.5 rounded bg-[#F5F1E8]">
          <div
            className={cn(
              "h-full rounded",
              budgetTone === "critical" ? "bg-rose-500" : budgetTone === "warning" ? "bg-amber-500" : "bg-[#98A2B3]",
            )}
            style={{ width: `${Math.min(100, budgetRatio * 100)}%` }}
          />
        </div>
        {budgetTone !== "info" && (
          <div className="mt-2 text-xs text-[#667085]">
            {Math.round(budgetRatio * 100)}% of monthly agent spend consumed.
          </div>
        )}
      </RailCard>

      <RailCard icon={<Flame className="h-4 w-4 text-rose-600" />} title="Agent failures (24h)">
        <div className="text-2xl font-semibold text-[#0A0F1F]">{data.agent_ops?.failures_24h ?? 0}</div>
        <div className="mt-1 text-xs text-[#8A94A6]">
          Runs in progress: <span className="text-[#334155]">{data.agent_ops?.runs_in_progress ?? 0}</span>
          {" · "}Needs attention: <span className="text-[#334155]">{data.agent_ops?.needs_attention ?? 0}</span>
        </div>
      </RailCard>

      <RailCard icon={<Clock className="h-4 w-4 text-amber-700" />} title="Upcoming deadlines">
        {data.upcoming_deadlines.length === 0 ? (
          <div className="text-xs text-[#8A94A6]">None in the next window.</div>
        ) : (
          <ul className="space-y-2">
            {data.upcoming_deadlines.slice(0, 4).map((d) => (
              <li key={`${d.project_id}-${d.label}`} className="text-xs">
                <div className="text-[#0A0F1F]">{d.label}</div>
                <div className="text-[#8A94A6]">
                  {d.project_name} · due {formatDate(d.due_on)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </RailCard>

      <RailCard icon={<Zap className="h-4 w-4 text-[#667085]" />} title="Changed since last check">
        {materialActivity.length === 0 ? (
          <div className="text-xs text-[#8A94A6]">Nothing material since last check.</div>
        ) : (
          <ul className="space-y-2">
            {materialActivity.map((a) => {
              const isNew = new Date(a.created_at).getTime() > cutoffMs;
              return (
                <li key={a.id} className="text-xs">
                  <div className="flex items-baseline gap-1.5">
                    {isNew && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" title="New since last check" />}
                    <span className="text-[#0A0F1F]">{a.title}</span>
                  </div>
                  <div className="pl-3 text-[#8A94A6]">
                    {a.project_name ?? "—"} · {new Date(a.created_at).toLocaleString()}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </RailCard>


      <RailCard icon={<Users className="h-4 w-4 text-[#667085]" />} title="Client actions">
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
    <section className="mt-8 rounded-lg border border-[#E8E1D6] bg-white px-5 py-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-xs">
        <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-[#98A2B3]">Portfolio context</div>
        <MutedCounter label="Total" value={total} />
        <MutedCounter label="Active" value={data.metrics.active_projects} />
        <MutedCounter label="Approved" value={data.metrics.approved} />
        <MutedCounter label="In execution" value={data.metrics.in_execution} />
        <div className="mx-2 h-4 w-px bg-[#EFE9DC]" />
        <HealthChip color="bg-emerald-500" label="On track" value={hb.on_track} />
        <HealthChip color="bg-amber-500" label="Needs attn" value={hb.needs_attention} />
        <HealthChip color="bg-rose-500" label="At risk" value={hb.at_risk} />
        <HealthChip color="bg-rose-500" label="Blocked" value={hb.blocked} />
        <HealthChip color="bg-[#98A2B3]" label="Planning" value={hb.planning} />
        <div className="ml-auto flex items-center gap-2 text-[#98A2B3]">
          <span>Stages:</span>
          {data.stage_breakdown.map((s) => (
            <span key={s.stage} className="text-[#667085]">
              {s.stage} <span className="text-[#98A2B3]">{s.count}</span>
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
    <div className="flex items-center justify-between gap-3 border-b border-[#EFEAE0] px-5 py-3">
      <div className="flex items-center gap-2">
        <span className="text-[#667085]">{icon}</span>
        <h2 className="text-sm font-semibold text-[#0A0F1F]">{title}</h2>
        {subtitle && <span className="text-[11px] text-[#98A2B3]">· {subtitle}</span>}
      </div>
      {right}
    </div>
  );
}

function RailCard({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-[#E8E1D6] bg-white p-4">
      <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-widest text-[#8A94A6]">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

function EmptyState({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-5 py-6 text-sm text-[#667085]">
      {icon}
      <span>{children}</span>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-[#E8E1D6] bg-[#FBF9F4] py-2">
      <div className="text-lg font-semibold text-[#0A0F1F]">{value}</div>
      <div className="text-[10px] uppercase tracking-widest text-[#8A94A6]">{label}</div>
    </div>
  );
}

function MutedCounter({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[#98A2B3]">{label}</span>
      <span className="font-medium text-[#0A0F1F]">{value}</span>
    </div>
  );
}

function HealthChip({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="inline-flex items-center gap-1.5">
      <span className={cn("h-1.5 w-1.5 rounded-full", color)} />
      <span className="text-[#8A94A6]">{label}</span>
      <span className="text-[#0A0F1F]">{value}</span>
    </div>
  );
}

// ─── decision building ───────────────────────────────────────────────────────

function severityTone(s: Severity) {
  if (s === "critical") {
    return {
      badge: "border-rose-300 bg-rose-50 text-rose-700",
      icon: <AlertOctagon className="h-3 w-3" />,
    };
  }
  if (s === "warning") {
    return {
      badge: "border-amber-300 bg-amber-50 text-amber-800",
      icon: <AlertTriangle className="h-3 w-3" />,
    };
  }
  return {
    badge: "border-[#E0D8C8] bg-[#F5F1E8] text-[#334155]",
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

function computeDeadline(kind: Decision["kind"], createdAt: string, due: string | null | undefined) {
  if (due) return new Date(due).toISOString();
  const started = new Date(createdAt).getTime();
  const ms = SLA_HOURS[kind] * 3600_000;
  return new Date(started + ms).toISOString();
}

function buildDecisions(data: CommandCenterPayload): Decision[] {
  const nowIso = new Date().toISOString();
  const out: Decision[] = [];
  const projects = new Map<string, EngineProjectRow>();
  for (const p of data.active_projects ?? []) projects.set(p.id, p);
  const nbaByProject = new Map<string, string>();
  for (const n of data.next_best_actions_v2 ?? []) nbaByProject.set(n.project_id, n.action);

  // Approvals — highest impact first
  for (const item of data.approval_breakdown?.items ?? []) {
    const severity: Severity = item.impact === "high" ? "critical" : "warning";
    const createdAt = item.created_at ?? nowIso;
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
      createdAt,
      deadlineAt: computeDeadline("approval", createdAt, null),
      riskDrivers: [
        `Impact classified ${item.impact}.`,
        `Artifact type: ${item.item_type.replace(/_/g, " ")}.`,
        `Sitting in review since ${new Date(createdAt).toLocaleString()}.`,
      ],
      requiredFields: ["Operator sign-off", "Optional rejection reason", "Notify client if impact = high"],
      changes: [],
      rank: severity === "critical" ? 100 : 70,
    });
  }

  // Blocked projects
  for (const p of data.active_projects ?? []) {
    if (p.status !== "blocked") continue;
    const createdAt = p.last_activity_at ?? nowIso;
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
      createdAt,
      due: p.next_critical_date?.due_on ?? null,
      deadlineAt: computeDeadline("blocked", createdAt, p.next_critical_date?.due_on ?? null),
      riskDrivers: [
        `Status: ${p.status}.`,
        p.open_decisions > 0 ? `${p.open_decisions} open decision(s) on client side.` : "Owner is Operator; internal blocker.",
        p.next_critical_date ? `${p.next_critical_date.label} due ${formatDate(p.next_critical_date.due_on)}.` : "No hard deadline set.",
        `Agent status: ${p.agent_status}.`,
      ],
      requiredFields: [
        "Identify blocker root cause",
        "Reassign owner if stalled >4h",
        "Update next_action or clear status",
      ],
      changes: [],
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
      createdAt: nowIso,
      deadlineAt: computeDeadline("agent_failure", nowIso, null),
      riskDrivers: [
        `${failures} failed run(s) in 24h.`,
        `Runs in progress: ${data.agent_ops?.runs_in_progress ?? 0}.`,
        `Runs needing attention: ${data.agent_ops?.needs_attention ?? 0}.`,
      ],
      requiredFields: ["Inspect failing runs", "Retry or archive", "Root-cause repeat failures"],
      changes: [],
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
      createdAt: nowIso,
      deadlineAt: computeDeadline("client_decision", nowIso, null),
      riskDrivers: [
        `${clientDecisions} pending client decision(s).`,
        `${data.client_action_counts.info_requests} info request(s) outstanding.`,
        `${data.client_action_counts.feedback_pending} feedback item(s) pending.`,
      ],
      requiredFields: ["Send reminder", "Escalate to call if >72h", "Log outcome in project chat"],
      changes: [],
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
      createdAt: nowIso,
      deadlineAt: computeDeadline("budget", nowIso, null),
      riskDrivers: [
        `${formatCents(spend)} of ${formatCents(budget)} consumed.`,
        `${Math.round((spend / budget) * 100)}% utilisation.`,
        spend / budget > 1 ? "Cap already exceeded." : "Trend suggests overrun within the week.",
      ],
      requiredFields: ["Raise monthly cap", "Or pause low-priority agents", "Alert stakeholders"],
      changes: [],
      rank: 65,
    });
  }

  return out.sort((a, b) => b.rank - a.rank);
}

// ─── SLA / countdown helpers ────────────────────────────────────────────────

function formatCountdown(deadlineIso: string, nowMs: number): { label: string; tone: Severity; overdue: boolean } {
  const target = new Date(deadlineIso).getTime();
  const diff = target - nowMs;
  const overdue = diff < 0;
  const abs = Math.abs(diff);
  const days = Math.floor(abs / 86_400_000);
  const hours = Math.floor((abs % 86_400_000) / 3_600_000);
  const mins = Math.floor((abs % 3_600_000) / 60_000);
  const parts = days > 0 ? `${days}d ${hours}h` : hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  const label = overdue ? `Overdue ${parts}` : `Due in ${parts}`;
  const tone: Severity = overdue
    ? "critical"
    : diff < 4 * 3_600_000
      ? "warning"
      : "info";
  return { label, tone, overdue };
}

function useNowTick(intervalMs = 60_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

const LAST_CHECK_KEY = "engine:command-center:last-checked";

/** Reads previous last-checked cutoff and writes a fresh one on mount. */
function useLastChecked(): string | null {
  const [cutoff, setCutoff] = useState<string | null>(null);
  const wrote = useRef(false);
  useEffect(() => {
    if (wrote.current) return;
    wrote.current = true;
    try {
      const prev = window.localStorage.getItem(LAST_CHECK_KEY);
      setCutoff(prev);
      window.localStorage.setItem(LAST_CHECK_KEY, new Date().toISOString());
    } catch {
      setCutoff(null);
    }
  }, []);
  return cutoff;
}

function enrichWithChanges(decisions: Decision[], data: CommandCenterPayload, cutoffIso: string | null): Decision[] {
  const cutoffMs = cutoffIso ? new Date(cutoffIso).getTime() : 0;
  const activity = (data.recent_activity ?? []).filter((a) => new Date(a.created_at).getTime() > cutoffMs);
  return decisions.map((d) => {
    const matches = activity
      .filter((a) => {
        if (d.projectId && a.project_id === d.projectId) return true;
        if (a.project_name && d.projectName && a.project_name === d.projectName) return true;
        // system-scoped decisions match failure/budget activity kinds
        if (d.kind === "agent_failure" && /fail|error|retry/i.test(`${a.kind} ${a.title}`)) return true;
        if (d.kind === "budget" && /budget|spend|cost/i.test(`${a.kind} ${a.title}`)) return true;
        return false;
      })
      .slice(0, 4)
      .map<ChangeEntry>((a) => ({ id: a.id, title: a.title, at: a.created_at, kind: a.kind }));
    return { ...d, changes: matches };
  });
}

// ─── decision detail drawer ─────────────────────────────────────────────────

function DecisionDrawer({
  decision,
  now,
  onClose,
}: {
  decision: Decision | null;
  now: number;
  onClose: () => void;
}) {
  const open = decision !== null;
  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-full overflow-y-auto border-l border-[#E8E1D6] bg-white sm:max-w-[520px]">
        {decision && (
          <>
            <SheetHeader className="text-left">
              <div className="flex flex-wrap items-center gap-2">
                <SeverityChip severity={decision.severity} />
                <SlaBadge deadlineAt={decision.deadlineAt} now={now} />
                <span className="text-[11px] uppercase tracking-widest text-[#8A94A6]">
                  {kindLabel(decision.kind)}
                </span>
              </div>
              <SheetTitle className="text-[#0A0F1F]">{decision.what}</SheetTitle>
              <SheetDescription className="text-[#667085]">{decision.why}</SheetDescription>
            </SheetHeader>

            <div className="mt-6 space-y-6 text-sm">
              <DrawerMeta decision={decision} />

              <DrawerSection title="Risk drivers" icon={<AlertTriangle className="h-4 w-4 text-amber-700" />}>
                <ul className="space-y-1.5">
                  {decision.riskDrivers.map((r, i) => (
                    <li key={i} className="flex gap-2 text-[13px] text-[#334155]">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#98A2B3]" />
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </DrawerSection>

              <DrawerSection title="Recommended next action" icon={<Sparkles className="h-4 w-4 text-sky-700" />}>
                <div className="rounded-md border border-[#E8E1D6] bg-[#FBF9F4] p-3 text-[13px] text-[#0A0F1F]">
                  {decision.recommended}
                </div>
              </DrawerSection>

              <DrawerSection title="Required to resolve" icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />}>
                <ul className="space-y-1.5">
                  {decision.requiredFields.map((r, i) => (
                    <li key={i} className="flex items-start gap-2 text-[13px] text-[#334155]">
                      <span className="mt-1 inline-block h-3 w-3 shrink-0 rounded border border-[#C8CFD9]" />
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </DrawerSection>

              <DrawerSection title="Changed since last check" icon={<History className="h-4 w-4 text-sky-700" />}>
                {decision.changes.length === 0 ? (
                  <div className="text-[13px] text-[#8A94A6]">
                    Nothing new. You have the latest state.
                  </div>
                ) : (
                  <ol className="space-y-2 border-l border-[#E8E1D6] pl-3">
                    {decision.changes.map((c) => (
                      <li key={c.id} className="relative text-[13px]">
                        <span className="absolute -left-[7px] top-1.5 h-2 w-2 rounded-full bg-sky-500" />
                        <div className="text-[#0A0F1F]">{c.title}</div>
                        <div className="text-xs text-[#8A94A6]">
                          {c.kind} · {new Date(c.at).toLocaleString()}
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </DrawerSection>

              <div className="flex flex-wrap items-center gap-2 border-t border-[#EFEAE0] pt-4">
                <Link
                  to={decision.href}
                  onClick={onClose}
                  className="inline-flex items-center gap-1.5 rounded-md bg-[#0A0F1F] px-3.5 py-2 text-xs font-medium text-[#FBF9F4] hover:bg-[#1a2234]"
                >
                  {ctaLabel(decision.kind)} <ArrowRight className="h-3.5 w-3.5" />
                </Link>
                {decision.projectId && (
                  <Link
                    to="/engine/projects/$projectId/overview"
                    params={{ projectId: decision.projectId }}
                    onClick={onClose}
                    className="inline-flex items-center gap-1.5 rounded-md border border-[#E0D8C8] bg-[#F5F1E8] px-3.5 py-2 text-xs font-medium text-[#0A0F1F] hover:bg-[#EFE9DC]"
                  >
                    Open project <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="ml-auto text-[11px] uppercase tracking-widest text-[#8A94A6] hover:text-[#0A0F1F]"
                >
                  Close
                </button>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function DrawerMeta({ decision }: { decision: Decision }) {
  return (
    <div className="grid grid-cols-2 gap-3 rounded-md border border-[#E8E1D6] bg-[#FBF9F4] p-3 text-xs">
      <MetaRow label="Client" value={decision.clientCompany} />
      <MetaRow label="Project" value={decision.projectName} />
      <MetaRow label="Owner" value={decision.owner} />
      <MetaRow label="Opened" value={new Date(decision.createdAt).toLocaleString()} />
      <MetaRow label="Deadline" value={new Date(decision.deadlineAt).toLocaleString()} />
      {decision.due && <MetaRow label="Hard due date" value={formatDate(decision.due)} />}
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-widest text-[#98A2B3]">{label}</div>
      <div className="truncate text-[#0A0F1F]">{value}</div>
    </div>
  );
}

function DrawerSection({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-widest text-[#8A94A6]">
        {icon}
        {title}
      </div>
      {children}
    </section>
  );
}

function SeverityChip({ severity }: { severity: Severity }) {
  const tone = severityTone(severity);
  return (
    <span className={cn("inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-widest", tone.badge)}>
      {tone.icon}
      {severity === "critical" ? "Critical" : severity === "warning" ? "Risk" : "Review"}
    </span>
  );
}


