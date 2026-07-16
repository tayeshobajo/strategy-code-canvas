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
  Activity,
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  DollarSign,
  ExternalLink,
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
  what: string;
  why: string;
  owner: string;
  recommended: string;
  href: string;
  severity: Severity;
  createdAt: string;
  due?: string | null;
  deadlineAt: string;
  riskDrivers: string[];
  requiredFields: string[];
  changes: ChangeEntry[];
  rank: number;
};

const SLA_HOURS: Record<Decision["kind"], number> = {
  approval: 24,
  blocked: 4,
  at_risk: 24,
  agent_failure: 2,
  client_decision: 72,
  budget: 24,
};

// canonical journey stage order
const JOURNEY_STAGES = [
  "intake",
  "understanding",
  "spine approval",
  "roadmap",
  "mockups",
  "build",
  "qa",
  "delivery",
] as const;

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

  const changesSinceLast = useMemo(() => {
    const cutoffMs = lastChecked ? new Date(lastChecked).getTime() : 0;
    return (data.recent_activity ?? []).filter((a) => new Date(a.created_at).getTime() > cutoffMs).length;
  }, [data.recent_activity, lastChecked]);

  return (
    <div className="-mx-4 -my-7 min-h-full bg-[#FBF9F4] text-[#0A0F1F] sm:-mx-6 sm:-my-8 lg:-mx-8 lg:-my-10">
      <div className="mx-auto max-w-[1440px] space-y-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <HeaderRow
          systemHealth={data.metrics.system_health}
          topDecision={top}
          onOpenTop={() => top && setSelectedId(top.id)}
          lastChecked={lastChecked}
          changesSinceLast={changesSinceLast}
        />

        <InstrumentRow data={data} />

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <NeedsAttention
            decisions={decisions}
            groups={attentionGroups}
            now={now}
            onSelect={setSelectedId}
          />
          <CaptainBrief data={data} decisions={decisions} groups={attentionGroups} />
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <ProjectJourney data={data} />
          <UpcomingDeliveries data={data} />
        </div>

        <BottomTelemetry data={data} changesSinceLast={changesSinceLast} />

        <DecisionDrawer decision={selected} now={now} onClose={() => setSelectedId(null)} />
      </div>
    </div>
  );
}

// ─── header ──────────────────────────────────────────────────────────────────

function HeaderRow({
  systemHealth,
  topDecision,
  onOpenTop,
  lastChecked,
  changesSinceLast,
}: {
  systemHealth: "green" | "amber" | "red";
  topDecision: Decision | null;
  onOpenTop: () => void;
  lastChecked: string | null;
  changesSinceLast: number;
}) {
  const now = new Date();
  const healthTone =
    systemHealth === "red"
      ? "border-rose-300 bg-rose-50 text-rose-700"
      : systemHealth === "amber"
        ? "border-amber-300 bg-amber-50 text-amber-800"
        : "border-emerald-300 bg-emerald-50 text-emerald-700";
  const healthLabel =
    systemHealth === "green" ? "System nominal" : systemHealth === "amber" ? "System elevated" : "System critical";

  return (
    <header className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,460px)]">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-[#8A94A6]">
          Command center
        </div>
        <h1 className="mt-1 font-display text-3xl leading-tight text-[#0A0F1F] sm:text-[36px]">
          Command Center
        </h1>
        <div className="mt-1 text-sm text-[#667085]">
          {now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          <span className="mx-1.5 text-[#C8CFD9]">·</span>
          {now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
          <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5", healthTone)}>
            <span className="h-1.5 w-1.5 rounded-full bg-current" /> {healthLabel}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E8E1D6] bg-[#F5F1E8] px-2 py-0.5 text-[#667085]">
            <Radio className="h-3 w-3" />
            Last sync {lastChecked ? new Date(lastChecked).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "now"}
          </span>
          {changesSinceLast > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-300 bg-sky-50 px-2 py-0.5 text-sky-800">
              <History className="h-3 w-3" />
              {changesSinceLast} change{changesSinceLast === 1 ? "" : "s"} since last check
            </span>
          )}
        </div>
        <p className="mt-3 max-w-xl text-sm text-[#667085]">
          Your operating cockpit. Live truth. Intelligent focus. Next best move.
        </p>
      </div>

      <HighestLeverageCard decision={topDecision} onOpen={onOpenTop} />
    </header>
  );
}

