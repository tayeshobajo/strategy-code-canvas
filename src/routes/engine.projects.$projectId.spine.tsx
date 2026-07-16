import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState, useEffect, useRef, type ReactNode } from "react";
import {
  getProjectSpine,
  getProjectWorkspace,
  type EngineProjectStatus,
  type ProjectSpinePayload,
  type SpineModuleSection,
  type SpineModuleKey,
} from "@/lib/engine.functions";
import { exportClientRoadmapPdf } from "@/lib/roadmap-pdf";
import type { WorkspaceProject } from "@/lib/engine-workspace";
import {
  approveMilestone,
  rejectMilestone,
  listMilestoneApprovalHistory,
} from "@/lib/engine-execution.functions";
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
  Search,
  Download,
  Check,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/hooks/use-workspace";
import { useSourceInspector } from "@/hooks/use-source-inspector";
import jsPDF from "jspdf";


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

type ModuleReadinessFilter = "all" | "ready" | "review" | "draft" | "missing";
type ModuleCategoryFilter = "all" | "direct" | "derived";
type ModuleSort = "label" | "readiness";

function ProjectSpine() {
  const { projectId } = Route.useParams();
  const spineFn = useServerFn(getProjectSpine);
  const historyFn = useServerFn(listMilestoneApprovalHistory);
  const approveFn = useServerFn(approveMilestone);
  const rejectFn = useServerFn(rejectMilestone);
  const queryClient = useQueryClient();

  const spineQ = useQuery({
    queryKey: ["engine", "spine", projectId],
    queryFn: () => spineFn({ data: { id: projectId } }),
    staleTime: 60_000,
  });
  const historyQ = useQuery({
    queryKey: ["engine", "spine-approval-history", projectId],
    queryFn: () => historyFn({ data: { project_id: projectId } }),
    staleTime: 30_000,
    enabled: !!spineQ.data,
  });

  const [moduleFilter, setModuleFilter] = useState<ModuleReadinessFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<ModuleCategoryFilter>("all");
  const [moduleSort, setModuleSort] = useState<ModuleSort>("readiness");
  const [evidenceSearch, setEvidenceSearch] = useState("");
  const [approvalError, setApprovalError] = useState<string | null>(null);

  const approveMut = useMutation({
    mutationFn: (id: string) => approveFn({ data: { id } }),
    onSuccess: async () => {
      setApprovalError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["engine", "spine", projectId] }),
        queryClient.invalidateQueries({
          queryKey: ["engine", "spine-approval-history", projectId],
        }),
      ]);
    },
    onError: (e: unknown) => setApprovalError((e as Error)?.message ?? "Approval failed"),
  });
  const rejectMut = useMutation({
    mutationFn: (id: string) => rejectFn({ data: { id } }),
    onSuccess: async () => {
      setApprovalError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["engine", "spine", projectId] }),
        queryClient.invalidateQueries({
          queryKey: ["engine", "spine-approval-history", projectId],
        }),
      ]);
    },
    onError: (e: unknown) => setApprovalError((e as Error)?.message ?? "Rejection failed"),
  });

  if (spineQ.isPending) {
    return <SpineLoading />;
  }

  if (spineQ.isError || !spineQ.data) {
    return (
      <ErrorBanner
        title="Spine unavailable"
        message={
          (spineQ.error as Error | null)?.message ??
          "The protected project spine could not be loaded."
        }
        onRetry={() => spineQ.refetch()}
      />
    );
  }

  const spine = spineQ.data as ProjectSpinePayload;
  const pointA = asRecord(spine.project.point_a);
  const pointB = asRecord(spine.project.point_b);
  const scopeItems = collectScope(spine.version?.payload);
  const groupedMilestones = groupMilestones(spine.milestones);
  const sourceTotal = Math.max(spine.sources.total, 1);
  const historyRows = historyQ.data ?? [];
  const pendingMilestoneId =
    approveMut.isPending
      ? (approveMut.variables as string | undefined) ?? null
      : rejectMut.isPending
        ? (rejectMut.variables as string | undefined) ?? null
        : null;

  const pendingApprovalsCount = spine.reviews.length;
  const approvedMilestoneCount = spine.milestones.filter(
    (m) => m.approval_status === "approved",
  ).length;
  const blockedItemsCount =
    spine.milestones.filter((m) => m.status === "blocked" || m.approval_status === "rejected")
      .length +
    spine.activity.filter((a) => a.severity === "critical").length;
  const nextMilestone = [...spine.milestones]
    .filter((m) => m.due_date)
    .sort(
      (a, b) => new Date(a.due_date as string).getTime() - new Date(b.due_date as string).getTime(),
    )[0];

  const variant = deriveSpineVariant(
    hasMeaningfulValue(spine.project.point_a),
    hasMeaningfulValue(spine.project.point_b),
    spine.milestones,
    spine.portal_publish,
  );

  return (
    <div className="space-y-6 text-[#0A0F1F]">
      {/* ───── Header row ───── */}
      <SpinePageHeader
        projectId={projectId}
        projectName={spine.project.name}
        status={spine.project.status}
        pendingApprovalsCount={pendingApprovalsCount}
        onExportPdf={() => exportSpinePdf(spine, historyRows)}
      />

      {/* ───── Variant banner (Incomplete / Active / Client-Ready) ───── */}
      <SpineVariantBanner variant={variant} projectId={projectId} spine={spine} />

      {approvalError ? (
        <ErrorBanner
          title="Approval action failed"
          message={approvalError}
          onDismiss={() => setApprovalError(null)}
        />
      ) : null}

      {variant === "active" ? (<>
      {/* ───── Hero row: NBA + Snapshot ───── */}
      <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <HeroNextBestActionCard
          nba={spine.nba}
          nextMilestone={nextMilestone ?? null}
          projectId={projectId}
        />
        <ProjectSnapshotCard
          project={spine.project}
          version={spine.version}
          pendingApprovals={pendingApprovalsCount}
          blockedItems={blockedItemsCount}
          approvedMilestones={approvedMilestoneCount}
          totalMilestones={spine.milestones.length}
          nextMilestoneDue={nextMilestone?.due_date ?? null}
          healthScore={spine.project.health_score}
          ownerEmail={spine.project.client_owner_email}
        />
      </div>

      {/* ───── Truth row: Point A / Point B ───── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <TruthCardV2
          point="A"
          projectId={projectId}
          approvedFlag={hasMeaningfulValue(spine.project.point_a)}
          bullets={collectTruthBullets(pointA, ["current_state", "challenges", "summary", "description"])}
          sourceCount={spine.sources.total}
          approvedAt={spine.version?.approved_at ?? null}
          inspectorKey="point_a"
          inspectorLabel="Point A — Current Reality"
        />
        <TruthCardV2
          point="B"
          projectId={projectId}
          approvedFlag={hasMeaningfulValue(spine.project.point_b)}
          bullets={collectTruthBullets(pointB, ["destination", "goal", "vision", "success_looks_like", "frame"])}
          sourceCount={spine.sources.total}
          approvedAt={spine.version?.approved_at ?? null}
          inspectorKey="point_b"
          inspectorLabel="Point B — Desired Future"
        />
      </div>

      {/* ───── Milestone Readiness matrix ───── */}
      <MilestoneReadinessMatrix
        projectId={projectId}
        milestones={spine.milestones}
      />

      {/* ───── Lower row: Approvals + Foundation + Captain Brief ───── */}
      <div className="grid gap-4 xl:grid-cols-3">
        <ApprovalsInlineCard reviews={spine.reviews} />
        <ProjectFoundationCard
          projectId={projectId}
          modules={spine.modules}
          pointA={pointA}
          pointB={pointB}
          milestones={spine.milestones}
        />
        <CaptainBriefCard
          nba={spine.nba}
          latestActivity={spine.activity[0] ?? null}
          version={spine.version}
        />
      </div>

      {/* ───── Footer stats bar ───── */}
      <FooterStatsBar
        sourcesProcessed={spine.sources.processed}
        sourcesTotal={spine.sources.total}
        lastRunAt={spine.sources.last_run?.finished_at ?? spine.sources.last_run?.started_at ?? null}
        projectCreatedAt={null}
        lastUpdatedAt={spine.project.updated_at}
        intelligenceConfidence={spine.intelligence.confidence}
      />

      {/* ───── Working focus (merged from legacy Overview) ───── */}
      <WorkingFocusStrip
        projectId={projectId}
        currentStepNum={spine.project.current_step_num}
        totalSteps={14}
        nextMilestoneId={nextMilestone?.id ?? spine.milestones[0]?.id ?? null}
        nextMilestoneName={nextMilestone?.name ?? spine.milestones[0]?.name ?? null}
      />

      {/* ───── Milestone approval history ───── */}
      <MilestoneApprovalHistoryCard
        rows={historyRows}
        milestones={spine.milestones}
        isLoading={historyQ.isPending}
        isError={historyQ.isError}
        errorMessage={(historyQ.error as Error | null)?.message}
        onRetry={() => historyQ.refetch()}
      />


      {/* ───── Modules & Readiness (power-user view) ───── */}
      <details className="group rounded-2xl border border-[#E8E1D6] bg-white shadow-sm">
        <summary className="cursor-pointer list-none px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-display text-base text-[#0A0F1F]">Modules &amp; readiness</div>
              <div className="mt-0.5 text-xs text-[#667085]">
                Detailed per-module state across the 10 spine modules
              </div>
            </div>
            <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-[#667085] group-open:text-[#3E68B2]">
              <span className="group-open:hidden">Expand</span>
              <span className="hidden group-open:inline">Collapse</span>
            </div>
          </div>
        </summary>
        <div className="space-y-4 border-t border-[#E8E1D6] px-5 py-5">
          <ModuleGridControls
            readiness={moduleFilter}
            onReadinessChange={setModuleFilter}
            category={categoryFilter}
            onCategoryChange={setCategoryFilter}
            sort={moduleSort}
            onSortChange={setModuleSort}
            modules={spine.modules}
          />
          <ModuleReadinessGrid
            modules={spine.modules}
            projectId={projectId}
            filter={moduleFilter}
            category={categoryFilter}
            sort={moduleSort}
          />
          <ModuleContentsList modules={spine.modules} projectId={projectId} />
          <ApproveRejectMilestonesList
            milestones={spine.milestones}
            onApprove={(id) => approveMut.mutate(id)}
            onReject={(id) => rejectMut.mutate(id)}
            pendingId={pendingMilestoneId}
          />
        </div>
      </details>

      {/* ───── Reference & Evidence (searchable, collapsed) ───── */}
      <section aria-labelledby="spine-evidence-heading" className="space-y-3">
        <SectionHeading
          id="spine-evidence-heading"
          eyebrow="Reference"
          title="Evidence & history"
          action={
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#667085]" />
              <input
                type="search"
                placeholder="Search evidence & history…"
                value={evidenceSearch}
                onChange={(e) => setEvidenceSearch(e.target.value)}
                className="w-64 rounded-full border border-[#E8E1D6] bg-white py-1.5 pl-8 pr-3 text-xs text-[#0A0F1F] placeholder:text-[#667085] focus:border-[#3E68B2] focus:outline-none"
              />
            </div>
          }
        />

        <SearchableBlock
          title="Sources & portal publish"
          subtitle={`${spine.sources.processed}/${spine.sources.total} processed`}
          search={evidenceSearch}
          haystack={[
            "sources",
            "portal",
            spine.portal_publish?.status ?? "not_published",
            spine.sources.last_run?.status ?? "",
          ].join(" ")}
        >
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
        </SearchableBlock>

        <SearchableBlock
          title="Recent activity"
          subtitle={`${spine.activity.length} events`}
          search={evidenceSearch}
          haystack={spine.activity
            .map((i) => `${i.title} ${i.kind} ${i.body ?? ""}`)
            .join(" ")}
        >
          <ListCard
            title="Activity"
            items={filterListItems(
              spine.activity.slice(0, 15).map((item) => ({
                id: item.id,
                title: item.title,
                meta: `${humanize(item.kind)} · ${formatDateTime(item.created_at)}`,
                body: item.body,
              })),
              evidenceSearch,
            )}
            empty="No recent activity."
          />
        </SearchableBlock>

        <SearchableBlock
          title="Audit trail"
          subtitle={`${spine.audit.length} entries`}
          search={evidenceSearch}
          haystack={spine.audit
            .map((i) => `${i.action} ${i.actor_email ?? ""} ${i.summary ?? ""}`)
            .join(" ")}
        >
          <ListCard
            title="Audit"
            items={filterListItems(
              spine.audit.slice(0, 15).map((item) => ({
                id: item.id,
                title: humanize(item.action),
                meta: `${item.actor_email ?? "system"} · ${formatDateTime(item.created_at)}`,
                body: item.summary,
              })),
              evidenceSearch,
            )}
            empty="No audit entries."
          />
        </SearchableBlock>

        <SearchableBlock
          title="Task ledger"
          subtitle={`${spine.tasks.length} task${spine.tasks.length === 1 ? "" : "s"}`}
          search={evidenceSearch}
          haystack={spine.tasks
            .map((t) => `${t.name} ${t.phase ?? ""} ${t.status} ${t.owner_email ?? ""}`)
            .join(" ")}
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
                  {spine.tasks
                    .filter((task) =>
                      matchesSearch(
                        `${task.name} ${task.phase ?? ""} ${task.status} ${task.owner_email ?? ""}`,
                        evidenceSearch,
                      ),
                    )
                    .map((task) => (
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
        </SearchableBlock>

        <SearchableBlock
          title="Version history"
          subtitle="Approved roadmap versions"
          search={evidenceSearch}
          haystack={`versions ${spine.version?.label ?? ""}`}
        >
          <SpineVersionHistory projectId={projectId} currentVersionLabel={spine.version?.label ?? null} />
        </SearchableBlock>

        <SearchableBlock
          title="Readiness contract"
          subtitle="14 canonical checks (advisory)"
          search={evidenceSearch}
          haystack="readiness contract checks advisory"
        >
          <SpineReadinessPanel />
        </SearchableBlock>
      </section>

      <NotificationsCard notifications={spine.notifications} />
      </>) : variant === "incomplete" ? (
        <SpineIncompleteBody spine={spine} projectId={projectId} />
      ) : (
        <SpineClientReadyBody spine={spine} projectId={projectId} />
      )}
    </div>
  );
}

/* ─────────────────── New Spine 2.0 layout components ─────────────────── */

function SpinePageHeader({
  projectId,
  projectName,
  status,
  pendingApprovalsCount,
  onExportPdf,
}: {
  projectId: string;
  projectName: string;
  status: string;
  pendingApprovalsCount: number;
  onExportPdf: () => void;
}) {
  return (
    <header className="space-y-3">
      <Link
        to="/engine/projects"
        className="inline-flex items-center gap-1.5 text-sm text-[#3E68B2] transition hover:text-[#284f93]"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to Projects
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-3xl leading-tight text-[#0A0F1F]">
              Project Spine
            </h1>
            <ProjectStatusBadge status={status} />
          </div>
          <p className="text-sm text-[#667085]">
            {projectName} — the central nervous system of your project. Live truth. Approved direction. Next best move.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2" data-qa-role="spine-header-actions">
          <a
            href="#spine-approvals"
            data-qa-action="approvals"
            className="inline-flex items-center gap-2 rounded-full border border-[#E8E1D6] bg-white px-3.5 py-2 text-sm font-medium text-[#0A0F1F] transition hover:border-[#3E68B2]/50"
          >
            Approvals
            <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-[#3E68B2] px-1.5 text-[11px] font-semibold text-white">
              {pendingApprovalsCount}
            </span>
          </a>
          <Link
            to="/engine/projects/$projectId/chat"
            params={{ projectId }}
            data-qa-action="ask-captain"
            className="inline-flex items-center gap-2 rounded-full border border-[#E8E1D6] bg-white px-3.5 py-2 text-sm font-medium text-[#0A0F1F] transition hover:border-[#3E68B2]/50"
          >
            <Sparkles className="h-3.5 w-3.5 text-[#3E68B2]" />
            Ask Captain
          </Link>
          <button
            type="button"
            onClick={onExportPdf}
            data-qa-action="export-roadmap"
            className="inline-flex items-center gap-2 rounded-full border border-[#0A0F1F] bg-[#0A0F1F] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#1c2440]"
          >
            <Download className="h-4 w-4" />
            Export Client Roadmap
          </button>
        </div>
      </div>
    </header>
  );
}

function HeroNextBestActionCard({
  nba,
  nextMilestone,
  projectId: _projectId,
}: {
  nba: ProjectSpinePayload["nba"];
  nextMilestone: ProjectSpinePayload["milestones"][number] | null;
  projectId: string;
}) {
  const tone = nba.severity ?? "info";
  const toneClasses: Record<"critical" | "warning" | "info", string> = {
    critical: "border-[#f3ced5] bg-gradient-to-br from-[#fbe9ec] via-white to-white",
    warning: "border-[#f1e3b9] bg-gradient-to-br from-[#fbf3e0] via-white to-white",
    info: "border-[#cdd6f3] bg-gradient-to-br from-[#eef3fd] via-white to-white",
  };
  const glyphTone: Record<"critical" | "warning" | "info", string> = {
    critical: "border-[#f3ced5] text-[#a4283c]",
    warning: "border-[#f1e3b9] text-[#8a6713]",
    info: "border-[#cdd6f3] text-[#3E68B2]",
  };

  return (
    <section
      aria-labelledby="spine-nba-heading"
      className={cn("rounded-2xl border p-6 shadow-sm", toneClasses[tone] ?? toneClasses.info)}
    >
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0 flex-1 space-y-4">
          <div className="inline-flex items-center gap-2 text-xs font-medium text-[#3E68B2]">
            <Sparkles className="h-4 w-4" />
            Next Best Action
          </div>
          <div className="space-y-2">
            <h2
              id="spine-nba-heading"
              className="font-display text-2xl leading-tight text-[#0A0F1F]"
            >
              {nba.action}
            </h2>
            {nba.reason ? (
              <p className="text-sm leading-6 text-[#3f4a5e]">{nba.reason}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-[#667085]">
            <MetaKV label="Unlocks" value={nextMilestone?.phase ? humanize(nextMilestone.phase) : "Next phase"} />
            <MetaKV label="Due" value={nextMilestone?.due_date ? formatDate(nextMilestone.due_date) : "—"} />
            <MetaKV label="Owner" value="Tai" />
          </div>
          {nba.href ? (
            <a
              href={nba.href}
              className="mt-2 inline-flex items-center gap-2 rounded-full bg-[#0A0F1F] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#1c2440]"
            >
              Review Now
              <ArrowRight className="h-4 w-4" />
            </a>
          ) : null}
        </div>
        <div
          className={cn(
            "hidden shrink-0 items-center justify-center rounded-full border-2 bg-white/70 shadow-inner sm:flex",
            glyphTone[tone] ?? glyphTone.info,
          )}
          style={{ width: 96, height: 96 }}
        >
          {tone === "critical" ? (
            <AlertTriangle className="h-8 w-8" />
          ) : tone === "warning" ? (
            <Clock className="h-8 w-8" />
          ) : (
            <ArrowRight className="h-8 w-8" />
          )}
        </div>
      </div>
    </section>
  );
}

function MetaKV({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#667085]">{label}:</span>
      <span className="text-[#0A0F1F]">{value}</span>
    </div>
  );
}

function ProjectSnapshotCard({
  project,
  version,
  pendingApprovals,
  blockedItems,
  approvedMilestones,
  totalMilestones,
  nextMilestoneDue,
  healthScore,
  ownerEmail,
}: {
  project: ProjectSpinePayload["project"];
  version: ProjectSpinePayload["version"];
  pendingApprovals: number;
  blockedItems: number;
  approvedMilestones: number;
  totalMilestones: number;
  nextMilestoneDue: string | null;
  healthScore: number;
  ownerEmail: string | null;
}) {
  const health =
    healthScore > 0
      ? healthFromScore(healthScore)
      : deriveHealth(project.status, blockedItems);
  const currentPhase = humanize(project.current_step || "—");
  const ownerDisplay = ownerEmail ?? project.client_company ?? "—";

  return (
    <section
      aria-labelledby="spine-snapshot-heading"
      className="rounded-2xl border border-[#E8E1D6] bg-white p-6 shadow-sm"
    >
      <h2 id="spine-snapshot-heading" className="font-display text-lg text-[#0A0F1F]">
        Project Snapshot
      </h2>
      <div className="mt-4 grid grid-cols-3 gap-x-4 gap-y-5">
        <SnapshotCell label="Current Phase" value={currentPhase} />
        <SnapshotCell
          label="Health"
          value={
            <span className="inline-flex items-center gap-1.5">
              <span className={cn("h-2 w-2 rounded-full", health.dot)} />
              {healthScore > 0 ? `${healthScore} · ${health.label}` : health.label}
            </span>
          }
        />
        <SnapshotCell
          label="Target Date"
          value={nextMilestoneDue ? formatDate(nextMilestoneDue) : "—"}
        />
        <SnapshotCell label="Project Owner" value={ownerDisplay} />
        <SnapshotCell label="Captain" value="Captain AI" />
        <SnapshotCell label="Roadmap Version" value={version?.label ?? "—"} />
        <SnapshotCell label="Pending Approvals" value={String(pendingApprovals)} />
        <SnapshotCell
          label="Blocked Items"
          value={
            <span className={cn(blockedItems > 0 ? "text-[#a4283c]" : "text-[#0A0F1F]")}>
              {blockedItems}
            </span>
          }
        />
        <SnapshotCell
          label="Active Milestones"
          value={`${approvedMilestones} of ${totalMilestones}`}
        />
      </div>
    </section>
  );
}

function healthFromScore(score: number): { label: string; dot: string } {
  if (score >= 80) return { label: "On Track", dot: "bg-[#1f6b3b]" };
  if (score >= 60) return { label: "Watch", dot: "bg-[#8a6713]" };
  return { label: "At Risk", dot: "bg-[#a4283c]" };
}

function SnapshotCell({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#667085]">
        {label}
      </div>
      <div className="mt-1 truncate text-sm font-medium text-[#0A0F1F]">{value}</div>
    </div>
  );
}

function deriveHealth(
  status: string,
  blockedItems: number,
): { label: string; dot: string } {
  if (blockedItems > 0) return { label: "At Risk", dot: "bg-[#a4283c]" };
  if (["blocked", "rejected"].includes(status)) return { label: "Blocked", dot: "bg-[#a4283c]" };
  if (["delivered", "in_execution", "approved", "active"].includes(status))
    return { label: "On Track", dot: "bg-[#1f6b3b]" };
  if (["needs_review", "draft"].includes(status))
    return { label: "Watch", dot: "bg-[#8a6713]" };
  return { label: humanize(status), dot: "bg-[#667085]" };
}

function TruthCardV2({
  point,
  projectId,
  approvedFlag,
  bullets,
  sourceCount,
  approvedAt,
  inspectorKey,
  inspectorLabel,
}: {
  point: "A" | "B";
  projectId: string;
  approvedFlag: boolean;
  bullets: string[];
  sourceCount: number;
  approvedAt: string | null;
  inspectorKey: string;
  inspectorLabel: string;
}) {
  const { open } = useSourceInspector();
  const label = point === "A" ? "Point A" : "Point B";
  const subtitle =
    point === "A" ? "Where the business is today." : "Where the business is going.";
  const badgeTone = approvedFlag ? "approved" : "pending";
  const badgeLabel = approvedFlag ? "APPROVED" : "DRAFT";

  return (
    <section className="rounded-2xl border border-[#E8E1D6] bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="rounded-full border border-[#E8E1D6] bg-[#FBF9F4] p-1.5 text-[#3E68B2]">
            <CheckCircle2 className="h-4 w-4" />
          </div>
          <div>
            <div className="font-display text-base text-[#0A0F1F]">{label}</div>
            <div className="text-xs text-[#667085]">{subtitle}</div>
          </div>
        </div>
        <GenericBadge tone={badgeTone}>{badgeLabel}</GenericBadge>
      </div>
      <ul className="mt-4 space-y-2 text-sm text-[#0A0F1F]">
        {bullets.length ? (
          bullets.slice(0, 3).map((b, i) => (
            <li key={i} className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#1f6b3b]" />
              <span className="min-w-0 break-words">{b}</span>
            </li>
          ))
        ) : (
          <li className="text-sm text-[#667085]">Not yet defined.</li>
        )}
      </ul>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-[#F3EEE6] pt-3 text-xs text-[#667085]">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <span>Sources: {sourceCount}</span>
          <span>Approved: {approvedAt ? formatDate(approvedAt) : "—"}</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            data-qa-role="inspect-source"
            data-inspect-key={inspectorKey}
            onClick={() =>
              open({
                projectId,
                sectionKey: inspectorKey,
                fieldKey: "summary",
                label: inspectorLabel,
                statement: bullets[0] ?? null,
              })
            }
            className="inline-flex items-center gap-1 font-medium text-[#3E68B2] hover:text-[#284f93]"
          >
            Inspect sources
            <ArrowRight className="h-3 w-3" />
          </button>
          <Link
            to={point === "A" ? "/engine/projects/$projectId/point-a" : "/engine/projects/$projectId/point-b"}
            params={{ projectId }}
            className="inline-flex items-center gap-1 font-medium text-[#0A0F1F] hover:text-[#3E68B2]"
          >
            Open room
          </Link>
        </div>
      </div>
    </section>
  );
}

function collectTruthBullets(
  record: Record<string, unknown> | null,
  keys: string[],
): string[] {
  if (!record) return [];
  const out: string[] = [];
  for (const k of keys) {
    const v = record[k];
    if (v == null) continue;
    if (Array.isArray(v)) {
      for (const item of v) {
        const s = stringifyValue(item);
        if (s) out.push(s);
        if (out.length >= 6) break;
      }
    } else {
      const s = stringifyValue(v);
      if (s) out.push(s);
    }
    if (out.length >= 6) break;
  }
  return out;
}

type GateState = "done" | "review" | "blocked" | "in_progress" | "not_started" | "not_ready" | "na";

function MilestoneReadinessMatrix({
  projectId,
  milestones,
}: {
  projectId: string;
  milestones: ProjectSpinePayload["milestones"];
}) {
  const rows = milestones.slice(0, 6);
  return (
    <section id="spine-milestones" className="scroll-mt-4 rounded-2xl border border-[#E8E1D6] bg-white p-5 shadow-sm">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-lg text-[#0A0F1F]">Milestone Readiness</h2>
        <Link
          to="/engine/projects/$projectId/roadmap"
          params={{ projectId }}
          className="inline-flex items-center gap-1 text-xs font-medium text-[#3E68B2] hover:text-[#284f93]"
        >
          View all <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-[#667085]">No milestones captured yet.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#E8E1D6] text-[#667085]">
                <th className="py-2 pr-4 font-mono text-[10px] uppercase tracking-[0.22em]">Milestone</th>
                <th className="py-2 pr-4 font-mono text-[10px] uppercase tracking-[0.22em]">Criteria</th>
                <th className="py-2 pr-4 font-mono text-[10px] uppercase tracking-[0.22em]">Design</th>
                <th className="py-2 pr-4 font-mono text-[10px] uppercase tracking-[0.22em]">Build</th>
                <th className="py-2 pr-4 font-mono text-[10px] uppercase tracking-[0.22em]">QA</th>
                <th className="py-2 font-mono text-[10px] uppercase tracking-[0.22em]">Due</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => {
                const gates = deriveGates(m);
                return (
                  <tr key={m.id} className="border-b border-[#F3EEE6] align-middle">
                    <td className="py-3 pr-4 text-[#0A0F1F]">
                      <Link
                        to="/engine/projects/$projectId/milestones/$milestoneId/brief"
                        params={{ projectId, milestoneId: m.id }}
                        className="hover:text-[#3E68B2]"
                      >
                        {m.name}
                      </Link>
                    </td>
                    <td className="py-3 pr-4"><GateChip state={gates.criteria} /></td>
                    <td className="py-3 pr-4"><GateChip state={gates.design} /></td>
                    <td className="py-3 pr-4"><GateChip state={gates.build} /></td>
                    <td className="py-3 pr-4"><GateChip state={gates.qa} /></td>
                    <td className="py-3 text-[#667085] whitespace-nowrap">
                      {m.due_date ? formatDate(m.due_date) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function deriveGates(m: ProjectSpinePayload["milestones"][number]): {
  criteria: GateState;
  design: GateState;
  build: GateState;
  qa: GateState;
} {
  // Criteria: driven directly by approval_status
  const criteria: GateState =
    m.approval_status === "approved"
      ? "done"
      : m.approval_status === "rejected"
        ? "blocked"
        : m.approval_status === "pending" || m.approval_status === "needs_review"
          ? "review"
          : "not_started";

  // Downstream gates progress with the milestone's own status/phase.
  const phase = (m.phase ?? "").toLowerCase();
  const status = (m.status ?? "").toLowerCase();
  const isDone = ["done", "completed", "approved", "delivered"].includes(status);
  const isBlocked = status === "blocked";
  const isInProgress = ["in_progress", "running", "active", "in_execution"].includes(status);

  const gateAt = (target: "design" | "build" | "qa"): GateState => {
    if (criteria !== "done") return "not_ready";
    if (isBlocked) return "blocked";
    if (isDone) return "done";
    const order = ["criteria", "design", "build", "qa"];
    const cur = order.indexOf(phase);
    const t = order.indexOf(target);
    if (cur === -1) return isInProgress && target === "design" ? "in_progress" : "not_started";
    if (cur > t) return "done";
    if (cur === t) return isInProgress ? "in_progress" : "review";
    return "not_started";
  };

  return {
    criteria,
    design: gateAt("design"),
    build: gateAt("build"),
    qa: gateAt("qa"),
  };
}

function GateChip({ state }: { state: GateState }) {
  if (state === "done")
    return <CheckCircle2 className="h-4 w-4 text-[#1f6b3b]" aria-label="Done" />;
  if (state === "review")
    return <GenericBadge tone="pending">Review</GenericBadge>;
  if (state === "blocked")
    return <GenericBadge tone="blocked">Blocked</GenericBadge>;
  if (state === "in_progress")
    return <GenericBadge tone="info">In Progress</GenericBadge>;
  if (state === "not_ready")
    return <GenericBadge tone="neutral">Not Ready</GenericBadge>;
  if (state === "not_started")
    return <GenericBadge tone="neutral">Not Started</GenericBadge>;
  return <span className="text-[#667085]">—</span>;
}

function ApprovalsInlineCard({ reviews }: { reviews: ProjectSpinePayload["reviews"] }) {
  return (
    <section
      id="spine-approvals"
      className="rounded-2xl border border-[#E8E1D6] bg-white p-5 shadow-sm"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-lg text-[#0A0F1F]">Approvals &amp; Decisions</h2>
        <a
          href="#milestone-approval-history"
          className="inline-flex items-center gap-1 text-xs font-medium text-[#3E68B2] hover:text-[#284f93]"
        >
          View all <ArrowRight className="h-3 w-3" />
        </a>
      </div>
      {reviews.length === 0 ? (
        <p className="mt-4 text-sm text-[#667085]">No pending review items.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {reviews.slice(0, 5).map((r) => {
            const dotClass =
              r.impact === "high"
                ? "bg-[#a4283c]"
                : r.impact === "medium"
                  ? "bg-[#8a6713]"
                  : "bg-[#3E68B2]";
            return (
              <li
                key={r.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-[#F3EEE6] p-3"
              >
                <div className="flex min-w-0 gap-2">
                  <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", dotClass)} />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-[#0A0F1F]">{r.title}</div>
                    <div className="mt-0.5 text-xs text-[#667085]">
                      {r.status === "pending" || r.status === "needs_review"
                        ? "Needs your approval"
                        : "Awaiting decision"}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  className="shrink-0 rounded-full border border-[#E8E1D6] bg-white px-3 py-1 text-xs font-medium text-[#3E68B2] hover:border-[#3E68B2]/60"
                >
                  Review
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function ProjectFoundationCard({
  projectId,
  modules,
  pointA,
  pointB,
  milestones,
}: {
  projectId: string;
  modules: SpineModuleSection[];
  pointA: Record<string, unknown> | null;
  pointB: Record<string, unknown> | null;
  milestones: ProjectSpinePayload["milestones"];
}) {
  const byKey = (k: string) => modules.find((m) => m.key === k);
  const dataCount = (m?: SpineModuleSection): number => {
    if (!m) return 0;
    const d = m.data;
    if (Array.isArray(d)) return d.length;
    if (d && typeof d === "object") {
      const rec = d as Record<string, unknown>;
      for (const key of ["categories", "items", "phases", "milestones", "list"]) {
        const v = rec[key];
        if (Array.isArray(v)) return v.length;
      }
      return Object.keys(rec).length;
    }
    return 0;
  };
  const contextStrength = hasMeaningfulValue(pointA) && hasMeaningfulValue(pointB)
    ? "Strong"
    : hasMeaningfulValue(pointA) || hasMeaningfulValue(pointB)
      ? "Partial"
      : "Missing";
  const hidden = byKey("hidden_assets");
  const scope = byKey("blueprint");
  const scopeReady = scope?.readiness.approved ? "Defined" : scope?.readiness.has_data ? "Draft" : "Missing";
  const successMetrics = byKey("success_metrics");
  const constraints = byKey("constraints");
  const decisions = byKey("decisions");
  const risks = byKey("risks");
  const highRisks = (() => {
    const d = risks?.data;
    if (Array.isArray(d)) {
      return d.filter((r) => {
        if (!r || typeof r !== "object") return false;
        const sev = ((r as Record<string, unknown>).severity ?? (r as Record<string, unknown>).level) as string | undefined;
        return typeof sev === "string" && /high|critical/i.test(sev);
      }).length;
    }
    return dataCount(risks);
  })();
  const alignment = milestones.some((m) => m.status === "blocked" || m.approval_status === "rejected")
    ? "Watch"
    : "On Track";

  const rows: Array<{ label: string; value: string; icon: ReactNode; link: SpineModuleKeyOrHome | null }> = [
    { label: "Business Context", value: contextStrength, icon: <Sparkles className="h-3.5 w-3.5" />, link: null },
    { label: "Assets & Leverage", value: `${dataCount(hidden)} Identified`, icon: <CheckCircle2 className="h-3.5 w-3.5" />, link: "hidden_assets" },
    { label: "Approved Scope", value: scopeReady, icon: <CheckCircle2 className="h-3.5 w-3.5" />, link: "blueprint" },
    { label: "Success Metrics", value: `${dataCount(successMetrics)} Defined`, icon: <CheckCircle2 className="h-3.5 w-3.5" />, link: "success_metrics" },
    { label: "Constraints", value: `${dataCount(constraints)} Active`, icon: <AlertTriangle className="h-3.5 w-3.5" />, link: "constraints" },
    { label: "Key Decisions", value: `${dataCount(decisions)} Made`, icon: <CheckCircle2 className="h-3.5 w-3.5" />, link: "decisions" },
    { label: "Risks", value: `${highRisks} High`, icon: <AlertTriangle className="h-3.5 w-3.5" />, link: "risks" },
    { label: "Team Alignment", value: alignment, icon: <CheckCircle2 className="h-3.5 w-3.5" />, link: null },
  ];

  return (
    <section className="rounded-2xl border border-[#E8E1D6] bg-white p-5 shadow-sm">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-lg text-[#0A0F1F]">Project Foundation</h2>
        <Link
          to="/engine/projects/$projectId/spine"
          params={{ projectId }}
          className="inline-flex items-center gap-1 text-xs font-medium text-[#3E68B2] hover:text-[#284f93]"
        >
          View all <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <ul className="mt-4 grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2 text-sm text-[#0A0F1F]">
              <span className="text-[#667085]">{r.icon}</span>
              {r.link ? (
                <ModuleLink
                  moduleKey={r.link as SpineModuleKey}
                  projectId={projectId}
                  className="truncate hover:text-[#3E68B2]"
                >
                  {r.label}
                </ModuleLink>
              ) : (
                <span className="truncate">{r.label}</span>
              )}
            </div>
            <span className="shrink-0 text-sm font-medium text-[#0A0F1F]">{r.value}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

type SpineModuleKeyOrHome = SpineModuleKey;

function CaptainBriefCard({
  nba,
  latestActivity,
  version,
}: {
  nba: ProjectSpinePayload["nba"];
  latestActivity: ProjectSpinePayload["activity"][number] | null;
  version: ProjectSpinePayload["version"];
}) {
  const rows = [
    {
      label: "What changed",
      value: latestActivity
        ? `${latestActivity.title}${latestActivity.body ? ` — ${latestActivity.body}` : ""}`
        : version
          ? `Roadmap ${version.label ?? "version"} ${humanize(version.status)}`
          : "No recent changes recorded.",
    },
    { label: "What matters now", value: nba.action },
    { label: "Recommendation", value: nba.reason || "Continue current phase and clear pending approvals." },
    {
      label: "Watch for",
      value:
        nba.severity === "critical"
          ? "Critical items blocking downstream work."
          : nba.severity === "warning"
            ? "Items approaching their commitment date."
            : "New review items landing over the next 48h.",
    },
  ];
  return (
    <section className="rounded-2xl border border-[#cdd6f3] bg-gradient-to-br from-[#eef3fd] via-white to-white p-5 shadow-sm">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="inline-flex items-center gap-2 font-display text-lg text-[#0A0F1F]">
          <Sparkles className="h-4 w-4 text-[#3E68B2]" />
          Captain Brief
        </h2>
        <a
          href="#spine-approvals"
          className="inline-flex items-center gap-1 text-xs font-medium text-[#3E68B2] hover:text-[#284f93]"
        >
          View all <ArrowRight className="h-3 w-3" />
        </a>
      </div>
      <dl className="mt-4 space-y-3">
        {rows.map((r) => (
          <div key={r.label} className="grid grid-cols-[7.5rem_1fr] gap-3">
            <dt className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#667085]">
              {r.label}
            </dt>
            <dd className="text-sm leading-6 text-[#0A0F1F]">{r.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function FooterStatsBar({
  sourcesProcessed,
  sourcesTotal,
  lastRunAt,
  projectCreatedAt,
  lastUpdatedAt,
  intelligenceConfidence,
}: {
  sourcesProcessed: number;
  sourcesTotal: number;
  lastRunAt: string | null;
  projectCreatedAt: string | null;
  lastUpdatedAt: string;
  intelligenceConfidence: number | null;
}) {
  const confidence =
    intelligenceConfidence !== null
      ? `${intelligenceConfidence}%`
      : sourcesTotal > 0
        ? `${Math.min(99, Math.round((sourcesProcessed / sourcesTotal) * 100))}%`
        : "—";
  return (
    <section className="rounded-2xl border border-[#E8E1D6] bg-white p-4 shadow-sm">
      <div className="grid grid-cols-2 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
        <FooterStat
          label="Sources Processed"
          value={sourcesTotal > 0 ? `${sourcesProcessed} of ${sourcesTotal}` : String(sourcesProcessed)}
        />
        <FooterStat label="Last Intelligence Run" value={lastRunAt ? formatDateTime(lastRunAt) : "—"} />
        <FooterStat label="Intelligence Confidence" value={confidence} />
        <FooterStat label="Project Created" value={projectCreatedAt ? formatDate(projectCreatedAt) : "—"} />
        <FooterStat label="Last Updated" value={formatDateTime(lastUpdatedAt)} />
        <div className="flex items-center justify-end gap-2 text-xs text-[#667085]">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#1f6b3b]" />
            <span className="text-[#0A0F1F]">Auto-saved</span>
          </span>
          <span>· Just now</span>
        </div>
      </div>
    </section>
  );
}

function FooterStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#667085]">{label}</div>
      <div className="mt-0.5 text-sm font-medium text-[#0A0F1F]">{value}</div>
    </div>
  );
}

function ApproveRejectMilestonesList({
  milestones,
  onApprove,
  onReject,
  pendingId,
}: {
  milestones: ProjectSpinePayload["milestones"];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  pendingId: string | null;
}) {
  if (milestones.length === 0) return null;
  return (
    <div id="milestone-approval-history" className="rounded-2xl border border-[#E8E1D6] bg-[#FBF9F4] p-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#667085]">
        Milestone approvals
      </div>
      <ul className="mt-3 space-y-2">
        {milestones.slice(0, 20).map((m) => {
          const isPending = pendingId === m.id;
          const isApproved = m.approval_status === "approved";
          const isRejected = m.approval_status === "rejected";
          return (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#E8E1D6] bg-white px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-[#0A0F1F]">{m.name}</div>
                <div className="text-xs text-[#667085]">
                  {m.phase ? humanize(m.phase) : "Unphased"} · {humanize(m.approval_status)}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={isPending || isApproved}
                  onClick={() => onApprove(m.id)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition",
                    isApproved
                      ? "border-[#c4e6d2] bg-[#e6f5ec] text-[#1f6b3b] cursor-default"
                      : "border-[#c4e6d2] bg-white text-[#1f6b3b] hover:bg-[#e6f5ec] disabled:opacity-50",
                  )}
                >
                  <Check className="h-3 w-3" />
                  {isPending ? "…" : "Approve"}
                </button>
                <button
                  type="button"
                  disabled={isPending || isRejected}
                  onClick={() => onReject(m.id)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition",
                    isRejected
                      ? "border-[#f3ced5] bg-[#fbe9ec] text-[#a4283c] cursor-default"
                      : "border-[#f3ced5] bg-white text-[#a4283c] hover:bg-[#fbe9ec] disabled:opacity-50",
                  )}
                >
                  <X className="h-3 w-3" />
                  {isPending ? "…" : "Reject"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
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
  onApprove,
  onReject,
  pendingMilestoneId,
}: {
  version: ProjectSpinePayload["version"];
  milestones: ProjectSpinePayload["milestones"];
  groupedMilestones: Array<[string, ProjectSpinePayload["milestones"]]>;
  scopeItems: string[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  pendingMilestoneId: string | null;
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
                {list.slice(0, 5).map((m) => {
                  const isPending = pendingMilestoneId === m.id;
                  const isApproved = m.approval_status === "approved";
                  const isRejected = m.approval_status === "rejected";
                  return (
                    <li key={m.id} className="flex flex-col gap-1">
                      <div className="flex items-start justify-between gap-3">
                        <span className="truncate">{m.name}</span>
                        <GenericBadge tone={toneForApproval(m.approval_status)}>
                          {humanize(m.approval_status)}
                        </GenericBadge>
                      </div>
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          disabled={isPending || isApproved}
                          onClick={() => onApprove(m.id)}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition",
                            isApproved
                              ? "border-[#c4e6d2] bg-[#e6f5ec] text-[#1f6b3b] cursor-default"
                              : "border-[#c4e6d2] bg-white text-[#1f6b3b] hover:bg-[#e6f5ec] disabled:opacity-50",
                          )}
                        >
                          <Check className="h-3 w-3" />
                          {isPending ? "…" : "Approve"}
                        </button>
                        <button
                          type="button"
                          disabled={isPending || isRejected}
                          onClick={() => onReject(m.id)}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition",
                            isRejected
                              ? "border-[#f3ced5] bg-[#fbe9ec] text-[#a4283c] cursor-default"
                              : "border-[#f3ced5] bg-white text-[#a4283c] hover:bg-[#fbe9ec] disabled:opacity-50",
                          )}
                        >
                          <X className="h-3 w-3" />
                          {isPending ? "…" : "Reject"}
                        </button>
                      </div>
                    </li>
                  );
                })}
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

function ModuleGridControls({
  readiness,
  onReadinessChange,
  category,
  onCategoryChange,
  sort,
  onSortChange,
  modules,
}: {
  readiness: ModuleReadinessFilter;
  onReadinessChange: (v: ModuleReadinessFilter) => void;
  category: ModuleCategoryFilter;
  onCategoryChange: (v: ModuleCategoryFilter) => void;
  sort: ModuleSort;
  onSortChange: (v: ModuleSort) => void;
  modules: SpineModuleSection[];
}) {
  const counts = useMemo(() => {
    const c = { all: modules.length, ready: 0, review: 0, draft: 0, missing: 0 };
    for (const m of modules) {
      const s = deriveModuleState(m);
      if (s === "ready") c.ready++;
      else if (s === "review") c.review++;
      else if (s === "draft" || s === "approved-no-data") c.draft++;
      else c.missing++;
    }
    return c;
  }, [modules]);

  const readinessOptions: Array<{ key: ModuleReadinessFilter; label: string; count: number }> = [
    { key: "all", label: "All", count: counts.all },
    { key: "ready", label: "Approved", count: counts.ready },
    { key: "review", label: "In review", count: counts.review },
    { key: "draft", label: "Draft", count: counts.draft },
    { key: "missing", label: "Missing", count: counts.missing },
  ];
  const categoryOptions: Array<{ key: ModuleCategoryFilter; label: string }> = [
    { key: "all", label: "All" },
    { key: "direct", label: "Module" },
    { key: "derived", label: "Derived" },
  ];

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#E8E1D6] bg-[#FBF9F4] p-3">
      <div className="flex flex-wrap items-center gap-1">
        <span className="mr-1 font-mono text-[10px] uppercase tracking-[0.22em] text-[#667085]">
          Readiness
        </span>
        {readinessOptions.map((opt) => (
          <button
            key={opt.key}
            type="button"
            onClick={() => onReadinessChange(opt.key)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs transition",
              readiness === opt.key
                ? "border-[#0A0F1F] bg-[#0A0F1F] text-white"
                : "border-[#E8E1D6] bg-white text-[#0A0F1F] hover:border-[#0A0F1F]/40",
            )}
          >
            {opt.label} <span className="opacity-70">({opt.count})</span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <span className="mr-1 font-mono text-[10px] uppercase tracking-[0.22em] text-[#667085]">
          Category
        </span>
        {categoryOptions.map((opt) => (
          <button
            key={opt.key}
            type="button"
            onClick={() => onCategoryChange(opt.key)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs transition",
              category === opt.key
                ? "border-[#0A0F1F] bg-[#0A0F1F] text-white"
                : "border-[#E8E1D6] bg-white text-[#0A0F1F] hover:border-[#0A0F1F]/40",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <div className="ml-auto flex items-center gap-2 text-xs text-[#667085]">
        <label htmlFor="module-sort" className="font-mono text-[10px] uppercase tracking-[0.22em]">
          Sort
        </label>
        <select
          id="module-sort"
          value={sort}
          onChange={(e) => onSortChange(e.target.value as ModuleSort)}
          className="rounded-md border border-[#E8E1D6] bg-white px-2 py-1 text-xs text-[#0A0F1F] focus:border-[#3E68B2] focus:outline-none"
        >
          <option value="readiness">Readiness (approved first)</option>
          <option value="label">Name (A → Z)</option>
        </select>
      </div>
    </div>
  );
}

const READINESS_RANK: Record<ModuleUiState, number> = {
  ready: 0,
  review: 1,
  "approved-no-data": 2,
  draft: 3,
  missing: 4,
};

function ModuleReadinessGrid({
  modules,
  projectId,
  filter,
  category,
  sort,
}: {
  modules: SpineModuleSection[];
  projectId: string;
  filter: ModuleReadinessFilter;
  category: ModuleCategoryFilter;
  sort: ModuleSort;
}) {
  const filtered = useMemo(() => {
    const list = modules.filter((m) => {
      if (category === "direct" && m.derived) return false;
      if (category === "derived" && !m.derived) return false;
      if (filter === "all") return true;
      const s = deriveModuleState(m);
      if (filter === "ready") return s === "ready";
      if (filter === "review") return s === "review";
      if (filter === "draft") return s === "draft" || s === "approved-no-data";
      if (filter === "missing") return s === "missing";
      return true;
    });
    return list.sort((a, b) => {
      if (sort === "label") return a.label.localeCompare(b.label);
      return (
        READINESS_RANK[deriveModuleState(a)] - READINESS_RANK[deriveModuleState(b)] ||
        a.label.localeCompare(b.label)
      );
    });
  }, [modules, filter, category, sort]);

  if (filtered.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[#E8E1D6] bg-white p-6 text-center text-sm text-[#667085]">
        No modules match the current filters.
      </div>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {filtered.map((m) => (
        <ModuleReadinessTile key={m.key} module={m} projectId={projectId} />
      ))}
    </div>
  );
}

type ModuleUiState = "ready" | "approved-no-data" | "review" | "draft" | "missing";

function deriveModuleState(m: SpineModuleSection): ModuleUiState {
  const { has_data, approved, ready, approval_state } = m.readiness;
  if (ready) return "ready";
  if (approved && !has_data) return "approved-no-data";
  if (approval_state === "review") return "review";
  if (has_data) return "draft";
  return "missing";
}

const MODULE_STATE_ICON: Record<ModuleUiState, ReactNode> = {
  ready: <CheckCircle2 className="h-4 w-4 text-[#1f6b3b]" />,
  "approved-no-data": <AlertTriangle className="h-4 w-4 text-[#8a6713]" />,
  review: <Clock className="h-4 w-4 text-[#8a6713]" />,
  draft: <CircleDashed className="h-4 w-4 text-[#3E68B2]" />,
  missing: <CircleDashed className="h-4 w-4 text-[#667085]" />,
};
const MODULE_STATE_LABEL: Record<ModuleUiState, string> = {
  ready: "Approved",
  "approved-no-data": "Approved · empty",
  review: "In review",
  draft: "Draft",
  missing: "Not started",
};
const MODULE_STATE_TONE: Record<ModuleUiState, "approved" | "pending" | "info" | "neutral"> = {
  ready: "approved",
  "approved-no-data": "pending",
  review: "pending",
  draft: "info",
  missing: "neutral",
};

/**
 * Typed deep link to a module's workspace route. Keeps navigation SPA-native
 * (preloading + type checks) instead of full-page reloads via <a href>.
 */
function ModuleLink({
  moduleKey,
  projectId,
  className,
  children,
}: {
  moduleKey: import("@/lib/engine.functions").SpineModuleKey;
  projectId: string;
  className?: string;
  children: ReactNode;
}) {
  const params = { projectId };
  switch (moduleKey) {
    case "hidden_assets":
      return (
        <Link to="/engine/projects/$projectId/hidden-assets" params={params} className={className}>
          {children}
        </Link>
      );
    case "gaps":
    case "constraints":
    case "risks":
      return (
        <Link to="/engine/projects/$projectId/gap-map" params={params} className={className}>
          {children}
        </Link>
      );
    case "blueprint":
      return (
        <Link to="/engine/projects/$projectId/blueprint" params={params} className={className}>
          {children}
        </Link>
      );
    case "sequencing":
      return (
        <Link to="/engine/projects/$projectId/sequencing" params={params} className={className}>
          {children}
        </Link>
      );
    case "deadlines":
      return (
        <Link to="/engine/projects/$projectId/deadlines" params={params} className={className}>
          {children}
        </Link>
      );
    case "investment":
      return (
        <Link to="/engine/projects/$projectId/investment" params={params} className={className}>
          {children}
        </Link>
      );
    case "success_metrics":
      return (
        <Link to="/engine/projects/$projectId/point-b" params={params} className={className}>
          {children}
        </Link>
      );
    case "decisions":
      return (
        <Link to="/engine/projects/$projectId/builder" params={params} className={className}>
          {children}
        </Link>
      );
    default:
      return <span className={className}>{children}</span>;
  }
}

function ModuleReadinessTile({
  module: m,
  projectId,
}: {
  module: SpineModuleSection;
  projectId: string;
}) {
  const state = deriveModuleState(m);

  return (
    <ModuleLink
      moduleKey={m.key}
      projectId={projectId}
      className={cn(
        "group block rounded-xl border p-4 shadow-sm transition hover:shadow-md",
        state === "ready"
          ? "border-[#c4e6d2] bg-[#f4faf6]"
          : "border-[#E8E1D6] bg-white hover:border-[#3E68B2]/40",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {MODULE_STATE_ICON[state]}
          <div className="text-sm font-medium text-[#0A0F1F]">{m.label}</div>
        </div>
        <GenericBadge tone={MODULE_STATE_TONE[state]}>{MODULE_STATE_LABEL[state]}</GenericBadge>
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-[#667085]">
        <span>{m.derived ? "Derived" : "Module"}</span>
        <span className="inline-flex items-center gap-1 text-[#3E68B2] opacity-0 transition group-hover:opacity-100">
          Open <ArrowRight className="h-3 w-3" />
        </span>
      </div>
    </ModuleLink>
  );
}

/* ─────────────────── Per-module content sections ─────────────────── */

function ModuleContentsList({
  modules,
  projectId,
}: {
  modules: SpineModuleSection[];
  projectId: string;
}) {
  return (
    <div className="space-y-3">
      {modules.map((m) => (
        <ModuleContentCard key={m.key} module={m} projectId={projectId} />
      ))}
    </div>
  );
}

function ModuleContentCard({
  module: m,
  projectId,
}: {
  module: SpineModuleSection;
  projectId: string;
}) {
  const state = deriveModuleState(m);
  const approvalLabel = m.readiness.approved
    ? "Approved"
    : m.readiness.approval_state
      ? humanize(m.readiness.approval_state)
      : "Not submitted";
  const preview = summarizeModuleData(m.data);

  return (
    <details
      className={cn(
        "group rounded-2xl border shadow-sm transition",
        state === "ready" ? "border-[#c4e6d2] bg-[#f9fcfa]" : "border-[#E8E1D6] bg-white",
      )}
    >
      <summary className="cursor-pointer list-none px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {MODULE_STATE_ICON[state]}
            <div className="min-w-0">
              <div className="font-display text-base text-[#0A0F1F]">{m.label}</div>
              <div className="mt-0.5 text-xs text-[#667085]">
                {m.derived ? "Derived · " : ""}
                {m.source}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <GenericBadge tone={MODULE_STATE_TONE[state]}>{MODULE_STATE_LABEL[state]}</GenericBadge>
            <GenericBadge tone={m.readiness.approved ? "approved" : "neutral"}>
              {approvalLabel}
            </GenericBadge>
            <span className="text-[10px] font-mono uppercase tracking-[0.22em] text-[#667085] group-open:text-[#3E68B2]">
              <span className="group-open:hidden">Expand</span>
              <span className="hidden group-open:inline">Collapse</span>
            </span>
          </div>
        </div>
      </summary>
      <div className="border-t border-[#E8E1D6] px-5 py-4 space-y-3">
        {preview.length ? (
          <ul className="space-y-2 text-sm text-[#0A0F1F]">
            {preview.map((line, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-[#3E68B2]">•</span>
                <span className="min-w-0 break-words">{line}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[#667085]">
            No {m.label.toLowerCase()} content has been captured yet.
          </p>
        )}
        <div className="flex items-center justify-between pt-2">
          <div className="text-xs text-[#667085]">
            {m.readiness.has_data ? "Content present" : "No content yet"} ·{" "}
            {m.readiness.approved ? "approval on file" : "awaiting approval"}
          </div>
          <ModuleLink
            moduleKey={m.key}
            projectId={projectId}
            className="inline-flex items-center gap-1 rounded-full border border-[#E8E1D6] bg-white px-3 py-1 text-xs font-medium text-[#3E68B2] hover:border-[#3E68B2]/60 hover:text-[#284f93]"
          >
            Open module
            <ArrowRight className="h-3 w-3" />
          </ModuleLink>
        </div>
      </div>
    </details>
  );
}

function summarizeModuleData(data: unknown): string[] {
  if (data == null) return [];
  if (typeof data === "string") {
    const t = data.trim();
    return t ? [t] : [];
  }
  if (typeof data === "number" || typeof data === "boolean") return [String(data)];
  if (Array.isArray(data)) {
    return data
      .slice(0, 8)
      .map((item) => {
        if (item == null) return null;
        if (typeof item === "string") return item.trim() || null;
        if (typeof item === "number" || typeof item === "boolean") return String(item);
        if (typeof item === "object") {
          return compactObjectSummary(item as Record<string, unknown>);
        }
        return null;
      })
      .filter((v): v is string => Boolean(v));
  }
  if (typeof data === "object") {
    const rec = data as Record<string, unknown>;
    return Object.entries(rec)
      .slice(0, 8)
      .map(([k, v]) => {
        const text = stringifyValue(v);
        return text ? `${humanize(k)}: ${text}` : null;
      })
      .filter((v): v is string => Boolean(v));
  }
  return [];
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

/* ─────────── Searchable block: auto-expands on matching search ─────────── */

function matchesSearch(haystack: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return haystack.toLowerCase().includes(q);
}

function filterListItems<T extends { title: string; body: string | null; meta: string }>(
  items: T[],
  query: string,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((it) =>
    `${it.title} ${it.body ?? ""} ${it.meta}`.toLowerCase().includes(q),
  );
}

function SearchableBlock({
  title,
  subtitle,
  search,
  haystack,
  children,
}: {
  title: string;
  subtitle?: string;
  search: string;
  haystack: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const [manuallyToggled, setManuallyToggled] = useState(false);
  const active = search.trim().length > 0;
  const isMatch = matchesSearch(`${title} ${subtitle ?? ""} ${haystack}`, search);

  useEffect(() => {
    if (!ref.current) return;
    if (!active) {
      setManuallyToggled(false);
      return;
    }
    // Auto-expand on match, auto-collapse when it no longer matches — but do
    // not fight the user if they manually toggled it while a search is active.
    if (!manuallyToggled) {
      ref.current.open = isMatch;
    }
  }, [active, isMatch, manuallyToggled]);

  if (active && !isMatch) {
    return (
      <div className="rounded-2xl border border-dashed border-[#E8E1D6] bg-[#FBF9F4] px-5 py-3 text-xs text-[#667085]">
        <span className="font-display text-sm text-[#0A0F1F]">{title}</span>
        <span className="ml-2">— no match for “{search}”.</span>
      </div>
    );
  }

  return (
    <details
      ref={ref}
      onToggle={() => {
        if (active) setManuallyToggled(true);
      }}
      className={cn(
        "group rounded-2xl border bg-white shadow-sm transition",
        active && isMatch ? "border-[#cdd6f3] ring-1 ring-[#3E68B2]/20" : "border-[#E8E1D6]",
      )}
    >
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

/* ─────────── Error banner used for spine + sub-query failures ─────────── */

function ErrorBanner({
  title,
  message,
  onRetry,
  onDismiss,
}: {
  title: string;
  message: string;
  onRetry?: () => void;
  onDismiss?: () => void;
}) {
  return (
    <div
      role="alert"
      className="rounded-2xl border border-[#f3ced5] bg-[#fbe9ec] p-4 text-sm text-[#a4283c]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#a4283c]/80">
            {title}
          </div>
          <p className="mt-1 text-[#7a1e2d]">{message}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="rounded-full border border-[#a4283c]/50 bg-white px-3 py-1 text-xs font-medium text-[#a4283c] hover:bg-[#fbe9ec]"
            >
              Retry
            </button>
          ) : null}
          {onDismiss ? (
            <button
              type="button"
              onClick={onDismiss}
              className="rounded-full border border-transparent px-3 py-1 text-xs text-[#a4283c] hover:bg-white"
            >
              Dismiss
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ─────────── Milestone approval history ─────────── */

type MilestoneApprovalRow = {
  id: string;
  actor_email: string | null;
  action: "milestone_approved" | "milestone_rejected";
  summary: string | null;
  target_id: string | null;
  created_at: string;
};

function MilestoneApprovalHistoryCard({
  rows,
  milestones,
  isLoading,
  isError,
  errorMessage,
  onRetry,
}: {
  rows: MilestoneApprovalRow[];
  milestones: ProjectSpinePayload["milestones"];
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
  onRetry: () => void;
}) {
  const nameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of milestones) map.set(m.id, m.name);
    return map;
  }, [milestones]);

  return (
    <div className="rounded-2xl border border-[#E8E1D6] bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#667085]">
            Milestone approval history
          </div>
          <div className="mt-1 font-display text-base text-[#0A0F1F]">
            {rows.length} recent decision{rows.length === 1 ? "" : "s"}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="mt-4 space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-[#F3EEE6]" />
          ))}
        </div>
      ) : isError ? (
        <div className="mt-4">
          <ErrorBanner
            title="Could not load approval history"
            message={errorMessage ?? "Please retry."}
            onRetry={onRetry}
          />
        </div>
      ) : rows.length === 0 ? (
        <p className="mt-3 text-sm text-[#667085]">
          No milestone approvals or rejections have been recorded yet.
        </p>
      ) : (
        <ol className="mt-4 space-y-2">
          {rows.map((row) => {
            const isApproved = row.action === "milestone_approved";
            const name = row.target_id ? nameById.get(row.target_id) : null;
            return (
              <li
                key={row.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-[#F3EEE6] p-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm text-[#0A0F1F]">
                    {isApproved ? (
                      <Check className="h-3.5 w-3.5 text-[#1f6b3b]" />
                    ) : (
                      <X className="h-3.5 w-3.5 text-[#a4283c]" />
                    )}
                    <span className="truncate font-medium">{name ?? "Milestone"}</span>
                  </div>
                  {row.summary ? (
                    <div className="mt-1 text-xs text-[#667085]">{row.summary}</div>
                  ) : null}
                  <div className="mt-1 text-[11px] text-[#667085]">
                    {row.actor_email ?? "system"} · {formatDateTime(row.created_at)}
                  </div>
                </div>
                <GenericBadge tone={isApproved ? "approved" : "blocked"}>
                  {isApproved ? "Approved" : "Rejected"}
                </GenericBadge>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

/* ─────────── PDF export ─────────── */

function exportSpinePdf(
  spine: ProjectSpinePayload,
  history: MilestoneApprovalRow[],
): void {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 48;
  const marginBottom = 56;
  const maxWidth = pageWidth - marginX * 2;
  let y = 56;

  const ensureRoom = (needed: number) => {
    if (y + needed > pageHeight - marginBottom) {
      doc.addPage();
      y = 56;
    }
  };
  const writeText = (
    text: string,
    opts: { size?: number; style?: "normal" | "bold"; gap?: number } = {},
  ) => {
    const size = opts.size ?? 10;
    doc.setFont("helvetica", opts.style ?? "normal");
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, maxWidth);
    for (const line of lines) {
      ensureRoom(size + 2);
      doc.text(line, marginX, y);
      y += size + 2;
    }
    y += opts.gap ?? 4;
  };
  const writeHeading = (text: string) => {
    ensureRoom(24);
    y += 6;
    writeText(text, { size: 13, style: "bold", gap: 6 });
  };
  const writeMeta = (text: string) => writeText(text, { size: 9, gap: 2 });

  const stripHtml = (v: unknown): string => {
    if (v == null) return "";
    if (typeof v === "string") return v.replace(/\s+/g, " ").trim();
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    return JSON.stringify(v).slice(0, 400);
  };

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("Project Spine", marginX, y);
  y += 22;
  writeText(spine.project.name, { size: 14, style: "bold" });
  writeMeta(
    `${spine.project.client_company || "No client"} · Status: ${humanize(
      spine.project.status,
    )} · Updated ${formatDateTime(spine.project.updated_at)}`,
  );

  // NBA
  writeHeading("Next Best Action");
  writeText(spine.nba.action, { style: "bold" });
  if (spine.nba.reason) writeText(spine.nba.reason);
  writeMeta(`Severity: ${humanize(spine.nba.severity ?? "info")}`);

  // Point A / Point B
  writeHeading("Point A — Where we are");
  const pointA = asRecord(spine.project.point_a);
  const aSections = extractNamedSections(pointA, [
    "current_state",
    "challenges",
    "summary",
    "description",
  ]);
  if (aSections.length === 0) writeText("Not yet defined.");
  else for (const s of aSections) writeText(`${s.label}: ${s.value}`);

  writeHeading("Point B — Where we're going");
  const pointB = asRecord(spine.project.point_b);
  const bSections = extractNamedSections(pointB, [
    "destination",
    "goal",
    "vision",
    "frame",
    "success_looks_like",
  ]);
  if (bSections.length === 0) writeText("Destination not yet approved.");
  else for (const s of bSections) writeText(`${s.label}: ${s.value}`);

  // Roadmap summary
  writeHeading("Roadmap");
  writeText(`Latest version: ${spine.version?.label || "None"}`);
  if (spine.version) {
    writeMeta(
      `Created ${formatDateTime(spine.version.created_at)}${
        spine.version.approved_at
          ? ` · Approved ${formatDateTime(spine.version.approved_at)}`
          : ""
      } · Status ${humanize(spine.version.status)}`,
    );
  }
  const approvedMs = spine.milestones.filter((m) => m.approval_status === "approved").length;
  writeText(`Milestones approved: ${approvedMs}/${spine.milestones.length}`);
  for (const m of spine.milestones.slice(0, 25)) {
    writeText(
      `  • [${humanize(m.approval_status)}] ${m.name}${m.phase ? ` (${humanize(m.phase)})` : ""}`,
      { size: 9, gap: 1 },
    );
  }
  if (spine.milestones.length > 25) {
    writeMeta(`  … and ${spine.milestones.length - 25} more`);
  }

  // Readiness
  writeHeading("Module readiness");
  for (const m of spine.modules) {
    const state = deriveModuleState(m);
    writeText(
      `${m.label}: ${MODULE_STATE_LABEL[state]} — approval ${
        m.readiness.approval_state ? humanize(m.readiness.approval_state) : "not submitted"
      }${m.readiness.has_data ? "" : " · no content"}${m.derived ? " · derived" : ""}`,
      { size: 9, gap: 1 },
    );
  }

  // Approvals: pending reviews
  writeHeading("Pending approvals");
  if (spine.reviews.length === 0) writeText("No pending review items.");
  else
    for (const r of spine.reviews.slice(0, 15)) {
      writeText(
        `• [${humanize(r.impact)}] ${r.title} — ${humanize(r.item_type)} · ${formatDateTime(
          r.created_at,
        )}`,
        { size: 9, gap: 1 },
      );
    }

  // Approval history
  writeHeading("Milestone approval history");
  if (history.length === 0) writeText("No milestone approvals or rejections recorded.");
  else
    for (const h of history.slice(0, 25)) {
      writeText(
        `• ${h.action === "milestone_approved" ? "APPROVED" : "REJECTED"} — ${
          h.summary ?? "Milestone"
        } · ${h.actor_email ?? "system"} · ${formatDateTime(h.created_at)}`,
        { size: 9, gap: 1 },
      );
    }
  // Silence "possibly unused" for the stripHtml helper (kept for future rich fields).
  void stripHtml;

  const slug = (spine.project.name || "project")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const date = new Date().toISOString().slice(0, 10);
  doc.save(`spine-${slug || "report"}-${date}.pdf`);
}



/* ─────────── Working focus strip (merged from legacy Overview) ─────────── */
function WorkingFocusStrip({
  projectId,
  currentStepNum,
  totalSteps,
  nextMilestoneId,
  nextMilestoneName,
}: {
  projectId: string;
  currentStepNum: number;
  totalSteps: number;
  nextMilestoneId: string | null;
  nextMilestoneName: string | null;
}) {
  const { dates } = useWorkspace(projectId);
  const pct = Math.min(100, Math.max(0, Math.round((currentStepNum / totalSteps) * 100)));
  const upcoming = [...dates]
    .filter((d) => !!d.due_on)
    .sort((a, b) => new Date(a.due_on).getTime() - new Date(b.due_on).getTime())
    .slice(0, 4);

  // Spine deep links — in-page anchors for spine subviews, and typed
  // Link entries for tab siblings + the milestone workspace brief.
  type TabTo =
    | "/engine/projects/$projectId/roadmap"
    | "/engine/projects/$projectId/work"
    | "/engine/projects/$projectId/qa-delivery"
    | "/engine/projects/$projectId/client-view"
    | "/engine/projects/$projectId/chat";

  const anchorShortcuts: Array<{ href: string; label: string }> = [
    { href: "#spine-approvals", label: "Approvals" },
    { href: "#spine-milestones", label: "Milestone matrix" },
    { href: "#spine-evidence-heading", label: "Evidence & history" },
  ];

  const tabShortcuts: Array<{ to: TabTo; label: string }> = [
    { to: "/engine/projects/$projectId/roadmap", label: "Roadmap" },
    { to: "/engine/projects/$projectId/work", label: "Work" },
    { to: "/engine/projects/$projectId/qa-delivery", label: "QA & Delivery" },
    { to: "/engine/projects/$projectId/client-view", label: "Client view" },
    { to: "/engine/projects/$projectId/chat", label: "Ask Captain" },
  ];

  return (
    <section
      aria-labelledby="working-focus-heading"
      className="grid gap-4 xl:grid-cols-3 rounded-2xl border border-[#E8E1D6] bg-white p-5 shadow-sm"
      data-qa-role="working-focus"
    >
      <div className="xl:col-span-1">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#667085]">
          Workflow progress
        </div>
        <div id="working-focus-heading" className="mt-1 text-lg font-medium text-[#0A0F1F]">
          Step {currentStepNum} of {totalSteps}
        </div>
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[#F3EEE6]">
          <div className="h-full bg-[#3E68B2] transition-all" style={{ width: `${Math.max(2, pct)}%` }} />
        </div>
        <div className="mt-1 text-[11px] text-[#667085] tabular-nums">{pct}%</div>
      </div>

      <div className="xl:col-span-1">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#667085]">
          Upcoming dates
        </div>
        {upcoming.length === 0 ? (
          <div className="mt-2 text-sm text-[#667085] italic">No dates set.</div>
        ) : (
          <ul className="mt-2 space-y-2 text-sm">
            {upcoming.map((d) => (
              <li key={d.id} className="flex items-baseline justify-between gap-3">
                <span className="truncate text-[#0A0F1F]">{d.label}</span>
                <span className="whitespace-nowrap text-xs text-[#667085]">
                  {new Date(d.due_on).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="xl:col-span-1">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#667085]">
          Shortcuts
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2" data-qa-role="workflow-shortcuts">
          {anchorShortcuts.map((s) => (
            <a
              key={s.href}
              href={s.href}
              data-qa-shortcut={s.label}
              className="rounded-lg border border-[#E8E1D6] px-3 py-2 text-xs text-[#0A0F1F] hover:border-[#3E68B2]/50 hover:bg-[#FBF9F4] transition"
            >
              {s.label}
            </a>
          ))}
          {tabShortcuts.map((s) => (
            <Link
              key={s.to}
              to={s.to}
              params={{ projectId }}
              data-qa-shortcut={s.label}
              className="rounded-lg border border-[#E8E1D6] px-3 py-2 text-xs text-[#0A0F1F] hover:border-[#3E68B2]/50 hover:bg-[#FBF9F4] transition"
            >
              {s.label}
            </Link>
          ))}
          {nextMilestoneId ? (
            <Link
              to="/engine/projects/$projectId/milestones/$milestoneId/brief"
              params={{ projectId, milestoneId: nextMilestoneId }}
              data-qa-shortcut="next-milestone-brief"
              title={nextMilestoneName ?? "Next milestone brief"}
              className="col-span-2 rounded-lg border border-[#3E68B2]/30 bg-[#F5F8FE] px-3 py-2 text-xs font-medium text-[#0A0F1F] hover:border-[#3E68B2]/60 transition truncate"
            >
              Next milestone brief{nextMilestoneName ? ` — ${nextMilestoneName}` : ""}
            </Link>
          ) : null}
        </div>
      </div>
    </section>
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

/* ────────────── Sprint 1 · Wave 1 — Spine variant selector ──────────────
 *
 * The same Spine page renders three variants depending on where the
 * project stands. The variant selector switches only the top banner and
 * the primary CTA — all downstream cards (NBA, snapshot, foundation,
 * milestones, evidence) stay in place so context never resets between
 * variants. Contract mirrors `doctrine/PROJECT_SPINE_CONTRACT.md` §5.
 */
type SpineVariant = "incomplete" | "active" | "client_ready";

function deriveSpineVariant(
  pointAApproved: boolean,
  pointBApproved: boolean,
  milestones: ProjectSpinePayload["milestones"],
  publish: ProjectSpinePayload["portal_publish"],
): SpineVariant {
  if (!pointAApproved || !pointBApproved) return "incomplete";
  const allMilestonesApproved =
    milestones.length > 0 && milestones.every((m) => m.approval_status === "approved");
  const publishedOrReady =
    !!publish && ["published", "ready_to_publish", "acknowledged"].includes(publish.status);
  if (allMilestonesApproved || publishedOrReady) return "client_ready";
  return "active";
}

function SpineVariantBanner({
  variant,
  projectId,
  spine,
}: {
  variant: SpineVariant;
  projectId: string;
  spine: ProjectSpinePayload;
}) {
  if (variant === "incomplete") {
    const missing: string[] = [];
    if (!hasMeaningfulValue(spine.project.point_a)) missing.push("Point A");
    if (!hasMeaningfulValue(spine.project.point_b)) missing.push("Point B");
    const contradictions = spine.notifications.filter(
      (n) => n.kind === "contradiction" || n.kind === "warning" || n.kind === "critical",
    ).length;
    return (
      <section
        data-qa-variant="incomplete"
        className="rounded-2xl border border-[#f1e3b9] bg-[#fbf6e4] p-5 shadow-sm"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#8a6713]">
              Spine · Incomplete
            </div>
            <h2 className="mt-1 font-display text-xl leading-tight text-[#0A0F1F]">
              Understanding is still being resolved.
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-[#3f4a63]">
              This Spine cannot be approved yet. {missing.length
                ? `${missing.join(" and ")} ${missing.length === 1 ? "is" : "are"} not approved.`
                : "Material questions remain open."}
              {contradictions > 0
                ? ` ${contradictions} unresolved contradiction${contradictions === 1 ? "" : "s"} in the record.`
                : ""}
            </p>
          </div>
          <Link
            to="/engine/projects/$projectId/understanding-room"
            params={{ projectId }}
            data-qa-action="resolve-gaps"
            className="inline-flex items-center gap-2 rounded-full bg-[#0A0F1F] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#1c2440]"
          >
            Resolve Understanding Gaps
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </section>
    );
  }

  if (variant === "client_ready") {
    const publish = spine.portal_publish;
    return (
      <section
        data-qa-variant="client-ready"
        className="rounded-2xl border border-[#c9e6d3] bg-[#eaf6ef] p-5 shadow-sm"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#1f6b3b]">
              Spine · Client-Ready
            </div>
            <h2 className="mt-1 font-display text-xl leading-tight text-[#0A0F1F]">
              This project is ready to speak to the client.
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-[#3f4a63]">
              Point A, Point B, milestone rationale, and investment ranges are all
              approved. {publish?.published_at
                ? `Currently published: ${new Date(publish.published_at).toLocaleDateString()}.`
                : "Nothing has been published to the client portal yet."}
            </p>
            <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-[#3f4a63] sm:grid-cols-3">
              <li>· Roadmap completeness</li>
              <li>· Milestone rationale</li>
              <li>· Investment ranges</li>
              <li>· Timeline</li>
              <li>· Client-safe summary</li>
              <li>· Client acknowledgment</li>
            </ul>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href="#spine-approvals"
              className="inline-flex items-center gap-2 rounded-full border border-[#0A0F1F] bg-white px-4 py-2 text-sm font-medium text-[#0A0F1F] transition hover:bg-[#FBF9F4]"
            >
              Open Roadmap Studio
              <ArrowRight className="h-3.5 w-3.5" />
            </a>
            <span
              data-qa-hint="export-lives-in-header"
              className="text-[11px] text-[#3f4a63]"
            >
              Export lives in the header ↑
            </span>
          </div>
        </div>
      </section>
    );
  }

  // Active — a lightweight confirmation strip so the operator sees which
  // variant is in effect and how far they are from the next state gate.
  const missingForClient: string[] = [];
  if (spine.milestones.some((m) => m.approval_status !== "approved"))
    missingForClient.push("all milestones approved");
  if (!spine.portal_publish) missingForClient.push("portal publish check");
  return (
    <section
      data-qa-variant="active"
      className="rounded-2xl border border-[#d5e0f2] bg-[#eef3fb] p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#3E68B2]">
            Spine · Active
          </div>
          <div className="mt-0.5 text-sm text-[#0A0F1F]">
            Point A and Point B approved. Delivering against the roadmap.
          </div>
        </div>
        <div className="text-[11px] text-[#3f4a63]">
          {missingForClient.length
            ? `To reach client-ready: ${missingForClient.join(", ")}.`
            : "Ready to switch to client-ready on the next milestone approval."}
        </div>
      </div>
    </section>
  );
}

/* ─────────────── Wave 2 · Body variants ─────────────── */

function SpineIncompleteBody({
  spine,
  projectId,
}: {
  spine: ProjectSpinePayload;
  projectId: string;
}) {
  const pointA = asRecord(spine.project.point_a);
  const pointB = asRecord(spine.project.point_b);
  const contradictions = spine.notifications.filter(
    (n) => n.kind === "contradiction" || n.kind === "warning" || n.kind === "critical",
  );
  return (
    <div className="space-y-6" data-qa-body="incomplete">
      <section className="rounded-2xl border border-[#E8E1D6] bg-white p-5 shadow-sm">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#8a6713]">
          Focus · Resolve understanding
        </div>
        <h2 className="mt-1 font-display text-xl leading-tight text-[#0A0F1F]">
          The spine needs approved truth before delivery can start.
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-[#3f4a63]">
          Work here until Point A and Point B are approved. Operational surfaces
          (milestones, approvals, delivery) unlock automatically once the
          understanding gate closes.
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <TruthCardV2
          point="A"
          projectId={projectId}
          approvedFlag={hasMeaningfulValue(spine.project.point_a)}
          bullets={collectTruthBullets(pointA, ["current_state", "challenges", "summary", "description"])}
          sourceCount={spine.sources.total}
          approvedAt={spine.version?.approved_at ?? null}
          inspectorKey="point_a"
          inspectorLabel="Point A — Current Reality"
        />
        <TruthCardV2
          point="B"
          projectId={projectId}
          approvedFlag={hasMeaningfulValue(spine.project.point_b)}
          bullets={collectTruthBullets(pointB, ["destination", "goal", "vision", "success_looks_like", "frame"])}
          sourceCount={spine.sources.total}
          approvedAt={spine.version?.approved_at ?? null}
          inspectorKey="point_b"
          inspectorLabel="Point B — Desired Future"
        />
      </div>

      <SpineReadinessPanel />

      {contradictions.length ? (
        <section className="rounded-2xl border border-[#f1e3b9] bg-[#fbf6e4] p-5 shadow-sm">
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#8a6713]">
            Open questions & contradictions ({contradictions.length})
          </div>
          <ul className="mt-3 space-y-2 text-sm text-[#3f4a63]">
            {contradictions.slice(0, 8).map((n) => (
              <li key={n.id} className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#8a6713]" />
                <div>
                  <div className="font-medium text-[#0A0F1F]">{n.title}</div>
                  {n.body ? <div className="text-xs text-[#667085]">{n.body}</div> : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <NotificationsCard notifications={spine.notifications} />
    </div>
  );
}

function SpineClientReadyBody({
  spine,
  projectId,
}: {
  spine: ProjectSpinePayload;
  projectId: string;
}) {
  const pointA = asRecord(spine.project.point_a);
  const pointB = asRecord(spine.project.point_b);
  const approvedMilestones = spine.milestones.filter((m) => m.approval_status === "approved");
  const publish = spine.portal_publish;
  return (
    <div className="space-y-6" data-qa-body="client-ready">
      <section className="rounded-2xl border border-[#c9e6d3] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#1f6b3b]">
              Portal publish
            </div>
            <h2 className="mt-1 font-display text-xl leading-tight text-[#0A0F1F]">
              {publish ? humanize(publish.status) : "Not yet published"}
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-[#3f4a63]">
              {publish?.published_at
                ? `Last published ${formatDateTime(publish.published_at)}.`
                : "Nothing has reached the client portal yet. Publish when ready."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/engine/projects/$projectId/preview"
              params={{ projectId }}
              className="inline-flex items-center gap-2 rounded-full border border-[#0A0F1F] bg-white px-4 py-2 text-sm font-medium text-[#0A0F1F] transition hover:bg-[#FBF9F4]"
            >
              Open portal preview
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <Link
              to="/engine/projects/$projectId/publish-history"
              params={{ projectId }}
              className="inline-flex items-center gap-2 rounded-full bg-[#0A0F1F] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#1c2440]"
            >
              Re-publish
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <TruthCardV2
          point="A"
          projectId={projectId}
          approvedFlag={hasMeaningfulValue(spine.project.point_a)}
          bullets={collectTruthBullets(pointA, ["current_state", "challenges", "summary", "description"])}
          sourceCount={spine.sources.total}
          approvedAt={spine.version?.approved_at ?? null}
          inspectorKey="point_a"
          inspectorLabel="Point A — Current Reality"
        />
        <TruthCardV2
          point="B"
          projectId={projectId}
          approvedFlag={hasMeaningfulValue(spine.project.point_b)}
          bullets={collectTruthBullets(pointB, ["destination", "goal", "vision", "success_looks_like", "frame"])}
          sourceCount={spine.sources.total}
          approvedAt={spine.version?.approved_at ?? null}
          inspectorKey="point_b"
          inspectorLabel="Point B — Desired Future"
        />
      </div>

      <section className="rounded-2xl border border-[#E8E1D6] bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#667085]">
              Approved milestones ({approvedMilestones.length})
            </div>
            <div className="text-sm text-[#3f4a63]">
              Client-facing roll-up. Everything below is safe to send.
            </div>
          </div>
        </div>
        {approvedMilestones.length ? (
          <ul className="mt-4 divide-y divide-[#F3EEE6]">
            {approvedMilestones.map((m, i) => (
              <li key={m.id} className="py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="font-display text-[15px] text-[#0A0F1F]">
                    {i + 1}. {m.name}
                  </div>
                  <div className="text-[11px] text-[#667085]">
                    {m.phase ? humanize(m.phase) : ""}
                    {m.due_date ? ` · ${formatDate(m.due_date)}` : ""}
                  </div>
                </div>
                {m.brief_md ? (
                  <p className="mt-1 text-sm text-[#3f4a63]">{m.brief_md}</p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-[#667085]">No milestones approved yet.</p>
        )}
      </section>

      <NotificationsCard notifications={spine.notifications} />
    </div>
  );
}

