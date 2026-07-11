import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from "lucide-react";
import { SectionCard, EmptyState, formatDate } from "@/components/engine/primitives";
import { StepEditor } from "@/components/engine/StepEditor";
import { StepStateBar, SourceEvidence } from "@/components/engine/StepState";
import { getProjectSpine } from "@/lib/engine.functions";

export const Route = createFileRoute("/engine/projects/$projectId/builder")({
  component: Builder,
});

type SpineMilestone = {
  id: string;
  name: string;
  phase: string;
  status: "draft" | "in_progress" | "completed" | "blocked" | string;
  approval_status: "pending" | "approved" | "rejected" | string;
  sort_index: number;
  due_date: string | null;
  brief_md: string | null;
};

type SpineTask = {
  id: string;
  milestone_id: string | null;
  owner_email: string | null;
  status: string;
  dependency_notes?: string | null;
};

function Builder() {
  const { projectId } = Route.useParams();
  const [clientSafe, setClientSafe] = useState(false);
  const [openMilestones, setOpenMilestones] = useState<Record<string, boolean>>({});
  const spineFn = useServerFn(getProjectSpine);
  const spineQ = useQuery({
    queryKey: ["engine", "spine", projectId],
    queryFn: () => spineFn({ data: { id: projectId } }),
    staleTime: 30_000,
  });

  const spine = spineQ.data;
  const milestones = ((spine?.milestones ?? []) as SpineMilestone[]).slice();
  const tasks = (spine?.tasks ?? []) as SpineTask[];
  const groupedMilestones = groupMilestones(milestones);
  const completedCount = milestones.filter((milestone) => milestone.status === "completed").length;
  const phaseCount = groupedMilestones.length;

  if (spineQ.isPending) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-56 animate-pulse rounded-full bg-[#E8E1D6]" />
        <div className="h-[120px] animate-pulse rounded-[28px] bg-[#0A0F1F]" />
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="rounded-[24px] border border-[#E8E1D6] bg-white p-6 shadow-sm">
              <div className="h-5 w-48 animate-pulse rounded bg-[#E8E1D6]" />
              <div className="mt-4 h-28 animate-pulse rounded-2xl bg-[#FBF9F4]" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (spineQ.isError || !spine) {
    return (
      <div className="rounded-2xl border border-[#f3ced5] bg-[#fbe9ec] p-6 text-sm text-[#7a2130]">
        {(spineQ.error as Error | null)?.message ?? "The roadmap journey could not be loaded."}
      </div>
    );
  }

  return (
    <div className="space-y-6 text-[#0A0F1F]">
      <header className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <Link
              to="/engine/projects/$projectId/overview"
              params={{ projectId }}
              className="inline-flex items-center gap-2 text-sm text-[#3E68B2] transition hover:text-[#284f93]"
            >
              <ChevronLeft className="h-4 w-4" />
              Back to Overview
            </Link>
            <div>
              <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-[#667085]">Roadmap</div>
              <h1 className="mt-1 font-display text-3xl text-[#0A0F1F]">
                Roadmap — {spine.project.name}
              </h1>
            </div>
          </div>
          <div className="flex flex-col items-start gap-3 lg:items-end">
            <div className="flex flex-wrap items-center gap-2 text-sm text-[#667085]">
              <span>Version: {spine.version?.label || "Unversioned"}</span>
              <VersionBadge status={spine.version?.status ?? "draft"} />
            </div>
            <button
              type="button"
              onClick={() => setClientSafe((value) => !value)}
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition ${
                clientSafe
                  ? "border-[#D4A843] bg-[#FBF3E0] text-[#8a6713]"
                  : "border-[#E8E1D6] bg-white text-[#667085] hover:border-[#cdd6f3] hover:text-[#3E68B2]"
              }`}
              aria-pressed={clientSafe}
            >
              <span
                className={`h-2.5 w-2.5 rounded-full ${clientSafe ? "bg-[#D4A843]" : "bg-[#c9c1b5]"}`}
              />
              Client-safe view
            </button>
          </div>
        </div>
      </header>

      <StepStateBar projectId={projectId} step="builder" current={undefined} />

      {clientSafe ? (
        <div className="rounded-2xl border border-[#f1e3b9] bg-[#fbf3e0] px-4 py-3 text-sm text-[#8a6713]">
          Client view — internal details hidden
        </div>
      ) : null}

      <section className="overflow-hidden rounded-[28px] bg-[#0A0F1F] text-[#FBF9F4] shadow-[0_24px_60px_rgba(10,15,31,0.18)]">
        <div className="grid min-h-[120px] gap-4 px-5 py-5 lg:grid-cols-[1.15fr_auto_1.15fr] lg:px-8">
          <JourneyBox
            label="Point A"
            title="Where the business is now"
            items={summarizePoint(spine.project.point_a)}
            fallback="Current-state truth is still being assembled."
          />

          <div className="flex min-w-[220px] flex-col items-center justify-center gap-3 py-2 text-center">
            <div className="font-mono text-[10px] uppercase tracking-[0.32em] text-[#D4A843]">Journey</div>
            <div className="flex w-full items-center gap-3">
              <div className="h-px flex-1 bg-white/25" />
              <div className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-[#FBF9F4]">
                {phaseCount} phases · {milestones.length} milestones
              </div>
              <div className="h-px flex-1 bg-white/25" />
            </div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs text-[#FBF9F4]/80">
              <span>{completedCount}/{Math.max(milestones.length, 1)} complete</span>
              <ChevronRight className="h-3.5 w-3.5 text-[#D4A843]" />
              <span>{Math.round((completedCount / Math.max(milestones.length, 1)) * 100)}%</span>
            </div>
          </div>

          <JourneyBox
            label="Point B"
            title="What this roadmap is unlocking"
            items={summarizeDestination(spine.project.goal, spine.project.point_b)}
            fallback="Destination still being clarified."
            accent
          />
        </div>
      </section>

      {milestones.length === 0 ? (
        <SectionCard title="Roadmap Journey">
          <EmptyState
            title="No milestones defined yet"
            hint="Start building the roadmap in the Roadmap Builder."
          />
        </SectionCard>
      ) : (
        <section className="space-y-6">
          {groupedMilestones.map((group, index) => {
            const phaseState = getPhaseStatus(group.milestones);
            const nextPhase = groupedMilestones[index + 1]?.phase ?? null;

            return (
              <div key={group.phase} className="space-y-4">
                <div className="rounded-[24px] border border-[#E8E1D6] bg-[#FBF9F4] p-5 shadow-sm">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="font-display text-2xl text-[#0A0F1F]">{group.phase}</div>
                      <div className="mt-1 text-sm text-[#667085]">
                        {group.milestones.length} milestone{group.milestones.length === 1 ? "" : "s"}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <PhaseStatusBadge status={phaseState} />
                      <div className="rounded-full border border-[#E8E1D6] bg-white px-3 py-1 text-xs text-[#667085]">
                        Unlocks {nextPhase ? nextPhase : "delivery readiness"}
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-4 xl:grid-cols-2">
                    {group.milestones.map((milestone) => {
                      const isOpen = !!openMilestones[milestone.id];
                      const milestoneTasks = tasks.filter((task) => task.milestone_id === milestone.id);
                      const ownerSummary = summarizeOwners(milestoneTasks);
                      const dependencySummary = summarizeDependencies(milestoneTasks);
                      const taskProgress = summarizeTaskProgress(milestoneTasks);
                      const preview = previewText(milestone.brief_md);

                      return (
                        <article
                          key={milestone.id}
                          className="rounded-xl border border-[#E8E1D6] bg-white p-5 shadow-sm"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-3">
                                <span
                                  className="h-3 w-3 rounded-full"
                                  style={{ backgroundColor: statusColor(milestone.status) }}
                                  aria-hidden="true"
                                />
                                <h3 className="font-display text-lg text-[#0A0F1F]">
                                  {milestone.name}
                                </h3>
                              </div>
                            </div>
                            {!clientSafe ? <ApprovalBadge status={milestone.approval_status} /> : null}
                          </div>

                          <div className="mt-4 grid gap-3 text-sm text-[#667085] md:grid-cols-2">
                            <MetaRow label="Phase" value={group.phase} />
                            <MetaRow
                              label="Due"
                              value={milestone.due_date ? formatDate(milestone.due_date) : "—"}
                            />
                            {!clientSafe ? <MetaRow label="Ownership" value={ownerSummary} /> : null}
                            {!clientSafe ? <MetaRow label="Progress" value={taskProgress} /> : null}
                            {!clientSafe ? <MetaRow label="Dependency" value={dependencySummary} /> : null}
                            {!clientSafe ? (
                              <MetaRow
                                label="Unlocks"
                                value={nextPhase ? `Advances into ${nextPhase}` : "Final delivery motion"}
                              />
                            ) : null}
                          </div>

                          {!clientSafe && preview ? (
                            <p className="mt-4 text-sm leading-6 text-[#667085]">{isOpen ? milestone.brief_md : preview}</p>
                          ) : null}

                          {!clientSafe && milestone.brief_md ? (
                            <button
                              type="button"
                              onClick={() =>
                                setOpenMilestones((current) => ({
                                  ...current,
                                  [milestone.id]: !current[milestone.id],
                                }))
                              }
                              className="mt-4 inline-flex items-center gap-2 text-sm text-[#3E68B2] transition hover:text-[#284f93]"
                            >
                              {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                              {isOpen ? "Hide details" : "View details"}
                            </button>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                </div>

                {index < groupedMilestones.length - 1 ? (
                  <div className="flex flex-col items-center gap-2 py-1 text-[#667085]">
                    <div className="h-10 w-px bg-[#D4A843]/60" />
                    <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[#E8E1D6] bg-white text-[#D4A843] shadow-sm">
                      <ChevronDown className="h-4 w-4" />
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </section>
      )}

      <SourceEvidence projectId={projectId} step="builder" />

      <SectionCard title="Edit roadmap (JSON)">
        <StepEditor
          projectId={projectId}
          step="builder"
          data={spine.project.roadmap}
          expectedUpdatedAt={spine.project.updated_at}
        />
      </SectionCard>
    </div>
  );
}

function JourneyBox({
  label,
  title,
  items,
  fallback,
  accent,
}: {
  label: string;
  title: string;
  items: string[];
  fallback: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-[24px] border px-4 py-4 ${
        accent ? "border-[#D4A843] bg-white/5" : "border-white/10 bg-white/5"
      }`}
    >
      <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-white/55">{label}</div>
      <div className="mt-2 text-sm font-medium text-[#FBF9F4]">{title}</div>
      <div className="mt-3 space-y-2 text-sm leading-6 text-[#FBF9F4]/82">
        {items.length ? (
          items.slice(0, 4).map((item, index) => (
            <div key={`${label}-${index}`} className="rounded-2xl bg-black/10 px-3 py-2">
              {item}
            </div>
          ))
        ) : (
          <div className="rounded-2xl bg-black/10 px-3 py-2">{fallback}</div>
        )}
      </div>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#667085]">{label}</div>
      <div className="mt-1 text-[#0A0F1F]">{value}</div>
    </div>
  );
}

function VersionBadge({ status }: { status: string }) {
  const tones: Record<string, string> = {
    approved: "border-[#c4e6d2] bg-[#e6f5ec] text-[#1f6b3b]",
    published: "border-[#c4e6d2] bg-[#e6f5ec] text-[#1f6b3b]",
    pending: "border-[#f1e3b9] bg-[#fbf3e0] text-[#8a6713]",
    draft: "border-[#E8E1D6] bg-[#FBF9F4] text-[#667085]",
    rejected: "border-[#f3ced5] bg-[#fbe9ec] text-[#a4283c]",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
        tones[status] ?? tones.draft
      }`}
    >
      {humanize(status)}
    </span>
  );
}

function PhaseStatusBadge({ status }: { status: "complete" | "in_progress" | "planned" }) {
  const config = {
    complete: "border-[#c4e6d2] bg-[#e6f5ec] text-[#1f6b3b]",
    in_progress: "border-[#cdd6f3] bg-[#e9eefb] text-[#3E68B2]",
    planned: "border-[#E8E1D6] bg-white text-[#667085]",
  };
  const label = {
    complete: "Complete",
    in_progress: "In Progress",
    planned: "Planned",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${config[status]}`}
    >
      {label[status]}
    </span>
  );
}