function HighestLeverageCard({ decision, onOpen }: { decision: Decision | null; onOpen: () => void }) {
  if (!decision) {
    return (
      <div className="flex flex-col justify-between rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5 shadow-sm">
        <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-emerald-700">
          Highest-leverage action
        </div>
        <div className="mt-3 flex items-center gap-2 text-emerald-800">
          <CheckCircle2 className="h-5 w-5" />
          <span className="text-sm">No decisions waiting. All clear.</span>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col justify-between rounded-2xl border border-[#0A0F1F]/10 bg-[#0A0F1F] p-5 text-white shadow-md">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-white/60">
          Highest-leverage action
        </div>
        <div className="mt-2 text-base font-medium leading-snug">{decision.what}</div>
        <div className="mt-1 text-xs text-white/70">
          <span className="text-white/50">Why: </span>
          {decision.why}
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5 text-[10px]">
          <MetaChip label="Impact" value={decision.severity === "critical" ? "High" : decision.severity === "warning" ? "Medium" : "Review"} />
          <MetaChip label="Blocks" value={kindLabel(decision.kind)} />
          <MetaChip label="Owner" value={decision.owner} />
          <MetaChip label="Due" value={decision.due ? formatDate(decision.due) : new Date(decision.deadlineAt).toLocaleDateString()} />
        </div>
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-[#0A0F1F] transition hover:bg-[#F5F1E8]"
      >
        Review and decide <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );
}

function MetaChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded border border-white/15 bg-white/5 px-1.5 py-0.5 uppercase tracking-widest text-white/70">
      <span className="text-white/50">{label}</span>
      <span className="text-white">{value}</span>
    </span>
  );
}

// ─── instrument row ─────────────────────────────────────────────────────────

type Slice = { label: string; value: number; color: string };

function InstrumentRow({ data }: { data: CommandCenterPayload }) {
  const hb = data.health_breakdown;
  const portfolioSlices: Slice[] = [
    { label: "On track", value: hb.on_track, color: "#10b981" },
    { label: "Needs attention", value: hb.needs_attention, color: "#f59e0b" },
    { label: "At risk", value: hb.at_risk, color: "#f43f5e" },
    { label: "Blocked", value: hb.blocked, color: "#7f1d1d" },
  ];

  const stageCount = (name: string) =>
    data.stage_breakdown.find((s) => s.stage.toLowerCase() === name)?.count ?? 0;

  const spineSlices: Slice[] = [
    { label: "Intake", value: stageCount("intake"), color: "#94a3b8" },
    { label: "Understanding", value: stageCount("understanding"), color: "#38bdf8" },
    { label: "Spine approval", value: stageCount("spine approval"), color: "#6366f1" },
    { label: "Roadmap", value: stageCount("roadmap"), color: "#10b981" },
  ];

  const deliverySlices: Slice[] = [
    { label: "Mockups", value: stageCount("mockups"), color: "#a78bfa" },
    { label: "Build", value: stageCount("build"), color: "#38bdf8" },
    { label: "QA", value: stageCount("qa"), color: "#f59e0b" },
    { label: "Delivery", value: stageCount("delivery"), color: "#10b981" },
  ];

  const cac = data.client_action_counts;
  const budget = data.metrics.agent_budget_cents;
  const spend = data.metrics.agent_spend_cents;
  const budgetPct = budget > 0 ? Math.round((spend / budget) * 100) : 0;
  const budgetTone = budgetPct > 90 ? "critical" : budgetPct > 70 ? "warning" : "info";

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      <InstrumentCard
        eyebrow="Portfolio health"
        primary={<Donut slices={portfolioSlices} centerLabel={String(data.metrics.active_projects)} centerHint="active" />}
        footer={
          <Legend slices={portfolioSlices} />
        }
        link={{ to: "/engine/projects", label: "View portfolio" }}
      />
      <InstrumentCard
        eyebrow="Spine readiness"
        note="Stage distribution before delivery."
        primary={<Donut slices={spineSlices} centerLabel={String(spineSlices.reduce((n, s) => n + s.value, 0))} centerHint="projects" />}
        footer={<Legend slices={spineSlices} />}
        link={{ to: "/engine/projects", label: "View spines" }}
      />
      <InstrumentCard
        eyebrow="Delivery readiness"
        note="Stage distribution in delivery."
        primary={<Donut slices={deliverySlices} centerLabel={String(deliverySlices.reduce((n, s) => n + s.value, 0))} centerHint="projects" />}
        footer={<Legend slices={deliverySlices} />}
        link={{ to: "/engine/projects", label: "View pipeline" }}
      />
      <InstrumentCard
        eyebrow="Client momentum"
        note="This week."
        primary={
          <div className="grid grid-cols-3 gap-2 py-4 text-center">
            <BigStat label="Decisions" value={cac.decisions_needed} />
            <BigStat label="Info req." value={cac.info_requests} />
            <BigStat label="Feedback" value={cac.feedback_pending} />
          </div>
        }
        link={{ to: "/engine/projects", label: "View clients" }}
      />
      <InstrumentCard
        eyebrow="Value and cost exposure"
        primary={
          <div className="py-2">
            <div className="text-2xl font-semibold text-[#0A0F1F]">
              {formatCents(spend)}
              <span className="ml-1 text-sm font-normal text-[#98A2B3]">of {formatCents(budget)}</span>
            </div>
            <div className="mt-2 h-1.5 rounded bg-[#F5F1E8]">
              <div
                className={cn(
                  "h-full rounded",
                  budgetTone === "critical" ? "bg-rose-500" : budgetTone === "warning" ? "bg-amber-500" : "bg-[#98A2B3]",
                )}
                style={{ width: `${Math.min(100, budgetPct)}%` }}
              />
            </div>
            <div className="mt-2 text-xs text-[#667085]">
              {budgetPct}% of monthly agent spend consumed.
            </div>
          </div>
        }
        link={{ to: "/engine/operations", label: "View spend" }}
      />
    </div>
  );
}

