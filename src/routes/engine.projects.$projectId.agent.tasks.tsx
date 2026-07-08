/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Kanban, List, Layers, User, Zap, Calendar as CalendarIcon, Search, PlusCircle } from "lucide-react";
import { SectionCard, MetricCard, formatCents } from "@/components/engine/primitives";
import { listTasks, createTask, updateTaskStatus, listMilestones } from "@/lib/engine-execution.functions";
import { generateTasksForApprovedMilestones } from "@/lib/engine-execution.functions";

export const Route = createFileRoute("/engine/projects/$projectId/agent/tasks")({
  component: TaskBoardPage,
  errorComponent: ({ error }) => (
    <div className="text-red-700 text-sm">Failed: {(error as Error).message}</div>
  ),
});

const STATUSES = [
  { key: "suggested", label: "Suggested", tone: "text-[#5435a4] border-[#dccdf3] bg-[#efe9fb]" },
  { key: "drafted", label: "Drafted", tone: "text-[#2842a4] border-[#cdd6f3] bg-[#e9eefb]" },
  { key: "needs_review", label: "Needs Review", tone: "text-[#8a6713] border-[#f1e3b9] bg-[#fbf3e0]" },
  { key: "approved", label: "Approved", tone: "text-[#1f6b3b] border-[#c4e6d2] bg-[#e6f5ec]" },
  { key: "in_progress", label: "In Progress", tone: "text-[#2842a4] border-[#cdd6f3] bg-[#e9eefb]" },
  { key: "blocked", label: "Blocked", tone: "text-[#a4283c] border-[#f3ced5] bg-[#fbe9ec]" },
  { key: "completed", label: "Completed", tone: "text-[#1f6b3b] border-[#c4e6d2] bg-[#e6f5ec]" },
  { key: "rejected", label: "Rejected", tone: "text-[#5a5d70] border-[#d6d8df] bg-[#ecedf0]" },
  { key: "archived", label: "Archived", tone: "text-[#5a5d70] border-[#d6d8df] bg-[#ecedf0]" },
];

const VIEWS = [
  { key: "board", label: "Board View", icon: Kanban },
  { key: "list", label: "List View", icon: List },
  { key: "milestone", label: "Milestone View", icon: Layers },
  { key: "owner", label: "Owner View", icon: User },
  { key: "priority", label: "Priority View", icon: Zap },
  { key: "calendar", label: "Calendar View", icon: CalendarIcon },
];

