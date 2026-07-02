/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  Bot,
  Send,
  Paperclip,
  Loader2,
  Sparkles,
  CheckCircle2,
  X,
  Save,
  ShieldCheck,
  Wallet,
  Layers,
} from "lucide-react";
import { SectionCard, MetricCard, EmptyState, formatCents } from "@/components/engine/primitives";
import {
  getAgentDashboard,
  listAgentTasks,
  runAgentPrompt,
  updateAgentTaskStatus,
  updateAgentControls,
  type EngineAgentTask,
} from "@/lib/engine-agent.functions";
import { POPULAR_PROMPTS, type AgentTaskKind } from "@/lib/engine-agent-prompts";

export const Route = createFileRoute("/engine/projects/$projectId/agent")({
  component: AgentConsolePage,
  errorComponent: ({ error }) => (
    <div className="text-red-700 text-sm">Failed: {(error as Error).message}</div>
  ),
});

const PERMISSION_OPTIONS: Array<{ value: "draft_only" | "propose_updates" | "execute_approved"; label: string; hint: string }> = [
  { value: "draft_only", label: "Draft only", hint: "Agent writes, Tai applies." },
  { value: "propose_updates", label: "Propose updates", hint: "Agent proposes module edits." },
  { value: "execute_approved", label: "Execute approved", hint: "Agent applies pre-approved actions." },
];

const ALL_MODULES = [
  "point_a",
  "point_b",
  "hidden_assets",
  "gap_map",
  "system_blueprint",
  "roadmap",
  "sequencing",
  "deadlines",
  "investment",
  "client_preview",
];

