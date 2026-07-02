import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { SectionCard, MetricCard } from "@/components/engine/primitives";
import { cn } from "@/lib/utils";
import { PlusCircle, LayoutGrid, DollarSign, ShieldCheck, ClipboardList, AlertTriangle, TrendingUp, X, Check } from "lucide-react";

export const Route = createFileRoute("/engine/operations")({
  component: GlobalOperationsPage,
});

type Agent = { name: string; status: string; health: string; tasks: number; approval: string; spend: string; budget: string; used: number; last: string; template?: string; model?: string; policy?: string };

const INITIAL_AGENTS: Agent[] = [
  { name: "Mental Dental Academy", status: "Active", health: "Healthy", tasks: 48, approval: "84%", spend: "$42.18", budget: "$150.00", used: 28, last: "10:14 AM" },
  { name: "Greenridge Learning", status: "Active", health: "Healthy", tasks: 42, approval: "88%", spend: "$38.77", budget: "$120.00", used: 32, last: "9:52 AM" },
  { name: "Elevate Coaching", status: "Active", health: "Healthy", tasks: 36, approval: "90%", spend: "$31.22", budget: "$100.00", used: 31, last: "9:23 AM" },
  { name: "Horizon Wellness", status: "Active", health: "Healthy", tasks: 28, approval: "81%", spend: "$28.14", budget: "$100.00", used: 28, last: "8:47 AM" },
  { name: "BuildRight Systems", status: "Paused", health: "Warning", tasks: 19, approval: "75%", spend: "$24.61", budget: "$80.00", used: 33, last: "Jun 19" },
  { name: "Summit Consulting", status: "Active", health: "Healthy", tasks: 25, approval: "86%", spend: "$21.35", budget: "$80.00", used: 27, last: "Jun 20" },
  { name: "Peak Performance Co.", status: "Draft", health: "Healthy", tasks: 8, approval: "100%", spend: "$3.12", budget: "$50.00", used: 6, last: "Jun 20" },
];

const TEMPLATES = [
  { id: "discovery", name: "Discovery Analyst", desc: "Ingest calls, surface truths, propose insights.", policy: "Draft only" },
  { id: "roadmap", name: "Roadmap Drafter", desc: "Turn intelligence into milestone drafts.", policy: "Propose updates" },
  { id: "delivery", name: "Delivery Coordinator", desc: "Track handoff, follow-ups, engagement.", policy: "Propose updates" },
  { id: "brief", name: "Milestone Brief Writer", desc: "Generate acceptance criteria, dev prompts, QA.", policy: "Propose updates" },
  { id: "custom", name: "Custom (blank)", desc: "Start from a blank agent config.", policy: "Draft only" },
];
const MODELS = [
  { id: "gemini-flash", name: "Gemini 2.5 Flash", cost: "$0.10 / 1M in · $0.40 / 1M out" },
  { id: "gemini-pro", name: "Gemini 2.5 Pro", cost: "$1.25 / 1M in · $10 / 1M out" },
  { id: "claude-sonnet", name: "Claude Sonnet 4.5", cost: "$3 / 1M in · $15 / 1M out" },
  { id: "gpt-5-mini", name: "GPT-5 Mini", cost: "$0.25 / 1M in · $2 / 1M out" },
];
const POLICIES = ["Draft only", "Propose updates", "Execute approved actions"] as const;

const SYSTEMS = [
  "Agent Orchestrator",
  "Intelligence Pipeline",
  "Memory & Knowledge Base",
  "Cost Tracking Service",
  "Delivery & Export Service",
  "Approval & Version Control",
  "Notification Service",
  "Security & Permissions",
];

const TOP_SPEND = [
  ["Mental Dental Academy", "$42.18"],
  ["Greenridge Learning", "$38.77"],
  ["Elevate Coaching", "$31.22"],
  ["Horizon Wellness", "$28.14"],
  ["BuildRight Systems", "$24.61"],
];

const ALERTS = [
  { tone: "red", title: "Budget threshold reached", who: "BuildRight Systems", when: "10:14 AM" },
  { tone: "orange", title: "High cost spike detected", who: "Greenridge Learning", when: "9:42 AM" },
  { tone: "orange", title: "Agent paused (budget limit)", who: "Horizon Wellness", when: "Yesterday" },
  { tone: "red", title: "Approval overdue", who: "Elevate Coaching", when: "Yesterday" },
];

