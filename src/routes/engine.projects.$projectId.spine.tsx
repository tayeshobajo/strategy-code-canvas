import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState, useEffect, useRef, type ReactNode, type FormEvent } from "react";
import {
  getProjectSpine,
  getProjectWorkspace,
  type EngineProjectStatus,
  type ProjectSpinePayload,
  type SpineModuleSection,
  type SpineModuleKey,
} from "@/lib/engine.functions";
import { evaluateProjectSpineReadiness } from "@/lib/engine-spine-readiness-eval.functions";
import { listAgentTasks, type EngineAgentTask } from "@/lib/engine-agent.functions";
import { approveVersion, listVersions } from "@/lib/engine-intelligence.functions";
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
import { LatestAmendmentsPanel } from "@/components/engine/LatestAmendmentsPanel";
import { DriftSummaryPanel } from "@/components/engine/DriftSummaryPanel";
import { AiPmStatusChip } from "@/components/engine/spine/AiPmStatusChip";
import { RunAiPmButton } from "@/components/engine/spine/RunAiPmButton";
import { useAutoPmRun } from "@/hooks/use-auto-pm-run";
import {
  Lock,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
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
  Radio,
  Compass,
  MapPin,
  Flag,
  MessageSquare,
  Bot,
  Brain,
  Layers,
  ClipboardCheck,
  Eye,
  FileText,
  Activity,
  Menu,
  Send,
  Loader2,
} from "lucide-react";
import { askProjectIntelligence } from "@/lib/engine-chat.functions";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/hooks/use-workspace";
import { useSourceInspector } from "@/hooks/use-source-inspector";
import jsPDF from "jspdf";
import { getSpineSection, type SpineFieldStatus } from "@/lib/spine-contract";
import type { SpineReadinessCheckResult } from "@/lib/spine-readiness-evaluator";
import {
  presentationFor,
  isApprovedTruth,
  type SpineStatusPresentation,
} from "@/lib/spine-truth-status";
import type { SpineVariant } from "@/lib/spine-variant";
import {
  getIntelligenceRoomLink,
  validateIntelligenceAnchor,
} from "@/lib/intelligence-room-links";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import { listChatThreads, getChatThread } from "@/lib/engine-chat.functions";
import { IdentityStrip } from "@/components/engine/spine/IdentityStrip";
import { NarrativeHeader } from "@/components/engine/spine/NarrativeHeader";
import { CaptainIntelligencePanel } from "@/components/engine/spine/CaptainIntelligencePanel";
import { PointCard } from "@/components/engine/spine/PointCard";
import { StrategicThesisCard } from "@/components/engine/spine/StrategicThesisCard";
import { ThesisRequiredBanner } from "@/components/engine/spine/ThesisRequiredBanner";
import { WorldEntryCard, ExecutionBoundaryCard } from "@/components/engine/spine/DoctrineCards";
import { RoadmapApprovalCard } from "@/components/engine/spine/RoadmapApprovalCard";
import { CompareVersionsModal } from "@/components/engine/roadmap/CompareVersionsModal";
import { extractPointBullets } from "@/lib/spine-coherence";
import { derivePhase } from "@/lib/spine-phase";
import { getStrategicThesis } from "@/lib/engine-strategic-thesis.functions";
import { toast } from "sonner";

/**
 * Map the richer 7-tone `SpineStatusPresentation` palette onto the 5
 * tones supported by the existing `GenericBadge` primitive. Keeps the
 * visual language identical to today's badges (approved = green,
 * blocked = red, etc.) while letting the presentation module stay pure.
 */
function badgeToneFor(
  tone: SpineStatusPresentation["tone"],
): "neutral" | "approved" | "pending" | "blocked" | "info" {
  switch (tone) {
    case "approved":       return "approved";
    case "verified":       return "info";
    case "assumption":     return "info";
    case "contradiction":  return "blocked";
    case "review":         return "pending";
    case "draft":          return "neutral";
    case "history":        return "neutral";
  }
}


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

/**
 * Preflight for Export Client Roadmap.
 *
 * The client-facing PDF renders Point A, Point B, phased roadmap, blueprint
 * nodes, and milestones with `client_facing` copy. If any of those are
 * missing the operator would ship a hollow file to the client, so we block
 * export and surface exactly what to fix.
 */
export function validateClientRoadmapExport(project: WorkspaceProject): {
  ok: boolean;
  missing: string[];
} {
  const missing: string[] = [];
  const pointA = (project.point_a ?? {}) as { key_diagnosis?: string };
  const pointB = (project.point_b ?? {}) as Record<string, string | undefined>;
  const phases =
    ((project.investment as { phases?: Array<{ name: string; client_facing?: string }> })?.phases) ??
    [];
  const nodes =
    ((project.blueprint as { nodes?: Array<{ name: string }> })?.nodes) ?? [];
  const milestones =
    ((project.roadmap as {
      milestones?: Array<{ name: string; client_facing?: string }>;
    })?.milestones) ?? [];

  if (!pointA.key_diagnosis?.trim()) missing.push("Point A · executive diagnosis is empty");
  if (!pointB["24_month_destination"]?.trim())
    missing.push("Point B · 24-month destination is empty");
  if (phases.length === 0) missing.push("No investment phases have been defined");
  if (nodes.length === 0) missing.push("System blueprint has no nodes");
  if (milestones.length === 0) missing.push("Roadmap has no milestones");
  else if (!milestones.some((m) => m.client_facing?.trim()))
    missing.push(
      `No milestones have client-facing copy (${milestones.length} internal-only)`,
    );

  return { ok: missing.length === 0, missing };
}