function InstrumentCard({
  eyebrow,
  note,
  primary,
  footer,
  link,
}: {
  eyebrow: string;
  note?: string;
  primary: ReactNode;
  footer?: ReactNode;
  link: { to: string; label: string };
}) {
  return (
    <div className="flex flex-col rounded-2xl border border-[#E8E1D6] bg-white p-4 shadow-sm">
      <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-[#8A94A6]">{eyebrow}</div>
      {note && <div className="mt-1 text-[11px] text-[#98A2B3]">{note}</div>}
      <div className="flex-1">{primary}</div>
      {footer && <div className="mt-2">{footer}</div>}
      <Link
        to={link.to}
        className="mt-3 inline-flex items-center gap-1 text-[11px] uppercase tracking-widest text-[#8A94A6] hover:text-[#0A0F1F]"
      >
        {link.label} <ArrowUpRight className="h-3 w-3" />
      </Link>
    </div>
  );
}

function BigStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-xl font-semibold text-[#0A0F1F]">{value}</div>
      <div className="text-[10px] uppercase tracking-widest text-[#8A94A6]">{label}</div>
    </div>
  );
}

// ─── donut ──────────────────────────────────────────────────────────────────

function Donut({ slices, centerLabel, centerHint }: { slices: Slice[]; centerLabel: string; centerHint?: string }) {
  const total = slices.reduce((n, s) => n + s.value, 0);
  const size = 112;
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex items-center justify-center py-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#EFE9DC" strokeWidth={stroke} />
          {total > 0 &&
            slices.map((s, i) => {
              if (s.value === 0) return null;
              const len = (s.value / total) * c;
              const el = (
                <circle
                  key={i}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={stroke}
                  strokeDasharray={`${len} ${c - len}`}
                  strokeDashoffset={-offset}
                  strokeLinecap="butt"
                />
              );
              offset += len;
              return el;
            })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="font-display text-xl text-[#0A0F1F]">{centerLabel}</div>
          {centerHint && (
            <div className="font-mono text-[9px] uppercase tracking-widest text-[#98A2B3]">{centerHint}</div>
          )}
        </div>
      </div>
    </div>
  );
}

