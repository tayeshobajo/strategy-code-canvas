import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { SectionCard, MetricCard } from "@/components/engine/primitives";
import { cn } from "@/lib/utils";
import { PlusCircle, LayoutGrid, DollarSign, ShieldCheck, ClipboardList, AlertTriangle, TrendingUp, X, Check, Loader2 } from "lucide-react";
import { listProjectAgents, createProjectAgent, type ProjectAgent } from "@/lib/engine-ops.functions";

export const Route = createFileRoute("/engine/operations")({
  component: GlobalOperationsPage,
});

const TEMPLATES = [
  { id: "discovery", name: "Discovery Analyst", desc: "Ingest calls, surface truths, propose insights.", policy: "Draft only" as const },
  { id: "roadmap", name: "Roadmap Drafter", desc: "Turn intelligence into milestone drafts.", policy: "Propose updates" as const },
  { id: "delivery", name: "Delivery Coordinator", desc: "Track handoff, follow-ups, engagement.", policy: "Propose updates" as const },
  { id: "brief", name: "Milestone Brief Writer", desc: "Generate acceptance criteria, dev prompts, QA.", policy: "Propose updates" as const },
  { id: "custom", name: "Custom (blank)", desc: "Start from a blank agent config.", policy: "Draft only" as const },
];
const MODELS = [
  { id: "gemini-flash", name: "Gemini 2.5 Flash", cost: "$0.10 / 1M in · $0.40 / 1M out" },
  { id: "gemini-pro", name: "Gemini 2.5 Pro", cost: "$1.25 / 1M in · $10 / 1M out" },
  { id: "claude-sonnet", name: "Claude Sonnet 4.5", cost: "$3 / 1M in · $15 / 1M out" },
  { id: "gpt-5-mini", name: "GPT-5 Mini", cost: "$0.25 / 1M in · $2 / 1M out" },
];
const POLICIES = ["Draft only", "Propose updates", "Execute approved actions"] as const;

const SYSTEMS = [
  "Agent Orchestrator", "Intelligence Pipeline", "Memory & Knowledge Base",
  "Cost Tracking Service", "Delivery & Export Service", "Approval & Version Control",
  "Notification Service", "Security & Permissions",
];

const agentsQO = queryOptions({
  queryKey: ["engine", "project-agents"],
  queryFn: () => listProjectAgents(),
});