function ProjectSpine() {
  const { projectId } = Route.useParams();
  const spineFn = useServerFn(getProjectSpine);
  const historyFn = useServerFn(listMilestoneApprovalHistory);
  const approveFn = useServerFn(approveMilestone);
  const rejectFn = useServerFn(rejectMilestone);
  const workspaceFn = useServerFn(getProjectWorkspace);
  const approveVersionFn = useServerFn(approveVersion);
  const listVersionsFn = useServerFn(listVersions);
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
  // Workspace project — needed by exportClientRoadmapPdf (uses investment /
  // blueprint / roadmap.client_facing shapes not present on the spine
  // payload). Kept as a non-suspense sibling of spineQ so header render is
  // never blocked on it.
  const workspaceQ = useQuery({
    queryKey: ["engine", "workspace", projectId],
    queryFn: () => workspaceFn({ data: { id: projectId } }),
    staleTime: 60_000,
  });
  // Hoisted so the top-of-page Status Strip and the Incomplete body share
  // the same query cache (readiness is expensive to recompute).
  const readinessFn = useServerFn(evaluateProjectSpineReadiness);
  const readinessQ = useQuery({
    queryKey: ["engine", "spine-readiness", projectId],
    queryFn: () => readinessFn({ data: { projectId } }),
    enabled: !!projectId,
    staleTime: 30_000,
  });
  // Fetch the Strategic Thesis so the phase machine and the
  // ThesisRequiredBanner can gate the roadmap on a real approval,
  // not just presence of a roadmap version.
  const thesisFn = useServerFn(getStrategicThesis);
  const thesisQ = useQuery({
    queryKey: ["engine", "strategic-thesis", projectId],
    queryFn: () => thesisFn({ data: { projectId } }),
    enabled: !!projectId,
    staleTime: 60_000,
  });

  // Versions list — powers the Compare Versions modal launched from the
  // roadmap approval card. Kept lightweight; refetched after approve.
  const versionsQ = useQuery({
    queryKey: ["engine", "roadmap-versions", projectId],
    queryFn: () => listVersionsFn({ data: { projectId } }),
    enabled: !!projectId,
    staleTime: 30_000,
  });

  // Proactively run the AI Product Manager when Spine readiness < 100%.
  // Cooldown + in-flight guards live in engine-pm-status so we don't spam
  // credits when this component remounts.
  const readinessResult = readinessQ.data?.result;
  const readinessRatio =
    readinessResult && readinessResult.total > 0
      ? readinessResult.passed / readinessResult.total
      : null;
  useAutoPmRun({ projectId, readinessRatio });


  const [moduleFilter, setModuleFilter] = useState<ModuleReadinessFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<ModuleCategoryFilter>("all");
  const [moduleSort, setModuleSort] = useState<ModuleSort>("readiness");
  const [evidenceSearch, setEvidenceSearch] = useState("");
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<{ title: string; missing: string[] } | null>(null);
  const [askCaptainOpen, setAskCaptainOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [baselineApproving, setBaselineApproving] = useState(false);
  const [justApproved, setJustApproved] = useState<{ at: string; by: string | null } | null>(null);
  const exportHandlerRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const handler = () => exportHandlerRef.current?.();
    window.addEventListener("spine:export-roadmap", handler);
    return () => window.removeEventListener("spine:export-roadmap", handler);
  }, []);



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
  // Server-owned read model (see src/lib/spine-variant.ts). Doctrine lives
  // on the server; the route just reads.
  const view = spine.view;
  const variant = view.variant;
  const pendingApprovalsCount = view.counts.pending_approvals;
  const approvedMilestoneCount = view.counts.approved_milestones;
  const blockedItemsCount = view.counts.blocked_items;
  const sourceTotal = view.counts.source_total_safe;
  // `next_milestone` in the view carries just id/name/due_date. Some
  // downstream cards want the full milestone row (`.phase`, `.brief_md`,
  // etc.) so we re-hydrate against the milestones array here.
  const nextMilestone = view.next_milestone
    ? spine.milestones.find((m) => m.id === view.next_milestone!.id) ?? null
    : null;

  const historyRows = historyQ.data ?? [];
  const pendingMilestoneId =
    approveMut.isPending
      ? (approveMut.variables as string | undefined) ?? null
      : rejectMut.isPending
        ? (rejectMut.variables as string | undefined) ?? null
        : null;

  const handleExportClientRoadmap = () => {
    const workspace = workspaceQ.data as
      | { project: WorkspaceProject }
      | undefined;
    if (!workspace) {
      setExportError({
        title: "Roadmap data still loading",
        missing: ["Project workspace has not finished loading. Try again in a moment."],
      });
      return;
    }
    const check = validateClientRoadmapExport(workspace.project);
    if (!check.ok) {
      setExportError({
        title: "Client Roadmap is not ready to export",
        missing: check.missing,
      });
      return;
    }
    setExportError(null);
    exportClientRoadmapPdf(workspace.project, {
      approvals: {
        approved: approvedMilestoneCount,
        total: spine.milestones.length,
      },
    });
  };
  exportHandlerRef.current = handleExportClientRoadmap;


  // Derive a single canonical project phase from the spine + thesis + roadmap.
  // Historical UI conflated project.status / current_step / portal.status and
  // could display "Client Preview" for an unapproved draft — the phase
  // machine collapses these into one truth.
  const thesisApproved = thesisQ.data?.current?.status === "approved";
  const phaseInfo = derivePhase({
    pointAApproved: isApprovedTruth(spine.project.point_a_status),
    pointBApproved: isApprovedTruth(spine.project.point_b_status),
    strategicThesisApproved: thesisApproved,
    roadmapVersionStatus: spine.version?.status ?? null,
    approvedMilestoneCount,
    totalMilestoneCount: spine.milestones.length,
    milestonesInProgress: spine.milestones.filter((m) => m.status === "in_progress").length,
    portalPublishStatus: spine.portal_publish?.status ?? null,
    projectStatus: spine.project.status ?? "",
  });
  const executionActive =
    phaseInfo.phase === "Execution" ||
    phaseInfo.phase === "QA" ||
    phaseInfo.phase === "Client Preview" ||
    phaseInfo.phase === "Delivery";
  // Roadmap should not be treated as operational without an approved thesis.
  const needsThesisGate =
    isApprovedTruth(spine.project.point_a_status) &&
    isApprovedTruth(spine.project.point_b_status) &&
    !thesisApproved;

  // Identity cells: name + client already live in the persistent
  // ProjectHeaderStrip above, so this strip carries only the facts that
  // aren't already on screen (phase, roadmap version).
  const identityCells = [
    { label: "Phase", value: phaseInfo.phase },
    { label: "Roadmap", value: spine.version?.label ?? "Draft" },
  ];
  // The header strip owns the project name. The Spine hero leads with the
  // project's goal — the editorial "why" — so the name is stated exactly once.
  const narrativeTitle = spine.project.goal
    ? spine.project.goal
    : spine.project.name || "Untitled project";
  const narrativeSubtitle = spine.project.goal
    ? "The living story of this project — truth, direction, and next move."
    : undefined;

  return (
    <div className="min-w-0 space-y-10 pb-12 text-[#0A0F1F]">
      {/* ───── Identity strip ───── */}
      <IdentityStrip cells={identityCells} />

      {/* ───── Narrative header ───── */}
      <NarrativeHeader title={narrativeTitle} subtitle={narrativeSubtitle} />


      {/* ───── Header actions ───── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <SpinePageHeader
          projectId={projectId}
          pendingApprovalsCount={pendingApprovalsCount}
          onAskCaptain={() => setAskCaptainOpen(true)}
        />
        <AiPmStatusChip projectId={projectId} />
      </div>


      {/* ───── Variant banner ───── */}
      <SpineVariantBanner variant={variant} projectId={projectId} spine={spine} />

      {/* ───── Strategic Thesis gate ─────
          Blocks operational treatment of the roadmap until the thesis is
          approved (see doctrine/PROJECT_SPINE_CONTRACT.md). */}
      {needsThesisGate ? <ThesisRequiredBanner projectId={projectId} /> : null}

      {/* ───── Status strip ───── */}
      <SpineStatusStrip
        spine={spine}
        blockedItems={blockedItemsCount}
        readinessPassed={readinessQ.data?.result?.passed ?? null}
        readinessTotal={readinessQ.data?.result?.total ?? 14}
      />

      {exportError ? (
        <ErrorBanner
          title={exportError.title}
          message={
            "Fix the following before exporting a client-safe roadmap:\n• " +
            exportError.missing.join("\n• ")
          }
          onDismiss={() => setExportError(null)}
        />
      ) : null}

      {approvalError ? (
        <ErrorBanner
          title="Approval action failed"
          message={approvalError}
          onDismiss={() => setApprovalError(null)}
        />
      ) : null}

      <div className="min-w-0 space-y-10">

      {variant === "active" ? (
        <>

      {/* ───── First viewport: NBA + Snapshot + Captain Intelligence + Sidebar ───── */}
      <div className="grid gap-5 xl:grid-cols-4 xl:items-start">
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
          portalPublish={spine.portal_publish}
        />
        <CaptainIntelligencePanel
          whatChanged={
            spine.activity[0]
              ? `${spine.activity[0].title} · ${formatRelative(spine.activity[0].created_at)}`
              : "No new signals in the last cycle."
          }
          whatMatters={
            blockedItemsCount > 0
              ? `${blockedItemsCount} blocked item${blockedItemsCount === 1 ? "" : "s"} need attention before the next milestone unlocks.`
              : pendingApprovalsCount > 0
                ? `${pendingApprovalsCount} approval${pendingApprovalsCount === 1 ? "" : "s"} waiting on you.`
                : "The project is on track — focus on advancing the next milestone."
          }
          recommendation={spine.nba.action}
          watchFor={
            needsThesisGate
              ? "Roadmap will remain a draft until the Strategic Thesis is approved."
              : phaseInfo.reason
          }
        />
        <div className="space-y-4">
          <LatestAmendmentsPanel projectId={projectId} />
          <DriftSummaryPanel projectId={projectId} executionActive={executionActive} />
          <RailCard
            title="Active Agents"
            action={<RailLinkAction to="/engine/projects/$projectId/agent" params={{ projectId }} label="View all" />}
          >
            <ActiveAgentsLive projectId={projectId} />
          </RailCard>
        </div>
      </div>

      {/* ───── Mirrored Point A / Point B ───── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <PointCard
          point="A"
          projectId={projectId}
          status={spine.project.point_a_status}
          bullets={extractPointBullets(pointA, "A")}
          sourceCount={spine.sources.total}
          approvedAt={spine.version?.approved_at ?? null}
          inspectorKey="point_a"
          inspectorLabel="Point A — Current Reality"
          summary={derivePointSummary(pointA, "A")}
          whatChanged={derivePointWhatChanged(spine.activity, "A")}
        />
        <PointCard
          point="B"
          projectId={projectId}
          status={spine.project.point_b_status}
          bullets={extractPointBullets(pointB, "B")}
          sourceCount={spine.sources.total}
          approvedAt={spine.version?.approved_at ?? null}
          inspectorKey="point_b"
          inspectorLabel="Point B — Desired Future"
          summary={derivePointSummary(pointB, "B")}
          whatChanged={derivePointWhatChanged(spine.activity, "B")}
        />
      </div>

      {/* ───── Doctrine cards: World Entry & Execution Boundary ───── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <WorldEntryCard projectId={projectId} />
        <ExecutionBoundaryCard projectId={projectId} />
      </div>

      {/* ───── Roadmap baseline approval (with post-approve confirmation) ───── */}
      {spine.version && (spine.version.status !== "approved" || justApproved) ? (
        <RoadmapApprovalCard
          projectId={projectId}
          versionLabel={spine.version.label ?? null}
          status={justApproved ? "approved" : (spine.version.status ?? "draft")}
          ownerEmail={spine.project.client_owner_email}
          dueDate={nextMilestone?.due_date ?? null}
          milestoneCount={spine.milestones.length}
          approving={baselineApproving}
          onApprove={async () => {
            if (!spine.version) return;
            const label = spine.version.label ?? "v0.1";
            if (!window.confirm(`Approve ${label} as the baseline? This locks the snapshot.`)) return;
            setBaselineApproving(true);
            try {
              await approveVersionFn({ data: { id: spine.version.id } });
              const now = new Date().toISOString();
              setJustApproved({ at: now, by: null });
              toast.success(`Baseline approved: ${label}`);
              await Promise.all([
                queryClient.invalidateQueries({ queryKey: ["engine", "spine", projectId] }),
                queryClient.invalidateQueries({ queryKey: ["engine", "roadmap-versions", projectId] }),
                queryClient.invalidateQueries({ queryKey: ["engine", "roadmap", projectId] }),
              ]);
            } catch (e) {
              toast.error((e as Error).message ?? "Approval failed");
            } finally {
              setBaselineApproving(false);
            }
          }}
          onCompare={() => setCompareOpen(true)}
          justApprovedAt={justApproved?.at ?? null}
          approvedBy={justApproved?.by ?? null}
        />
      ) : null}

      {compareOpen && (
        <CompareVersionsModal
          projectId={projectId}
          versions={(versionsQ.data?.rows ?? []).map((v) => ({
            id: v.id,
            label: v.version ?? null,
            status: v.status ?? "draft",
            created_at: v.created_at ?? new Date().toISOString(),
            approved_at: v.approved_at ?? null,
          }))}
          onClose={() => setCompareOpen(false)}
        />
      )}

      {/* ───── Strategic Thesis ───── */}
      <StrategicThesisCard projectId={projectId} />

      {/* ───── Business Roadmap preview strip (Point A → phases → Point B) ───── */}
      <BusinessRoadmapPreview
        projectId={projectId}
        milestones={spine.milestones}
        currentStep={spine.project.current_step}
        pointAApproved={isApprovedTruth(spine.project.point_a_status)}
        pointBApproved={isApprovedTruth(spine.project.point_b_status)}
      />

      {/* ───── Milestone Readiness matrix ───── */}
      <MilestoneReadinessMatrix
        projectId={projectId}
        milestones={spine.milestones}
        ownerEmail={spine.project.client_owner_email}
      />


      {/* ───── Project Evidence & History (collapsed operational detail) ───── */}
      <details className="group rounded-2xl border border-[#E8E1D6] bg-white shadow-sm">
        <summary className="cursor-pointer list-none px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-display text-base text-[#0A0F1F]">Project Evidence &amp; History</div>
              <div className="mt-0.5 text-xs text-[#667085]">
                Approvals, modules, sources, activity, audit, tasks, versions, readiness contract.
              </div>
            </div>
            <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-[#667085] group-open:text-[#3E68B2]">
              <span className="group-open:hidden">Expand</span>
              <span className="hidden group-open:inline">Collapse</span>
            </div>
          </div>
        </summary>
        <div className="space-y-6 border-t border-[#E8E1D6] px-5 py-5">

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
          <SpineReadinessPanel projectId={projectId} />
        </SearchableBlock>
      </section>

        </div>
      </details>

      <NotificationsCard notifications={spine.notifications} />
        </>
      ) : variant === "incomplete" ? (
        <SpineIncompleteBody spine={spine} projectId={projectId} />
      ) : (
        <SpineClientReadyBody spine={spine} projectId={projectId} />
      )}
        </div>

      <AskCaptainModal

        open={askCaptainOpen}
        onClose={() => setAskCaptainOpen(false)}
        projectId={projectId}
      />
    </div>

  );
}