function TaskBoardPage() {
  const { projectId } = Route.useParams();
  const qc = useQueryClient();
  const listFn = useServerFn(listTasks);
  const createFn = useServerFn(createTask);
  const statusFn = useServerFn(updateTaskStatus);
  const milestonesFn = useServerFn(listMilestones);
  const [view, setView] = useState("board");
  const [q, setQ] = useState("");
  const [milestoneId, setMilestoneId] = useState<string>("");

  const query = useQuery({
    queryKey: ["engine", "tasks", projectId],
    queryFn: () => listFn({ data: { projectId } }),
  });
  const milestonesQ = useQuery({
    queryKey: ["engine", "milestones", projectId],
    queryFn: () => milestonesFn({ data: { projectId } }),
  });
  const milestones: any[] = (milestonesQ.data as any)?.rows ?? [];
  const tasks: any[] = (query.data as any)?.rows ?? [];
  const filtered = tasks.filter((t) => !q || (t.name ?? "").toLowerCase().includes(q.toLowerCase()));

  const refresh = () => qc.invalidateQueries({ queryKey: ["engine", "tasks", projectId] });

  const totals = STATUSES.reduce<Record<string, number>>((acc, s) => {
    acc[s.key] = filtered.filter((t) => t.status === s.key).length;
    return acc;
  }, {});
  const totalEffort = filtered.reduce((s, t) => s + (Number(t.estimated_effort_hours) || 0), 0);
  const totalCost = filtered.reduce((s, t) => s + (t.estimated_cost_cents ?? 0), 0);

  const addTask = useMutation({
    mutationFn: (status: string) => {
      if (!milestoneId) throw new Error("Pick a milestone above before adding a task.");
      return createFn({ data: { projectId, name: "New task", status, priority: "P2", milestoneId } });
    },
    onSuccess: () => { toast.success("Task added"); refresh(); },
    onError: (e: any) => toast.error(e?.message ?? "Add task failed"),
  });


  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => statusFn({ data: { id, status } }),
    onSuccess: refresh,
  });

  return (
    <div className="space-y-5 max-w-[1500px]">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl text-ink">Agent Task Board</h1>
          <p className="text-sm text-ink/60 mt-1">Tasks created or suggested by your AI agent. Review, approve, assign, and track execution.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-xs text-ink/60">Milestone for new tasks:</label>
          <select
            value={milestoneId}
            onChange={(e) => setMilestoneId(e.target.value)}
            className="text-xs border border-border rounded-md px-2 py-1.5 bg-card min-w-[220px]"
          >
            <option value="">— select milestone —</option>
            {milestones.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
          <button className="text-xs border border-border rounded-md px-3 py-1.5 hover:border-royal/50 flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5" /> Generate New Tasks
          </button>
          <button className="text-xs border border-border rounded-md px-3 py-1.5 hover:border-royal/50">Import Tasks</button>
        </div>

      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        <MetricCard label="Total tasks" value={filtered.length.toString()} tone="blue" />
        <MetricCard label="Needs review" value={(totals.needs_review ?? 0).toString()} tone="orange" hint="High priority" />
        <MetricCard label="Approved" value={(totals.approved ?? 0).toString()} tone="green" hint="Ready" />
        <MetricCard label="In progress" value={(totals.in_progress ?? 0).toString()} tone="blue" hint="On track" />
        <MetricCard label="Completed" value={(totals.completed ?? 0).toString()} tone="green" hint="This month" />
        <MetricCard label="Est. effort" value={`${totalEffort}h`} hint="Total" />
        <MetricCard label="Agent cost" value={formatCents(totalCost)} tone="purple" hint="This month" />
        <MetricCard label="Blocked" value={(totals.blocked ?? 0).toString()} tone="red" hint="Waiting" />
      </div>

      {/* View switcher */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex flex-wrap gap-1.5">
          {VIEWS.map((v) => {
            const Icon = v.icon;
            const on = view === v.key;
            return (
              <button
                key={v.key}
                onClick={() => setView(v.key)}
                className={`text-xs rounded-md px-3 py-1.5 flex items-center gap-1.5 border ${
                  on ? "bg-royal text-white border-royal" : "border-border text-ink/70 hover:border-royal/50"
                }`}
              ><Icon className="w-3.5 h-3.5" />{v.label}</button>
            );
          })}
        </div>
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-ink/40 absolute left-2.5 top-2.5" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search tasks..."
            className="text-xs border border-border rounded-md pl-8 pr-3 py-1.5 bg-card w-64"
          />
        </div>
      </div>

      {view === "board" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
          {STATUSES.slice(0, 6).map((s) => {
            const items = filtered.filter((t) => t.status === s.key);
            return (
              <div key={s.key} className="rounded-lg border border-border bg-canvas/40">
                <div className="px-3 py-2 border-b border-border flex items-center justify-between">
                  <span className={`inline-flex items-center gap-2 text-xs font-medium ${s.tone.split(" ").find((c) => c.startsWith("text-"))}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${s.tone.split(" ").find((c) => c.startsWith("bg-"))}`} />
                    {s.label}
                  </span>
                  <span className="text-[11px] text-ink/50">{items.length}</span>
                </div>
                <div className="p-2 space-y-2 min-h-[200px]">
                  {items.map((t) => (
                    <TaskCard key={t.id} task={t} onStatus={(status) => setStatus.mutate({ id: t.id, status })} />
                  ))}
                  <button
                    onClick={() => addTask.mutate(s.key)}
                    className="w-full text-xs text-royal hover:bg-royal/5 rounded-md py-2 flex items-center justify-center gap-1"
                  ><PlusCircle className="w-3 h-3" /> New Task</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {view !== "board" && (
        <SectionCard title="All Tasks">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-ink/50 border-b border-border">
                  <th className="py-2 pr-3">Task</th>
                  <th className="py-2 pr-3">Milestone</th>
                  <th className="py-2 pr-3">Priority</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Owner</th>
                  <th className="py-2 pr-3">Effort</th>
                  <th className="py-2 pr-3">Cost</th>
                  <th className="py-2 pr-3">Due</th>
                  <th className="py-2 pr-3">Source</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr key={t.id} className="border-b border-border/60">
                    <td className="py-2.5 pr-3 text-ink">{t.name}</td>
                    <td className="py-2.5 pr-3 text-ink/70">{t.engine_milestones?.name ?? "—"}</td>
                    <td className="py-2.5 pr-3"><span className="inline-flex rounded border border-border px-1.5 py-0.5 text-[10px]">{t.priority}</span></td>
                    <td className="py-2.5 pr-3 capitalize text-ink/80">{(t.status ?? "").replace(/_/g, " ")}</td>
                    <td className="py-2.5 pr-3 text-ink/70">{t.owner_email ?? "—"}</td>
                    <td className="py-2.5 pr-3 text-ink/70">{t.estimated_effort_hours ? `${t.estimated_effort_hours}h` : "—"}</td>
                    <td className="py-2.5 pr-3 text-ink/70">{formatCents(t.estimated_cost_cents ?? 0)}</td>
                    <td className="py-2.5 pr-3 text-ink/70">{t.due_date ?? "—"}</td>
                    <td className="py-2.5 pr-3 text-ink/50 truncate max-w-[200px]">{t.source ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && <div className="text-sm text-ink/50 text-center py-10">No tasks yet.</div>}
          </div>
        </SectionCard>
      )}
    </div>
  );
}

function TaskCard({ task, onStatus }: { task: any; onStatus: (s: string) => void }) {
  return (
    <div className="rounded-md border border-border bg-card p-2.5 shadow-sm text-xs">
      <div className="flex items-start justify-between gap-2">
        <div className="text-ink font-medium leading-snug">{task.name}</div>
        <span className="text-[10px] text-royal shrink-0">AI</span>
      </div>
      {task.engine_milestones?.name && (
        <div className="mt-1.5 text-[10px] text-ink/60">→ {task.engine_milestones.name}</div>
      )}
      <div className="mt-2 flex items-center justify-between text-[10px] text-ink/60">
        <span>{task.priority} · {task.estimated_effort_hours ? `${task.estimated_effort_hours}h` : "—"}</span>
        <span>{formatCents(task.estimated_cost_cents ?? 0)}</span>
      </div>
      <div className="mt-2 flex gap-1">
        <select
          value={task.status}
          onChange={(e) => onStatus(e.target.value)}
          className="text-[10px] border border-border rounded px-1.5 py-0.5 bg-card w-full"
        >
          {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      </div>
    </div>
  );
}
