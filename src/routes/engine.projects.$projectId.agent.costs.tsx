/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { TrendingUp, Wallet, AlertTriangle, Star, Layers, Download, RefreshCw, AlertCircle } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid } from "recharts";
import { SectionCard, MetricCard, formatCents } from "@/components/engine/primitives";
import { getAgentCosts, updateBudgetControls, exportAgentCostsCsv } from "@/lib/engine-execution.functions";

export const Route = createFileRoute("/engine/projects/$projectId/agent/costs")({
  component: CostCenterPage,
  errorComponent: ({ error }) => (
    <div className="text-red-700 text-sm">Failed: {(error as Error).message}</div>
  ),
});

const CATEGORY_COLORS = ["#2842a4", "#5435a4", "#1f6b3b", "#c99a20", "#a4283c", "#8a6713", "#6f5ab3"];

function CostCenterPage() {
  const { projectId } = Route.useParams();
  const qc = useQueryClient();
  const fn = useServerFn(getAgentCosts);
  const updFn = useServerFn(updateBudgetControls);
  const csvFn = useServerFn(exportAgentCostsCsv);

  const q = useQuery({
    queryKey: ["engine", "costs", projectId],
    queryFn: () => fn({ data: { projectId } }),
  });
  const d = q.data as any;
  const totals = d?.totals ?? { totalSpend: 0, monthSpend: 0, budget: 0, remaining: 0, projected: 0, costPerApproved: 0, unusedDraftCost: 0, approvedOutputs: 0, rejectedOutputs: 0, draftOutputs: 0, tasksCreated: 0, unattributedCents: 0 };
  const timeline = (d?.timeline ?? []).map((t: any) => ({ ...t, dollars: t.cents / 100 }));
  const categories = d?.spendByCategory ?? [];
  const milestones = d?.spendByMilestone ?? [];
  const recent = d?.recent ?? [];
  const ledger = d?.ledger ?? [];

  const budgetPct = totals.budget > 0 ? Math.round((totals.monthSpend / totals.budget) * 100) : 0;
  const projectedRange = useMemo(() => ({
    low: Math.round(totals.projected * 0.9),
    high: Math.round(totals.projected * 1.1),
  }), [totals.projected]);

  const [budgetForm, setBudgetForm] = useState({
    monthly_cap_cents: totals.budget || 15000,
    warning_threshold_pct: 80,
    hard_stop_pct: 100,
    require_approval_above_cents: 500,
    preferred_model: "google/gemini-3-flash-preview",
    auto_pause_when_exceeded: true,
  });

  const save = useMutation({
    mutationFn: () => updFn({ data: { projectId, ...budgetForm } }),
    onSuccess: () => { toast.success("Budget controls saved"); qc.invalidateQueries({ queryKey: ["engine", "costs", projectId] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const download = useMutation({
    mutationFn: () => csvFn({ data: { projectId } }),
    onSuccess: (res: any) => {
      const blob = new Blob([res.csv ?? ""], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename ?? "cost-center.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${res.rowCount ?? 0} ledger rows`);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to export CSV"),
  });

  return (
    <div className="space-y-5 max-w-[1500px]">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl text-ink">Agent Cost Center</h1>
          <p className="text-sm text-ink/60 mt-1">Track the cost, efficiency, and value of your AI agent for this project.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => q.refetch()}
            disabled={q.isFetching}
            className="text-xs border border-border rounded-md px-3 py-1.5 flex items-center gap-1.5 hover:border-royal/50 disabled:opacity-60"
            title="Refresh cost data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${q.isFetching ? "animate-spin" : ""}`} />
            {q.isFetching ? "Refreshing…" : "Refresh"}
          </button>
          <button
            onClick={() => download.mutate()}
            disabled={download.isPending}
            className="text-xs border border-border rounded-md px-3 py-1.5 flex items-center gap-1.5 hover:border-royal/50 disabled:opacity-60"
          >
            <Download className="w-3.5 h-3.5" />
            {download.isPending ? "Preparing…" : "Download CSV"}
          </button>
        </div>
      </div>

      {q.isError && (
        <div className="rounded-md border border-[#a4283c]/30 bg-[#fdecef] px-3 py-2 flex items-center justify-between gap-3">
          <div className="flex items-start gap-2 text-sm text-[#a4283c]">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <div>
              <div className="font-medium">Failed to load cost data</div>
              <div className="text-[#a4283c]/80 text-xs">{(q.error as Error)?.message ?? "Unknown error"}</div>
            </div>
          </div>
          <button
            onClick={() => q.refetch()}
            className="text-xs bg-[#a4283c] text-white rounded-md px-3 py-1.5 hover:bg-[#a4283c]/90"
          >Retry</button>
        </div>
      )}


      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricCard label="Total spend" value={formatCents(totals.totalSpend)} tone="blue" hint={`Across ${totals.tasksCreated} agent runs`} />
        <MetricCard label="Spend this month" value={formatCents(totals.monthSpend)} tone="green" hint={`${budgetPct}% of budget`} />
        <MetricCard label="Budget remaining" value={formatCents(totals.remaining)} tone="green" hint={`${Math.max(0, 100 - budgetPct)}% remaining`} />
        <MetricCard label="Projected month-end" value={`${formatCents(projectedRange.low)}–${formatCents(projectedRange.high)}`} tone="purple" hint="Based on current usage" />
        <MetricCard label="Cost / approved output" value={formatCents(totals.costPerApproved)} tone="orange" hint="Target: <$5.00" />
        <MetricCard label="Unused draft cost" value={formatCents(totals.unusedDraftCost)} tone="red" hint={`${totals.draftOutputs} drafts`} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_1fr_320px] gap-5">
        {/* Spend overview */}
        <SectionCard title="Spend Overview" className="min-w-0">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={timeline}>
                <CartesianGrid stroke="#eee" strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => v.slice(5)} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
                <Tooltip formatter={(v: any) => `$${v}`} />
                <Line type="monotone" dataKey="dollars" stroke="#2842a4" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        {/* Category donut */}
        <SectionCard title="Spend by Category" className="min-w-0">
          <div className="flex items-center gap-4 h-64">
            <div className="h-full w-40 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={categories} dataKey="cents" nameKey="category" innerRadius={40} outerRadius={70}>
                    {categories.map((_: any, i: number) => (
                      <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="flex-1 min-w-0 space-y-1.5 text-xs">
              {categories.slice(0, 8).map((c: any, i: number) => (
                <li key={c.category} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }} />
                    <span className="text-ink/80 truncate capitalize">{String(c.category).replace(/_/g, " ")}</span>
                  </span>
                  <span className="font-mono text-ink shrink-0">{formatCents(c.cents)}</span>
                </li>
              ))}
              {categories.length === 0 && <li className="text-ink/50">No spend yet.</li>}
            </ul>
          </div>
        </SectionCard>

        {/* Cost intelligence */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-4">
          <div className="font-display text-sm text-ink flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-[#c99a20]" /> Cost Intelligence
          </div>
          <div className="rounded-md bg-[#fbf3e0] border border-[#f1e3b9] p-3">
            <div className="text-xs font-medium text-[#8a6713]">Highest cost driver</div>
            <div className="text-sm text-ink mt-1">{categories[0]?.category ?? "—"}</div>
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex items-start gap-2">
              <Star className="w-3.5 h-3.5 text-royal mt-0.5" />
              <div>
                <div className="text-ink">Approved outputs</div>
                <div className="text-ink/60">{totals.approvedOutputs} approved · {totals.rejectedOutputs} rejected</div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <TrendingUp className="w-3.5 h-3.5 text-[#1f6b3b] mt-0.5" />
              <div>
                <div className="text-ink">Budget risk</div>
                <div className="text-ink/60">{budgetPct < 80 ? "Low risk — within safe range" : budgetPct < 100 ? "Warning — near cap" : "Over budget"}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Spend by milestone */}
      <SectionCard
        title={<span className="flex items-center gap-2"><Layers className="w-4 h-4" />Spend by Milestone</span>}
        right={<span className="text-ink/60">{formatCents(totals.unattributedCents ?? 0)} unattributed</span>}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-ink/50 border-b border-border">
                <th className="py-2 pr-3">Milestone</th>
                <th className="py-2 pr-3 text-right">Total spend</th>
                <th className="py-2 pr-3 text-right">Approved</th>
                <th className="py-2 pr-3 text-right">Unused drafts</th>
                <th className="py-2 pr-3 text-right">Cost / approved</th>
              </tr>
            </thead>
            <tbody>
              {milestones.map((m: any) => (
                <tr key={m.id} className="border-b border-border/60">
                  <td className="py-2 pr-3 text-ink">{m.name}</td>
                  <td className="py-2 pr-3 text-right font-mono text-ink">{formatCents(m.cents)}</td>
                  <td className="py-2 pr-3 text-right font-mono text-[#1f6b3b]">{formatCents(m.approved_cents)}</td>
                  <td className="py-2 pr-3 text-right font-mono text-[#a4283c]">{formatCents(m.unused_cents)}</td>
                  <td className="py-2 pr-3 text-right font-mono text-ink/80">{m.cost_per_approved ? formatCents(m.cost_per_approved) : "—"}</td>
                </tr>
              ))}
              {milestones.length === 0 && (
                <tr><td colSpan={5} className="py-6 text-center text-ink/50 text-sm">No milestone-attributed spend yet. Set an agent output&rsquo;s related module to a milestone name to see it here.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-5">
        <SectionCard title="Value & Efficiency">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard label="Approved outputs" value={totals.approvedOutputs.toString()} tone="green" />
            <MetricCard label="Rejected outputs" value={totals.rejectedOutputs.toString()} tone="red" />
            <MetricCard label="Drafts reused" value={totals.draftOutputs.toString()} tone="blue" />
            <MetricCard label="Tasks created" value={totals.tasksCreated.toString()} tone="purple" />
            <MetricCard label="Est. time saved" value={`${totals.approvedOutputs * 2}h`} hint="vs manual" />
            <MetricCard label="Cost / approved output" value={formatCents(totals.costPerApproved)} tone="green" hint="Target: <$5.00" />
            <MetricCard label="Cost / roadmap version" value={formatCents(Math.round(totals.totalSpend / 3))} tone="blue" hint="Target: <$20.00" />
          </div>

          <div className="mt-5">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-mono uppercase tracking-wide text-ink/50">Live Cost Ledger</div>
              <div className="text-[11px] text-ink/50">
                {ledger.length > 0 ? `${d?.ledgerCount ?? ledger.length} ledger entries` : `${recent.length} recent tasks`}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-ink/50 border-b border-border">
                    <th className="py-2 pr-3">When</th>
                    <th className="py-2 pr-3">Activity</th>
                    <th className="py-2 pr-3">Category</th>
                    <th className="py-2 pr-3">Tokens</th>
                    <th className="py-2 pr-3">Cost</th>
                    <th className="py-2 pr-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {q.isLoading && (
                    Array.from({ length: 4 }).map((_, i) => (
                      <tr key={`sk-${i}`} className="border-b border-border/60">
                        {Array.from({ length: 6 }).map((__, j) => (
                          <td key={j} className="py-2 pr-3"><div className="h-3 bg-ink/5 rounded animate-pulse" /></td>
                        ))}
                      </tr>
                    ))
                  )}
                  {!q.isLoading && (ledger.length > 0 ? ledger : recent).map((r: any) => (
                    <tr key={r.id} className="border-b border-border/60">
                      <td className="py-2 pr-3 text-ink/70 whitespace-nowrap">{new Date(r.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</td>
                      <td className="py-2 pr-3 text-ink capitalize">{String(r.kind ?? "").replace(/_/g, " ")}</td>
                      <td className="py-2 pr-3 text-ink/70 capitalize">{String(r.category ?? r.kind ?? "").replace(/_/g, " ")}</td>
                      <td className="py-2 pr-3 text-ink/60">{(r.tokens_in ?? 0) + (r.tokens_out ?? 0)}</td>
                      <td className="py-2 pr-3 text-ink">{formatCents(r.cost_cents ?? 0)}</td>
                      <td className="py-2 pr-3 text-ink/70 capitalize">{r.status ?? "—"}</td>
                    </tr>
                  ))}
                  {!q.isLoading && ledger.length === 0 && recent.length === 0 && (
                    <tr><td colSpan={6} className="py-8 text-center text-ink/50 text-sm">No cost activity yet. The ledger populates the first time the agent runs.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </SectionCard>


        {/* Budget controls */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-3">
          <div className="font-display text-sm text-ink flex items-center gap-2">
            <Wallet className="w-4 h-4" /> Budget Controls
          </div>
          <Field label="Monthly Budget Cap ($)">
            <input
              type="number"
              value={budgetForm.monthly_cap_cents / 100}
              onChange={(e) => setBudgetForm((f) => ({ ...f, monthly_cap_cents: Math.round(Number(e.target.value) * 100) }))}
              className="w-full text-sm border border-border rounded-md px-2 py-1.5 bg-card"
            />
          </Field>
          <Field label="Warning threshold (%)">
            <input type="number" value={budgetForm.warning_threshold_pct}
              onChange={(e) => setBudgetForm((f) => ({ ...f, warning_threshold_pct: Number(e.target.value) }))}
              className="w-full text-sm border border-border rounded-md px-2 py-1.5 bg-card"
            />
          </Field>
          <Field label="Hard stop (%)">
            <input type="number" value={budgetForm.hard_stop_pct}
              onChange={(e) => setBudgetForm((f) => ({ ...f, hard_stop_pct: Number(e.target.value) }))}
              className="w-full text-sm border border-border rounded-md px-2 py-1.5 bg-card"
            />
          </Field>
          <Field label="Require approval above ($)">
            <input type="number" value={budgetForm.require_approval_above_cents / 100}
              onChange={(e) => setBudgetForm((f) => ({ ...f, require_approval_above_cents: Math.round(Number(e.target.value) * 100) }))}
              className="w-full text-sm border border-border rounded-md px-2 py-1.5 bg-card"
            />
          </Field>
          <Field label="Preferred model">
            <select
              value={budgetForm.preferred_model}
              onChange={(e) => setBudgetForm((f) => ({ ...f, preferred_model: e.target.value }))}
              className="w-full text-sm border border-border rounded-md px-2 py-1.5 bg-card"
            >
              <option value="google/gemini-3-flash-preview">Gemini 3 Flash (Balanced)</option>
              <option value="google/gemini-3.1-flash-lite">Gemini 3.1 Flash Lite (Cheap)</option>
              <option value="google/gemini-3.1-pro-preview">Gemini 3.1 Pro (Powerful)</option>
            </select>
          </Field>
          <label className="flex items-center justify-between text-sm text-ink/80 pt-1">
            <span>Auto-pause when exceeded</span>
            <input type="checkbox"
              checked={budgetForm.auto_pause_when_exceeded}
              onChange={(e) => setBudgetForm((f) => ({ ...f, auto_pause_when_exceeded: e.target.checked }))}
              className="accent-royal"
            />
          </label>
          <button
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="w-full text-sm bg-royal text-white rounded-md py-2 mt-2 hover:bg-royal/90 disabled:opacity-60"
          >Update Budget Settings</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs text-ink/60 mb-1">{label}</div>
      {children}
    </label>
  );
}
