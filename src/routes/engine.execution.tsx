import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { SectionCard, MetricCard } from "@/components/engine/primitives";
import { cn } from "@/lib/utils";
import { AlertTriangle, FileWarning, Calendar, ClockAlert, HeartPulse, Check } from "lucide-react";

export const Route = createFileRoute("/engine/execution")({
  component: ExecutionTrackerPage,
});

type Build = {
  id: string;
  client: string;
  roadmap: string;
  phase: string;
  progress: number;
  health: "on_track" | "at_risk" | "blocked";
  milestone: string;
  nextDeadline: string;
};

const BUILDS: Build[] = [
  { id: "b1", client: "Mental Dental Academy", roadmap: "Scale Dental Board Prep", phase: "Phase 1 · Pre-Test Readiness", progress: 62, health: "on_track", milestone: "Q-Bank Engine", nextDeadline: "Oct 1, 2025" },
  { id: "b2", client: "Valley Precision Painting", roadmap: "Operations & Lead Engine", phase: "Phase 2 · Growth Focus", progress: 44, health: "at_risk", milestone: "Lead Router MVP", nextDeadline: "Aug 12, 2025" },
  { id: "b3", client: "Gradient Group", roadmap: "Job Board Growth Engine", phase: "Phase 1 · Foundation", progress: 28, health: "on_track", milestone: "Employer onboarding", nextDeadline: "Sep 5, 2025" },
  { id: "b4", client: "Innago", roadmap: "Platform Modernization", phase: "Phase 3 · Automation", progress: 81, health: "blocked", milestone: "Billing rewrite", nextDeadline: "Jul 22, 2025" },
  { id: "b5", client: "Elevate Coaching", roadmap: "Onboarding Engine", phase: "Phase 1 · Intake", progress: 15, health: "on_track", milestone: "Client intake portal", nextDeadline: "Nov 3, 2025" },
];

const HEALTH: Record<Build["health"], { label: string; cls: string; dot: string }> = {
  on_track: { label: "On Track", cls: "bg-[#e6f5ec] text-[#1f6b3b] border-[#c4e6d2]", dot: "bg-[#1f6b3b]" },
  at_risk: { label: "At Risk", cls: "bg-[#fbf3e0] text-[#8a6713] border-[#f1e3b9]", dot: "bg-[#c99a20]" },
  blocked: { label: "Blocked", cls: "bg-[#fbe9ec] text-[#a4283c] border-[#f3ced5]", dot: "bg-[#a4283c]" },
};

type AlertKind = "blocked_decision" | "missing_file" | "overdue_approval" | "delivery_health";
type Alert = {
  id: string;
  kind: AlertKind;
  client: string;
  title: string;
  detail: string;
  ageDays: number;
  severity: "high" | "medium";
  action: string;
};

const INITIAL_ALERTS: Alert[] = [
  { id: "a1", kind: "blocked_decision", client: "Innago", title: "Billing schema sign-off", detail: "Waiting on CTO decision to unblock billing rewrite.", ageDays: 4, severity: "high", action: "Nudge CTO" },
  { id: "a2", kind: "blocked_decision", client: "Valley Precision", title: "Lead source list", detail: "Jason V. hasn't confirmed lead source priorities.", ageDays: 2, severity: "medium", action: "Send reminder" },
  { id: "a3", kind: "blocked_decision", client: "Mental Dental", title: "Question bank format", detail: "Import spec pending confirmation.", ageDays: 3, severity: "medium", action: "Confirm spec" },
  { id: "a4", kind: "missing_file", client: "Gradient Group", title: "Brand kit v3", detail: "Design team blocked without updated brand assets.", ageDays: 5, severity: "high", action: "Request upload" },
  { id: "a5", kind: "missing_file", client: "Elevate Coaching", title: "Client list export", detail: "Need CSV export before intake portal launch.", ageDays: 2, severity: "medium", action: "Request upload" },
  { id: "a6", kind: "overdue_approval", client: "Gradient Group", title: "Approve Phase 1 scope", detail: "Sent 6 days ago, no response.", ageDays: 6, severity: "high", action: "Escalate" },
  { id: "a7", kind: "overdue_approval", client: "Innago", title: "Sign off billing spec", detail: "Sent 3 days ago.", ageDays: 3, severity: "medium", action: "Follow up" },
  { id: "a8", kind: "delivery_health", client: "Innago", title: "Health dropped to Blocked", detail: "Billing rewrite deadline in 12 days.", ageDays: 1, severity: "high", action: "Open build" },
  { id: "a9", kind: "delivery_health", client: "Valley Precision", title: "Progress stalled 8 days", detail: "Progress bar hasn't moved since last sync.", ageDays: 8, severity: "medium", action: "Schedule sync" },
];