function fmtCents(c: number) { return `$${(c / 100).toFixed(2)}`; }
function fmtDateTime(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function GlobalOperationsPage() {
  const [wizardOpen, setWizardOpen] = useState(false);
  const { data: agents = [], isLoading } = useQuery(agentsQO);

  const activeCount = agents.filter((a) => a.status === "Active").length;
  const totalSpend = agents.reduce((s, a) => s + a.spend_month_cents, 0);
  const totalTasks = agents.reduce((s, a) => s + a.tasks_count, 0);
  const avgApproval = useMemo(() => {
    const withPct = agents.filter((a) => a.approval_pct != null);
    if (withPct.length === 0) return 0;
    return Math.round(withPct.reduce((s, a) => s + (a.approval_pct ?? 0), 0) / withPct.length);
  }, [agents]);
  const alertCount = agents.filter((a) => a.health !== "Healthy" || (a.spend_month_cents / Math.max(1, a.monthly_budget_cents)) > 0.8).length;

  const topSpend = [...agents].sort((a, b) => b.spend_month_cents - a.spend_month_cents).slice(0, 5);

  return (
    <div className="max-w-[1500px]">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal">Ops</div>
          <h1 className="font-display text-4xl text-ink mt-1 mb-2">Global Agent Operations</h1>
          <p className="text-ink/60 mb-6">Oversee all project agents. New agents persist to the database and appear here immediately.</p>
        </div>
        {isLoading ? <Loader2 className="w-4 h-4 animate-spin text-ink/40 mt-2" /> : null}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <MetricCard label="Active Project Agents" value={activeCount} tone="purple" hint={`of ${agents.length} total`} />
        <MetricCard label="Total Spend (Month)" value={fmtCents(totalSpend)} tone="blue" />
        <MetricCard label="Total Tasks" value={totalTasks} tone="default" />
        <MetricCard label="Avg Approval" value={`${avgApproval}%`} tone="green" />
        <MetricCard label="Alerts" value={alertCount} tone={alertCount > 0 ? "red" : "green"} />
        <MetricCard label="System Health" value="98%" tone="green" hint="All systems operational" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 mb-6">
        <SectionCard title="System Health">
          <ul className="grid grid-cols-2 gap-2 text-sm">
            {SYSTEMS.map((s) => (
              <li key={s} className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-ink"><span className="w-2 h-2 rounded-full bg-[#1f6b3b]" />{s}</span>
                <span className="text-xs text-[#1f6b3b]">Healthy</span>
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard title="Top Agents by Spend">
          <ol className="space-y-2 text-sm">
            {topSpend.map((a, i) => (
              <li key={a.id} className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-ink"><span className="font-mono text-xs text-ink/40 w-4">{i + 1}</span>{a.name}</span>
                <span className="font-medium text-ink">{fmtCents(a.spend_month_cents)}</span>
              </li>
            ))}
            {topSpend.length === 0 ? <li className="text-xs text-ink/50">No agents yet.</li> : null}
          </ol>
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
                  <th className="px-3 py-2.5">Policy</th>
                  <th className="px-3 py-2.5">Model</th>
                  <th className="px-3 py-2.5">Tasks</th>
                  <th className="px-3 py-2.5">Spend</th>
                  <th className="px-3 py-2.5">Budget</th>
                  <th className="px-5 py-2.5">Last Active</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((a) => {
                  const used = a.monthly_budget_cents > 0 ? Math.min(100, Math.round((a.spend_month_cents / a.monthly_budget_cents) * 100)) : 0;
                  return (
                    <tr key={a.id} className="border-b border-border/60 hover:bg-paper-soft/40">
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
                          <span className={cn("w-1.5 h-1.5 rounded-full", a.health === "Healthy" ? "bg-[#1f6b3b]" : "bg-[#c99a20]")} />{a.health}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-xs text-ink/70 whitespace-nowrap">{a.policy}</td>
                      <td className="px-3 py-3 text-xs text-ink/70 whitespace-nowrap">{a.model ?? "—"}</td>
                      <td className="px-3 py-3 text-ink/80">{a.tasks_count}</td>
                      <td className="px-3 py-3 text-ink/80">{fmtCents(a.spend_month_cents)}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2 min-w-[120px]">
                          <div className="flex-1 h-1.5 rounded-full bg-border overflow-hidden">
                            <div className={cn("h-full", used > 90 ? "bg-[#a4283c]" : used > 70 ? "bg-[#c99a20]" : "bg-royal")}
                              style={{ width: `${used}%` }} />
                          </div>
                          <span className="text-xs text-ink/60 w-9 text-right">{used}%</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-xs text-ink/60 whitespace-nowrap">{fmtDateTime(a.last_active_at)}</td>
                    </tr>
                  );
                })}
                {agents.length === 0 && !isLoading ? (
                  <tr><td colSpan={9} className="px-5 py-8 text-center text-ink/50 text-sm">No project agents yet — click "Create New Project Agent" to add one.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <div className="space-y-4">
          <SectionCard title="Top Alerts">
            <ul className="space-y-3 text-sm">
              {agents.filter((a) => a.health !== "Healthy").slice(0, 4).map((a) => (
                <li key={a.id} className="flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[#c99a20]" />
                  <div className="min-w-0 flex-1">
                    <div className="text-ink font-medium">{a.health} — {a.name}</div>
                    <div className="text-xs text-ink/60">{a.status} · {fmtCents(a.spend_month_cents)} / {fmtCents(a.monthly_budget_cents)}</div>
                  </div>
                </li>
              ))}
              {agents.filter((a) => a.health !== "Healthy").length === 0 ? (
                <li className="text-xs text-ink/50">No alerts.</li>
              ) : null}
            </ul>
          </SectionCard>

          <SectionCard title="Global Insights">
            <ul className="space-y-3 text-sm">
              <li className="flex items-start gap-2"><TrendingUp className="w-3.5 h-3.5 text-royal mt-0.5" />
                <div><div className="text-ink font-medium">Highest approval</div>
                  <div className="text-xs text-ink/60">{[...agents].sort((a, b) => (b.approval_pct ?? 0) - (a.approval_pct ?? 0))[0]?.name ?? "—"}</div></div></li>
              <li className="flex items-start gap-2"><TrendingUp className="w-3.5 h-3.5 text-[#1f6b3b] mt-0.5" />
                <div><div className="text-ink font-medium">Most tasks</div>
                  <div className="text-xs text-ink/60">{[...agents].sort((a, b) => b.tasks_count - a.tasks_count)[0]?.name ?? "—"}</div></div></li>
            </ul>
          </SectionCard>
        </div>
      </div>

      <SectionCard title="Global Controls">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <button onClick={() => setWizardOpen(true)}
            className="text-left rounded-lg border border-royal bg-royal/5 hover:bg-royal/10 p-4 transition-colors">
            <div className="flex items-center gap-2 mb-1.5"><PlusCircle className="w-4 h-4 text-royal" /><div className="font-medium text-ink text-sm">Create New Project Agent</div></div>
            <div className="text-xs text-ink/60">Spin up a new agent for a client project.</div>
          </button>
          <ControlCard icon={<LayoutGrid className="w-4 h-4 text-royal" />} title="Agent Templates" hint="Manage global agent templates." />
          <ControlCard icon={<DollarSign className="w-4 h-4 text-royal" />} title="Model & Cost Settings" hint="Configure models and global cost rules." />
          <ControlCard icon={<ShieldCheck className="w-4 h-4 text-royal" />} title="Permission Policies" hint="Set default permissions and safety rules." />
          <ControlCard icon={<ClipboardList className="w-4 h-4 text-royal" />} title="Audit Log" hint="View all system and agent activity logs." />
        </div>
      </SectionCard>

      {wizardOpen ? <CreateAgentWizard onClose={() => setWizardOpen(false)} /> : null}
    </div>
  );
}

function CreateAgentWizard({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [name, setName] = useState("");
  const [template, setTemplate] = useState(TEMPLATES[0].id);
  const [model, setModel] = useState(MODELS[0].id);
  const [budget, setBudget] = useState(100);
  const [policy, setPolicy] = useState<(typeof POLICIES)[number]>("Draft only");

  const canNext = step === 1 ? name.trim().length >= 2 : true;
  const templateObj = TEMPLATES.find((t) => t.id === template)!;
  const modelObj = MODELS.find((m) => m.id === model)!;

  const qc = useQueryClient();
  const createFn = useServerFn(createProjectAgent);
  const create = useMutation({
    mutationFn: () => createFn({ data: {
      name: name.trim(), template: templateObj.name, model: modelObj.name,
      policy, monthly_budget_cents: Math.round(budget * 100),
    }}),
    onSuccess: (row: ProjectAgent) => {
      qc.setQueryData<ProjectAgent[]>(["engine", "project-agents"], (prev) => prev ? [row, ...prev] : [row]);
      qc.invalidateQueries({ queryKey: ["engine", "project-agents"] });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div className="bg-card rounded-xl border border-border shadow-lg max-w-xl w-full" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-royal">Step {step} of 4</div>
            <div className="font-display text-lg text-ink">Create Project Agent</div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-paper-soft rounded"><X className="w-4 h-4" /></button>
        </header>

        <div className="p-5 space-y-4">
          <div className="flex gap-1">
            {[1, 2, 3, 4].map((s) => (
              <div key={s} className={cn("flex-1 h-1 rounded-full", s <= step ? "bg-royal" : "bg-border")} />
            ))}
          </div>

          {step === 1 ? (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-mono uppercase tracking-wider text-ink/60">Agent name</label>
                <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Castle Vineyard"
                  className="mt-1 w-full text-sm border border-border rounded-md p-2 focus:outline-none focus:border-royal" />
              </div>
              <div>
                <label className="text-xs font-mono uppercase tracking-wider text-ink/60">Template</label>
                <div className="mt-1 space-y-1.5">
                  {TEMPLATES.map((t) => (
                    <label key={t.id} className={cn("flex items-start gap-2 border rounded-md p-2.5 cursor-pointer hover:bg-paper-soft",
                      template === t.id ? "border-royal bg-royal/5" : "border-border")}>
                      <input type="radio" name="tpl" checked={template === t.id} onChange={() => { setTemplate(t.id); setPolicy(t.policy); }} className="mt-1" />
                      <div className="min-w-0"><div className="text-sm font-medium text-ink">{t.name}</div>
                        <div className="text-xs text-ink/60">{t.desc}</div></div>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-2">
              <label className="text-xs font-mono uppercase tracking-wider text-ink/60">Default model</label>
              {MODELS.map((m) => (
                <label key={m.id} className={cn("flex items-start gap-2 border rounded-md p-2.5 cursor-pointer hover:bg-paper-soft",
                  model === m.id ? "border-royal bg-royal/5" : "border-border")}>
                  <input type="radio" name="model" checked={model === m.id} onChange={() => setModel(m.id)} className="mt-1" />
                  <div><div className="text-sm font-medium text-ink">{m.name}</div>
                    <div className="text-xs text-ink/60 font-mono">{m.cost}</div></div>
                </label>
              ))}
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-3">
              <label className="text-xs font-mono uppercase tracking-wider text-ink/60">Monthly budget (USD)</label>
              <div className="flex items-center gap-3">
                <input type="range" min={25} max={500} step={25} value={budget} onChange={(e) => setBudget(Number(e.target.value))} className="flex-1" />
                <div className="w-20 text-right font-display text-2xl text-ink">${budget}</div>
              </div>
              <div className="text-xs text-ink/60">Agent auto-pauses when budget threshold is reached.</div>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-mono uppercase tracking-wider text-ink/60">Initial permission policy</label>
                <div className="mt-1 space-y-1.5">
                  {POLICIES.map((p) => (
                    <label key={p} className={cn("flex items-start gap-2 border rounded-md p-2.5 cursor-pointer hover:bg-paper-soft",
                      policy === p ? "border-royal bg-royal/5" : "border-border")}>
                      <input type="radio" name="pol" checked={policy === p} onChange={() => setPolicy(p)} className="mt-1" />
                      <div><div className="text-sm font-medium text-ink">{p}</div>
                        <div className="text-xs text-ink/60">
                          {p === "Draft only" ? "Agent produces drafts. Nothing takes effect without you." :
                            p === "Propose updates" ? "Agent can push proposed changes into the review queue." :
                              "Agent can execute pre-approved action types."}
                        </div></div>
                    </label>
                  ))}
                </div>
              </div>
              <div className="rounded-md bg-paper-soft border border-border p-3 text-xs space-y-1">
                <div className="text-ink/60 font-mono uppercase tracking-wider text-[10px]">Summary</div>
                <div><span className="text-ink/60">Name:</span> <span className="text-ink font-medium">{name || "—"}</span></div>
                <div><span className="text-ink/60">Template:</span> <span className="text-ink">{templateObj.name}</span></div>
                <div><span className="text-ink/60">Model:</span> <span className="text-ink">{modelObj.name}</span></div>
                <div><span className="text-ink/60">Budget:</span> <span className="text-ink">${budget}/mo</span></div>
                <div><span className="text-ink/60">Policy:</span> <span className="text-ink">{policy}</span></div>
              </div>
              {create.error ? (
                <div className="text-xs text-[#a4283c] bg-[#fbe9ec] border border-[#f3ced5] rounded p-2 flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">Couldn't create agent</div>
                    <div className="text-[#a4283c]/80">{(create.error as Error).message}</div>
                  </div>
                  <button onClick={() => create.mutate()} disabled={create.isPending}
                    className="shrink-0 text-[11px] px-2 py-1 rounded border border-[#a4283c] text-[#a4283c] hover:bg-white disabled:opacity-40">
                    Retry
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <footer className="flex justify-between p-4 border-t border-border">
          <button onClick={() => (step === 1 ? onClose() : setStep((s) => (s - 1) as 1 | 2 | 3))}
            className="text-xs px-3 py-1.5 rounded border border-border text-ink/70 hover:bg-paper-soft">
            {step === 1 ? "Cancel" : "Back"}
          </button>
          {step < 4 ? (
            <button onClick={() => canNext && setStep((s) => (s + 1) as 2 | 3 | 4)} disabled={!canNext}
              className="text-xs px-3 py-1.5 rounded bg-ink text-white hover:bg-ink/90 disabled:opacity-40">Continue</button>
          ) : (
            <button onClick={() => create.mutate()} disabled={create.isPending}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-royal text-white hover:bg-royal/90 disabled:opacity-40">
              {create.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Create agent
            </button>
          )}
        </footer>
      </div>
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