/* ─────────────────── New Spine 2.0 layout components ─────────────────── */

function SpinePageHeader({
  projectId: _projectId,
  pendingApprovalsCount,
  onAskCaptain,
}: {
  projectId: string;
  pendingApprovalsCount: number;
  onAskCaptain?: () => void;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#667085]">
          Project Spine
        </div>
        <p className="mt-0.5 text-[13px] text-[#667085] leading-snug">
          Live truth · approved direction · next best move.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5" data-qa-role="spine-header-actions">
        <a
          href="#spine-approvals"
          data-qa-action="approvals"
          className="inline-flex items-center gap-1.5 rounded-full border border-[#E8E1D6] bg-white px-3 py-1.5 text-[13px] text-[#0A0F1F] transition hover:border-[#3E68B2]/50"
        >
          Approvals
          <span className="inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-[#3E68B2] px-1 text-[10px] font-semibold text-white">
            {pendingApprovalsCount}
          </span>
        </a>
        <button
          type="button"
          onClick={onAskCaptain}
          data-qa-action="ask-captain"
          className="inline-flex items-center gap-1.5 rounded-full border border-[#E8E1D6] bg-white px-3 py-1.5 text-[13px] text-[#0A0F1F] transition hover:border-[#3E68B2]/50"
        >
          <Sparkles className="h-3.5 w-3.5 text-[#3E68B2]" />
          Ask Captain
        </button>
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
            <MetaKV label="Impact" value={tone === "critical" ? "High" : tone === "warning" ? "Medium" : "Standard"} />
            <MetaKV label="Unlocks" value={nextMilestone?.phase ? humanize(nextMilestone.phase) : "Next phase"} />
            <MetaKV label="Owner" value="Tai" />
            <MetaKV label="Due" value={nextMilestone?.due_date ? formatDate(nextMilestone.due_date) : "Today"} />
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
  healthScore: _healthScore,
  ownerEmail,
  portalPublish,
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
  portalPublish: ProjectSpinePayload["portal_publish"];
}) {
  const clientPortal = portalPublish
    ? humanize(portalPublish.status)
    : "Not Published";
  const projectType = project.frame ? humanize(project.frame) : "—";
  const parentProject = project.client_company || "—";
  const client = project.client_company || "—";
  const ownerLine = ownerEmail ?? "—";

  const left: Array<[string, ReactNode]> = [
    ["Client", client],
    ["Project Type", projectType],
    ["Parent Project", parentProject],
    ["Target Date", nextMilestoneDue ? formatDate(nextMilestoneDue) : "—"],
    ["Roadmap Version", version?.label ?? "Draft"],
  ];
  const right: Array<[string, ReactNode]> = [
    ["Open Approvals", String(pendingApprovals)],
    [
      "Blocked Items",
      <span key="b" className={cn(blockedItems > 0 ? "text-[#a4283c]" : "text-[#0A0F1F]")}>
        {blockedItems}
      </span>,
    ],
    ["Active Milestones", `${approvedMilestones} of ${totalMilestones}`],
    ["Client Portal", clientPortal],
    ["Owner", ownerLine],
  ];

  return (
    <section
      aria-labelledby="spine-snapshot-heading"
      className="rounded-2xl border border-[#E8E1D6] bg-white p-6 shadow-sm"
    >
      <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#667085]">
        Project Snapshot
      </div>
      <h2 id="spine-snapshot-heading" className="sr-only">Project Snapshot</h2>
      <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-4">
        <dl className="space-y-3">
          {left.map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-3">
              <dt className="text-xs text-[#667085]">{k}</dt>
              <dd className="text-sm font-medium text-[#0A0F1F] text-right truncate">{v}</dd>
            </div>
          ))}
        </dl>
        <dl className="space-y-3">
          {right.map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-3">
              <dt className="text-xs text-[#667085]">{k}</dt>
              <dd className="text-sm font-medium text-[#0A0F1F] text-right truncate">{v}</dd>
            </div>
          ))}
        </dl>
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
  status,
  bullets,
  sourceCount,
  approvedAt,
  inspectorKey,
  inspectorLabel,
}: {
  point: "A" | "B";
  projectId: string;
  status: SpineFieldStatus | null;
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
  const presentation = presentationFor(status);
  const badgeTone = badgeToneFor(presentation.tone);
  const badgeLabel = presentation.label;

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
          {(() => {
            const link = getIntelligenceRoomLink(point);
            return (
              <Link
                to={link.to}
                params={{ projectId }}
                hash={link.hash}
                data-qa-action="open-intelligence-room"
                data-qa-anchor={link.hash}
                onClick={() => {
                  // Runs after nav; scrolls to anchor and warns (dev only) if missing.
                  window.setTimeout(() => validateIntelligenceAnchor(link.hash), 50);
                }}
                className="inline-flex items-center gap-1 font-medium text-[#3E68B2] hover:text-[#284f93]"
              >
                <Brain className="h-3 w-3" />
                Open intelligence room
              </Link>
            );
          })()}
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

type GateState =
  | "done"
  | "review"
  | "blocked"
  | "in_progress"
  | "not_started"
  | "not_configured"
  | "not_ready"
  | "na";

const DEFAULT_GATE_COLUMNS: Array<{
  key: "criteria" | "mockups" | "build" | "qa" | "due_date";
  label: string;
}> = [
  { key: "criteria", label: "Criteria" },
  { key: "mockups", label: "Mockups" },
  { key: "build", label: "Build" },
  { key: "qa", label: "QA" },
  { key: "due_date", label: "Due" },
];

const DETAIL_GATE_COLUMNS: Array<{
  key: "design" | "evidence" | "qa_auto" | "qa_human" | "dependencies" | "blockers";
  label: string;
}> = [
  { key: "design", label: "Design" },
  { key: "evidence", label: "Evidence" },
  { key: "qa_auto", label: "Automated QA" },
  { key: "qa_human", label: "Human QA" },
  { key: "dependencies", label: "Dependencies" },
  { key: "blockers", label: "Blockers" },
];

function combineQaState(auto: GateState, human: GateState): GateState {
  const states = [auto, human].filter(
    (s): s is GateState => s !== "na" && s !== "not_configured",
  );
  if (states.length === 0) return "not_configured";
  if (states.some((s) => s === "blocked")) return "blocked";
  if (states.some((s) => s === "review")) return "review";
  if (states.every((s) => s === "done")) return "done";
  if (states.some((s) => s === "in_progress")) return "in_progress";
  if (states.some((s) => s === "not_ready")) return "not_ready";
  return "not_started";
}

/**
 * Canonical gate order used to identify the *current* gate blocking a
 * milestone. Kept in-file (not shared) because it only makes sense in
 * the context of the readiness table on the Spine.
 */
const CURRENT_GATE_ORDER: Array<{
  key: keyof ProjectSpinePayload["milestones"][number]["readiness"];
  label: string;
  reason: string;
  move: string;
}> = [
  {
    key: "criteria",
    label: "Acceptance criteria",
    reason: "No acceptance criteria captured yet.",
    move: "Draft criteria in the milestone brief.",
  },
  {
    key: "design",
    label: "Design frame",
    reason: "No design frame is defined.",
    move: "Create the design frame in Plans & Specs.",
  },
  {
    key: "mockups",
    label: "Mockups",
    reason: "Mockups have not been produced.",
    move: "Attach mockups or generate them from the frame.",
  },
  {
    key: "build",
    label: "Build packet",
    reason: "Build packet is not ready.",
    move: "Package the build spec for execution.",
  },
  {
    key: "evidence",
    label: "Build evidence",
    reason: "Build evidence has not been submitted.",
    move: "Upload build evidence when the work lands.",
  },
  {
    key: "qa_auto",
    label: "Automated QA",
    reason: "Automated QA has not run or is failing.",
    move: "Run the automated QA plan and resolve failures.",
  },
  {
    key: "qa_human",
    label: "Human QA",
    reason: "Human QA review is pending.",
    move: "Complete the human QA review.",
  },
  {
    key: "dependencies",
    label: "Dependencies",
    reason: "Upstream dependencies are not satisfied.",
    move: "Unblock or reroute the dependency.",
  },
  {
    key: "blockers",
    label: "Blockers",
    reason: "An open blocker is preventing progress.",
    move: "Resolve or reassign the blocker.",
  },
];

type CurrentGate = {
  milestone: ProjectSpinePayload["milestones"][number];
  gate: (typeof CURRENT_GATE_ORDER)[number] | null;
  state: GateState | null;
  nextGate: (typeof CURRENT_GATE_ORDER)[number] | null;
};

function deriveCurrentGates(
  milestones: ProjectSpinePayload["milestones"],
): CurrentGate[] {
  // Focus on milestones that are not yet fully done and are the closest
  // to shipping — first three by sort_index that still have work.
  const active = milestones
    .filter((m) => m.status !== "done" && m.approval_status !== "rejected")
    .slice(0, 3);
  return active.map((m) => {
    const gates = m.readiness;
    const firstIncomplete = CURRENT_GATE_ORDER.findIndex((g) => {
      const s = gates[g.key] as GateState | undefined;
      return s !== "done" && s !== "na";
    });
    if (firstIncomplete === -1) {
      return { milestone: m, gate: null, state: null, nextGate: null };
    }
    const gate = CURRENT_GATE_ORDER[firstIncomplete];
    const state = gates[gate.key] as GateState;
    // Next gate after the current one that still needs attention.
    const nextIdx = CURRENT_GATE_ORDER.findIndex((g, i) => {
      if (i <= firstIncomplete) return false;
      const s = gates[g.key] as GateState | undefined;
      return s !== "done" && s !== "na";
    });
    const nextGate = nextIdx === -1 ? null : CURRENT_GATE_ORDER[nextIdx];
    return { milestone: m, gate, state, nextGate };
  });
}

function humanizeGateState(state: GateState | null): string {
  switch (state) {
    case "blocked":
      return "Blocked";
    case "review":
      return "In review";
    case "in_progress":
      return "In progress";
    case "not_ready":
      return "Not ready";
    case "not_started":
      return "Not started";
    case "not_configured":
      return "Not configured";
    case "done":
      return "Done";
    case "na":
      return "N/A";
    default:
      return "—";
  }
}

function MilestoneReadinessMatrix({
  projectId,
  milestones,
  ownerEmail,
}: {
  projectId: string;
  milestones: ProjectSpinePayload["milestones"];
  ownerEmail: string | null;
}) {
  const rows = milestones.slice(0, 6);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const storageKey = `spine.readiness.showAll:${projectId}`;
  const [showAll, setShowAll] = useState<boolean>(false);
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const currentGates = deriveCurrentGates(milestones);

  // Restore per-project session preference on mount.
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(storageKey);
      if (raw === "1") setShowAll(true);
    } catch { /* sessionStorage may be unavailable */ }
  }, [storageKey]);

  const toggleShowAll = () => {
    // Preserve scroll position across the layout swap: capture the
    // section's viewport-relative top, flip state, then re-anchor.
    const rect = sectionRef.current?.getBoundingClientRect();
    const top = rect ? rect.top : null;
    setShowAll((v) => {
      const next = !v;
      try { window.sessionStorage.setItem(storageKey, next ? "1" : "0"); } catch { /* noop */ }
      return next;
    });
    if (top != null) {
      requestAnimationFrame(() => {
        const newRect = sectionRef.current?.getBoundingClientRect();
        if (newRect) window.scrollBy({ top: newRect.top - top, behavior: "auto" });
      });
    }
  };

  return (
    <section
      ref={sectionRef}
      id="spine-milestones"
      className="scroll-mt-4 rounded-2xl border border-[#E8E1D6] bg-white p-5 shadow-sm"
    >
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h2 className="font-display text-lg text-[#0A0F1F]">Milestone Readiness</h2>
          <p className="mt-1 text-xs text-[#667085]">
            {showAll
              ? "Every gate across every milestone. Derived from durable project records."
              : "What matters now — the milestone in flight, the gate blocking it, and the next move."}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={toggleShowAll}
            className="inline-flex items-center gap-1 text-xs font-medium text-[#3E68B2] transition-colors hover:text-[#284f93]"
            aria-pressed={showAll}
            aria-controls="spine-milestones-body"
          >
            {showAll ? "Show current gate" : "View all"}
            {showAll ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          <Link
            to="/engine/projects/$projectId/roadmap"
            params={{ projectId }}
            search={{ view: "journey" }}
            className="inline-flex items-center gap-1 text-xs font-medium text-[#3E68B2] hover:text-[#284f93]"
          >
            Open roadmap <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      <div id="spine-milestones-body" key={showAll ? "all" : "current"} className="animate-fade-in">


      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-[#667085]">No milestones captured yet.</p>
      ) : !showAll ? (
        currentGates.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-[#E8E1D6] bg-[#FBF9F4] p-4 text-sm text-[#667085]">
            No active milestones. Approve the next milestone from the roadmap to begin.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#E8E1D6] text-[#667085]">
                  <th className="py-2 pr-4 font-mono text-[10px] uppercase tracking-[0.22em]">Milestone</th>
                  <th className="py-2 pr-4 font-mono text-[10px] uppercase tracking-[0.22em]">Current gate</th>
                  <th className="py-2 pr-4 font-mono text-[10px] uppercase tracking-[0.22em]">Why it's not ready</th>
                  <th className="py-2 pr-4 font-mono text-[10px] uppercase tracking-[0.22em]">Next gate</th>
                  <th className="py-2 pr-4 font-mono text-[10px] uppercase tracking-[0.22em]">Owner</th>
                  <th className="py-2 pr-3 font-mono text-[10px] uppercase tracking-[0.22em]">Next move</th>
                </tr>
              </thead>
              <tbody>
                {currentGates.map(({ milestone: m, gate, state, nextGate }) => (
                  <tr key={m.id} className="border-b border-[#F3EEE6] align-top">
                    <td className="py-3 pr-4">
                      <Link
                        to="/engine/projects/$projectId/milestones/$milestoneId/brief"
                        params={{ projectId, milestoneId: m.id }}
                        className="font-medium text-[#0A0F1F] hover:text-[#3E68B2]"
                      >
                        {m.name}
                      </Link>
                      {m.due_date ? (
                        <div className="mt-0.5 text-[11px] text-[#667085]">
                          Due {formatDate(m.due_date)}
                        </div>
                      ) : null}
                    </td>
                    <td className="py-3 pr-4">
                      {gate ? (
                        <div>
                          <div className="text-sm text-[#0A0F1F]">{gate.label}</div>
                          <div className="mt-1">
                            <GateChip state={state ?? "not_started"} />
                          </div>
                        </div>
                      ) : (
                        <GateChip state="done" />
                      )}
                    </td>
                    <td className="py-3 pr-4 text-[13px] leading-5 text-[#3f4a5e]">
                      {gate ? gate.reason : "All gates cleared — awaiting approval."}
                    </td>
                    <td className="py-3 pr-4 text-[13px] text-[#3f4a5e]">
                      {nextGate ? nextGate.label : gate ? "—" : "Ready to close"}
                    </td>
                    <td className="py-3 pr-4 text-[13px] text-[#3f4a5e]">
                      {ownerEmail ?? <span className="text-[#8a94a6]">Unassigned</span>}
                    </td>
                    <td className="py-3 pr-3 text-[13px] leading-5 text-[#0A0F1F]">
                      {gate ? gate.move : "Send to approval."}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#E8E1D6] text-[#667085]">
                <th className="py-2 pr-4 font-mono text-[10px] uppercase tracking-[0.22em]">Milestone</th>
                {DEFAULT_GATE_COLUMNS.map((c) => (
                  <th key={c.key} className="py-2 pr-3 font-mono text-[10px] uppercase tracking-[0.22em]">
                    {c.label}
                  </th>
                ))}
                <th className="py-2 pr-3 font-mono text-[10px] uppercase tracking-[0.22em]">Details</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => {
                const gates = m.readiness;
                const qaCombined = combineQaState(
                  gates.qa_auto as GateState,
                  gates.qa_human as GateState,
                );
                const isOpen = !!expanded[m.id];
                return (
                  <>
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
                      {DEFAULT_GATE_COLUMNS.map((c) => {
                        const state: GateState =
                          c.key === "qa" ? qaCombined : (gates[c.key] as GateState);
                        return (
                          <td key={c.key} className="py-3 pr-3">
                            <GateChip state={state} />
                          </td>
                        );
                      })}
                      <td className="py-3 pr-3">
                        <button
                          type="button"
                          onClick={() =>
                            setExpanded((prev) => ({ ...prev, [m.id]: !prev[m.id] }))
                          }
                          className="inline-flex items-center gap-1 text-xs font-medium text-[#3E68B2] hover:text-[#284f93]"
                          aria-expanded={isOpen}
                          aria-controls={`milestone-details-${m.id}`}
                        >
                          {isOpen ? (
                            <>
                              Less <ChevronUp className="h-3 w-3" />
                            </>
                          ) : (
                            <>
                              More <ChevronDown className="h-3 w-3" />
                            </>
                          )}
                        </button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr
                        id={`milestone-details-${m.id}`}
                        className="border-b border-[#F3EEE6] bg-[#FAF8F5] align-middle"
                      >
                        <td colSpan={DEFAULT_GATE_COLUMNS.length + 2} className="py-3 pr-4">
                          <div className="flex flex-wrap items-center gap-3">
                            <span className="text-xs font-medium text-[#667085]">All gates:</span>
                            {DETAIL_GATE_COLUMNS.map((c) => (
                              <div key={c.key} className="flex items-center gap-1.5 rounded-md border border-[#E8E1D6] bg-white px-2 py-1">
                                <span className="text-[10px] uppercase tracking-wide text-[#667085]">
                                  {c.label}
                                </span>
                                <GateChip state={gates[c.key] as GateState} />
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      </div>
      {/* Suppress the eslint hint for humanizeGateState if unused elsewhere — kept for future chip labeling. */}
      <span className="sr-only">{humanizeGateState(null)}</span>
    </section>
  );
}

// deriveGates removed — Milestone Readiness now uses durable records
// via `SpineMilestone.readiness` computed in `getProjectSpine`.


function GateChip({ state }: { state: GateState }) {
  if (state === "done")
    return <CheckCircle2 className="h-4 w-4 text-[#1f6b3b]" aria-label="Done" />;
  if (state === "review")
    return <GenericBadge tone="pending">Review</GenericBadge>;
  if (state === "blocked")
    return <GenericBadge tone="blocked">Blocked</GenericBadge>;
  if (state === "in_progress")
    return <GenericBadge tone="info">In Progress</GenericBadge>;
  if (state === "not_configured")
    return <GenericBadge tone="neutral">Not configured</GenericBadge>;
  if (state === "not_ready")
    return <GenericBadge tone="neutral">Not Ready</GenericBadge>;
  if (state === "not_started")
    return <GenericBadge tone="neutral">Not Started</GenericBadge>;
  return <span className="text-[#667085]">—</span>;
}

function ApprovalsInlineCard({ reviews }: { reviews: ProjectSpinePayload["reviews"] }) {
  const [impact, setImpact] = useState<"all" | "high" | "medium" | "low">("all");
  const [expanded, setExpanded] = useState(false);
  const filtered = reviews.filter((r) => impact === "all" || r.impact === impact);
  const visible = expanded ? filtered : filtered.slice(0, 5);
  const counts = {
    all: reviews.length,
    high: reviews.filter((r) => r.impact === "high").length,
    medium: reviews.filter((r) => r.impact === "medium").length,
    low: reviews.filter((r) => r.impact === "low").length,
  };
  const chip = (key: "all" | "high" | "medium" | "low", label: string) => (
    <button
      key={key}
      type="button"
      onClick={() => setImpact(key)}
      className={cn(
        "rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition",
        impact === key
          ? "border-[#3E68B2] bg-[#3E68B2] text-white"
          : "border-[#E8E1D6] bg-white text-[#667085] hover:border-[#3E68B2]/60 hover:text-[#3E68B2]",
      )}
    >
      {label} <span className="opacity-70">· {counts[key]}</span>
    </button>
  );
  return (
    <section
      id="spine-approvals"
      className="scroll-mt-4 rounded-2xl border border-[#E8E1D6] bg-white p-5 shadow-sm"
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
      {reviews.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {chip("all", "All")}
          {chip("high", "High impact")}
          {chip("medium", "Medium")}
          {chip("low", "Low")}
        </div>
      ) : null}
      {filtered.length === 0 ? (
        <p className="mt-4 text-sm text-[#667085]">
          {reviews.length === 0 ? "No pending review items." : "No items match this filter."}
        </p>
      ) : (
        <>
          <ul className="mt-4 space-y-3">
            {visible.map((r) => {
              const dotClass =
                r.impact === "high"
                  ? "bg-[#a4283c]"
                  : r.impact === "medium"
                    ? "bg-[#8a6713]"
                    : "bg-[#3E68B2]";
              return (
                <li
                  key={r.id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-[#F3EEE6] p-3 hover:border-[#3E68B2]/40"
                >
                  <div className="flex min-w-0 gap-2">
                    <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", dotClass)} />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-[#0A0F1F]">{r.title}</div>
                      <div className="mt-0.5 text-xs text-[#667085]">
                        {humanize(r.item_type)} · {formatRelative(r.created_at)} ·{" "}
                        {r.status === "pending" || r.status === "needs_review"
                          ? "Needs your approval"
                          : "Awaiting decision"}
                      </div>
                    </div>
                  </div>
                  <a
                    href={`/engine/approvals#${r.id}`}
                    className="shrink-0 rounded-full border border-[#E8E1D6] bg-white px-3 py-1 text-xs font-medium text-[#3E68B2] hover:border-[#3E68B2]/60"
                  >
                    Review
                  </a>
                </li>
              );
            })}
          </ul>
          {filtered.length > 5 ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[#3E68B2] hover:text-[#284f93]"
            >
              {expanded ? "Show fewer" : `Show all ${filtered.length}`}
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
          ) : null}
        </>
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
      <ul className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {rows.map((r) => (
          <li key={r.label} className="rounded-xl border border-[#F3EEE6] bg-[#FBF7F0]/60 p-3">
            <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.18em] text-[#667085]">
              <span>{r.icon}</span>
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
            <div className="mt-2 text-sm font-semibold text-[#0A0F1F] leading-tight">{r.value}</div>
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
  // Empty operational cards create visual noise and do not support project
  // health. Hide entirely when nothing to show — the header notification
  // bell still surfaces new items.
  if (!notifications.length) return null;
  return (
    <div className="rounded-2xl border border-[#E8E1D6] bg-white p-5 shadow-sm">
      <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#667085]">
        Operator notifications
      </div>
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
          <p className="mt-1 whitespace-pre-line text-[#7a1e2d]">{message}</p>
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
              search={s.to === "/engine/projects/$projectId/roadmap" ? { view: "journey" as const } : (undefined as never)}
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

/**
 * Point A/B card summary: a single short sentence pulled from the
 * richest available field, so both cards start with the same
 * structural cell instead of leading with bullets.
 */
function derivePointSummary(
  record: Record<string, unknown> | null,
  point: "A" | "B",
): string | null {
  if (!record) return null;
  const keys =
    point === "A"
      ? ["summary", "description", "key_diagnosis", "current_state", "challenges"]
      : ["summary", "description", "24_month_destination", "destination", "vision", "goal"];
  for (const k of keys) {
    const v = record[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

/**
 * "What changed" cell: most recent activity row related to this point.
 * Falls back to null when no relevant signal exists.
 */
function derivePointWhatChanged(
  activity: ReadonlyArray<{ title?: string | null; created_at?: string | null; area?: string | null }>,
  point: "A" | "B",
): string | null {
  const needle = point === "A" ? /point[-_ ]?a|current reality|diagnosis/i : /point[-_ ]?b|destination|desired future/i;
  const hit = activity.find((a) => {
    const t = (a.title ?? "") + " " + (a.area ?? "");
    return needle.test(t);
  });
  if (!hit?.title) return null;
  const when = hit.created_at ? new Date(hit.created_at).toLocaleDateString() : null;
  return when ? `${hit.title} · ${when}` : hit.title;
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
 * The variant is selected server-side inside `getProjectSpine` and exposed
 * as `spine.view.variant`. Doctrine mirror:
 * `doctrine/PROJECT_SPINE_CONTRACT.md` §5 and `src/lib/spine-variant.ts`.
 */

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
    if (!isApprovedTruth(spine.project.point_a_status)) missing.push("Point A");
    if (!isApprovedTruth(spine.project.point_b_status)) missing.push("Point B");
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

const BLOCKER_PRIORITY_ORDER: readonly string[] = [
  "point_a_approved",
  "point_b_approved",
  "constraints_named",
  "gaps_classified",
  "roadmap_rationale_approved",
  "critical_dates_captured",
];

function deriveTopBlockers(
  checks: readonly SpineReadinessCheckResult[],
): SpineReadinessCheckResult[] {
  const failing = checks.filter((c) => c.state !== "pass");
  const ordered = BLOCKER_PRIORITY_ORDER.map((id) =>
    failing.find((c) => c.id === id),
  ).filter((c): c is SpineReadinessCheckResult => !!c);
  const rest = failing.filter((c) => !BLOCKER_PRIORITY_ORDER.includes(c.id));
  return [...ordered, ...rest].slice(0, 5);
}

function resolveLinkForCheck(check: SpineReadinessCheckResult): string | null {
  const section = getSpineSection(check.section_key);
  if (section.key === "point_a") return "point-a";
  if (section.key === "point_b") return "point-b";
  return section.deep_link_pattern;
}

function RoomLink({
  projectId,
  link,
  children,
}: {
  projectId: string;
  link: string;
  children: ReactNode;
}) {
  const params = { projectId };
  const className =
    "inline-flex shrink-0 items-center gap-1 text-xs font-medium text-[#0A0F1F] transition hover:underline";
  if (link === "point-a") {
    return (
      <Link to="/engine/projects/$projectId/point-a" params={params} className={className}>
        {children}
      </Link>
    );
  }
  if (link === "point-b") {
    return (
      <Link to="/engine/projects/$projectId/point-b" params={params} className={className}>
        {children}
      </Link>
    );
  }
  if (link === "understanding-room") {
    return (
      <Link to="/engine/projects/$projectId/understanding-room" params={params} className={className}>
        {children}
      </Link>
    );
  }
  if (link === "gap-map") {
    return (
      <Link to="/engine/projects/$projectId/gap-map" params={params} className={className}>
        {children}
      </Link>
    );
  }
  if (link === "hidden-assets") {
    return (
      <Link to="/engine/projects/$projectId/hidden-assets" params={params} className={className}>
        {children}
      </Link>
    );
  }
  if (link === "builder") {
    return (
      <Link to="/engine/projects/$projectId/builder" params={params} className={className}>
        {children}
      </Link>
    );
  }
  if (link === "sequencing") {
    return (
      <Link to="/engine/projects/$projectId/sequencing" params={params} className={className}>
        {children}
      </Link>
    );
  }
  if (link === "investment") {
    return (
      <Link to="/engine/projects/$projectId/investment" params={params} className={className}>
        {children}
      </Link>
    );
  }
  if (link === "preview") {
    return (
      <Link to="/engine/projects/$projectId/preview" params={params} className={className}>
        {children}
      </Link>
    );
  }
  return null;
}

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

  const readinessFn = useServerFn(evaluateProjectSpineReadiness);
  const readinessQ = useQuery({
    queryKey: ["engine", "spine-readiness", projectId],
    queryFn: () => readinessFn({ data: { projectId } }),
    enabled: !!projectId,
    staleTime: 30_000,
  });

  const readinessResult = readinessQ.data?.result;
  const topBlockers: SpineReadinessCheckResult[] = readinessResult
    ? deriveTopBlockers(readinessResult.checks)
    : [];

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
          status={spine.project.point_a_status}
          bullets={collectTruthBullets(pointA, ["current_state", "challenges", "summary", "description"])}
          sourceCount={spine.sources.total}
          approvedAt={spine.version?.approved_at ?? null}
          inspectorKey="point_a"
          inspectorLabel="Point A — Current Reality"
        />
        <TruthCardV2
          point="B"
          projectId={projectId}
          status={spine.project.point_b_status}
          bullets={collectTruthBullets(pointB, ["destination", "goal", "vision", "success_looks_like", "frame"])}
          sourceCount={spine.sources.total}
          approvedAt={spine.version?.approved_at ?? null}
          inspectorKey="point_b"
          inspectorLabel="Point B — Desired Future"
        />
      </div>

      <BusinessRoadmapPreview
        projectId={projectId}
        milestones={spine.milestones}
        currentStep={spine.project.current_step}
        pointAApproved={isApprovedTruth(spine.project.point_a_status)}
        pointBApproved={isApprovedTruth(spine.project.point_b_status)}
        draft
      />

      {topBlockers.length > 0 ? (
        <section className="rounded-2xl border border-[#f1e3b9] bg-[#fbf6e4] p-5 shadow-sm">
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#8a6713]">
            Resolve these first
          </div>
          <ul className="mt-3 space-y-2">
            {topBlockers.map((check) => {
              const link = resolveLinkForCheck(check);
              return (
                <li key={check.id} className="flex items-start gap-3 text-sm">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[#8a6713]" />
                  <div className="min-w-0 flex-1">
                    <span className="text-[#0A0F1F]">{check.label}</span>
                    {check.note ? (
                      <div className="text-xs text-[#667085]">{check.note}</div>
                    ) : null}
                  </div>
                  {link ? (
                    <RoomLink projectId={projectId} link={link}>
                      Go to room
                      <ArrowRight className="h-3 w-3" />
                    </RoomLink>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <details className="group rounded-2xl border border-[#E8E1D6] bg-white shadow-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between p-5">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#8a6713]">
              View all readiness checks
            </div>
            <div className="mt-1 text-xs text-[#667085]">
              {readinessResult
                ? `${readinessResult.passed} of ${readinessResult.total} passing`
                : "Loading readiness checks..."}
            </div>
          </div>
          <ChevronDown className="h-4 w-4 text-[#667085] transition group-open:rotate-180" />
        </summary>
        <div className="border-t border-[#E8E1D6] p-5">
          <SpineReadinessPanel projectId={projectId} />
        </div>
      </details>

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
          status={spine.project.point_a_status}
          bullets={collectTruthBullets(pointA, ["current_state", "challenges", "summary", "description"])}
          sourceCount={spine.sources.total}
          approvedAt={spine.version?.approved_at ?? null}
          inspectorKey="point_a"
          inspectorLabel="Point A — Current Reality"
        />
        <TruthCardV2
          point="B"
          projectId={projectId}
          status={spine.project.point_b_status}
          bullets={collectTruthBullets(pointB, ["destination", "goal", "vision", "success_looks_like", "frame"])}
          sourceCount={spine.sources.total}
          approvedAt={spine.version?.approved_at ?? null}
          inspectorKey="point_b"
          inspectorLabel="Point B — Desired Future"
        />
      </div>

      <BusinessRoadmapPreview
        projectId={projectId}
        milestones={spine.milestones}
        currentStep={spine.project.current_step}
        pointAApproved={isApprovedTruth(spine.project.point_a_status)}
        pointBApproved={isApprovedTruth(spine.project.point_b_status)}
      />

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

/**
 * Business Roadmap preview — horizontal Point A → Phase 1 … Phase N → Point B
 * strip required by PROJECT_SPINE_CONTRACT.md §5. Phases are derived from
 * approved milestones grouped by `phase`. The current phase is inferred from
 * `project.current_step` when it matches a phase key. Purely presentational:
 * consumes existing spine payload, no new data fetch.
 */
function BusinessRoadmapPreview({
  projectId,
  milestones,
  currentStep,
  pointAApproved,
  pointBApproved,
  draft = false,
}: {
  projectId: string;
  milestones: ProjectSpinePayload["milestones"];
  currentStep: string | null;
  pointAApproved: boolean;
  pointBApproved: boolean;
  draft?: boolean;
}) {
  const grouped = groupMilestones(milestones);
  const currentPhaseLabel = currentStep ? humanize(currentStep) : null;
  return (
    <section
      aria-labelledby="spine-roadmap-preview-heading"
      className="rounded-2xl border border-[#E8E1D6] bg-white p-5 shadow-sm"
    >
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#667085]">
            Business roadmap
          </div>
          <h2 id="spine-roadmap-preview-heading" className="font-display text-base text-[#0A0F1F]">
            Point A → phases → Point B
          </h2>
          {draft ? (
            <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.22em] text-[#8a6713]">
              Draft roadmap direction, generated from current understanding
            </div>
          ) : null}
        </div>
        <Link
          to="/engine/projects/$projectId/roadmap"
          params={{ projectId }}
          search={{ view: "journey" }}
          className="inline-flex items-center gap-1 text-xs font-medium text-[#3E68B2] hover:text-[#284f93]"
        >
          Open full roadmap <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {grouped.length === 0 ? (
        <p className="mt-4 text-sm text-[#667085]">
          No phases captured yet. Approve milestones to see the phased path.
        </p>
      ) : (
        <ol className="mt-4 flex items-stretch gap-2 overflow-x-auto pb-1">
          <li className="flex min-w-[8rem] flex-col items-center justify-center rounded-xl border border-[#E8E1D6] bg-[#FBF9F4] px-3 py-3 text-center">
            <span
              className={cn(
                "inline-flex h-2.5 w-2.5 rounded-full",
                pointAApproved ? "bg-[#1f6b3b]" : "bg-[#c9b78a]",
              )}
              aria-hidden
            />
            <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.22em] text-[#667085]">
              Point A
            </div>
            <div className="mt-0.5 text-xs text-[#0A0F1F]">
              {pointAApproved ? "Approved" : "Not approved"}
            </div>
          </li>
          {grouped.map(([phase, list], idx) => {
            const approved = list.filter((m) => m.approval_status === "approved").length;
            const isCurrent =
              !!currentPhaseLabel && phase.toLowerCase() === currentPhaseLabel.toLowerCase();
            return (
              <li key={phase} className="flex items-center gap-2">
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[#c9b78a]" aria-hidden />
                <div
                  className={cn(
                    "min-w-[10rem] rounded-xl border px-3 py-3",
                    isCurrent
                      ? "border-[#3E68B2] bg-[#eef3fd] shadow-sm"
                      : "border-[#E8E1D6] bg-white",
                  )}
                >
                  <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#667085]">
                    Phase {idx + 1}
                  </div>
                  <div className="mt-0.5 truncate text-sm font-medium text-[#0A0F1F]">
                    {phase}
                  </div>
                  <div className="mt-1 text-[11px] text-[#667085]">
                    {approved}/{list.length} milestone{list.length === 1 ? "" : "s"} approved
                  </div>
                  {isCurrent ? (
                    <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-[0.18em] text-[#3E68B2]">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#3E68B2]" /> Current
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
          <li className="flex items-center gap-2">
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[#c9b78a]" aria-hidden />
            <div className="flex min-w-[8rem] flex-col items-center justify-center rounded-xl border border-[#E8E1D6] bg-[#FBF9F4] px-3 py-3 text-center">
              <span
                className={cn(
                  "inline-flex h-2.5 w-2.5 rounded-full",
                  pointBApproved ? "bg-[#1f6b3b]" : "bg-[#c9b78a]",
                )}
                aria-hidden
              />
              <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.22em] text-[#667085]">
                Point B
              </div>
              <div className="mt-0.5 text-xs text-[#0A0F1F]">
                {pointBApproved ? "Approved" : "Not approved"}
              </div>
            </div>
          </li>
        </ol>
      )}
      {milestones.length > 0 ? <RoadmapFooterSummary milestones={milestones} /> : null}
    </section>
  );
}

function RoadmapFooterSummary({
  milestones,
}: {
  milestones: ProjectSpinePayload["milestones"];
}) {
  const total = milestones.length;
  const approved = milestones.filter((m) => m.approval_status === "approved").length;
  const inProgress = milestones.filter(
    (m) => m.status === "active" || m.status === "in_progress",
  ).length;
  const blocked = milestones.filter(
    (m) => m.status === "blocked" || m.approval_status === "rejected",
  ).length;
  const dated = milestones
    .filter((m): m is typeof m & { due_date: string } => !!m.due_date)
    .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());
  const nextDue = dated[0]?.due_date ?? null;
  const finalDue = dated[dated.length - 1]?.due_date ?? null;

  const cells: Array<[string, string]> = [
    ["Total milestones", String(total)],
    ["Approved", `${approved} of ${total}`],
    ["In progress", String(inProgress)],
    ["Blocked", String(blocked)],
    ["Next due", nextDue ? formatDate(nextDue) : "—"],
    ["Target date", finalDue ? formatDate(finalDue) : "—"],
  ];

  return (
    <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 rounded-xl border border-dashed border-[#E8E1D6] bg-[#FBF9F4] px-4 py-3 sm:grid-cols-3 lg:grid-cols-6">
      {cells.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#667085]">
            {label}
          </div>
          <div
            className={cn(
              "mt-0.5 truncate text-sm font-medium",
              label === "Blocked" && Number(value) > 0
                ? "text-[#a4283c]"
                : "text-[#0A0F1F]",
            )}
          >
            {value}
          </div>
        </div>
      ))}
    </div>
  );
}



/* ─────────────────── Status strip + right rail ─────────────────── */

function StatusChip({ label, tone }: { label: string; tone: "ok" | "warn" | "bad" | "neutral" }) {
  const cls =
    tone === "ok" ? "bg-emerald-50 text-emerald-800 border-emerald-200"
      : tone === "warn" ? "bg-amber-50 text-amber-800 border-amber-200"
      : tone === "bad" ? "bg-rose-50 text-rose-800 border-rose-200"
      : "bg-[#F5EFE4] text-[#0A0F1F] border-[#E8E1D6]";
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium", cls)}>
      {label}
    </span>
  );
}

function SpineStatusStrip({
  spine,
  blockedItems,
  readinessPassed,
  readinessTotal,
}: {
  spine: ProjectSpinePayload;
  blockedItems: number;
  readinessPassed: number | null;
  readinessTotal: number;
}) {
  const project = spine.project;
  const health = project.health_score > 0
    ? healthFromScore(project.health_score)
    : deriveHealth(project.status, blockedItems);
  const healthTone: "ok" | "warn" | "bad" = /green|good|on/i.test(health.label)
    ? "ok" : /red|risk|off/i.test(health.label) ? "bad" : "warn";
  const statusTone: "ok" | "warn" | "bad" | "neutral" =
    project.status === "active" ? "ok"
      : project.status === "at_risk" ? "warn"
      : project.status === "blocked" ? "bad"
      : "neutral";
  const readinessLabel =
    readinessPassed === null ? "Evaluating…" : `${readinessPassed}/${readinessTotal}`;
  const readinessTone: "ok" | "warn" | "bad" | "neutral" =
    readinessPassed === null ? "neutral"
      : readinessPassed >= readinessTotal ? "ok"
      : readinessPassed >= Math.ceil(readinessTotal * 0.6) ? "warn"
      : "bad";
  const lastUpdate = project.updated_at ? formatRelative(project.updated_at) : "—";

  const cells: Array<{ label: string; render: ReactNode }> = [
    { label: "Status", render: <StatusChip label={humanize(project.status)} tone={statusTone} /> },
    {
      label: "Health",
      render: (
        <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink">
          <span className={cn("h-2 w-2 rounded-full", health.dot)} />
          {project.health_score > 0 ? `${project.health_score} · ${health.label}` : health.label}
        </span>
      ),
    },
    {
      label: "Current Phase",
      render: (
        <span className="block truncate text-[13px] font-semibold text-ink">
          {humanize(project.current_step || "—")}
        </span>
      ),
    },
    { label: "Captain", render: <span className="text-[13px] font-semibold text-ink">Tai · Active</span> },
    { label: "Last Update", render: <span className="text-[13px] font-semibold text-ink">{lastUpdate}</span> },
    {
      label: "Version",
      render: <span className="text-[13px] font-semibold text-ink">{spine.version?.label ?? "Draft"}</span>,
    },
    { label: "Readiness", render: <StatusChip label={readinessLabel} tone={readinessTone} /> },
  ];

  return (
    <section
      aria-label="Project status strip"
      className="rounded-2xl border border-rule bg-white px-6 py-4 shadow-sm ring-1 ring-black/[0.02]"
    >
      <ul className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4 lg:grid-cols-7 lg:divide-x lg:divide-rule">
        {cells.map((c, i) => (
          <li
            key={c.label}
            className={cn("min-w-0", i > 0 && "lg:pl-6")}
          >
            <div className="font-mono text-[10px] font-medium uppercase tracking-[0.24em] text-ink/50">
              {c.label}
            </div>
            <div className="mt-2 truncate leading-tight">{c.render}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const diff = Date.now() - t;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(iso);
}

function RailCard({
  title,
  anchor,
  action,
  children,
}: {
  title: string;
  anchor?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[#E8E1D6] bg-white p-4 shadow-sm ring-1 ring-black/[0.02]">
      <div className="mb-3 flex items-center justify-between gap-2">
        {anchor ? (
          <a
            href={anchor}
            className="group inline-flex items-center gap-1 font-display text-sm text-[#0A0F1F] hover:text-[#3E68B2]"
          >
            {title}
            <ArrowRight className="h-3 w-3 opacity-0 transition group-hover:opacity-100" />
          </a>
        ) : (
          <h3 className="font-display text-sm text-[#0A0F1F]">{title}</h3>
        )}
        {action}
      </div>
      {children}
    </section>
  );
}

function RailLinkAction({ to, params, label }: { to: string; params?: Record<string, string>; label: string }) {
  return (
    <Link
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      to={to as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      params={params as any}
      className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#3E68B2] hover:text-[#284f93]"
    >
      {label}
    </Link>
  );
}

const JUMP_TARGETS: Array<{ id: string; label: string }> = [
  { id: "spine-snapshot-heading", label: "Snapshot" },
  { id: "spine-nba-heading", label: "Captain Brief" },
  { id: "spine-milestones", label: "Milestones" },
  { id: "spine-approvals", label: "Approvals" },
  { id: "spine-evidence-heading", label: "Evidence" },
  { id: "spine-roadmap-preview-heading", label: "Roadmap" },
  { id: "working-focus-heading", label: "Working focus" },
];

function JumpToCard() {
  const [available, setAvailable] = useState<Array<{ id: string; label: string }>>([]);
  useEffect(() => {
    const check = () => {
      setAvailable(JUMP_TARGETS.filter((t) => document.getElementById(t.id)));
    };
    check();
    const t = window.setTimeout(check, 250);
    return () => window.clearTimeout(t);
  }, []);
  if (available.length === 0) return null;
  const jump = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    if (history.replaceState) history.replaceState(null, "", `#${id}`);
  };
  return (
    <RailCard title="Jump to">
      <ul className="flex flex-col gap-1">
        {available.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => jump(t.id)}
              className="group flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[13px] text-[#0A0F1F] hover:bg-[#F5EFE4] hover:text-[#3E68B2]"
            >
              <span>{t.label}</span>
              <ArrowRight className="h-3 w-3 opacity-0 transition group-hover:opacity-100" />
            </button>
          </li>
        ))}
      </ul>
    </RailCard>
  );
}

function SpineRightRail({
  spine,
  projectId,
  pendingApprovals,
}: {
  spine: ProjectSpinePayload;
  projectId: string;
  pendingApprovals: number;
}) {
  const [approvalImpact, setApprovalImpact] = useState<"all" | "high" | "medium" | "low">("all");
  const [approvalsExpanded, setApprovalsExpanded] = useState(false);
  const [changesExpanded, setChangesExpanded] = useState(false);

  const filteredReviews = spine.reviews.filter(
    (r) => approvalImpact === "all" || r.impact === approvalImpact,
  );
  const visibleReviews = approvalsExpanded ? filteredReviews : filteredReviews.slice(0, 4);

  const material = spine.activity.filter(
    (a) => a.severity === "critical" || a.severity === "warning",
  );
  const visibleMaterial = changesExpanded ? material : material.slice(0, 4);
  const recent = spine.activity.slice(0, 4);

  const chip = (key: "all" | "high" | "medium" | "low", label: string) => (
    <button
      key={key}
      type="button"
      onClick={() => setApprovalImpact(key)}
      className={cn(
        "rounded-full border px-2 py-0.5 text-[10px] font-medium transition",
        approvalImpact === key
          ? "border-[#3E68B2] bg-[#3E68B2] text-white"
          : "border-[#E8E1D6] bg-white text-[#667085] hover:border-[#3E68B2]/60 hover:text-[#3E68B2]",
      )}
    >
      {label}
    </button>
  );

  return (
    <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto xl:pr-1 [scrollbar-width:thin]">
      <LatestAmendmentsPanel projectId={projectId} />
      <DriftSummaryPanel projectId={projectId} />
      <RailCard
        title="Captain Brief"
        anchor="#spine-nba-heading"
        action={<RailLinkAction to="/engine/projects/$projectId/chat" params={{ projectId }} label="Open chat" />}
      >
        <p className="text-sm text-[#0A0F1F] leading-relaxed">{spine.nba.action}</p>
        {spine.nba.reason ? (
          <p className="mt-2 text-xs text-[#667085] leading-relaxed">{spine.nba.reason}</p>
        ) : null}
      </RailCard>

      <RailCard
        title="Approvals & Blockers"
        anchor="#spine-approvals"
        action={
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#667085]">
            {pendingApprovals} pending
          </span>
        }
      >
        {spine.reviews.length > 0 ? (
          <div className="mb-2 flex flex-wrap items-center gap-1">
            {chip("all", "All")}
            {chip("high", "High")}
            {chip("medium", "Med")}
            {chip("low", "Low")}
          </div>
        ) : null}
        {filteredReviews.length === 0 ? (
          <p className="text-xs text-[#667085]">
            {spine.reviews.length === 0 ? "Nothing waiting on you." : "None at this impact level."}
          </p>
        ) : (
          <>
            <ul className="space-y-2">
              {visibleReviews.map((r) => {
                const dotClass =
                  r.impact === "high"
                    ? "bg-[#a4283c]"
                    : r.impact === "medium"
                      ? "bg-[#8a6713]"
                      : "bg-[#3E68B2]";
                return (
                  <li key={r.id}>
                    <a
                      href={`/engine/approvals#${r.id}`}
                      className="flex items-start gap-2 rounded-md p-1 -m-1 text-sm text-[#0A0F1F] hover:bg-[#F5EFE4]"
                    >
                      <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", dotClass)} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{r.title}</span>
                        <span className="mt-0.5 block text-[10px] text-[#667085]">
                          {humanize(r.item_type)} · {formatRelative(r.created_at)}
                        </span>
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
            {filteredReviews.length > 4 ? (
              <button
                type="button"
                onClick={() => setApprovalsExpanded((v) => !v)}
                className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-[#3E68B2] hover:text-[#284f93]"
              >
                {approvalsExpanded ? "Show fewer" : `Show all ${filteredReviews.length}`}
                {approvalsExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
            ) : null}
          </>
        )}
      </RailCard>

      <RailCard
        title="Material Changes"
        anchor="#spine-evidence-heading"
        action={
          material.length > 0 ? (
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#667085]">
              {material.length}
            </span>
          ) : undefined
        }
      >
        {material.length === 0 ? (
          <p className="text-xs text-[#667085]">No material changes recorded.</p>
        ) : (
          <>
            <ul className="space-y-2">
              {visibleMaterial.map((a) => (
                <li key={a.id} className="text-sm text-[#0A0F1F]">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        a.severity === "critical" ? "bg-rose-500" : "bg-amber-500",
                      )}
                    />
                    <span className="truncate">{a.title}</span>
                  </div>
                  <div className="ml-3.5 text-[11px] text-[#667085]">{formatRelative(a.created_at)}</div>
                </li>
              ))}
            </ul>
            {material.length > 4 ? (
              <button
                type="button"
                onClick={() => setChangesExpanded((v) => !v)}
                className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-[#3E68B2] hover:text-[#284f93]"
              >
                {changesExpanded ? "Show fewer" : `Show all ${material.length}`}
                {changesExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
            ) : null}
          </>
        )}
      </RailCard>

      <RailCard
        title="Active Agents"
        action={<RailLinkAction to="/engine/projects/$projectId/agent" params={{ projectId }} label="Open room" />}
      >
        <ActiveAgentsLive projectId={projectId} />
      </RailCard>
    </aside>
  );
}




/* ─────────────────── Active Agents (live) ─────────────────── */

type AgentStatusTone = "active" | "pending" | "success" | "error" | "idle";

const AGENT_TONE_STYLES: Record<AgentStatusTone, { badge: string; dot: string }> = {
  active: {
    badge: "bg-[#e9eefb] text-[#2842a4] border-[#cdd6f3]",
    dot: "bg-[#3E68B2]",
  },
  pending: {
    badge: "bg-[#fbf3e0] text-[#8a6713] border-[#f1e3b9]",
    dot: "bg-amber-500",
  },
  success: {
    badge: "bg-[#e6f5ec] text-[#1f6b3b] border-[#c4e6d2]",
    dot: "bg-emerald-500",
  },
  error: {
    badge: "bg-[#fbe9ec] text-[#a4283c] border-[#f3ced5]",
    dot: "bg-rose-500",
  },
  idle: {
    badge: "bg-[#ecedf0] text-[#5a5d70] border-[#d6d8df]",
    dot: "bg-[#98a1b3]",
  },
};

function AgentStatusBadge({ tone, label }: { tone: AgentStatusTone; label: string }) {
  const s = AGENT_TONE_STYLES[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium whitespace-nowrap",
        s.badge,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} />
      {label}
    </span>
  );
}

function AgentRowSkeleton() {
  return (
    <li className="min-w-0">
      <div className="flex items-center justify-between gap-2">
        <div className="h-3 w-32 animate-pulse rounded bg-[#ecedf0]" />
        <div className="h-3 w-10 animate-pulse rounded bg-[#ecedf0]" />
      </div>
      <div className="mt-1.5 h-3 w-20 animate-pulse rounded bg-[#ecedf0]" />
    </li>
  );
}

function ActiveAgentsLive({ projectId }: { projectId: string }) {
  const fn = useServerFn(listAgentTasks);
  const q = useQuery({
    queryKey: ["engine", "spine-active-agents", projectId],
    queryFn: () => fn({ data: { projectId } }),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const rows: EngineAgentTask[] = (q.data as { rows?: EngineAgentTask[] } | undefined)?.rows ?? [];
  const recent = rows.slice(0, 5);

  const toneFor = (t: EngineAgentTask): AgentStatusTone => {
    if (t.error) return "error";
    if (t.pending_approval) return "pending";
    if (t.status === "applied") return "success";
    if (t.status === "rejected") return "idle";
    return "active";
  };
  const statusLabel = (t: EngineAgentTask): string => {
    if (t.error) return "Error";
    if (t.pending_approval) return "Awaiting approval";
    return humanize(t.status);
  };

  return (
    <ul className="space-y-2 text-sm">
      <li className="flex items-center justify-between gap-2">
        <span className="truncate text-[#0A0F1F]">Captain</span>
        <AgentStatusBadge tone="success" label="Monitoring" />
      </li>
      {q.isPending ? (
        <>
          <AgentRowSkeleton />
          <AgentRowSkeleton />
        </>
      ) : q.isError ? (
        <li className="flex items-center justify-between gap-2">
          <span className="truncate text-[#0A0F1F]">Agent activity</span>
          <div className="flex items-center gap-2">
            <AgentStatusBadge tone="error" label="Failed to load" />
            <button
              type="button"
              onClick={() => q.refetch()}
              className="text-[11px] font-medium text-[#3E68B2] hover:text-[#284f93]"
            >
              Retry
            </button>
          </div>
        </li>
      ) : recent.length === 0 ? (
        <li className="rounded-md border border-dashed border-[#E8E1D6] bg-[#FBF9F4]/60 px-2 py-2 text-[11px] text-[#667085]">
          No agent runs in the last window.
        </li>
      ) : (
        recent.map((t) => {
          const tone = toneFor(t);
          return (
            <li key={t.id} className="min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-[#0A0F1F]">{humanize(t.kind)}</span>
                <span className="shrink-0 text-[11px] text-[#667085]">
                  {formatRelative(t.updated_at ?? t.created_at)}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <AgentStatusBadge tone={tone} label={statusLabel(t)} />
                {t.confidence > 0 ? (
                  <span className="text-[11px] text-[#667085]">
                    {Math.round(t.confidence * 100)}% conf
                  </span>
                ) : null}
              </div>
            </li>
          );
        })
      )}
    </ul>
  );
}





/* ─────────────────── Ask Captain modal ─────────────────── */

type AskCaptainCitation = string;
type AskCaptainSuggestedLink = { label: string; to: string };

type AskCaptainTurn = {
  id: string;
  question: string;
  answer: string | null;
  citations: AskCaptainCitation[];
  suggestedLinks: AskCaptainSuggestedLink[];
  error: string | null;
};


function AskCaptainModal({
  open,
  onClose,
  projectId,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
}) {
  const askFn = useServerFn(askProjectIntelligence);
  const listThreadsFn = useServerFn(listChatThreads);
  const getThreadFn = useServerFn(getChatThread);
  const [input, setInput] = useState("");
  const [threadId, setThreadId] = useState<string | undefined>(undefined);
  const [turns, setTurns] = useState<AskCaptainTurn[]>([]);
  const [busy, setBusy] = useState(false);
  const [hydrating, setHydrating] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(containerRef, open);

  // Persist / restore: on open, load the most-recent thread for this project
  // and hydrate its messages into turns. Runs once per open.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setHydrating(true);
    (async () => {
      try {
        const { threads } = (await listThreadsFn({ data: { projectId } })) as {
          threads: Array<{ id: string }>;
        };
        const latest = threads[0];
        if (!latest) return;
        const { messages } = (await getThreadFn({ data: { threadId: latest.id } })) as {
          messages: Array<{
            id: string;
            role: "user" | "assistant" | "system_note";
            content: string;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            metadata: any;
          }>;
        };
        if (cancelled) return;
        setThreadId(latest.id);
        // Pair user → assistant messages into turns.
        const restored: AskCaptainTurn[] = [];
        let pendingUser: { id: string; question: string } | null = null;
        for (const m of messages) {
          if (m.role === "user") {
            if (pendingUser) {
              restored.push({
                id: pendingUser.id,
                question: pendingUser.question,
                answer: null,
                citations: [],
                suggestedLinks: [],
                error: null,
              });
            }
            pendingUser = { id: m.id, question: m.content };
          } else if (m.role === "assistant" && pendingUser) {
            const meta = m.metadata ?? {};
            const answer = meta?.answer ?? null;
            const summary: string = answer?.summary ?? m.content ?? "";
            const citations: string[] = Array.isArray(answer?.citations) ? answer.citations : [];
            const links: AskCaptainSuggestedLink[] = Array.isArray(answer?.suggested_links)
              ? answer.suggested_links.filter(
                  (l: unknown): l is AskCaptainSuggestedLink =>
                    !!l && typeof (l as AskCaptainSuggestedLink).to === "string",
                )
              : [];
            restored.push({
              id: pendingUser.id,
              question: pendingUser.question,
              answer: summary,
              citations,
              suggestedLinks: links,
              error: meta?.success === false ? meta?.error_code ?? "AI error" : null,
            });
            pendingUser = null;
          }
        }
        if (pendingUser) {
          restored.push({
            id: pendingUser.id,
            question: pendingUser.question,
            answer: null,
            citations: [],
            suggestedLinks: [],
            error: null,
          });
        }
        setTurns(restored);
      } catch {
        // Best-effort restore; leave the thread empty on failure.
      } finally {
        if (!cancelled) setHydrating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, projectId, listThreadsFn, getThreadFn]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns, open]);

  if (!open) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const question = input.trim();
    if (!question || busy) return;
    const turnId = crypto.randomUUID();
    setTurns((prev) => [
      ...prev,
      { id: turnId, question, answer: null, citations: [], suggestedLinks: [], error: null },
    ]);
    setInput("");
    setBusy(true);
    try {
      const res = (await askFn({ data: { projectId, threadId, message: question } })) as {
        thread: { id: string };
        answer: {
          summary: string;
          citations?: string[];
          suggested_links?: AskCaptainSuggestedLink[];
        };
      };
      setThreadId(res.thread.id);
      const citations = Array.isArray(res.answer.citations) ? res.answer.citations : [];
      const suggestedLinks = Array.isArray(res.answer.suggested_links)
        ? res.answer.suggested_links.filter(
            (l): l is AskCaptainSuggestedLink => !!l && typeof l.to === "string",
          )
        : [];
      setTurns((prev) =>
        prev.map((t) =>
          t.id === turnId ? { ...t, answer: res.answer.summary, citations, suggestedLinks } : t,
        ),
      );
    } catch (err) {
      setTurns((prev) =>
        prev.map((t) =>
          t.id === turnId ? { ...t, error: (err as Error).message || "Ask failed" } : t,
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label="Ask Captain">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        ref={containerRef}
        className="relative flex h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl outline-none sm:h-[70vh] sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-[#E8E1D6] px-5 py-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[#3E68B2]" />
            <div className="font-display text-base text-[#0A0F1F]">Ask Captain</div>
            {hydrating ? (
              <span className="ml-2 inline-flex items-center gap-1 text-[11px] text-[#667085]">
                <Loader2 className="h-3 w-3 animate-spin" /> Restoring
              </span>
            ) : null}
            {busy ? (
              <span className="ml-2 inline-flex items-center gap-1 text-[11px] text-[#667085]">
                <Loader2 className="h-3 w-3 animate-spin" /> Captain is thinking
              </span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full border border-[#E8E1D6] bg-white p-1.5 text-[#0A0F1F]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4">
          {turns.length === 0 && !hydrating ? (
            <div className="mt-6 text-sm text-[#667085]">
              Ask a question about this project. Captain reads the full spine — Point A, Point B, milestones, evidence, and approvals.
            </div>
          ) : (
            <ul className="space-y-4">
              {turns.map((t) => (
                <li key={t.id} className="space-y-2">
                  <div className="ml-6 rounded-2xl bg-[#3E68B2] px-4 py-2 text-sm text-white">
                    {t.question}
                  </div>
                  {t.error ? (
                    <div className="mr-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-800">
                      {t.error}
                    </div>
                  ) : t.answer ? (
                    <div className="mr-6 space-y-2">
                      <div className="whitespace-pre-wrap rounded-2xl border border-[#E8E1D6] bg-[#FBF9F4] px-4 py-2 text-sm text-[#0A0F1F]">
                        {t.answer}
                      </div>
                      {t.citations.length > 0 ? (
                        <div className="rounded-xl border border-dashed border-[#E8E1D6] bg-white px-3 py-2 text-xs text-[#667085]">
                          <div className="mb-1 font-mono uppercase tracking-[0.18em] text-[10px] text-[#667085]">
                            Sources used
                          </div>
                          <ul className="flex flex-wrap gap-1.5">
                            {t.citations.map((c, i) => (
                              <li
                                key={`${t.id}-cite-${i}`}
                                className="rounded-full border border-[#E8E1D6] bg-[#FBF9F4] px-2 py-0.5 font-mono text-[10px] text-[#0A0F1F]"
                              >
                                {c}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {t.suggestedLinks.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {t.suggestedLinks.map((l, i) => (
                            <a
                              key={`${t.id}-link-${i}`}
                              href={l.to}
                              className="inline-flex items-center gap-1 rounded-full border border-[#E8E1D6] bg-white px-2 py-0.5 text-[11px] text-[#3E68B2] hover:bg-[#FBF9F4]"
                            >
                              {l.label}
                            </a>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="mr-6 inline-flex items-center gap-2 rounded-2xl border border-[#E8E1D6] bg-[#FBF9F4] px-4 py-2 text-sm text-[#667085]">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Captain is thinking...
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <form onSubmit={submit} className="border-t border-[#E8E1D6] px-4 py-3">
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void submit(e as unknown as FormEvent);
                }
              }}
              rows={2}
              placeholder="Ask about status, blockers, risks, next steps..."
              className="min-h-[44px] flex-1 resize-none rounded-xl border border-[#E8E1D6] bg-white px-3 py-2 text-sm text-[#0A0F1F] focus:border-[#3E68B2] focus:outline-none"
              disabled={busy}
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-[#0A0F1F] px-4 text-sm font-medium text-white transition hover:bg-[#1c2440] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