const KIND_META: Record<AlertKind, { label: string; icon: React.ReactNode; tone: string }> = {
  blocked_decision: { label: "Blocked Decision", icon: <AlertTriangle className="w-3.5 h-3.5" />, tone: "text-[#a4283c]" },
  missing_file: { label: "Missing File", icon: <FileWarning className="w-3.5 h-3.5" />, tone: "text-[#8a6713]" },
  overdue_approval: { label: "Overdue Approval", icon: <ClockAlert className="w-3.5 h-3.5" />, tone: "text-[#a4283c]" },
  delivery_health: { label: "Delivery Health", icon: <HeartPulse className="w-3.5 h-3.5" />, tone: "text-[#5435a4]" },
};

type Tab = "all" | AlertKind;
const TABS: Tab[] = ["all", "blocked_decision", "missing_file", "overdue_approval", "delivery_health"];
const TAB_LABEL: Record<Tab, string> = {
  all: "All",
  blocked_decision: "Blocked",
  missing_file: "Files",
  overdue_approval: "Approvals",
  delivery_health: "Health",
};

function ExecutionTrackerPage() {
  const [alerts, setAlerts] = useState<Alert[]>(INITIAL_ALERTS);
  const [tab, setTab] = useState<Tab>("all");

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: alerts.length };
    for (const a of alerts) c[a.kind] = (c[a.kind] ?? 0) + 1;
    return c;
  }, [alerts]);

  const highCount = alerts.filter((a) => a.severity === "high").length;
  const filtered = tab === "all" ? alerts : alerts.filter((a) => a.kind === tab);
  const sorted = [...filtered].sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "high" ? -1 : 1;
    return b.ageDays - a.ageDays;
  });

  function resolve(id: string) {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }

  return (
    <div className="max-w-[1500px]">
      <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal">Delivery</div>
      <h1 className="font-display text-4xl text-ink mt-1 mb-2">Execution Tracker</h1>
      <p className="text-ink/60 mb-6">Live status, health, and the fix-now queue for anything blocking active builds.</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <MetricCard label="Active Builds" value={BUILDS.length} tone="blue" />
        <MetricCard label="Open Alerts" value={alerts.length} tone={alerts.length > 0 ? "orange" : "green"} />
        <MetricCard label="High Severity" value={highCount} tone="red" />
        <MetricCard label="Delivery Health" value="86%" tone="green" hint="Rolling 30d" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        <SectionCard title="Active Builds">
          <div className="overflow-x-auto -mx-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] font-mono uppercase tracking-[0.2em] text-ink/50 border-b border-border">
                  <th className="px-5 py-2.5">Client / Roadmap</th>
                  <th className="px-3 py-2.5">Current Phase</th>
                  <th className="px-3 py-2.5">Milestone</th>
                  <th className="px-3 py-2.5">Progress</th>
                  <th className="px-3 py-2.5">Health</th>
                  <th className="px-5 py-2.5">Next Deadline</th>
                </tr>
              </thead>
              <tbody>
                {BUILDS.map((b) => (
                  <tr key={b.id} className="border-b border-border/60 hover:bg-paper-soft/40">
                    <td className="px-5 py-3">
                      <div className="font-medium text-ink">{b.client}</div>
                      <div className="text-xs text-ink/60">{b.roadmap}</div>
                    </td>
                    <td className="px-3 py-3 text-ink/80 whitespace-nowrap">{b.phase}</td>
                    <td className="px-3 py-3 text-ink/80">{b.milestone}</td>
                    <td className="px-3 py-3 min-w-[140px]">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-border overflow-hidden">
                          <div className={cn("h-full", HEALTH[b.health].dot)} style={{ width: `${b.progress}%` }} />
                        </div>
                        <span className="text-xs text-ink/70 w-9 text-right">{b.progress}%</span>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span className={cn("inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border", HEALTH[b.health].cls)}>
                        <span className={cn("w-1.5 h-1.5 rounded-full", HEALTH[b.health].dot)} />
                        {HEALTH[b.health].label}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-ink/70 whitespace-nowrap">{b.nextDeadline}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <SectionCard
          title={
            <div className="flex items-center gap-2">
              <span>Fix Now</span>
              {alerts.length > 0 ? (
                <span className="text-[10px] font-mono uppercase tracking-wider bg-[#a4283c] text-white rounded-full px-2 py-0.5">{alerts.length}</span>
              ) : null}
            </div>
          }
          right={
            <div className="flex gap-1">
              {TABS.map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={cn(
                    "text-[10px] px-2 py-0.5 rounded border",
                    tab === t ? "bg-ink text-white border-ink" : "border-border text-ink/60 hover:border-royal/50",
                  )}
                >
                  {TAB_LABEL[t]} {counts[t] ? <span className="opacity-70">{counts[t]}</span> : null}
                </button>
              ))}
            </div>
          }
        >
          {sorted.length === 0 ? (
            <div className="text-center py-10">
              <Check className="w-8 h-8 mx-auto text-[#1f6b3b] mb-1" />
              <div className="font-display text-lg text-ink">All clear</div>
              <div className="text-sm text-ink/50">No open alerts.</div>
            </div>
          ) : (
            <ul className="space-y-3">
              {sorted.map((a) => {
                const meta = KIND_META[a.kind];
                return (
                  <li key={a.id} className="border border-border rounded-lg p-3 hover:border-royal/40">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className={cn("flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider", meta.tone)}>
                          {meta.icon}
                          {meta.label}
                          {a.severity === "high" ? (
                            <span className="ml-1 text-[9px] bg-[#a4283c] text-white rounded px-1 py-0.5">HIGH</span>
                          ) : null}
                        </div>
                        <div className="text-ink font-medium mt-1">{a.client} — {a.title}</div>
                        <div className="text-xs text-ink/60 mt-0.5">{a.detail}</div>
                        <div className="text-[10px] text-ink/50 mt-1 font-mono">Open {a.ageDays}d</div>
                      </div>
                    </div>
                    <div className="mt-2 flex justify-end gap-1.5">
                      <button
                        onClick={() => resolve(a.id)}
                        className="text-[11px] border border-border rounded px-2 py-1 text-ink/70 hover:border-royal/50"
                      >
                        Dismiss
                      </button>
                      <button
                        onClick={() => resolve(a.id)}
                        className="inline-flex items-center gap-1 text-[11px] bg-ink text-white rounded px-2 py-1 hover:bg-ink/90"
                      >
                        {a.action}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>
      </div>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-3">
        <SectionCard title="Upcoming Deadlines">
          <ul className="space-y-2 text-sm">
            {BUILDS.slice(0, 3).map((b) => (
              <li key={b.id} className="flex items-start gap-2">
                <Calendar className="w-3.5 h-3.5 text-royal mt-0.5" />
                <div>
                  <div className="text-ink font-medium">{b.client} — {b.milestone}</div>
                  <div className="text-xs text-ink/60">{b.nextDeadline}</div>
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
        <SectionCard title="Alert Breakdown">
          <ul className="space-y-2 text-sm">
            {(["blocked_decision", "missing_file", "overdue_approval", "delivery_health"] as AlertKind[]).map((k) => (
              <li key={k} className="flex justify-between items-center">
                <span className={cn("flex items-center gap-1.5", KIND_META[k].tone)}>{KIND_META[k].icon}{KIND_META[k].label}</span>
                <span className="font-medium text-ink">{counts[k] ?? 0}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
        <SectionCard title="Health Snapshot">
          <ul className="space-y-2 text-sm">
            {(["on_track", "at_risk", "blocked"] as Build["health"][]).map((h) => (
              <li key={h} className="flex justify-between items-center">
                <span className="flex items-center gap-1.5"><span className={cn("w-2 h-2 rounded-full", HEALTH[h].dot)} />{HEALTH[h].label}</span>
                <span className="font-medium text-ink">{BUILDS.filter((b) => b.health === h).length}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}