function GlobalOperationsPage() {
  return (
    <div className="max-w-[1500px]">
      <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal">Ops</div>
      <h1 className="font-display text-4xl text-ink mt-1 mb-2">Global Agent Operations</h1>
      <p className="text-ink/60 mb-6">Oversee all project agents, system health, usage, and performance across the Roadmap Engine.</p>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <MetricCard label="Active Project Agents" value={7} tone="purple" hint="of 12 total · 58% active" />
        <MetricCard label="Total Spend (Month)" value="$312.67" tone="blue" hint="↑ 18% vs May" />
        <MetricCard label="Total Tasks Created" value={248} tone="default" hint="↑ 22% vs May" />
        <MetricCard label="Approved Outputs" value={96} tone="green" hint="84% approval rate" />
        <MetricCard label="High Priority Alerts" value={4} tone="red" hint="Requires attention" />
        <MetricCard label="System Health" value="98%" tone="green" hint="All systems operational" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 mb-6">
        <SectionCard title="Agent Activity Overview" right="Last 30 days">
          <SparkChart />
        </SectionCard>

        <SectionCard title="System Health">
          <ul className="space-y-2 text-sm">
            {SYSTEMS.map((s) => (
              <li key={s} className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-ink"><span className="w-2 h-2 rounded-full bg-[#1f6b3b]" />{s}</span>
                <span className="text-xs text-[#1f6b3b]">Healthy</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 mb-6">
        <SectionCard title="All Project Agents">
          <div className="overflow-x-auto -mx-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] font-mono uppercase tracking-[0.2em] text-ink/50 border-b border-border">
                  <th className="px-5 py-2.5">Project Agent</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5">Health</th>
                  <th className="px-3 py-2.5">Tasks</th>
                  <th className="px-3 py-2.5">Approval</th>
                  <th className="px-3 py-2.5">Spend</th>
                  <th className="px-3 py-2.5">Budget</th>
                  <th className="px-5 py-2.5">Last Active</th>
                </tr>
              </thead>
              <tbody>
                {AGENTS.map((a) => (
                  <tr key={a.name} className="border-b border-border/60 hover:bg-paper-soft/40">
                    <td className="px-5 py-3 font-medium text-ink whitespace-nowrap">{a.name}</td>
                    <td className="px-3 py-3">
                      <span className={cn("text-[11px] px-2 py-0.5 rounded-full border",
                        a.status === "Active" ? "bg-[#e6f5ec] text-[#1f6b3b] border-[#c4e6d2]" :
                        a.status === "Paused" ? "bg-[#fbf3e0] text-[#8a6713] border-[#f1e3b9]" :
                        "bg-[#e9eefb] text-[#2842a4] border-[#cdd6f3]")}>{a.status}</span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={cn("inline-flex items-center gap-1 text-xs",
                        a.health === "Healthy" ? "text-[#1f6b3b]" : "text-[#8a6713]")}>
                        <span className={cn("w-1.5 h-1.5 rounded-full", a.health === "Healthy" ? "bg-[#1f6b3b]" : "bg-[#c99a20]")} />
                        {a.health}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-ink/80">{a.tasks}</td>
                    <td className="px-3 py-3 text-ink/80">{a.approval}</td>
                    <td className="px-3 py-3 text-ink/80">{a.spend}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2 min-w-[120px]">
                        <div className="flex-1 h-1.5 rounded-full bg-border overflow-hidden">
                          <div className="h-full bg-royal" style={{ width: `${a.used}%` }} />
                        </div>
                        <span className="text-xs text-ink/60">{a.used}%</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-xs text-ink/60 whitespace-nowrap">{a.last}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <div className="space-y-4">
          <SectionCard title="Top Agents by Spend">
            <ol className="space-y-2 text-sm">
              {TOP_SPEND.map(([name, val], i) => (
                <li key={name} className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-ink"><span className="font-mono text-xs text-ink/40 w-4">{i + 1}</span>{name}</span>
                  <span className="font-medium text-ink">{val}</span>
                </li>
              ))}
            </ol>
          </SectionCard>

          <SectionCard title="Top Alerts">
            <ul className="space-y-3 text-sm">
              {ALERTS.map((a) => (
                <li key={a.title} className="flex items-start gap-2">
                  <AlertTriangle className={cn("w-3.5 h-3.5 mt-0.5 shrink-0", a.tone === "red" ? "text-[#a4283c]" : "text-[#c99a20]")} />
                  <div className="min-w-0 flex-1">
                    <div className="text-ink font-medium">{a.title}</div>
                    <div className="text-xs text-ink/60 flex justify-between"><span>{a.who}</span><span>{a.when}</span></div>
                  </div>
                </li>
              ))}
            </ul>
          </SectionCard>

          <SectionCard title="Global Insights">
            <ul className="space-y-3 text-sm">
              <li className="flex items-start gap-2"><TrendingUp className="w-3.5 h-3.5 text-royal mt-0.5" /><div><div className="text-ink font-medium">Most productive day</div><div className="text-xs text-ink/60">Jun 18 · 48 tasks created</div></div></li>
              <li className="flex items-start gap-2"><TrendingUp className="w-3.5 h-3.5 text-[#1f6b3b] mt-0.5" /><div><div className="text-ink font-medium">Highest approval rate</div><div className="text-xs text-ink/60">Mental Dental Academy · 92%</div></div></li>
              <li className="flex items-start gap-2"><TrendingUp className="w-3.5 h-3.5 text-royal mt-0.5" /><div><div className="text-ink font-medium">Most time saved</div><div className="text-xs text-ink/60">186.5 hrs across all projects</div></div></li>
            </ul>
          </SectionCard>
        </div>
      </div>

      <SectionCard title="Global Controls">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <ControlCard icon={<PlusCircle className="w-4 h-4 text-royal" />} title="Create New Project Agent" hint="Spin up a new agent for a client project." />
          <ControlCard icon={<LayoutGrid className="w-4 h-4 text-royal" />} title="Agent Templates" hint="Manage global agent templates." />
          <ControlCard icon={<DollarSign className="w-4 h-4 text-royal" />} title="Model & Cost Settings" hint="Configure models and global cost rules." />
          <ControlCard icon={<ShieldCheck className="w-4 h-4 text-royal" />} title="Permission Policies" hint="Set default permissions and safety rules." />
          <ControlCard icon={<ClipboardList className="w-4 h-4 text-royal" />} title="Audit Log" hint="View all system and agent activity logs." />
        </div>
      </SectionCard>
    </div>
  );
}

function ControlCard({ icon, title, hint }: { icon: React.ReactNode; title: string; hint: string }) {
  return (
    <button className="text-left rounded-lg border border-border bg-paper-soft/40 hover:border-royal/50 hover:bg-paper-soft p-4 transition-colors">
      <div className="flex items-center gap-2 mb-1.5">{icon}<div className="font-medium text-ink text-sm">{title}</div></div>
      <div className="text-xs text-ink/60">{hint}</div>
    </button>
  );
}

function SparkChart() {
  const tasks = [40, 90, 120, 150, 130, 200, 240, 260, 220, 300];
  const cost = [10, 60, 90, 130, 110, 180, 220, 250, 240, 300];
  const max = 320;
  const w = 640;
  const h = 200;
  const step = w / (tasks.length - 1);
  const path = (arr: number[]) => arr.map((v, i) => `${i === 0 ? "M" : "L"} ${i * step} ${h - (v / max) * h}`).join(" ");
  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${w} ${h + 20}`} className="w-full min-w-[500px] h-56">
        <g stroke="#e5e7eb" strokeWidth="1">
          {[0, 0.25, 0.5, 0.75, 1].map((r) => (
            <line key={r} x1="0" x2={w} y1={h * r} y2={h * r} />
          ))}
        </g>
        <path d={path(tasks)} fill="none" stroke="#5435a4" strokeWidth="2.5" />
        <path d={path(cost)} fill="none" stroke="#1f6b3b" strokeWidth="2.5" strokeDasharray="4 3" />
        {tasks.map((v, i) => <circle key={`t${i}`} cx={i * step} cy={h - (v / max) * h} r="3" fill="#5435a4" />)}
        {cost.map((v, i) => <circle key={`c${i}`} cx={i * step} cy={h - (v / max) * h} r="3" fill="#1f6b3b" />)}
      </svg>
      <div className="flex gap-4 text-xs text-ink/60 mt-2">
        <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-[#5435a4]" />Tasks Created</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-[#1f6b3b]" />Outputs Approved</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 border-t border-dashed border-[#1f6b3b]" />Cost (USD)</span>
      </div>
    </div>
  );
}