function Legend({ slices }: { slices: Slice[] }) {
  return (
    <ul className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
      {slices.map((s) => (
        <li key={s.label} className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
          <span className="truncate text-[#667085]">{s.label}</span>
          <span className="ml-auto text-[#0A0F1F]">{s.value}</span>
        </li>
      ))}
    </ul>
  );
}

// ─── needs your attention ───────────────────────────────────────────────────

type AttentionTab = "decisions" | "risk" | "readiness" | "aging";

function NeedsAttention({
  decisions,
  groups,
  now,
  onSelect,
}: {
  decisions: Decision[];
  groups: AttentionGroup[];
  now: number;
  onSelect: (id: string) => void;
}) {
  const [tab, setTab] = useState<AttentionTab>("decisions");
  const risk = groups.filter((g) => g.key === "blocked" || g.key === "at_risk" || g.key === "needs_review");
  const readiness = groups.filter((g) => g.tone === "critical");
  const overdue = decisions.filter((d) => new Date(d.deadlineAt).getTime() < now);

  const counts = {
    decisions: decisions.length,
    risk: risk.reduce((n, g) => n + g.rows.length, 0),
    readiness: readiness.reduce((n, g) => n + g.rows.length, 0),
    aging: overdue.length,
  };

  return (
    <section className="rounded-2xl border border-[#E8E1D6] bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-[#EFE9DC] px-5 py-3">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-[#667085]" />
          <h2 className="text-sm font-semibold text-[#0A0F1F]">Needs your attention</h2>
        </div>
        <Link to="/engine/approvals" className="text-[11px] uppercase tracking-widest text-[#8A94A6] hover:text-[#0A0F1F]">
          Open queue →
        </Link>
      </div>
      <div className="flex flex-wrap gap-1 border-b border-[#EFE9DC] px-3 py-2">
        <TabButton active={tab === "decisions"} onClick={() => setTab("decisions")} label="Decisions" count={counts.decisions} />
        <TabButton active={tab === "risk"} onClick={() => setTab("risk")} label="Projects at risk" count={counts.risk} />
        <TabButton active={tab === "readiness"} onClick={() => setTab("readiness")} label="Readiness blockers" count={counts.readiness} />
        <TabButton active={tab === "aging"} onClick={() => setTab("aging")} label="Overdue and aging" count={counts.aging} />
      </div>

      {tab === "decisions" &&
        (decisions.length === 0 ? (
          <EmptyState icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />}>
            Nothing awaiting a decision. Healthy silence.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-[#EFE9DC]">
            {decisions.slice(0, 8).map((d) => (
              <DecisionRow key={d.id} d={d} now={now} onSelect={onSelect} />
            ))}
          </ul>
        ))}

      {tab === "risk" && <AttentionGroupsList groups={risk} />}
      {tab === "readiness" && <AttentionGroupsList groups={readiness} />}
      {tab === "aging" &&
        (overdue.length === 0 ? (
          <EmptyState icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />}>
            Nothing overdue. Countdown is quiet.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-[#EFE9DC]">
            {overdue.slice(0, 8).map((d) => (
              <DecisionRow key={d.id} d={d} now={now} onSelect={onSelect} />
            ))}
          </ul>
        ))}
    </section>
  );
}

function TabButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs transition",
        active ? "bg-[#0A0F1F] text-white" : "text-[#667085] hover:bg-[#F5F1E8] hover:text-[#0A0F1F]",
      )}
    >
      {label}
      <span
        className={cn(
          "inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px]",
          active ? "bg-white/15 text-white" : "bg-[#F5F1E8] text-[#667085]",
        )}
      >
        {count}
      </span>
    </button>
  );
}