function AgentConsolePage() {
  const { projectId } = Route.useParams();
  const qc = useQueryClient();
  const dashFn = useServerFn(getAgentDashboard);
  const tasksFn = useServerFn(listAgentTasks);

  const dash = useQuery({
    queryKey: ["engine", "agent-dashboard", projectId],
    queryFn: () => dashFn({ data: { projectId } }),
  });
  const tasksQ = useQuery({
    queryKey: ["engine", "agent-tasks", projectId],
    queryFn: () => tasksFn({ data: { projectId } }),
  });

  const project = (dash.data as any)?.project;
  const tasks = ((tasksQ.data as any)?.rows ?? []) as EngineAgentTask[];
  const sources = ((dash.data as any)?.sources ?? []) as any[];
  const pending = ((dash.data as any)?.pending_approvals ?? []) as any[];

  const budgetCents = project?.agent_budget_monthly_cents ?? 0;
  const spendCents = project?.agent_spend_month_cents ?? 0;
  const remaining = Math.max(0, budgetCents - spendCents);
  const todayCents = tasks
    .filter((t) => new Date(t.created_at).toDateString() === new Date().toDateString())
    .reduce((s, t) => s + (t.cost_cents ?? 0), 0);

  const modulesNeedingReview = tasks.filter((t) => t.status === "draft" && t.related_module).length;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["engine", "agent-dashboard", projectId] });
    qc.invalidateQueries({ queryKey: ["engine", "agent-tasks", projectId] });
  };

  return (
    <div className="space-y-5">
      {/* Header metrics */}
      <div className="rounded-xl bg-card border border-border p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-royal/10 flex items-center justify-center">
              <Bot className="w-5 h-5 text-royal" />
            </div>
            <div>
              <h2 className="font-display text-2xl text-ink">Project Agent</h2>
              <p className="text-sm text-ink/60 mt-0.5">
                Dedicated AI product manager for {project?.name ?? "this project"}.
              </p>
            </div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <MetricCard label="Draft version" value={project?.roadmap_version ?? "—"} />
          <MetricCard label="Approved" value={project?.approved_version ?? "—"} />
          <MetricCard label="Agent tasks" value={tasks.length.toString()} />
          <MetricCard label="Needs review" value={modulesNeedingReview.toString()} />
          <MetricCard label="Blocked decisions" value={(project?.open_decisions?.length ?? 0).toString()} />
          <MetricCard label="Spend / budget" value={`${formatCents(spendCents)} / ${formatCents(budgetCents)}`} />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-5">
        <div className="space-y-5 min-w-0">
          <PromptConsole
            projectId={projectId}
            sources={sources}
            onSent={refresh}
          />
          <RecentOutputs tasks={tasks} onChange={refresh} />
        </div>

        <aside className="space-y-4">
          <div className="rounded-xl bg-card border border-border p-4 shadow-sm">
            <div className="font-display text-lg text-ink flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-ink/60" /> Agent Control
            </div>
            <PermissionSelect
              projectId={projectId}
              current={project?.agent_permission_level ?? "draft_only"}
              onSaved={refresh}
            />
            <div className="mt-4 space-y-2 text-sm">
              <RowKV label="Cost today" value={formatCents(todayCents)} />
              <RowKV label="Cost this month" value={formatCents(spendCents)} />
              <RowKV label="Budget remaining" value={formatCents(remaining)} tone={remaining < budgetCents * 0.2 ? "red" : "muted"} />
            </div>
            <BudgetEditor
              projectId={projectId}
              current={budgetCents}
              onSaved={refresh}
            />
          </div>

          <div className="rounded-xl bg-card border border-border p-4 shadow-sm">
            <div className="font-display text-sm text-ink flex items-center gap-2">
              <Layers className="w-4 h-4 text-ink/60" /> Modules agent can update
            </div>
            <ModulesEditor
              projectId={projectId}
              current={project?.agent_allowed_modules ?? []}
              onSaved={refresh}
            />
          </div>

          <div className="rounded-xl bg-card border border-border p-4 shadow-sm">
            <div className="font-display text-sm text-ink">Sources available</div>
            <ul className="mt-2 space-y-1.5 text-xs text-ink/70 max-h-40 overflow-auto">
              {sources.length === 0 ? (
                <li className="text-ink/50">No sources yet.</li>
              ) : (
                sources.map((s: any) => (
                  <li key={s.id} className="flex items-center justify-between gap-2">
                    <span className="truncate">{s.name}</span>
                    <span className="text-[10px] text-ink/50 capitalize shrink-0">{s.status}</span>
                  </li>
                ))
              )}
            </ul>
          </div>

          <div className="rounded-xl bg-card border border-border p-4 shadow-sm">
            <div className="font-display text-sm text-ink">Pending approvals</div>
            {pending.length === 0 ? (
              <p className="text-xs text-ink/60 mt-2">None right now.</p>
            ) : (
              <ul className="mt-2 space-y-1.5 text-xs">
                {pending.map((p: any) => (
                  <li key={p.id} className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#c99a20] mt-1.5 shrink-0" />
                    <span className="text-ink/80">{p.title}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-xl bg-canvas border border-border p-4">
            <div className="font-display text-sm text-ink">Safety rules</div>
            <ul className="mt-2 space-y-1 text-xs text-ink/60">
              {(project?.agent_safety_rules ?? [
                "Never edit approved versions",
                "Never send client copy without Tai review",
                "Never invent client quotes",
              ]).map((r: string, i: number) => (
                <li key={i}>· {r}</li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}

function RowKV({ label, value, tone }: { label: string; value: string; tone?: "red" | "muted" }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-ink/60">{label}</span>
      <span className={`font-mono ${tone === "red" ? "text-[#a4283c]" : "text-ink"}`}>{value}</span>
    </div>
  );
}

/* ============================================================
 * Prompt console
 * ============================================================ */

function PromptConsole({
  projectId,
  sources,
  onSent,
}: {
  projectId: string;
  sources: any[];
  onSent: () => void;
}) {
  const runFn = useServerFn(runAgentPrompt);
  const [prompt, setPrompt] = useState("");
  const [kind, setKind] = useState<AgentTaskKind>("free_form");
  const [useContext, setUseContext] = useState(true);
  const [attach, setAttach] = useState<string[]>([]);
  const [showAttach, setShowAttach] = useState(false);

  const runMut = useMutation({
    mutationFn: () =>
      runFn({
        data: {
          projectId,
          kind,
          prompt: prompt.trim(),
          useProjectContext: useContext,
          attachedSourceIds: attach,
        },
      }),
    onSuccess: () => {
      toast.success("Agent draft ready");
      setPrompt("");
      setAttach([]);
      setKind("free_form");
      onSent();
    },
    onError: (e: any) => toast.error(e.message ?? "Agent failed"),
  });

  return (
    <SectionCard
      title={<span className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-ink/60" />Ask the agent</span>}
    >
      <div className="flex flex-wrap gap-1.5 mb-3">
        {POPULAR_PROMPTS.map((p) => (
          <button
            key={p.kind}
            type="button"
            onClick={() => {
              setKind(p.kind);
              setPrompt(p.template);
            }}
            className={`text-[11px] border rounded-full px-2.5 py-1 hover:border-royal/50 ${
              kind === p.kind ? "border-royal bg-royal/5 text-royal" : "border-border text-ink/70"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <textarea
        rows={5}
        placeholder="Ask something the agent can do for this project..."
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        className="w-full text-sm border border-border rounded-md px-3 py-2 bg-card"
      />

      <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <label className="inline-flex items-center gap-2 text-xs text-ink/70">
            <input
              type="checkbox"
              checked={useContext}
              onChange={(e) => setUseContext(e.target.checked)}
              className="accent-royal"
            />
            Use project context
          </label>
          <button
            type="button"
            onClick={() => setShowAttach((s) => !s)}
            className="inline-flex items-center gap-1.5 text-xs text-ink/70 hover:text-ink"
          >
            <Paperclip className="w-3.5 h-3.5" /> Attach source ({attach.length})
          </button>
        </div>
        <button
          type="button"
          disabled={!prompt.trim() || runMut.isPending}
          onClick={() => runMut.mutate()}
          className="inline-flex items-center gap-2 text-sm bg-ink text-white rounded-md px-4 py-2 hover:bg-ink/90 disabled:opacity-60"
        >
          {runMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Send
        </button>
      </div>

      {showAttach ? (
        <div className="mt-3 rounded-md border border-border p-3 bg-canvas/50">
          <div className="text-xs text-ink/60 mb-2">Attach up to 20 sources</div>
          {sources.length === 0 ? (
            <p className="text-xs text-ink/50">No sources available.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-48 overflow-auto">
              {sources.map((s: any) => {
                const on = attach.includes(s.id);
                return (
                  <label key={s.id} className="flex items-center gap-2 text-xs text-ink/80">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() =>
                        setAttach((cur) =>
                          on ? cur.filter((x) => x !== s.id) : [...cur, s.id].slice(0, 20),
                        )
                      }
                      className="accent-royal"
                    />
                    <span className="truncate">{s.name}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </SectionCard>
  );
}

/* ============================================================
 * Recent outputs
 * ============================================================ */

function RecentOutputs({ tasks, onChange }: { tasks: EngineAgentTask[]; onChange: () => void }) {
  const updateFn = useServerFn(updateAgentTaskStatus);
  const [openId, setOpenId] = useState<string | null>(null);

  async function setStatus(id: string, status: EngineAgentTask["status"]) {
    await updateFn({ data: { id, status } });
    onChange();
  }

  return (
    <SectionCard
      title={<span className="flex items-center gap-2"><Bot className="w-4 h-4 text-ink/60" />Recent agent outputs</span>}
      right={<span>{tasks.length}</span>}
    >
      {tasks.length === 0 ? (
        <EmptyState title="No outputs yet" hint="Send a prompt to see drafts appear here." />
      ) : (
        <ul className="space-y-2">
          {tasks.map((t) => {
            const open = openId === t.id;
            return (
              <li key={t.id} className="border border-border rounded-md">
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : t.id)}
                  className="w-full text-left px-3 py-2.5 flex items-start justify-between gap-3 hover:bg-canvas/50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] uppercase tracking-wide text-ink/50">
                        {t.kind.replace(/_/g, " ")}
                      </span>
                      {t.related_module ? (
                        <span className="text-[10px] text-royal">→ {t.related_module}</span>
                      ) : null}
                      <TaskStatus status={t.status} />
                    </div>
                    <p className="text-sm text-ink mt-1 truncate">{t.prompt}</p>
                    <div className="text-[11px] text-ink/50 mt-1 flex items-center gap-3">
                      <span>Confidence {t.confidence}%</span>
                      <span>Cost {formatCents(t.cost_cents)}</span>
                      <span>{new Date(t.created_at).toLocaleString()}</span>
                    </div>
                  </div>
                </button>
                {open ? (
                  <div className="border-t border-border p-3 bg-canvas/40 space-y-3">
                    {t.error ? (
                      <div className="text-xs text-[#a4283c]">Error: {t.error}</div>
                    ) : (
                      <pre className="whitespace-pre-wrap font-mono text-xs text-ink/80 max-h-96 overflow-auto">
                        {t.output ?? "(no output)"}
                      </pre>
                    )}
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => setStatus(t.id, "applied")}
                        className="inline-flex items-center gap-1.5 text-xs bg-ink text-white rounded px-2.5 py-1 hover:bg-ink/90"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> Apply
                      </button>
                      <button
                        onClick={() => setStatus(t.id, "saved_as_task")}
                        className="inline-flex items-center gap-1.5 text-xs border border-border rounded px-2.5 py-1 hover:border-royal/50"
                      >
                        <Save className="w-3.5 h-3.5" /> Save as task
                      </button>
                      <button
                        onClick={() => setStatus(t.id, "rejected")}
                        className="inline-flex items-center gap-1.5 text-xs border border-border rounded px-2.5 py-1 hover:border-[#a4283c]/50 text-[#a4283c]"
                      >
                        <X className="w-3.5 h-3.5" /> Reject
                      </button>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}

function TaskStatus({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: "bg-[#e9eefb] text-royal border-[#cdd6f3]",
    applied: "bg-[#e6f5ec] text-[#1f6b3b] border-[#c4e6d2]",
    saved_as_task: "bg-[#fbf3e0] text-[#8a6713] border-[#f1e3b9]",
    rejected: "bg-[#fbe9ec] text-[#a4283c] border-[#f3ced5]",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${
        map[status] ?? map.draft
      }`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

/* ============================================================
 * Controls
 * ============================================================ */

function PermissionSelect({
  projectId,
  current,
  onSaved,
}: {
  projectId: string;
  current: "draft_only" | "propose_updates" | "execute_approved";
  onSaved: () => void;
}) {
  const updateFn = useServerFn(updateAgentControls);
  return (
    <div className="mt-3 space-y-1.5">
      {PERMISSION_OPTIONS.map((opt) => {
        const active = current === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={async () => {
              await updateFn({ data: { projectId, permission_level: opt.value } });
              toast.success("Permission updated");
              onSaved();
            }}
            className={`w-full text-left rounded-md border px-3 py-2 transition ${
              active ? "border-royal bg-royal/5" : "border-border hover:border-royal/40"
            }`}
          >
            <div className="text-sm font-medium text-ink">{opt.label}</div>
            <div className="text-[11px] text-ink/60">{opt.hint}</div>
          </button>
        );
      })}
    </div>
  );
}

function BudgetEditor({
  projectId,
  current,
  onSaved,
}: {
  projectId: string;
  current: number;
  onSaved: () => void;
}) {
  const updateFn = useServerFn(updateAgentControls);
  const [dollars, setDollars] = useState((current / 100).toFixed(0));
  return (
    <form
      className="mt-4 flex items-center gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const cents = Math.round(parseFloat(dollars) * 100);
        if (!Number.isFinite(cents) || cents < 0) return;
        await updateFn({ data: { projectId, budget_monthly_cents: cents } });
        toast.success("Budget cap saved");
        onSaved();
      }}
    >
      <Wallet className="w-4 h-4 text-ink/50" />
      <span className="text-xs text-ink/60">Cap $</span>
      <input
        value={dollars}
        onChange={(e) => setDollars(e.target.value)}
        inputMode="numeric"
        className="w-20 text-sm border border-border rounded px-2 py-1 bg-card"
      />
      <button type="submit" className="text-xs bg-ink text-white rounded px-2 py-1 hover:bg-ink/90">
        Save
      </button>
    </form>
  );
}

function ModulesEditor({
  projectId,
  current,
  onSaved,
}: {
  projectId: string;
  current: string[];
  onSaved: () => void;
}) {
  const updateFn = useServerFn(updateAgentControls);
  const [selected, setSelected] = useState<string[]>(current);
  const [dirty, setDirty] = useState(false);
  return (
    <div className="mt-2 space-y-1.5">
      <div className="grid grid-cols-2 gap-1">
        {ALL_MODULES.map((m) => {
          const on = selected.includes(m);
          return (
            <label key={m} className="flex items-center gap-2 text-xs text-ink/80">
              <input
                type="checkbox"
                checked={on}
                onChange={() => {
                  setDirty(true);
                  setSelected((cur) => (on ? cur.filter((x) => x !== m) : [...cur, m]));
                }}
                className="accent-royal"
              />
              <span className="capitalize">{m.replace(/_/g, " ")}</span>
            </label>
          );
        })}
      </div>
      {dirty ? (
        <button
          onClick={async () => {
            await updateFn({ data: { projectId, allowed_modules: selected } });
            toast.success("Modules updated");
            setDirty(false);
            onSaved();
          }}
          className="mt-2 text-xs bg-ink text-white rounded px-2 py-1 hover:bg-ink/90"
        >
          Save modules
        </button>
      ) : null}
    </div>
  );
}
