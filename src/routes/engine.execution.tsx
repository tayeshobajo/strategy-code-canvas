import { createFileRoute } from "@tanstack/react-router";
import { SectionCard, MetricCard } from "@/components/engine/primitives";
import { cn } from "@/lib/utils";
import { AlertTriangle, FileWarning, Calendar, MessageSquare, CheckCircle2 } from "lucide-react";

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

function ExecutionTrackerPage() {
  return (
    <div className="max-w-[1500px]">
      <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal">Delivery</div>
      <h1 className="font-display text-4xl text-ink mt-1 mb-2">Execution Tracker</h1>
      <p className="text-ink/60 mb-6">Track approved roadmap work that has moved into delivery. Live status, health, blockers, and deadlines.</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <MetricCard label="Active Builds" value={5} tone="blue" hint="Across 5 clients" />
        <MetricCard label="Milestones In Progress" value={12} tone="purple" />
        <MetricCard label="Blocked Decisions" value={3} tone="red" hint="Needs unblocking" />
        <MetricCard label="Delivery Health" value="86%" tone="green" hint="Rolling 30d" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
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

        <div className="space-y-4">
          <SectionCard title="Blocked Decisions">
            <ul className="space-y-3 text-sm">
              <RailItem tone="red" title="Innago — Billing schema sign-off" hint="Waiting on CTO · 4d" />
              <RailItem tone="orange" title="Valley Precision — Lead source list" hint="Awaiting Jason V. · 2d" />
              <RailItem tone="orange" title="Mental Dental — Question bank format" hint="Confirm import spec · 3d" />
            </ul>
          </SectionCard>

          <SectionCard title="Files Needed">
            <ul className="space-y-2 text-sm">
              <li className="flex gap-2 text-ink/80"><FileWarning className="w-3.5 h-3.5 text-[#8a6713] shrink-0 mt-0.5" />Gradient Group — brand kit v3</li>
              <li className="flex gap-2 text-ink/80"><FileWarning className="w-3.5 h-3.5 text-[#8a6713] shrink-0 mt-0.5" />Elevate Coaching — client list export</li>
            </ul>
          </SectionCard>

          <SectionCard title="Upcoming Deadlines">
            <ul className="space-y-3 text-sm">
              <RailItem icon={<Calendar className="w-3.5 h-3.5 text-royal" />} title="Innago — Billing rewrite" hint="Jul 22, 2025" />
              <RailItem icon={<Calendar className="w-3.5 h-3.5 text-royal" />} title="Valley Precision — Lead Router" hint="Aug 12, 2025" />
              <RailItem icon={<Calendar className="w-3.5 h-3.5 text-royal" />} title="Gradient Group — Employer onboarding" hint="Sep 5, 2025" />
            </ul>
          </SectionCard>

          <SectionCard title="Change Requests">
            <ul className="space-y-2 text-sm">
              <li className="flex gap-2 text-ink/80"><MessageSquare className="w-3.5 h-3.5 text-royal shrink-0 mt-0.5" />Mental Dental — add SSO to Phase 1</li>
              <li className="flex gap-2 text-ink/80"><MessageSquare className="w-3.5 h-3.5 text-royal shrink-0 mt-0.5" />Elevate — replace Zapier w/ n8n</li>
            </ul>
          </SectionCard>

          <SectionCard title="Client Approvals Needed">
            <ul className="space-y-2 text-sm">
              <li className="flex gap-2 text-ink/80"><CheckCircle2 className="w-3.5 h-3.5 text-[#1f6b3b] shrink-0 mt-0.5" />Gradient — approve Phase 1 scope</li>
              <li className="flex gap-2 text-ink/80"><CheckCircle2 className="w-3.5 h-3.5 text-[#1f6b3b] shrink-0 mt-0.5" />Innago — sign off billing spec</li>
            </ul>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

function RailItem({ icon, title, hint, tone }: { icon?: React.ReactNode; title: string; hint: string; tone?: "red" | "orange" }) {
  const dot = tone === "red" ? "bg-[#a4283c]" : tone === "orange" ? "bg-[#c99a20]" : "";
  return (
    <li className="flex items-start gap-2">
      {icon ?? (dot ? <span className={cn("w-2 h-2 rounded-full mt-1.5", dot)} /> : <AlertTriangle className="w-3.5 h-3.5 text-royal mt-0.5" />)}
      <div className="min-w-0">
        <div className="text-ink font-medium">{title}</div>
        <div className="text-xs text-ink/60">{hint}</div>
      </div>
    </li>
  );
}