function AttentionGroupsList({ groups }: { groups: AttentionGroup[] }) {
  const total = groups.reduce((n, g) => n + g.rows.length, 0);
  if (total === 0) {
    return (
      <EmptyState icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />}>
        No exceptions in this view.
      </EmptyState>
    );
  }
  return (
    <div className="divide-y divide-[#EFE9DC]">
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
                    : "border-[#E8E1D6] bg-[#F5F1E8] text-[#334155]",
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
                className="grid grid-cols-1 items-center gap-2 rounded-lg border border-[#EFE9DC] bg-[#FBF9F4] px-3 py-2 md:grid-cols-[minmax(0,1fr)_auto]"
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
                  className="inline-flex items-center gap-1 rounded-lg border border-[#EFE9DC] bg-[#F5F1E8] px-2.5 py-1 text-[11px] text-[#0A0F1F] hover:bg-[#EFE9DC]"
                >
                  Review <ArrowUpRight className="h-3 w-3" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

// ─── captain brief ──────────────────────────────────────────────────────────

function CaptainBrief({
  data,
  decisions,
  groups,
}: {
  data: CommandCenterPayload;
  decisions: Decision[];
  groups: AttentionGroup[];
}) {
  const top = decisions[0] ?? null;
  const riskCount = groups
    .filter((g) => g.key === "blocked" || g.key === "at_risk")
    .reduce((n, g) => n + g.rows.length, 0);
  const approvalCount = data.approval_breakdown?.total ?? 0;
  const clientPending = data.client_action_counts.decisions_needed;
  const nba = data.next_best_actions_v2?.[0] ?? data.next_best_actions?.[0] ?? null;

  const bullets: string[] = [];
  if (top) {
    bullets.push(
      `Top decision is "${top.what}". Resolving it unblocks ${kindLabel(top.kind).toLowerCase()} work on ${top.projectName}.`,
    );
  }
  if (riskCount > 0) {
    const firstRisk = groups.find((g) => g.key === "blocked" || g.key === "at_risk")?.rows[0];
    bullets.push(
      `${riskCount} project${riskCount === 1 ? "" : "s"} at risk${firstRisk ? `, starting with ${firstRisk.name}` : ""}.`,
    );
  }
  if (approvalCount > 0) {
    bullets.push(`${approvalCount} artifact${approvalCount === 1 ? "" : "s"} sitting in review awaiting sign-off.`);
  }
  if (clientPending > 0) {
    bullets.push(`${clientPending} decision${clientPending === 1 ? "" : "s"} waiting on clients this week.`);
  }
  if (bullets.length === 0) {
    bullets.push("All queues are quiet. No open decisions, no risk signals, no client blockers right now.");
  }

  const posture =
    approvalCount >= Math.max(riskCount, 1)
      ? "approvals dominate, clear the queue before starting new work"
      : riskCount > 0
        ? "risk dominates, unblock at-risk projects first"
        : "all clear, invest in the next best action";

  return (
    <section className="flex h-full flex-col rounded-2xl border border-[#E8E1D6] bg-white p-5 shadow-sm">
      <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-[#8A94A6]">Captain brief</div>
      <div className="mt-1 font-display text-lg text-[#0A0F1F]">Here is what matters most right now.</div>
      <ul className="mt-3 space-y-2 text-sm text-[#334155]">
        {bullets.slice(0, 4).map((b, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[#98A2B3]" />
            <span>{b}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 rounded-xl border border-[#EFE9DC] bg-[#FBF9F4] p-3 text-sm text-[#0A0F1F]">
        <span className="font-mono text-[10px] uppercase tracking-widest text-[#8A94A6]">Recommended posture: </span>
        {posture}.
      </div>
      {nba && (
        <div className="mt-3">
          <div className="text-xs text-[#667085]">{nba.action}</div>
          <Link
            to="/engine/projects/$projectId/overview"
            params={{ projectId: nba.project_id }}
            className="mt-1 inline-flex items-center gap-1.5 text-xs text-sky-700 hover:text-sky-800"
          >
            Open next best action <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}
    </section>
  );
}

// ─── project journey strip ──────────────────────────────────────────────────

function ProjectJourney({ data }: { data: CommandCenterPayload }) {
  const byStage = new Map<string, { count: number; projects: { id: string; name: string }[] }>();
  for (const s of data.stage_breakdown ?? []) {
    byStage.set(s.stage.toLowerCase(), {
      count: s.count,
      projects: (s.projects ?? []).map((p) => ({ id: p.id, name: p.name })),
    });
  }
  return (
    <section className="rounded-2xl border border-[#E8E1D6] bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-[#8A94A6]">Project journey</div>
          <div className="mt-1 font-display text-lg text-[#0A0F1F]">Pipeline by stage</div>
        </div>
        <Link to="/engine/projects" className="text-[11px] uppercase tracking-widest text-[#8A94A6] hover:text-[#0A0F1F]">
          View pipeline →
        </Link>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
        {JOURNEY_STAGES.map((stage) => {
          const s = byStage.get(stage);
          const muted = !s || s.count === 0;
          return (
            <div
              key={stage}
              className={cn(
                "rounded-xl border p-3 text-xs",
                muted ? "border-[#EFE9DC] bg-[#FBF9F4] text-[#98A2B3]" : "border-[#E8E1D6] bg-white text-[#334155]",
              )}
            >
              <div className="font-mono text-[9px] uppercase tracking-widest">{stage}</div>
              <div className={cn("mt-1 font-display text-2xl", muted ? "text-[#C8CFD9]" : "text-[#0A0F1F]")}>
                {s?.count ?? 0}
              </div>
              <ul className="mt-2 space-y-0.5">
                {(s?.projects ?? []).slice(0, 3).map((p) => (
                  <li key={p.id} className="truncate">
                    <Link
                      to="/engine/projects/$projectId/overview"
                      params={{ projectId: p.id }}
                      className="hover:text-[#0A0F1F]"
                    >
                      {p.name}
                    </Link>
                  </li>
                ))}
                {s && s.projects.length > 3 && (
                  <li className="text-[#98A2B3]">+{s.projects.length - 3} more</li>
                )}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ─── upcoming deliveries ────────────────────────────────────────────────────

function UpcomingDeliveries({ data }: { data: CommandCenterPayload }) {
  const statusById = new Map<string, EngineProjectRow>();
  for (const p of data.active_projects ?? []) statusById.set(p.id, p);
  return (
    <section className="rounded-2xl border border-[#E8E1D6] bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4 text-amber-700" />
        <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-[#8A94A6]">Upcoming deliveries</div>
      </div>
      {data.upcoming_deadlines.length === 0 ? (
        <div className="mt-3 text-sm text-[#8A94A6]">No upcoming deliveries in the current window.</div>
      ) : (
        <ul className="mt-3 space-y-3">
          {data.upcoming_deadlines.slice(0, 6).map((d) => {
            const proj = statusById.get(d.project_id);
            const tone: Severity =
              proj?.status === "blocked"
                ? "critical"
                : proj?.status === "needs_review"
                  ? "warning"
                  : "info";
            const cls =
              tone === "critical"
                ? "border-rose-300 bg-rose-50 text-rose-700"
                : tone === "warning"
                  ? "border-amber-300 bg-amber-50 text-amber-800"
                  : "border-emerald-300 bg-emerald-50 text-emerald-700";
            const label = tone === "critical" ? "At risk" : tone === "warning" ? "Watch" : "On track";
            return (
              <li key={`${d.project_id}-${d.label}`} className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm text-[#0A0F1F]">{d.label}</div>
                  <div className="truncate text-xs text-[#8A94A6]">
                    {d.project_name} · due {formatDate(d.due_on)}
                  </div>
                </div>
                <span className={cn("inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-widest", cls)}>
                  {label}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ─── bottom telemetry ───────────────────────────────────────────────────────

function BottomTelemetry({ data, changesSinceLast }: { data: CommandCenterPayload; changesSinceLast: number }) {
  const cac = data.client_action_counts;
  const ops = data.agent_ops;
  const spend = data.metrics.agent_spend_cents;
  const budget = data.metrics.agent_budget_cents;
  const budgetPct = budget > 0 ? Math.round((spend / budget) * 100) : 0;
  const healthLabel =
    data.metrics.system_health === "green" ? "Nominal" : data.metrics.system_health === "amber" ? "Elevated" : "Critical";

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <TelemetryCard
        icon={<Users className="h-3.5 w-3.5" />}
        eyebrow="Client actions"
        rows={[
          { label: "Decisions", value: cac.decisions_needed },
          { label: "Info req.", value: cac.info_requests },
          { label: "Feedback", value: cac.feedback_pending },
        ]}
        link={{ to: "/engine/projects", label: "View clients" }}
      />
      <TelemetryCard
        icon={<Activity className="h-3.5 w-3.5" />}
        eyebrow="Agent operations"
        rows={[
          { label: "Active", value: ops?.runs_in_progress ?? 0 },
          { label: "Waiting", value: ops?.needs_attention ?? 0 },
          { label: "Failed 24h", value: ops?.failures_24h ?? 0 },
        ]}
        link={{ to: "/engine/operations", label: "View operations" }}
      />
      <TelemetryCard
        icon={<DollarSign className="h-3.5 w-3.5" />}
        eyebrow="Cost and efficiency"
        rows={[
          { label: "Spend", value: formatCents(spend) },
          { label: "Budget", value: formatCents(budget) },
          { label: "% used", value: `${budgetPct}%` },
        ]}
        link={{ to: "/engine/operations", label: "View spend" }}
      />
      <TelemetryCard
        icon={<Zap className="h-3.5 w-3.5" />}
        eyebrow="Change intelligence"
        rows={[
          { label: "Since last check", value: changesSinceLast },
          { label: "Recent items", value: data.recent_activity?.length ?? 0 },
        ]}
        link={{ to: "/engine/projects", label: "View activity" }}
      />
      <TelemetryCard
        icon={<ShieldAlert className="h-3.5 w-3.5" />}
        eyebrow="System integrity"
        rows={[
          { label: "Health", value: healthLabel },
          { label: "Active projects", value: data.metrics.active_projects },
        ]}
        link={{ to: "/admin/command-center", label: "View integrity" }}
      />
    </div>
  );
}

function TelemetryCard({
  icon,
  eyebrow,
  rows,
  link,
}: {
  icon: ReactNode;
  eyebrow: string;
  rows: Array<{ label: string; value: number | string }>;
  link: { to: string; label: string };
}) {
  return (
    <div className="flex flex-col rounded-2xl border border-[#E8E1D6] bg-white p-4 shadow-sm">
      <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.24em] text-[#8A94A6]">
        {icon}
        {eyebrow}
      </div>
      <div className="mt-3 space-y-1.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-2">
            <span className="text-[11px] uppercase tracking-widest text-[#98A2B3]">{r.label}</span>
            <span className="font-display text-base text-[#0A0F1F]">{r.value}</span>
          </div>
        ))}
      </div>
      <Link
        to={link.to}
        className="mt-3 inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-[#8A94A6] hover:text-[#0A0F1F]"
      >
        {link.label} <ArrowUpRight className="h-3 w-3" />
      </Link>
    </div>
  );
}

// ─── projects needing attention (data build) ───────────────────────────────

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
      reason: (r) => r.next_action ?? "Blocked. Unblock or reassign.",
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

  const seen = new Set<string>();
  return groups
    .map((g) => ({
      ...g,
      rows: g.rows.filter((r) => {
        const k = `${g.key}:${r.id}`;
        if (seen.has(k)) return false;
        seen.add(k);
        const anyKey = `p:${r.id}`;
        if (seen.has(anyKey)) return false;
        seen.add(anyKey);
        return true;
      }),
    }))
    .filter((g) => g.rows.length > 0);
}

// ─── decision row ───────────────────────────────────────────────────────────

function SlaBadge({ deadlineAt, now }: { deadlineAt: string; now: number }) {
  const { label, tone, overdue } = formatCountdown(deadlineAt, now);
  const cls =
    tone === "critical"
      ? "border-rose-300 bg-rose-50 text-rose-700"
      : tone === "warning"
        ? "border-amber-300 bg-amber-50 text-amber-800"
        : "border-[#E8E1D6] bg-[#F5F1E8] text-[#334155]";
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
          <span className="inline-flex items-center gap-1.5 rounded-md border border-[#E8E1D6] bg-[#F5F1E8] px-3 py-1.5 text-xs font-medium text-[#0A0F1F]">
            Review <ArrowUpRight className="h-3.5 w-3.5" />
          </span>
        </div>
      </button>
    </li>
  );
}

// ─── small primitives ──────────────────────────────────────────────────────

function EmptyState({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-5 py-6 text-sm text-[#667085]">
      {icon}
      <span>{children}</span>
    </div>
  );
}

// ─── decision building ─────────────────────────────────────────────────────

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
    badge: "border-[#E8E1D6] bg-[#F5F1E8] text-[#334155]",
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
        p.open_decisions > 0 ? `${p.open_decisions} open decision(s) on client side.` : "Owner is Operator. Internal blocker.",
        p.next_critical_date ? `${p.next_critical_date.label} due ${formatDate(p.next_critical_date.due_on)}.` : "No hard deadline set.",
        `Agent status: ${p.agent_status}.`,
      ],
      requiredFields: [
        "Identify blocker root cause",
        "Reassign owner if stalled over 4h",
        "Update next_action or clear status",
      ],
      changes: [],
      rank: 95,
    });
  }

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
      requiredFields: ["Send reminder", "Escalate to call if over 72h", "Log outcome in project chat"],
      changes: [],
      rank: 55,
    });
  }

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
  const tone: Severity = overdue ? "critical" : diff < 4 * 3_600_000 ? "warning" : "info";
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
                <div className="rounded-xl border border-[#EFE9DC] bg-[#FBF9F4] p-3 text-[13px] text-[#0A0F1F]">
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

              <div className="flex flex-wrap items-center gap-2 border-t border-[#EFE9DC] pt-4">
                <Link
                  to={decision.href}
                  onClick={onClose}
                  className="inline-flex items-center gap-1.5 rounded-md bg-[#3E68B2] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#345aa0]"
                >
                  {ctaLabel(decision.kind)} <ArrowRight className="h-3.5 w-3.5" />
                </Link>
                {decision.projectId && (
                  <Link
                    to="/engine/projects/$projectId/overview"
                    params={{ projectId: decision.projectId }}
                    onClick={onClose}
                    className="inline-flex items-center gap-1.5 rounded-md border border-[#E8E1D6] bg-[#F5F1E8] px-3.5 py-2 text-xs font-medium text-[#0A0F1F] hover:bg-[#EFE9DC]"
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
    <div className="grid grid-cols-2 gap-3 rounded-xl border border-[#EFE9DC] bg-[#FBF9F4] p-3 text-xs">
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

// keep Target import used to preserve tree-shaking hint
void Target;
