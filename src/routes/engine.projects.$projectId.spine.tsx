import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getProjectSpine, type ProjectSpinePayload, type SpineTask, type SpineMilestone } from "@/lib/engine.functions";
import { SectionCard, EmptyState, EngineStatusBadge, formatDate } from "@/components/engine/primitives";
import { cn } from "@/lib/utils";
import {
  Sparkles,
  ShieldCheck,
  Target,
  ListChecks,
  AlertTriangle,
  CheckCircle2,
  Circle,
  ArrowRight,
  Bot,
  Loader2,
} from "lucide-react";
import type { EngineProjectStatus } from "@/lib/engine.functions";

const spineQueryOptions = (
  projectId: string,
  fn: (input: { data: { id: string } }) => Promise<unknown>,
) =>
  queryOptions({
    queryKey: ["engine", "spine", projectId],
    queryFn: () => fn({ data: { id: projectId } }),
    staleTime: 15_000,
  });

export const Route = createFileRoute("/engine/projects/$projectId/spine")({
  component: SpinePage,
  loader: ({ context, params }) => {
    // Prime cache using the server fn reference from the router context is
    // unavailable here; we rely on the component's useSuspenseQuery which
    // handles the initial fetch. Keeping loader lean.
    void context;
    void params;
  },
  errorComponent: ({ error }) => (
    <div role="alert" className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800" data-qa-state="spine-route-error">
      Failed to load project spine: {(error as Error).message}
    </div>
  ),
});

function SpinePage() {
  const { projectId } = Route.useParams();
  const fn = useServerFn(getProjectSpine);
  const { data, error, isError, isPending, isFetching, refetch } = useQuery(
    spineQueryOptions(projectId, fn as unknown as (i: { data: { id: string } }) => Promise<unknown>),
  );

  if (isPending) {
    return <SpineLoading projectId={projectId} />;
  }

  if (isError || !data) {
    return (
      <SpineError
        projectId={projectId}
        message={(error as Error | null)?.message ?? "The Spine data request returned no payload."}
        onRetry={() => void refetch()}
      />
    );
  }

  const spine = data as ProjectSpinePayload;

  return (
    <div className="space-y-3" data-qa-state="spine-loaded" data-project-id={projectId}>
      {isFetching ? (
        <div className="inline-flex items-center gap-2 rounded border border-border bg-card px-3 py-2 text-xs text-ink/60 shadow-sm">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Refreshing Spine data
        </div>
      ) : null}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <div className="xl:col-span-2 space-y-6">
        <ProjectDirection spine={spine} />
        <ApprovedScope spine={spine} />
        <RoadmapSpine spine={spine} />
        <TaskSpine spine={spine} />
        <QaGates spine={spine} />
        <ActivityDecisions spine={spine} />
      </div>
      <div className="xl:col-span-1">
        <div className="xl:sticky xl:top-4">
          <AiPmPanel spine={spine} />
        </div>
      </div>
      </div>
    </div>
  );
}