function ApprovalBadge({ status }: { status: string }) {
  const config = {
    approved: "border-[#c4e6d2] bg-[#e6f5ec] text-[#1f6b3b]",
    pending: "border-[#f1e3b9] bg-[#fbf3e0] text-[#8a6713]",
    rejected: "border-[#f3ced5] bg-[#fbe9ec] text-[#a4283c]",
  } as const;
  const label = {
    approved: "Approved",
    pending: "Pending Review",
    rejected: "Rejected",
  } as const;

  const tone = config[status as keyof typeof config] ?? config.pending;
  const text = label[status as keyof typeof label] ?? humanize(status);

  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${tone}`}>
      {text}
    </span>
  );
}

function groupMilestones(milestones: SpineMilestone[]) {
  const grouped = new Map<string, SpineMilestone[]>();

  for (const milestone of milestones.sort((a, b) => a.sort_index - b.sort_index)) {
    const phase = humanize(milestone.phase || "unphased");
    const existing = grouped.get(phase) ?? [];
    existing.push(milestone);
    grouped.set(phase, existing);
  }

  return Array.from(grouped.entries()).map(([phase, phaseMilestones]) => ({
    phase,
    milestones: phaseMilestones,
  }));
}

function getPhaseStatus(milestones: SpineMilestone[]): "complete" | "in_progress" | "planned" {
  if (milestones.length > 0 && milestones.every((milestone) => milestone.status === "completed")) {
    return "complete";
  }
  if (milestones.some((milestone) => milestone.status === "in_progress")) {
    return "in_progress";
  }
  return "planned";
}

function summarizePoint(value: unknown): string[] {
  return summarizeMixedValue(value);
}

function summarizeDestination(goal: string | null | undefined, pointB: unknown): string[] {
  const goalLines = goal ? [goal] : [];
  const summary = summarizeMixedValue(pointB);
  return [...goalLines, ...summary].filter(onlyUnique);
}

function summarizeMixedValue(value: unknown): string[] {
  if (!value) return [];
  if (typeof value === "string") return splitText(value);
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => summarizeMixedValue(item))
      .filter(onlyUnique)
      .slice(0, 4);
  }
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, entry]) => {
        const text = flattenValue(entry);
        return text ? `${humanize(key)}: ${text}` : null;
      })
      .filter((entry): entry is string => Boolean(entry))
      .slice(0, 4);
  }
  return [String(value)];
}

function flattenValue(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    const items = value.flatMap((item) => summarizeMixedValue(item));
    return items.length ? items.join(" · ") : null;
  }
  if (typeof value === "object") {
    const items = Object.values(value as Record<string, unknown>)
      .map((item) => flattenValue(item))
      .filter((item): item is string => Boolean(item));
    return items.length ? items.slice(0, 3).join(" · ") : null;
  }
  return null;
}

function splitText(value: string): string[] {
  return value
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 4);
}

function previewText(value: string | null): string | null {
  if (!value) return null;
  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact) return null;
  return compact.length > 150 ? `${compact.slice(0, 147).trim()}...` : compact;
}

function summarizeOwners(tasks: SpineTask[]): string {
  const owners = tasks
    .map((task) => task.owner_email?.trim())
    .filter((owner): owner is string => Boolean(owner));
  if (!owners.length) return "Unassigned";
  return owners.filter(onlyUnique).join(", ");
}

function summarizeDependencies(tasks: SpineTask[]): string {
  const notes = tasks
    .map((task) => task.dependency_notes?.trim())
    .filter((note): note is string => Boolean(note));
  return notes.filter(onlyUnique).join(" · ") || "Prior phase completion";
}

function summarizeTaskProgress(tasks: SpineTask[]): string {
  if (!tasks.length) return "Milestone-only tracking";
  const done = tasks.filter((task) => ["completed", "done"].includes(task.status)).length;
  return `${done}/${tasks.length} tasks complete`;
}

function statusColor(status: string) {
  if (status === "completed") return "#1f6b3b";
  if (status === "in_progress") return "#3E68B2";
  if (status === "blocked") return "#C47A5A";
  return "#E8E1D6";
}

function humanize(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function onlyUnique(value: string, index: number, array: string[]) {
  return array.indexOf(value) === index;
}
