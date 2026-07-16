import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import type { ReactNode } from "react";
import {
  getProjectSpine,
  type EngineProjectStatus,
  type ProjectSpinePayload,
  type SpineModuleSection,
} from "@/lib/engine.functions";
import { EngineStatusBadge, formatDate } from "@/components/engine/primitives";
import { SpineVersionHistory } from "@/components/engine/SpineVersionHistory";
import { SpineReadinessPanel } from "@/components/engine/SpineReadinessPanel";
import {
  Lock,
  ChevronLeft,
  ArrowRight,
  CheckCircle2,
  CircleDashed,
  AlertTriangle,
  Clock,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";


export const Route = createFileRoute("/engine/projects/$projectId/spine")({
  component: ProjectSpine,
});

const KNOWN_ENGINE_STATUS = new Set([
  "active",
  "draft",
  "needs_review",
  "approved",
  "delivered",
  "in_execution",
  "blocked",
  "archived",
]);

function ProjectSpine() {
  const { projectId } = Route.useParams();
  const spineFn = useServerFn(getProjectSpine);
  const spineQ = useQuery({
    queryKey: ["engine", "spine", projectId],
    queryFn: () => spineFn({ data: { id: projectId } }),
    staleTime: 60_000,
  });

  if (spineQ.isPending) {
    return <SpineLoading />;
  }

  if (spineQ.isError || !spineQ.data) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-900">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-red-700/70">
          Spine unavailable
        </div>
        <p className="mt-2">
          {(spineQ.error as Error | null)?.message ??
            "The protected project spine could not be loaded."}
        </p>
      </div>
    );
  }

  const spine = spineQ.data as ProjectSpinePayload;
  const pointA = asRecord(spine.project.point_a);
  const pointB = asRecord(spine.project.point_b);
  const scopeItems = collectScope(spine.version?.payload);
  const groupedMilestones = groupMilestones(spine.milestones);
  const sourceTotal = Math.max(spine.sources.total, 1);

  return (
    <div className="space-y-8 text-[#0A0F1F]">
      {/* Header */}
      <header className="space-y-3">
        <Link
          to="/engine/projects/$projectId/overview"
          params={{ projectId }}
          className="inline-flex items-center gap-2 text-sm text-[#3E68B2] transition hover:text-[#284f93]"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to Overview
        </Link>
        <div className="space-y-2">
          <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-[#667085]">
            Project Spine · Approved Truth
          </div>
          <h1 className="font-display text-3xl text-[#0A0F1F]">{spine.project.name}</h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-[#667085]">
            <span>{spine.project.client_company || "No client company"}</span>
            <span>·</span>
            <ProjectStatusBadge status={spine.project.status} />
            <span>·</span>
            <span>Last updated {formatDateTime(spine.project.updated_at)}</span>
          </div>
        </div>
      </header>

      {/* 1. Next Best Action — hero */}
      <NextBestActionCard nba={spine.nba} projectId={projectId} />

      {/* 2. Point A / Point B */}
      <section aria-labelledby="spine-truth-heading" className="space-y-3">
        <SectionHeading id="spine-truth-heading" eyebrow="Approved Truth" title="Point A · Point B" />
        <div className="grid gap-4 lg:grid-cols-2">
          <TruthCard
            label="POINT A — WHERE WE ARE"
            sections={extractNamedSections(pointA, [
              "current_state",
              "challenges",
              "summary",
              "description",
            ])}
            emptyLabel="Not yet defined."
            footer={
              hasMeaningfulValue(spine.project.point_a) ? (
                <div className="inline-flex items-center gap-2 text-xs text-[#667085]">
                  <Lock className="h-3.5 w-3.5" />
                  Approved truth — locked
                </div>
              ) : null
            }
          />
          <TruthCard
            label="POINT B — WHERE WE'RE GOING"
            sections={extractNamedSections(pointB, [
              "destination",
              "goal",
              "vision",
              "frame",
              "success_looks_like",
            ])}
            emptyLabel="Destination not yet approved."
            footer={
              <div className="flex flex-wrap gap-2">
                {spine.project.frame ? <MetaChip label="Frame" value={spine.project.frame} /> : null}
                {spine.project.goal ? <MetaChip label="Goal" value={spine.project.goal} /> : null}
              </div>
            }
          />
        </div>
      </section>

      {/* 3. Roadmap summary */}
      <section aria-labelledby="spine-roadmap-heading" className="space-y-3">
        <SectionHeading
          id="spine-roadmap-heading"
          eyebrow="Roadmap"
          title="Latest approved roadmap"
          action={
            <Link
              to="/engine/projects/$projectId/roadmap"
              params={{ projectId }}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#3E68B2] hover:text-[#284f93]"
            >
              Open roadmap
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          }
        />
        <RoadmapSummaryCard
          version={spine.version}
          milestones={spine.milestones}
          groupedMilestones={groupedMilestones}
          scopeItems={scopeItems}
        />
      </section>

      {/* 4. Milestone / module readiness */}
      <section aria-labelledby="spine-readiness-modules-heading" className="space-y-3">
        <SectionHeading
          id="spine-readiness-modules-heading"
          eyebrow="Readiness"
          title="Milestone & module readiness"
        />
        <ModuleReadinessGrid modules={spine.modules} />
      </section>

      {/* 5. Approvals */}
      <section aria-labelledby="spine-approvals-heading" className="space-y-3">
        <SectionHeading
          id="spine-approvals-heading"
          eyebrow="Approvals"
          title="Pending decisions & operator notifications"
        />
        <div className="grid gap-4 lg:grid-cols-2">
          <ApprovalsCard reviews={spine.reviews} />
          <NotificationsCard notifications={spine.notifications} />
        </div>
      </section>

      {/* 6. Evidence & History (collapsed) */}
      <section aria-labelledby="spine-evidence-heading" className="space-y-3">
        <SectionHeading
          id="spine-evidence-heading"
          eyebrow="Reference"
          title="Evidence & history"
        />
        <CollapsedBlock title="Sources & portal publish" subtitle={`${spine.sources.processed}/${spine.sources.total} processed`}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-[#E8E1D6] bg-white p-4">
              <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#667085]">
                Sources summary
              </div>
              <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
                <Stat label="Total" value={spine.sources.total} />
                <Stat label="Processed" value={spine.sources.processed} tone="approved" />
                <Stat label="Failed" value={spine.sources.failed} tone="blocked" />
              </div>
              <div className="mt-4 space-y-3">
                <ProgressRow label="Processed" value={spine.sources.processed} max={sourceTotal} color="bg-[#1f6b3b]" />
                <ProgressRow label="Queued" value={spine.sources.queued} max={sourceTotal} color="bg-[#8a6713]" />
                <ProgressRow label="Failed" value={spine.sources.failed} max={sourceTotal} color="bg-[#a4283c]" />
              </div>
              <div className="mt-3 text-xs text-[#667085]">
                Last run{" "}
                {spine.sources.last_run
                  ? `${humanize(spine.sources.last_run.status)} · ${formatDateTime(
                      spine.sources.last_run.finished_at ?? spine.sources.last_run.started_at,
                    )}`
                  : "not available"}
              </div>
            </div>
            <div className="rounded-xl border border-[#E8E1D6] bg-white p-4">
              <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#667085]">
                Portal publish
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="text-sm text-[#0A0F1F]">
                  {spine.portal_publish ? humanize(spine.portal_publish.status) : "Not published"}
                </div>
                <GenericBadge tone={toneForStatus(spine.portal_publish?.status ?? "not_published")}>
                  {humanize(spine.portal_publish?.status ?? "not_published")}
                </GenericBadge>
              </div>
              <div className="mt-2 text-xs text-[#667085]">
                {spine.portal_publish?.published_at
                  ? `Published ${formatDateTime(spine.portal_publish.published_at)}`
                  : "No publish timestamp recorded."}
              </div>
            </div>
          </div>
        </CollapsedBlock>

        <CollapsedBlock title="Recent activity" subtitle={`${spine.activity.length} events`}>
          <ListCard
            title="Activity"
            items={spine.activity.slice(0, 15).map((item) => ({
              id: item.id,
              title: item.title,
              meta: `${humanize(item.kind)} · ${formatDateTime(item.created_at)}`,
              body: item.body,
            }))}
            empty="No recent activity."
          />
        </CollapsedBlock>

        <CollapsedBlock title="Audit trail" subtitle={`${spine.audit.length} entries`}>
          <ListCard
            title="Audit"
            items={spine.audit.slice(0, 15).map((item) => ({
              id: item.id,
              title: humanize(item.action),
              meta: `${item.actor_email ?? "system"} · ${formatDateTime(item.created_at)}`,
              body: item.summary,
            }))}
            empty="No audit entries."
          />
        </CollapsedBlock>

        <CollapsedBlock
          title="Task ledger"
          subtitle={`${spine.tasks.length} task${spine.tasks.length === 1 ? "" : "s"}`}
        >
          {spine.tasks.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#E8E1D6] text-[#667085]">
                    <th className="py-2 pr-4 font-mono text-[10px] uppercase tracking-[0.22em]">Name</th>
                    <th className="py-2 pr-4 font-mono text-[10px] uppercase tracking-[0.22em]">Phase</th>
                    <th className="py-2 pr-4 font-mono text-[10px] uppercase tracking-[0.22em]">Status</th>
                    <th className="py-2 pr-4 font-mono text-[10px] uppercase tracking-[0.22em]">Owner</th>
                    <th className="py-2 font-mono text-[10px] uppercase tracking-[0.22em]">Due Date</th>
                  </tr>
                </thead>
                <tbody>
                  {spine.tasks.map((task) => (
                    <tr key={task.id} className="border-b border-[#F3EEE6] align-top">
                      <td className="py-3 pr-4 text-[#0A0F1F]">{task.name}</td>
                      <td className="py-3 pr-4 text-[#667085]">{task.phase ? humanize(task.phase) : "—"}</td>
                      <td className="py-3 pr-4">
                        <GenericBadge tone={toneForStatus(task.status)}>{humanize(task.status)}</GenericBadge>
                      </td>
                      <td className="py-3 pr-4 text-[#667085]">{task.owner_email || "—"}</td>
                      <td className="py-3 text-[#667085]">{task.due_date ? formatDate(task.due_date) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-[#667085]">No tasks have been approved into the spine.</p>
          )}
        </CollapsedBlock>

        <CollapsedBlock title="Version history" subtitle="Approved roadmap versions">
          <SpineVersionHistory projectId={projectId} currentVersionLabel={spine.version?.label ?? null} />
        </CollapsedBlock>

        <CollapsedBlock title="Readiness contract" subtitle="14 canonical checks (advisory)">
          <SpineReadinessPanel />
        </CollapsedBlock>
      </section>
    </div>
  );
}

/* ─────────────────────────── Layout primitives ─────────────────────────── */

function SectionHeading({
  id,
  eyebrow,
  title,
  action,
}: {
  id: string;
  eyebrow: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-[#667085]">
          {eyebrow}
        </div>
        <h2 id={id} className="mt-1 font-display text-xl text-[#0A0F1F]">
          {title}
        </h2>
      </div>
      {action}
    </div>
  );
}

function NextBestActionCard({
  nba,
  projectId: _projectId,
}: {
  nba: ProjectSpinePayload["nba"];
  projectId: string;
}) {
  const tone = nba.severity ?? "info";
  const toneClasses: Record<"critical" | "warning" | "info", string> = {
    critical: "border-[#f3ced5] bg-gradient-to-br from-[#fbe9ec] to-white",
    warning: "border-[#f1e3b9] bg-gradient-to-br from-[#fbf3e0] to-white",
    info: "border-[#cdd6f3] bg-gradient-to-br from-[#e9eefb] to-white",
  };
  const icon =
    tone === "critical" ? (
      <AlertTriangle className="h-5 w-5 text-[#a4283c]" />
    ) : tone === "warning" ? (
      <Clock className="h-5 w-5 text-[#8a6713]" />
    ) : (
      <Sparkles className="h-5 w-5 text-[#3E68B2]" />
    );


  return (
    <section
      aria-labelledby="spine-nba-heading"
      className={cn(
        "rounded-2xl border p-6 shadow-sm",
        toneClasses[tone] ?? toneClasses.info,
      )}
    >
      <div className="flex items-start justify-between gap-6">
        <div className="flex items-start gap-4 min-w-0">
          <div className="mt-1 rounded-full border border-white bg-white/70 p-2 shadow-sm">
            {icon}
          </div>
          <div className="min-w-0 space-y-2">
            <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-[#667085]">
              Next Best Action
            </div>
            <h2 id="spine-nba-heading" className="font-display text-2xl leading-tight text-[#0A0F1F]">
              {nba.action}
            </h2>
            {nba.reason ? (
              <p className="text-sm leading-6 text-[#3f4a5e]">{nba.reason}</p>
            ) : null}
          </div>
        </div>
        {nba.href ? (
          <a
            href={nba.href}
            className="inline-flex shrink-0 items-center gap-2 rounded-full bg-[#0A0F1F] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#1c2440]"
          >
            Take action
            <ArrowRight className="h-4 w-4" />
          </a>
        ) : null}
      </div>
    </section>
  );
}

function RoadmapSummaryCard({
  version,
  milestones,
  groupedMilestones,
  scopeItems,
}: {
  version: ProjectSpinePayload["version"];
  milestones: ProjectSpinePayload["milestones"];
  groupedMilestones: Array<[string, ProjectSpinePayload["milestones"]]>;
  scopeItems: string[];
}) {
  const approvedCount = milestones.filter((m) => m.approval_status === "approved").length;
  const totalMilestones = milestones.length;
  const progressPct = totalMilestones
    ? Math.round((approvedCount / totalMilestones) * 100)
    : 0;

  return (
    <div className="rounded-2xl border border-[#E8E1D6] bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#667085]">
            Latest version
          </div>
          <div className="mt-1 text-lg font-medium text-[#0A0F1F]">
            {version?.label || "No approved version"}
          </div>
          <div className="mt-1 text-xs text-[#667085]">
            {version
              ? `Created ${formatDateTime(version.created_at)}${
                  version.approved_at ? ` · Approved ${formatDateTime(version.approved_at)}` : ""
                }`
              : "No roadmap version approved yet."}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          {version ? (
            <GenericBadge tone={toneForStatus(version.status)}>
              {humanize(version.status)}
            </GenericBadge>
          ) : null}
          <div className="text-xs text-[#667085]">
            {approvedCount}/{totalMilestones} milestones approved
          </div>
        </div>
      </div>

      <div className="mt-4">
        <div className="h-2 rounded-full bg-[#F3EEE6]">
          <div className="h-2 rounded-full bg-[#1f6b3b]" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      {groupedMilestones.length ? (
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {groupedMilestones.map(([phase, list]) => (
            <div key={phase} className="rounded-xl border border-[#E8E1D6] bg-[#FBF9F4] p-3">
              <div className="text-xs font-medium uppercase tracking-[0.18em] text-[#667085]">
                {phase}
              </div>
              <ul className="mt-2 space-y-2 text-sm text-[#0A0F1F]">
                {list.slice(0, 5).map((m) => (
                  <li key={m.id} className="flex items-start justify-between gap-3">
                    <span className="truncate">{m.name}</span>
                    <GenericBadge tone={toneForApproval(m.approval_status)}>
                      {humanize(m.approval_status)}
                    </GenericBadge>
                  </li>
                ))}
                {list.length > 5 ? (
                  <li className="text-xs text-[#667085]">+{list.length - 5} more</li>
                ) : null}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-[#667085]">No milestones captured yet.</p>
      )}

      {scopeItems.length ? (
        <div className="mt-5 rounded-xl border border-[#E8E1D6] bg-[#FBF9F4] p-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#667085]">
            Approved scope
          </div>
          <ul className="mt-2 space-y-1 text-sm text-[#0A0F1F]">
            {scopeItems.slice(0, 6).map((s, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-[#3E68B2]">•</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function ModuleReadinessGrid({ modules }: { modules: SpineModuleSection[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {modules.map((m) => (
        <ModuleReadinessTile key={m.key} module={m} />
      ))}
    </div>
  );
}

function ModuleReadinessTile({ module: m }: { module: SpineModuleSection }) {
  const { has_data, approved, ready, approval_state } = m.readiness;
  const state: "ready" | "approved-no-data" | "review" | "draft" | "missing" = ready
    ? "ready"
    : approved && !has_data
      ? "approved-no-data"
      : approval_state === "review"
        ? "review"
        : has_data
          ? "draft"
          : "missing";

  const iconMap = {
    ready: <CheckCircle2 className="h-4 w-4 text-[#1f6b3b]" />,
    "approved-no-data": <AlertTriangle className="h-4 w-4 text-[#8a6713]" />,
    review: <Clock className="h-4 w-4 text-[#8a6713]" />,
    draft: <CircleDashed className="h-4 w-4 text-[#3E68B2]" />,
    missing: <CircleDashed className="h-4 w-4 text-[#667085]" />,
  };
  const labelMap = {
    ready: "Approved",
    "approved-no-data": "Approved · empty",
    review: "In review",
    draft: "Draft",
    missing: "Not started",
  };
  const toneMap: Record<string, "approved" | "pending" | "info" | "neutral"> = {
    ready: "approved",
    "approved-no-data": "pending",
    review: "pending",
    draft: "info",
    missing: "neutral",
  };

  return (
    <a
      href={m.deep_link}
      className={cn(
        "group rounded-xl border p-4 shadow-sm transition hover:shadow-md",
        state === "ready"
          ? "border-[#c4e6d2] bg-[#f4faf6]"
          : "border-[#E8E1D6] bg-white hover:border-[#3E68B2]/40",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {iconMap[state]}
          <div className="text-sm font-medium text-[#0A0F1F]">{m.label}</div>
        </div>
        <GenericBadge tone={toneMap[state]}>{labelMap[state]}</GenericBadge>
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-[#667085]">
        <span>{m.derived ? "Derived" : "Module"}</span>
        <span className="inline-flex items-center gap-1 text-[#3E68B2] opacity-0 transition group-hover:opacity-100">
          Open <ArrowRight className="h-3 w-3" />
        </span>
      </div>
    </a>
  );
}

function ApprovalsCard({ reviews }: { reviews: ProjectSpinePayload["reviews"] }) {
  return (
    <div className="rounded-2xl border border-[#E8E1D6] bg-white p-5 shadow-sm">
      <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#667085]">
        Pending reviews
      </div>
      {reviews.length ? (
        <div className="mt-3 space-y-3">
          {reviews.slice(0, 6).map((review) => (
            <div key={review.id} className="rounded-lg border border-[#E8E1D6] p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-[#0A0F1F]">{review.title}</div>
                  <div className="mt-1 text-xs text-[#667085]">
                    {humanize(review.item_type)} · {formatDateTime(review.created_at)}
                  </div>
                </div>
                <GenericBadge tone={toneForImpact(review.impact)}>
                  {humanize(review.impact)}
                </GenericBadge>
              </div>
            </div>
          ))}
          {reviews.length > 6 ? (
            <div className="text-xs text-[#667085]">+{reviews.length - 6} more pending</div>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-sm text-[#667085]">No pending review items.</p>
      )}
    </div>
  );
}

function NotificationsCard({
  notifications,
}: {
  notifications: ProjectSpinePayload["notifications"];
}) {
  return (
    <div className="rounded-2xl border border-[#E8E1D6] bg-white p-5 shadow-sm">
      <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#667085]">
        Operator notifications
      </div>
      {notifications.length ? (
        <div className="mt-3 space-y-3">
          {notifications.slice(0, 6).map((n) => (
            <div key={n.id} className="rounded-lg border border-[#F3EEE6] p-3">
              <div className="text-sm font-medium text-[#0A0F1F]">{n.title}</div>
              {n.body ? <div className="mt-1 text-xs text-[#667085]">{n.body}</div> : null}
              <div className="mt-2 flex items-center justify-between text-xs text-[#667085]">
                <span>
                  {humanize(n.kind)} · {formatDateTime(n.created_at)}
                </span>
                {n.href ? (
                  <a
                    href={n.href}
                    className="inline-flex items-center gap-1 text-[#3E68B2] hover:text-[#284f93]"
                  >
                    Open <ArrowRight className="h-3 w-3" />
                  </a>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-[#667085]">No operator notifications.</p>
      )}
    </div>
  );
}

function CollapsedBlock({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <details className="group rounded-2xl border border-[#E8E1D6] bg-white shadow-sm">
      <summary className="cursor-pointer list-none px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-display text-base text-[#0A0F1F]">{title}</div>
            {subtitle ? (
              <div className="mt-0.5 text-xs text-[#667085]">{subtitle}</div>
            ) : null}
          </div>
          <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-[#667085] transition group-open:text-[#3E68B2]">
            <span className="group-open:hidden">Expand</span>
            <span className="hidden group-open:inline">Collapse</span>
          </div>
        </div>
      </summary>
      <div className="border-t border-[#E8E1D6] px-5 py-4">{children}</div>
    </details>
  );
}


function SpineLoading() {
  return (
    <div className="space-y-6">
      <div className="h-6 w-36 animate-pulse rounded bg-[#E8E1D6]" />
      <div className="h-10 w-80 animate-pulse rounded bg-[#E8E1D6]" />
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <div
            key={index}
            className="rounded-xl border border-[#E8E1D6] bg-[#FBF9F4] p-5 shadow-sm"
          >
            <div className="h-3 w-40 animate-pulse rounded bg-[#E8E1D6]" />
            <div className="mt-4 h-16 animate-pulse rounded bg-white" />
          </div>
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="rounded-2xl border border-[#E8E1D6] bg-white p-5 shadow-sm">
            <div className="h-5 w-40 animate-pulse rounded bg-[#E8E1D6]" />
            <div className="mt-4 space-y-3">
              <div className="h-16 animate-pulse rounded bg-[#FBF9F4]" />
              <div className="h-16 animate-pulse rounded bg-[#FBF9F4]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TruthCard({
  label,
  sections,
  emptyLabel,
  footer,
}: {
  label: string;
  sections: Array<{ key: string; label: string; value: string }>;
  emptyLabel: string;
  footer?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[#E8E1D6] bg-[#FBF9F4] p-5 shadow-sm">
      <div className="font-mono text-[10px] uppercase tracking-widest text-[#667085]">{label}</div>
      <div className="mt-4 space-y-4">
        {sections.length ? (
          sections.map((section) => (
            <div key={section.key} className="space-y-1">
              <div className="text-xs uppercase tracking-[0.18em] text-[#667085]">
                {section.label}
              </div>
              <p className="text-sm leading-6 text-[#0A0F1F]">{section.value}</p>
            </div>
          ))
        ) : (
          <p className="text-sm text-[#667085]">{emptyLabel}</p>
        )}
      </div>
      {footer ? <div className="mt-5 border-t border-[#E8E1D6] pt-4">{footer}</div> : null}
    </div>
  );
}

function ColumnCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-[#E8E1D6] bg-white p-5 shadow-sm">
      <div className="font-display text-xl text-[#0A0F1F]">{title}</div>
      <div className="mt-4 space-y-4">{children}</div>
    </div>
  );
}

function FoundationSection({
  title,
  items,
  empty,
}: {
  title: string;
  items: string[];
  empty: string;
}) {
  return (
    <div className="rounded-xl border border-[#E8E1D6] bg-[#FBF9F4] p-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#667085]">
        {title}
      </div>
      {items.length ? (
        <ul className="mt-3 space-y-2 text-sm leading-6 text-[#0A0F1F]">
          {items.map((item, index) => (
            <li key={`${title}-${index}`} className="flex gap-2">
              <span className="text-[#3E68B2]">•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-[#667085]">{empty}</p>
      )}
    </div>
  );
}

function ListCard({
  title,
  items,
  empty,
}: {
  title: string;
  items: Array<{ id: string; title: string; meta: string; body: string | null }>;
  empty: string;
}) {
  return (
    <div className="rounded-xl border border-[#E8E1D6] bg-white p-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#667085]">
        {title}
      </div>
      {items.length ? (
        <div className="mt-3 space-y-3">
          {items.map((item) => (
            <div key={item.id} className="rounded-lg border border-[#F3EEE6] p-3">
              <div className="text-sm font-medium text-[#0A0F1F]">{item.title}</div>
              {item.body ? <div className="mt-1 text-xs text-[#667085]">{item.body}</div> : null}
              <div className="mt-2 text-xs text-[#667085]">{item.meta}</div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-[#667085]">{empty}</p>
      )}
    </div>
  );
}

function MetaChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[#E8E1D6] bg-white px-3 py-1 text-xs text-[#667085]">
      <span className="uppercase tracking-[0.18em]">{label}</span>
      <span className="text-[#0A0F1F]">{value}</span>
    </span>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "approved" | "blocked";
}) {
  return (
    <div className="rounded-lg border border-[#E8E1D6] bg-[#FBF9F4] p-3">
      <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#667085]">
        {label}
      </div>
      <div
        className={cn("mt-2 text-2xl font-display text-[#0A0F1F]", {
          "text-[#1f6b3b]": tone === "approved",
          "text-[#a4283c]": tone === "blocked",
        })}
      >
        {value}
      </div>
    </div>
  );
}

function ProgressRow({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  const width = `${Math.min(100, Math.round((value / max) * 100))}%`;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-[#667085]">
        <span>{label}</span>
        <span>
          {value}/{max}
        </span>
      </div>
      <div className="h-2 rounded-full bg-[#F3EEE6]">
        <div className={cn("h-2 rounded-full", color)} style={{ width }} />
      </div>
    </div>
  );
}

function ProjectStatusBadge({ status }: { status: string }) {
  if (KNOWN_ENGINE_STATUS.has(status)) {
    return <EngineStatusBadge status={status as EngineProjectStatus} />;
  }

  return <GenericBadge tone={toneForStatus(status)}>{humanize(status)}</GenericBadge>;
}

function GenericBadge({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "neutral" | "approved" | "pending" | "blocked" | "info";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap",
        {
          "border-[#E8E1D6] bg-[#FBF9F4] text-[#667085]": tone === "neutral",
          "border-[#c4e6d2] bg-[#e6f5ec] text-[#1f6b3b]": tone === "approved",
          "border-[#f1e3b9] bg-[#fbf3e0] text-[#8a6713]": tone === "pending",
          "border-[#f3ced5] bg-[#fbe9ec] text-[#a4283c]": tone === "blocked",
          "border-[#cdd6f3] bg-[#e9eefb] text-[#3E68B2]": tone === "info",
        },
      )}
    >
      {children}
    </span>
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function hasMeaningfulValue(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length > 0;
  return true;
}

function extractNamedSections(
  record: Record<string, unknown> | null,
  keys: string[],
): Array<{ key: string; label: string; value: string }> {
  if (!record) return [];

  return keys
    .map((key) => {
      const value = stringifyValue(record[key]);
      return value
        ? {
            key,
            label: humanize(key),
            value,
          }
        : null;
    })
    .filter((item): item is { key: string; label: string; value: string } => Boolean(item));
}

function buildBusinessContext(
  pointA: Record<string, unknown> | null,
  pointB: Record<string, unknown> | null,
): string[] {
  const sections = [
    ...extractNamedSections(pointA, ["summary", "description", "current_state", "challenges"]),
    ...extractNamedSections(pointB, ["vision", "destination", "goal"]),
  ];
  const seen = new Set<string>();

  return sections
    .map((section) => section.value)
    .filter((value) => {
      if (seen.has(value)) return false;
      seen.add(value);
      return true;
    });
}

function collectScope(value: unknown): string[] {
  const record = asRecord(value);
  if (!record) return [];

  return [
    ...extractValueList(record.scope),
    ...extractValueList(record.included),
    ...extractValueList(record.in_scope),
    ...extractValueList(record.scope_included),
  ].filter(onlyUnique);
}

function extractValueList(value: unknown): string[] {
  if (value == null) return [];

  if (typeof value === "string") {
    return value.trim() ? [value.trim()] : [];
  }

  if (Array.isArray(value)) {
    return value
      .flatMap((item) => {
        if (typeof item === "string") return item.trim() ? [item.trim()] : [];
        if (typeof item === "number" || typeof item === "boolean") return [String(item)];
        if (item && typeof item === "object") {
          const record = item as Record<string, unknown>;
          return [
            stringifyValue(record.label),
            stringifyValue(record.title),
            stringifyValue(record.name),
            stringifyValue(record.text),
            compactObjectSummary(record),
          ].filter((entry): entry is string => Boolean(entry));
        }
        return [];
      })
      .filter(onlyUnique);
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const ordered = ["summary", "description", "value", "target", "name", "title", "text"];
    const textValues = ordered
      .map((key) => stringifyValue(record[key]))
      .filter((entry): entry is string => Boolean(entry));

    if (textValues.length) return textValues.filter(onlyUnique);

    return Object.entries(record)
      .map(([key, entry]) => {
        const text = stringifyValue(entry);
        return text ? `${humanize(key)}: ${text}` : null;
      })
      .filter((entry): entry is string => Boolean(entry));
  }

  return [String(value)];
}

function compactObjectSummary(record: Record<string, unknown>): string | null {
  const parts = Object.entries(record)
    .map(([key, value]) => {
      const text = stringifyValue(value);
      return text ? `${humanize(key)}: ${text}` : null;
    })
    .filter((entry): entry is string => Boolean(entry))
    .slice(0, 3);

  return parts.length ? parts.join(" · ") : null;
}

function stringifyValue(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    const list = extractValueList(value);
    return list.length ? list.join(" · ") : null;
  }
  if (typeof value === "object") {
    return compactObjectSummary(value as Record<string, unknown>);
  }
  return null;
}

function groupMilestones(milestones: ProjectSpinePayload["milestones"]) {
  const grouped = new Map<string, ProjectSpinePayload["milestones"]>();

  for (const milestone of milestones) {
    const phase = milestone.phase ? humanize(milestone.phase) : "Unphased";
    const existing = grouped.get(phase) ?? [];
    existing.push(milestone);
    existing.sort((a, b) => a.sort_index - b.sort_index);
    grouped.set(phase, existing);
  }

  return Array.from(grouped.entries());
}

function toneForStatus(status: string): "neutral" | "approved" | "pending" | "blocked" | "info" {
  if (
    ["approved", "active", "processed", "published", "delivered", "completed", "done"].includes(
      status,
    )
  ) {
    return "approved";
  }
  if (
    [
      "pending",
      "queued",
      "draft",
      "needs_review",
      "processing",
      "running",
      "suggested",
      "not_published",
    ].includes(status)
  ) {
    return "pending";
  }
  if (["blocked", "failed", "critical", "rejected"].includes(status)) {
    return "blocked";
  }
  if (["in_execution", "info"].includes(status)) {
    return "info";
  }
  return "neutral";
}

function toneForApproval(status: string): "neutral" | "approved" | "pending" | "blocked" | "info" {
  if (status === "approved") return "approved";
  if (["pending", "needs_review"].includes(status)) return "pending";
  if (["rejected", "blocked"].includes(status)) return "blocked";
  return "neutral";
}

function toneForImpact(impact: string): "neutral" | "approved" | "pending" | "blocked" | "info" {
  if (impact === "high") return "blocked";
  if (impact === "medium") return "pending";
  if (impact === "low") return "info";
  return "neutral";
}

function humanize(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function onlyUnique(value: string, index: number, array: string[]) {
  return array.indexOf(value) === index;
}