function SpineLoading({ projectId }: { projectId: string }) {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3" data-qa-state="spine-loading" data-project-id={projectId}>
      <div className="xl:col-span-2 space-y-4">
        {["Project Direction", "Roadmap Spine", "Task Spine", "QA Gates"].map((label) => (
          <div key={label} className="rounded-lg border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2 text-sm text-ink/70">
              <Loader2 className="h-4 w-4 animate-spin text-royal" /> Loading {label}
            </div>
            <div className="mt-4 space-y-2">
              <div className="h-2 w-2/3 rounded bg-border" />
              <div className="h-2 w-1/2 rounded bg-border" />
            </div>
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center gap-2 text-sm text-ink/70">
          <Loader2 className="h-4 w-4 animate-spin text-royal" /> Loading AI Product Manager
        </div>
      </div>
    </div>
  );
}

function SpineError({ projectId, message, onRetry }: { projectId: string; message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-5 text-red-900 shadow-sm" data-qa-state="spine-error" data-project-id={projectId}>
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-red-700/70">Spine data failed</div>
          <div className="mt-1 text-sm">{message}</div>
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 inline-flex items-center gap-2 rounded border border-red-300 bg-red-100 px-3 py-1.5 text-xs font-medium text-red-900 hover:bg-red-200"
          >
            Retry data load
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ 1. Direction ----------------------------- */

function ProjectDirection({ spine }: { spine: ProjectSpinePayload }) {
  const p = spine.project;
  return (
    <SectionCard
      title={<span className="flex items-center gap-2"><Target className="w-4 h-4" /> Project Direction</span>}
      right={<EngineStatusBadge status={p.status as EngineProjectStatus} />}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Name" value={p.name} />
        <Field label="Client" value={p.client_company} />
        <Field label="Frame / Type" value={p.frame ?? <Missing to={`/engine/projects/${p.id}/point-b`} label="Set in Point B" />} />
        <Field label="Project goal" value={p.goal ?? <Missing to={`/engine/projects/${p.id}/point-b`} label="Set in Point B" />} />
        <Field label="Current step" value={`${p.current_step_num}. ${prettyStep(p.current_step)}`} />
        <Field label="Sources" value={formatSources(spine.sources)} />
        <Field
          label="Point A"
          value={summarizeJson(p.point_a) ?? <Missing to={`/engine/projects/${p.id}/point-a`} label="Diagnose in Point A" />}
        />
        <Field
          label="Point B"
          value={summarizeJson(p.point_b) ?? <Missing to={`/engine/projects/${p.id}/point-b`} label="Define in Point B" />}
        />
      </div>

      <div className="mt-5 rounded-lg border border-royal/20 bg-royal/5 p-4">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full",
              spine.nba.severity === "critical" ? "bg-red-500" :
              spine.nba.severity === "warning" ? "bg-amber-500" : "bg-emerald-500",
            )}
          />
          <div className="min-w-0 flex-1">
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink/50">Next best action</div>
            <div className="text-ink text-lg mt-1">{spine.nba.action}</div>
            {spine.nba.reason ? <div className="text-sm text-ink/70 mt-1">{spine.nba.reason}</div> : null}
            {spine.nba.href ? (
              <a href={spine.nba.href} className="mt-2 inline-flex items-center gap-1 text-sm text-royal hover:underline">
                Go now <ArrowRight className="w-3.5 h-3.5" />
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

/* ------------------------------ 2. Scope --------------------------------- */

function ApprovedScope({ spine }: { spine: ProjectSpinePayload }) {
  const payload = (spine.version?.payload ?? {}) as Record<string, unknown>;
  const included = arrayField(payload, ["included", "in_scope", "scope_included"]);
  const excluded = arrayField(payload, ["excluded", "out_of_scope", "scope_excluded"]);
  const assumptions = arrayField(payload, ["assumptions"]);
  const constraints = arrayField(payload, ["constraints"]);
  const openQ = arrayField(payload, ["open_questions", "openQuestions"]);
  const decisions = arrayField(payload, ["decisions", "decision_log"]);

  const anyPresent = [included, excluded, assumptions, constraints, openQ, decisions].some((l) => l.length > 0);

  return (
    <SectionCard
      title={<span className="flex items-center gap-2"><ShieldCheck className="w-4 h-4" /> Approved Scope</span>}
      right={spine.version ? `${spine.version.label ?? "Version"} · ${spine.version.status}` : "No version yet"}
    >
      {!spine.version ? (
        <EmptyState title="No roadmap version yet" hint="Run the intelligence pipeline to generate a draft." />
      ) : !anyPresent ? (
        <div className="text-sm text-ink/60">
          The current roadmap version does not yet capture scope fields.{" "}
          <Link to="/engine/projects/$projectId/builder" params={{ projectId: spine.project.id }} className="text-royal hover:underline">Open Roadmap Builder →</Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ScopeList label="Included" items={included} tone="green" fallback={`/engine/projects/${spine.project.id}/builder`} />
          <ScopeList label="Excluded" items={excluded} tone="red" fallback={`/engine/projects/${spine.project.id}/builder`} />
          <ScopeList label="Assumptions" items={assumptions} tone="blue" fallback={`/engine/projects/${spine.project.id}/point-b`} />
          <ScopeList label="Constraints" items={constraints} tone="amber" fallback={`/engine/projects/${spine.project.id}/point-a`} />
          <ScopeList label="Open questions" items={openQ} tone="amber" fallback={`/engine/projects/${spine.project.id}/point-b`} />
          <ScopeList label="Decision log" items={decisions} tone="default" fallback={`/engine/projects/${spine.project.id}/versions/compare`} />
        </div>
      )}
    </SectionCard>
  );
}

function ScopeList({ label, items, tone, fallback }: { label: string; items: string[]; tone: "green" | "red" | "amber" | "blue" | "default"; fallback: string }) {
  const toneClass = {
    green: "text-[#1f6b3b] border-[#c4e6d2] bg-[#f2f9f5]",
    red: "text-[#a4283c] border-[#f3ced5] bg-[#fdf3f5]",
    amber: "text-[#8a6713] border-[#f1e3b9] bg-[#fdf9ee]",
    blue: "text-[#2842a4] border-[#cdd6f3] bg-[#f4f6fd]",
    default: "text-ink/70 border-border bg-card",
  }[tone];
  return (
    <div className={cn("rounded-lg border p-3", toneClass)}>
      <div className="font-mono text-[10px] uppercase tracking-[0.22em] mb-2">{label}</div>
      {items.length ? (
        <ul className="space-y-1 text-sm">
          {items.slice(0, 8).map((it, i) => (
            <li key={i} className="flex gap-2"><span>·</span><span>{it}</span></li>
          ))}
          {items.length > 8 ? <li className="text-xs opacity-70">+{items.length - 8} more</li> : null}
        </ul>
      ) : (
        <div className="text-xs italic opacity-75">
          Not yet captured — <a href={fallback} className="underline">add here</a>
        </div>
      )}
    </div>
  );
}

/* ------------------------------ 3. Roadmap ------------------------------- */

function RoadmapSpine({ spine }: { spine: ProjectSpinePayload }) {
  const byPhase = groupByPhase(spine.milestones);
  const tasksByMilestone = new Map<string, SpineTask[]>();
  for (const t of spine.tasks) {
    const list = tasksByMilestone.get(t.milestone_id) ?? [];
    list.push(t);
    tasksByMilestone.set(t.milestone_id, list);
  }
  return (
    <SectionCard
      title={<span className="flex items-center gap-2"><Target className="w-4 h-4" /> Roadmap Spine</span>}
      right={`${spine.milestones.length} milestone${spine.milestones.length === 1 ? "" : "s"}`}
    >
      {!spine.milestones.length ? (
        <EmptyState title="No milestones yet" hint="Approve a roadmap version to generate milestones." />
      ) : (
        <div className="space-y-5">
          {Array.from(byPhase.entries()).map(([phase, list]) => (
            <div key={phase}>
              <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink/50 mb-2">
                {phase} · {list.length}
              </div>
              <div className="space-y-2">
                {list.map((m) => {
                  const tasks = tasksByMilestone.get(m.id) ?? [];
                  const blocked = tasks.some((t) => t.status === "blocked");
                  return (
                    <div key={m.id} className={cn("rounded-lg border border-border p-3 flex items-center gap-3", blocked && "border-l-4 border-l-red-500")}>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-ink truncate">{m.name}</div>
                        <div className="text-xs text-ink/60 mt-0.5">
                          {m.approval_status} · {m.status}{m.due_date ? ` · due ${formatDate(m.due_date)}` : ""}
                        </div>
                      </div>
                      <div className="text-xs text-ink/60 whitespace-nowrap">{tasks.length} task{tasks.length === 1 ? "" : "s"}</div>
                      {blocked ? <AlertTriangle className="w-4 h-4 text-red-500" /> : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

/* ------------------------------ 4. Tasks --------------------------------- */

function TaskSpine({ spine }: { spine: ProjectSpinePayload }) {
  const byPhase = groupByPhase(spine.milestones);
  const tasksByMilestone = new Map<string, SpineTask[]>();
  for (const t of spine.tasks) {
    const list = tasksByMilestone.get(t.milestone_id) ?? [];
    list.push(t);
    tasksByMilestone.set(t.milestone_id, list);
  }
  return (
    <SectionCard
      title={<span className="flex items-center gap-2"><ListChecks className="w-4 h-4" /> Task Spine</span>}
      right={`${spine.tasks.length} task${spine.tasks.length === 1 ? "" : "s"}`}
    >
      {!spine.tasks.length ? (
        <EmptyState title="No tasks yet" hint="Use AI Decompose on approved milestones to seed a task tree." />
      ) : (
        <div className="space-y-6">
          {Array.from(byPhase.entries()).map(([phase, list]) => (
            <div key={phase}>
              <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink/50 mb-2">{phase}</div>
              <div className="space-y-4">
                {list.map((m) => {
                  const tasks = tasksByMilestone.get(m.id) ?? [];
                  return (
                    <div key={m.id}>
                      <div className="text-sm text-ink mb-2">{m.name}</div>
                      {!tasks.length ? (
                        <div className="text-xs text-ink/50 italic">No tasks yet for this milestone.</div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {tasks.map((t) => <TaskCard key={t.id} task={t} />)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function TaskCard({ task }: { task: SpineTask }) {
  const isSuggested = task.status === "suggested" && task.ai_generated;
  const isBlocked = task.status === "blocked";
  const cardStyle = cn(
    "rounded-lg p-3",
    isBlocked ? "border-l-4 border-l-red-500 border border-red-200 bg-red-50/40" :
    isSuggested ? "border border-dashed border-amber-400 bg-amber-50/40" :
    "border border-border bg-card",
  );
  return (
    <div className={cardStyle}>
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm text-ink font-medium min-w-0">{task.name}</div>
        <div className="flex items-center gap-1 shrink-0">
          {task.ai_generated ? (
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-amber-800 bg-amber-100 rounded px-1.5 py-0.5">
              <Bot className="w-3 h-3" /> AI
            </span>
          ) : null}
          <span className="text-[10px] uppercase tracking-widest text-ink/60 border border-border rounded px-1.5 py-0.5">
            {task.status}
          </span>
        </div>
      </div>
      {task.purpose ? <div className="text-xs text-ink/70 mt-1">{task.purpose}</div> : null}
      <div className="mt-2 grid grid-cols-1 gap-1.5 text-xs">
        {task.expected_artifact ? <MiniField label="Artifact" value={task.expected_artifact} /> : null}
        {task.owner_email ? <MiniField label="Owner" value={task.owner_email} /> : null}
        {task.priority ? <MiniField label="Priority" value={task.priority} /> : null}
        {task.due_date ? <MiniField label="Due" value={formatDate(task.due_date)} /> : null}
        {task.blocked_decision ? <MiniField label="Blocked on" value={task.blocked_decision} tone="red" /> : null}
        {task.dependency_notes ? <MiniField label="Depends on" value={task.dependency_notes} /> : null}
      </div>
      <ListLine label="Acceptance criteria" items={toStringList(task.acceptance_criteria)} />
      <ListLine label="QA checklist" items={toStringList(task.qa_checklist)} />
      <ListLine label="Risks" items={toStringList(task.risks)} />
    </div>
  );
}

function MiniField({ label, value, tone }: { label: string; value: string; tone?: "red" }) {
  return (
    <div className="flex gap-1.5">
      <span className="text-ink/50">{label}:</span>
      <span className={tone === "red" ? "text-red-700" : "text-ink/80"}>{value}</span>
    </div>
  );
}

function ListLine({ label, items }: { label: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="mt-2">
      <div className="font-mono text-[10px] uppercase tracking-widest text-ink/50">{label}</div>
      <ul className="mt-1 space-y-0.5 text-xs text-ink/80">
        {items.slice(0, 5).map((it, i) => (
          <li key={i} className="flex gap-1.5"><span>·</span><span>{it}</span></li>
        ))}
        {items.length > 5 ? <li className="text-[10px] opacity-70">+{items.length - 5} more</li> : null}
      </ul>
    </div>
  );
}

/* --------------------------- 5. AI PM Panel ------------------------------ */

function AiPmPanel({ spine }: { spine: ProjectSpinePayload }) {
  const t = spine.tasks;
  const m = spine.milestones;
  const v = spine.version;

  const knows: string[] = [];
  if (v) knows.push(`Roadmap ${v.label ?? "draft"} (${v.status})`);
  if (m.length) knows.push(`${m.length} milestone${m.length === 1 ? "" : "s"} across ${new Set(m.map((x) => x.phase ?? "—")).size} phase(s)`);
  if (t.length) knows.push(`${t.length} task${t.length === 1 ? "" : "s"} decomposed`);
  if (spine.sources.processed) knows.push(`${spine.sources.processed} source(s) processed`);
  if (spine.project.frame) knows.push(`Frame: ${spine.project.frame}`);

  const missing: string[] = [];
  if (!spine.project.frame) missing.push("Project frame / type not set");
  if (!spine.project.goal) missing.push("Point B destination not set");
  if (!summarizeJson(spine.project.point_a)) missing.push("Point A diagnosis empty");
  if (!v) missing.push("No roadmap version yet");
  if (v && v.status !== "approved") missing.push("Roadmap version not approved");
  if (m.length && !t.length) missing.push("Milestones present but no tasks decomposed");
  const milestonesWithoutTasks = m.filter((x) => !t.some((task) => task.milestone_id === x.id));
  if (milestonesWithoutTasks.length && t.length) {
    missing.push(`${milestonesWithoutTasks.length} milestone(s) without any tasks`);
  }
  const tasksWithoutAc = t.filter((task) => !toStringList(task.acceptance_criteria).length);
  if (tasksWithoutAc.length) missing.push(`${tasksWithoutAc.length} task(s) missing acceptance criteria`);

  const blocked: string[] = [];
  const blockedTasks = t.filter((x) => x.status === "blocked");
  if (blockedTasks.length) blocked.push(`${blockedTasks.length} blocked task(s)`);
  if (spine.sources.failed) blocked.push(`${spine.sources.failed} failed source(s)`);
  if (spine.sources.last_run?.status === "failed") blocked.push("Last extraction run failed");
  if (spine.reviews.length) blocked.push(`${spine.reviews.length} pending review item(s)`);

  const changed = spine.activity.slice(0, 5).map((a) => `${a.title} — ${timeAgo(a.created_at)}`);

  const canDraft: Array<{ label: string; href: string }> = [];
  if (v?.status === "approved" && milestonesWithoutTasks.length) {
    canDraft.push({
      label: `Decompose ${milestonesWithoutTasks.length} milestone(s) into tasks`,
      href: `/engine/projects/${spine.project.id}/agent/tasks`,
    });
  }
  if (!v) canDraft.push({ label: "Generate a draft roadmap", href: `/engine/projects/${spine.project.id}/intelligence` });
  if (v && v.status !== "approved") canDraft.push({ label: "Review the AI draft roadmap", href: `/engine/projects/${spine.project.id}/reviews` });

  const needsApproval: string[] = [];
  const suggested = t.filter((x) => x.status === "suggested" && x.ai_generated).length;
  if (suggested) needsApproval.push(`${suggested} AI-suggested task(s) awaiting approval`);
  if (spine.reviews.length) needsApproval.push(`${spine.reviews.length} pending review item(s)`);
  if (v && (v.status === "ai_generated" || v.status === "draft")) needsApproval.push("AI-drafted roadmap version");

  return (
    <div className="rounded-xl border border-royal/20 bg-white shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-royal/10 bg-royal/5 flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-royal" />
        <div className="font-display text-base text-ink">AI Product Manager</div>
      </div>
      <div className="p-4 space-y-4 text-sm">
        <Bucket title="What I know" items={knows} tone="green" empty="No signals extracted yet." />
        <Bucket title="What is missing" items={missing} tone="amber" empty="Nothing major missing right now." />
        <Bucket title="What changed" items={changed} tone="default" empty="No recent activity." />
        <Bucket title="What is blocked" items={blocked} tone="red" empty="Nothing blocked." />
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink/50">What I recommend next</div>
          <div className="mt-1 text-ink">{spine.nba.action}</div>
          {spine.nba.reason ? <div className="text-xs text-ink/60 mt-0.5">{spine.nba.reason}</div> : null}
          {spine.nba.href ? (
            <a href={spine.nba.href} className="mt-1 inline-flex items-center gap-1 text-xs text-royal hover:underline">
              Go <ArrowRight className="w-3 h-3" />
            </a>
          ) : null}
        </div>
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink/50">What I can draft now</div>
          {canDraft.length ? (
            <ul className="mt-1 space-y-1">
              {canDraft.map((c, i) => (
                <li key={i}>
                  <a href={c.href} className="text-royal hover:underline text-sm">{c.label} →</a>
                </li>
              ))}
            </ul>
          ) : <div className="text-xs text-ink/50 italic">No drafts available right now.</div>}
        </div>
        <Bucket title="What needs human approval" items={needsApproval} tone="amber" empty="Nothing waiting on approval." />
      </div>
    </div>
  );
}

function Bucket({ title, items, tone, empty }: { title: string; items: string[]; tone: "green" | "amber" | "red" | "default"; empty: string }) {
  const dot = {
    green: "bg-emerald-500",
    amber: "bg-amber-500",
    red: "bg-red-500",
    default: "bg-ink/40",
  }[tone];
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink/50">{title}</div>
      {items.length ? (
        <ul className="mt-1 space-y-1">
          {items.map((it, i) => (
            <li key={i} className="flex gap-2 text-sm text-ink/80">
              <span className={cn("mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full", dot)} />
              <span className="min-w-0">{it}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="text-xs text-ink/50 italic mt-1">{empty}</div>
      )}
    </div>
  );
}

/* ------------------------------ 6. QA Gates ------------------------------ */

type Gate = { label: string; status: "pass" | "warn" | "fail" | "info"; reason: string; next?: { label: string; href: string } };

function computeGates(spine: ProjectSpinePayload): Gate[] {
  const pid = spine.project.id;
  const gates: Gate[] = [];
  gates.push({ label: "Role access", status: "pass", reason: "Route gated to operator/admin roles." });

  const orphanTasks = spine.tasks.filter((t) => !spine.milestones.some((m) => m.id === t.milestone_id)).length;
  const integrityBad = orphanTasks || spine.sources.failed;
  gates.push({
    label: "Data integrity",
    status: integrityBad ? "warn" : "pass",
    reason: orphanTasks
      ? `${orphanTasks} orphan task(s) — milestone missing.`
      : spine.sources.failed
        ? `${spine.sources.failed} failed source(s).`
        : "No orphan tasks; no failed sources.",
    next: integrityBad ? { label: "Open Signal Room", href: `/engine/projects/${pid}/signal-room` } : undefined,
  });

  const aiDelivered =
    spine.portal_publish?.status === "delivered" &&
    spine.version?.status !== "approved";
  const draftAwaitingApproval =
    spine.version && (spine.version.status === "ai_generated" || spine.version.status === "draft" || spine.version.status === "tai_edited");
  const approvalWarn = aiDelivered || spine.reviews.length > 0 || draftAwaitingApproval;
  gates.push({
    label: "Approval gates",
    status: aiDelivered ? "fail" : approvalWarn ? "warn" : "pass",
    reason: aiDelivered
      ? "AI-draft version is published to the portal without approval."
      : spine.reviews.length
        ? `${spine.reviews.length} pending review item(s) awaiting decision.`
        : draftAwaitingApproval
          ? "Roadmap draft is waiting on human approval."
          : "No AI-draft published to portal.",
    next: approvalWarn ? { label: "Open Reviews", href: `/engine/projects/${pid}/reviews` } : undefined,
  });

  const portalUnsafe =
    spine.portal_publish?.status === "approved" &&
    spine.version?.status === "ai_generated";
  gates.push({
    label: "Client portal safety",
    status: portalUnsafe ? "fail" : "pass",
    reason: portalUnsafe ? "Portal shows an approved roadmap while engine version is still AI-drafted." : "Portal state consistent with approved engine version.",
    next: portalUnsafe ? { label: "Open Delivery Prep", href: `/engine/projects/${pid}/delivery` } : undefined,
  });

  const lastRun = spine.sources.last_run;
  const backendStatus: Gate["status"] = lastRun
    ? lastRun.status === "succeeded"
      ? "pass"
      : lastRun.status === "running"
        ? "info"
        : "warn"
    : "info";
  gates.push({
    label: "Backend readiness",
    status: backendStatus,
    reason: lastRun
      ? `Last extraction run: ${lastRun.status}${lastRun.error ? ` — ${lastRun.error}` : ""}`
      : "No extraction run yet.",
    next: backendStatus === "warn" || backendStatus === "info"
      ? { label: "Open System Blueprint", href: `/engine/projects/${pid}/blueprint` }
      : undefined,
  });

  const blockedTasks = spine.tasks.filter((t) => t.status === "blocked").length;
  if (blockedTasks) {
    gates.push({
      label: "Blocked tasks",
      status: "warn",
      reason: `${blockedTasks} task(s) blocked — need operator input.`,
      next: { label: "Open Task Board", href: `/engine/projects/${pid}/agent/tasks` },
    });
  }

  gates.push({
    label: "Responsive readiness",
    status: "info",
    reason: "Mobile and tablet review has not been captured for this project yet.",
    next: { label: "Run responsive QA", href: `/engine/projects/${pid}/spine` },
  });

  const deliveryReady =
    spine.version?.status === "approved" && spine.portal_publish?.status && spine.portal_publish.status !== "not_published" && !blockedTasks;
  gates.push({
    label: "Delivery readiness",
    status: deliveryReady ? "pass" : "warn",
    reason: !spine.version || spine.version.status !== "approved"
      ? "Roadmap version not yet approved."
      : !spine.portal_publish
        ? "No client portal roadmap linked."
        : blockedTasks
          ? `${blockedTasks} blocked task(s) must be resolved.`
          : "All delivery gates clear.",
    next: deliveryReady ? undefined : { label: "Open Delivery Prep", href: `/engine/projects/${pid}/delivery` },
  });

  return gates;
}

function QaGates({ spine }: { spine: ProjectSpinePayload }) {
  const gates = computeGates(spine);
  const toneOf = (s: Gate["status"]) => ({
    pass: "bg-emerald-100 text-emerald-800 border-emerald-200",
    warn: "bg-amber-100 text-amber-800 border-amber-200",
    fail: "bg-red-100 text-red-800 border-red-200",
    info: "bg-slate-100 text-slate-700 border-slate-200",
  }[s]);
  const iconOf = (s: Gate["status"]) => s === "pass" ? <CheckCircle2 className="w-4 h-4" /> : s === "info" ? <Circle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />;
  return (
    <SectionCard title={<span className="flex items-center gap-2"><ShieldCheck className="w-4 h-4" /> QA Gates</span>}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {gates.map((g) => (
          <div key={g.label} className={cn("rounded-lg border p-3 flex items-start gap-3", toneOf(g.status))}>
            <div className="mt-0.5">{iconOf(g.status)}</div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{g.label}</div>
              <div className="text-xs opacity-90 mt-0.5">{g.reason}</div>
              {g.next ? (
                <a href={g.next.href} className="text-xs underline mt-1 inline-block">{g.next.label} →</a>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

/* -------------------- 7. Activity, notifications, reviews ---------------- */

function ActivityDecisions({ spine }: { spine: ProjectSpinePayload }) {
  return (
    <SectionCard title="Activity & Decisions">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <ListCol title="Recent activity" empty="No activity yet.">
          {spine.activity.slice(0, 10).map((a) => (
            <li key={a.id} className="text-xs">
              <div className="text-ink">{a.title}</div>
              <div className="text-ink/50">{timeAgo(a.created_at)}</div>
            </li>
          ))}
        </ListCol>
        <ListCol title="Operator notifications" empty="No notifications for this project.">
          {spine.notifications.slice(0, 10).map((n) => (
            <li key={n.id} className="text-xs">
              {n.href ? (
                <a href={n.href} className="text-ink hover:underline">{n.title}</a>
              ) : (
                <div className="text-ink">{n.title}</div>
              )}
              <div className="text-ink/50">{timeAgo(n.created_at)}</div>
            </li>
          ))}
        </ListCol>
        <ListCol title="Pending review items" empty="No pending reviews.">
          {spine.reviews.map((r) => (
            <li key={r.id} className="text-xs">
              <div className="text-ink">{r.title}</div>
              <div className="text-ink/50">{r.item_type} · impact {r.impact}</div>
            </li>
          ))}
        </ListCol>
      </div>
      {spine.audit.length ? (
        <details className="mt-4">
          <summary className="cursor-pointer text-xs text-ink/60">Recent audit log ({spine.audit.length})</summary>
          <ul className="mt-2 space-y-1 text-xs">
            {spine.audit.map((a) => (
              <li key={a.id} className="flex justify-between gap-3 text-ink/70">
                <span className="min-w-0"><span className="font-mono">{a.action}</span> {a.summary ? `— ${a.summary}` : ""}</span>
                <span className="shrink-0 text-ink/50">{a.actor_email ?? "system"} · {timeAgo(a.created_at)}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </SectionCard>
  );
}

function ListCol({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const arr = Array.isArray(children) ? children : [children];
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink/50 mb-2">{title}</div>
      {arr.length ? <ul className="space-y-2">{children}</ul> : <div className="text-xs text-ink/50 italic">{empty}</div>}
    </div>
  );
}

/* ------------------------------ Helpers ---------------------------------- */

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink/50">{label}</div>
      <div className="text-sm text-ink mt-1">{value}</div>
    </div>
  );
}

function Missing({ to, label }: { to: string; label: string }) {
  return <a href={to} className="text-xs italic text-ink/60 hover:text-royal underline">{label}</a>;
}

function summarizeJson(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "object") {
    const rec = v as Record<string, unknown>;
    const keys = ["summary", "description", "destination", "goal", "diagnosis", "text"];
    for (const k of keys) {
      const val = rec[k];
      if (typeof val === "string" && val.trim()) return val;
    }
    if (Object.keys(rec).length === 0) return null;
    return `${Object.keys(rec).length} field(s) captured`;
  }
  return String(v);
}

function arrayField(payload: Record<string, unknown>, keys: string[]): string[] {
  for (const k of keys) {
    const v = payload[k];
    if (Array.isArray(v)) {
      return v.map((x) => (typeof x === "string" ? x : (x as { text?: string; title?: string; label?: string })?.text ?? (x as { title?: string })?.title ?? (x as { label?: string })?.label ?? JSON.stringify(x)))
        .filter((s): s is string => Boolean(s));
    }
  }
  return [];
}

function toStringList(v: unknown): string[] {
  if (!v) return [];
  if (Array.isArray(v)) {
    return v.map((x) => typeof x === "string" ? x : (x as { text?: string; title?: string })?.text ?? (x as { title?: string })?.title ?? JSON.stringify(x)).filter(Boolean);
  }
  if (typeof v === "string") return v ? [v] : [];
  return [];
}

function groupByPhase(milestones: SpineMilestone[]): Map<string, SpineMilestone[]> {
  const map = new Map<string, SpineMilestone[]>();
  for (const m of milestones) {
    const key = m.phase ?? "Unphased";
    const list = map.get(key) ?? [];
    list.push(m);
    map.set(key, list);
  }
  return map;
}

function prettyStep(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatSources(s: ProjectSpinePayload["sources"]): string {
  const parts = [`${s.total} total`];
  if (s.queued) parts.push(`${s.queued} queued`);
  if (s.processing) parts.push(`${s.processing} processing`);
  parts.push(`${s.processed} processed`);
  if (s.failed) parts.push(`${s.failed} failed`);
  return parts.join(" · ");
}

function timeAgo(iso: string): string {
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}
