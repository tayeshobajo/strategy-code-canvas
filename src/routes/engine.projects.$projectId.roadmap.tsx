import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { approveVersion } from "@/lib/engine-intelligence.functions";
import { fillMissingSpineDetailsFromIntake } from "@/lib/engine-spine-ai-fill.functions";
import { batchApproveDraftedSpineTruth } from "@/lib/engine-spine-ceremonies.functions";
import {
  Map as MapIcon,
  ArrowRight,
  ArrowUpRight,
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Clock,
  GitBranch,
  Layers,
  ListChecks,
  Sparkles,
  Users,
  Timer,
  ChevronRight,
  Network,
} from "lucide-react";
import { getProjectRoadmap, type ProjectRoadmapPayload } from "@/lib/engine-roadmap.functions";
import type {
  RoadmapPhase,
  RoadmapMilestoneView,
  RoadmapPhaseHealth,
  RoadmapPhaseStatus,
} from "@/lib/roadmap-view";
import { RoadmapDependencyGraph } from "@/components/engine/roadmap/RoadmapDependencyGraph";
import { CaptainPrompts } from "@/components/engine/roadmap/CaptainPrompts";
import { CompareVersionsModal } from "@/components/engine/roadmap/CompareVersionsModal";
import { ClientExportPreviewModal } from "@/components/engine/roadmap/ClientExportPreviewModal";
import {
  MilestoneCpExplainer,
  PhaseCpExplainer,
} from "@/components/engine/roadmap/CriticalPathExplainer";

const searchSchema = z.object({
  view: z.enum(["journey", "timeline", "graph", "table"]).default("journey"),
  phase: z.string().optional(),
  versionId: z.string().uuid().optional(),
});

export const Route = createFileRoute("/engine/projects/$projectId/roadmap")({
  validateSearch: (raw) => searchSchema.parse(raw ?? {}),
  component: RoadmapTab,
});

const roadmapQueryOptions = (
  projectId: string,
  versionId: string | undefined,
  fn: (input: { data: { id: string; versionId?: string } }) => Promise<ProjectRoadmapPayload>,
) =>
  queryOptions({
    queryKey: ["engine", "roadmap", projectId, versionId ?? "current"],
    queryFn: () => fn({ data: { id: projectId, ...(versionId ? { versionId } : {}) } }),
  });

function RoadmapTab() {
  const { projectId } = Route.useParams();
  const search = useSearch({ from: "/engine/projects/$projectId/roadmap" });
  const fn = useServerFn(getProjectRoadmap);
  const { data, isPending, isError, error } = useQuery(
    roadmapQueryOptions(
      projectId,
      search.versionId,
      fn as unknown as (i: { data: { id: string; versionId?: string } }) => Promise<ProjectRoadmapPayload>,
    ),
  );

  if (isPending) {
    return <RoadmapLoadingSkeleton />;
  }
  if (isError || !data) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-900" role="alert" data-qa-state="roadmap-error">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-red-700/70">Roadmap failed</div>
        <div className="mt-1">{(error as Error | null)?.message ?? "Roadmap data did not load."}</div>
      </div>
    );
  }

  return <RoadmapDashboard projectId={projectId} payload={data} activeView={search.view} activePhaseKey={search.phase ?? null} />;
}

// ------------- top-level shell -------------

function RoadmapDashboard({
  projectId,
  payload,
  activeView,
  activePhaseKey,
}: {
  projectId: string;
  payload: ProjectRoadmapPayload;
  activeView: "journey" | "timeline" | "graph" | "table";
  activePhaseKey: string | null;
}) {
  const { view, versions } = payload;
  const [compareOpen, setCompareOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const filteredMilestones = useMemo(() => {
    if (!activePhaseKey) return view.milestones;
    const phase = view.phases.find((p) => p.key === activePhaseKey);
    if (!phase) return view.milestones;
    return view.milestones.filter((m) => phase.milestone_ids.includes(m.id));
  }, [view.milestones, view.phases, activePhaseKey]);

  if (view.mode === "no_truth") {
    return <NoTruthState projectId={projectId} missing={view.missing_for_approval} />;
  }
  if (view.mode === "draft_generating") {
    return <DraftGeneratingState projectId={projectId} />;
  }

  return (
    <div className="space-y-5" data-qa-tab-view="roadmap" data-roadmap-mode={view.mode}>
      <RoadmapHeader
        projectId={projectId}
        payload={payload}
        onOpenCompare={() => setCompareOpen(true)}
        onOpenExport={() => setExportOpen(true)}
      />
      <RoadmapSummaryStrip payload={payload} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px] items-start">
        <div className="space-y-5 min-w-0">
          <ViewSwitcher projectId={projectId} activeView={activeView} activePhaseKey={activePhaseKey} />

          <StrategicJourneyBand
            projectId={projectId}
            phases={view.phases}
            activePhaseKey={activePhaseKey}
          />

          {activeView === "journey" && (
            <PhasesDetailList phases={view.phases} milestones={view.milestones} activePhaseKey={activePhaseKey} />
          )}
          {activeView === "timeline" && (
            <>
              <CriticalPathBanner critical={view.critical_path} />
              <RoadmapTimeline
                phases={view.phases}
                milestones={filteredMilestones}
                bottleneckId={view.critical_path.bottleneck_id}
              />
            </>
          )}
          {activeView === "graph" && (
            <RoadmapDependencyGraph
              phases={view.phases}
              milestones={filteredMilestones}
              dependencies={view.dependencies}
            />
          )}
          {activeView === "table" && (
            <MilestoneTable projectId={projectId} milestones={filteredMilestones} />
          )}
        </div>

        <aside className="space-y-4 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto pr-1">
          <CaptainBriefCard brief={view.captain_brief} projectId={projectId} />
          <ChangeSummaryCard
            change={view.change_summary}
            versions={versions}
            onOpenCompare={() => setCompareOpen(true)}
          />
          <CrossProjectCard family={view.cross_project_dependencies} />
          <ChangeRequestCta permissions={payload.permissions} projectId={projectId} />
        </aside>
      </div>

      {compareOpen && (
        <CompareVersionsModal
          projectId={projectId}
          versions={versions}
          onClose={() => setCompareOpen(false)}
        />
      )}
      {exportOpen && (
        <ClientExportPreviewModal
          version={view.version}
          phases={view.phases}
          milestones={view.milestones}
          canPublish={payload.permissions.can_publish_client_safe}
          onClose={() => setExportOpen(false)}
        />
      )}
    </div>
  );
}

// ------------- header -------------

function RoadmapHeader({
  projectId,
  payload,
  onOpenCompare,
  onOpenExport,
}: {
  projectId: string;
  payload: ProjectRoadmapPayload;
  onOpenCompare: () => void;
  onOpenExport: () => void;
}) {
  const { view, project } = payload;
  const version = view.version;
  const qc = useQueryClient();
  const approveFn = useServerFn(approveVersion);
  const fillMissingFn = useServerFn(fillMissingSpineDetailsFromIntake);
  const approveDraftedTruthFn = useServerFn(batchApproveDraftedSpineTruth);
  const [approving, setApproving] = useState(false);
  const invalidateRoadmapTruth = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["engine", "roadmap", projectId] }),
      qc.invalidateQueries({ queryKey: ["engine", "spine", projectId] }),
      qc.invalidateQueries({ queryKey: ["engine", "workspace", projectId] }),
      qc.invalidateQueries({ queryKey: ["engine", "spine-status", projectId] }),
      qc.invalidateQueries({ queryKey: ["engine", "ceremony-summary", projectId] }),
    ]);
  };
  const fillMutation = useMutation({
    mutationFn: () => fillMissingFn({ data: { projectId } }),
    onSuccess: async (result) => {
      await invalidateRoadmapTruth();
      const count = result.changed.length;
      toast.success(
        count
          ? `AI Product Manager drafted ${count} missing Spine field${count === 1 ? "" : "s"}. Review and approve on the Spine tab.`
          : "AI Product Manager reviewed the Spine. No blank fields were changed.",
      );
    },
    onError: (e) => {
      toast.error((e as Error).message || "AI Product Manager could not fill missing details.");
    },
  });
  const approveDraftedMutation = useMutation({
    mutationFn: () => approveDraftedTruthFn({ data: { projectId } }),
    onSuccess: async (result) => {
      await invalidateRoadmapTruth();
      if (result.approved.length) {
        toast.success(`Approved ${result.approved.length} drafted Spine truth${result.approved.length === 1 ? "" : "s"}. Try approving the roadmap again.`);
      } else {
        toast.info("No AI-drafted Spine truth was ready for approval. Open the Spine tab to review remaining fields.");
      }
    },
    onError: (e) => {
      toast.error((e as Error).message || "Drafted Spine truth could not be approved.");
    },
  });
  const canApprove =
    payload.permissions.can_approve_baseline &&
    version != null &&
    !version.locked &&
    version.status !== "approved";

  const handleApprove = async () => {
    if (!version) return;
    if (!confirm(`Approve ${version.label} as the baseline? This locks the snapshot.`)) return;
    setApproving(true);
    try {
      const res = await approveFn({ data: { id: version.id } });
      toast.success(`Baseline approved: ${res.version}`);
      await qc.invalidateQueries({ queryKey: ["engine", "roadmap", projectId] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setApproving(false);
    }
  };

  return (
    <section
      className="rounded-xl border border-border bg-card px-5 py-4 shadow-sm"
      data-qa-section="roadmap-header"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.22em] text-ink/50">
            <MapIcon className="h-3.5 w-3.5" />
            Project Roadmap
            {version && (
              <>
                <span aria-hidden>·</span>
                <span>{version.label}</span>
                <VersionBadge status={version.status} />
              </>
            )}
          </div>
          <h1 className="mt-1 font-display text-2xl text-ink">
            The path from where we are to where we're going
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-ink/60">
            One living map — phases, milestones, dependencies. Every gate ties back to durable project truth.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/engine/projects/$projectId/spine"
            params={{ projectId }}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-white px-3 py-1.5 text-xs text-ink hover:border-ink/40"
          >
            Back to Spine
          </Link>
          <button
            type="button"
            onClick={onOpenCompare}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-white px-3 py-1.5 text-xs text-ink hover:border-ink/40"
          >
            <GitBranch className="h-3.5 w-3.5" />
            Compare versions
          </button>
          {canApprove && (
            <button
              type="button"
              onClick={handleApprove}
              disabled={approving}
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              data-qa-action="approve-baseline"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {approving ? "Approving…" : `Approve ${version?.label ?? "baseline"}`}
            </button>
          )}
          {payload.permissions.can_publish_client_safe && (
            <button
              type="button"
              onClick={onOpenExport}
              className="inline-flex items-center gap-1.5 rounded-md bg-ink px-3 py-1.5 text-xs text-white hover:bg-ink/90"
            >
              Publish client-safe view
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      {version?.locked && (
        <div className="mt-3 inline-flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-900">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Baseline approved
          {version.approved_at && (
            <span className="text-emerald-800/70">· {new Date(version.approved_at).toLocaleDateString()}</span>
          )}
        </div>
      )}
      {canApprove && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
          <span className="max-w-4xl">
            This roadmap is a <strong>draft</strong>. Approving it locks the baseline and unlocks the Work tab. Requires: Point A + Point B approved, no open critical change events, and a second reviewer (you can't approve a version you authored). Investment confirmation is required later, before publishing to the client portal.
          </span>
          <button
            type="button"
            onClick={() => fillMutation.mutate()}
            disabled={fillMutation.isPending}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-950 hover:border-amber-500 disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {fillMutation.isPending ? "Filling details…" : "Fill missing Spine details"}
          </button>
          <button
            type="button"
            onClick={() => approveDraftedMutation.mutate()}
            disabled={approveDraftedMutation.isPending}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-950 hover:border-emerald-500 disabled:opacity-50"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            {approveDraftedMutation.isPending ? "Approving truth…" : "Approve drafted Spine truth"}
          </button>
        </div>
      )}
      <div className="sr-only" aria-live="polite">
        Progress {project.progress_percent} percent
      </div>
    </section>
  );
}


function VersionBadge({ status }: { status: string }) {
  const tone =
    status === "approved"
      ? "bg-emerald-100 text-emerald-900 border-emerald-200"
      : status === "archived"
        ? "bg-ink/5 text-ink/60 border-border"
        : "bg-amber-100 text-amber-900 border-amber-200";
  return (
    <span className={`ml-1 inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${tone}`}>
      {status}
    </span>
  );
}

// ------------- summary strip -------------

function RoadmapSummaryStrip({ payload }: { payload: ProjectRoadmapPayload }) {
  const s = payload.view.summary;
  const items: Array<{
    label: string;
    value: string;
    hint?: string;
    icon: React.ComponentType<{ className?: string }>;
    tone?: "default" | "warn" | "success" | "danger";
  }> = [
    {
      label: "Current phase",
      value: s.current_phase_name ?? "—",
      hint: s.current_phase_range ?? undefined,
      icon: Layers,
    },
    {
      label: "Phases",
      value: `${s.phases_complete}/${s.phases_total}`,
      hint: "complete",
      icon: ListChecks,
    },
    {
      label: "Active milestones",
      value: String(s.active_milestones),
      icon: Sparkles,
    },
    {
      label: "Blocked",
      value: String(s.blocked_milestones),
      icon: AlertTriangle,
      tone: s.blocked_milestones > 0 ? "danger" : "default",
    },
    {
      label: "Ready for build",
      value: String(s.ready_for_build),
      icon: CircleDashed,
    },
    {
      label: "Ready for QA",
      value: String(s.ready_for_qa),
      icon: CheckCircle2,
    },
    {
      label: "Target date",
      value: s.target_date ? new Date(s.target_date).toLocaleDateString() : "—",
      hint: s.target_days_remaining != null ? `${s.target_days_remaining}d left` : undefined,
      icon: Timer,
      tone: s.target_days_remaining != null && s.target_days_remaining < 14 ? "warn" : "default",
    },
    {
      label: "Roadmap health",
      value: labelHealth(s.roadmap_health_label),
      hint: `${s.roadmap_health_score}/100`,
      icon: HealthDot,
      tone:
        s.roadmap_health_label === "at_risk"
          ? "danger"
          : s.roadmap_health_label === "needs_attention"
            ? "warn"
            : s.roadmap_health_label === "excellent" || s.roadmap_health_label === "good"
              ? "success"
              : "default",
    },
  ];

  return (
    <section
      className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:grid-cols-4 xl:grid-cols-8"
      data-qa-section="roadmap-summary"
      role="group"
      aria-label="Roadmap summary"
    >
      {items.map((it) => {
        const Icon = it.icon;
        const toneClass =
          it.tone === "danger"
            ? "text-rose-700"
            : it.tone === "warn"
              ? "text-amber-700"
              : it.tone === "success"
                ? "text-emerald-700"
                : "text-ink";
        return (
          <div key={it.label} className="min-w-0">
            <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.2em] text-ink/50">
              <Icon className="h-3 w-3" />
              {it.label}
            </div>
            <div className={`mt-1 font-display text-lg leading-tight ${toneClass}`}>{it.value}</div>
            {it.hint && <div className="text-[11px] text-ink/50">{it.hint}</div>}
          </div>
        );
      })}
    </section>
  );
}

function HealthDot({ className }: { className?: string }) {
  return <span className={`inline-block rounded-full bg-current ${className}`} style={{ width: 8, height: 8 }} />;
}

function labelHealth(l: string): string {
  switch (l) {
    case "excellent":
      return "Excellent";
    case "good":
      return "On track";
    case "needs_attention":
      return "Watch";
    case "at_risk":
      return "At risk";
    default:
      return "Unknown";
  }
}

// ------------- view switcher -------------

function ViewSwitcher({
  projectId,
  activeView,
  activePhaseKey,
}: {
  projectId: string;
  activeView: "journey" | "timeline" | "graph" | "table";
  activePhaseKey: string | null;
}) {
  const tabs: Array<{ key: "journey" | "timeline" | "graph" | "table"; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { key: "journey", label: "Journey", icon: MapIcon },
    { key: "timeline", label: "Timeline", icon: Clock },
    { key: "graph", label: "Dependencies", icon: Network },
    { key: "table", label: "Milestones", icon: ListChecks },
  ];
  return (
    <div className="inline-flex items-center gap-1 rounded-md border border-border bg-card p-1 shadow-sm" role="tablist" aria-label="Roadmap view">
      {tabs.map((t) => {
        const Icon = t.icon;
        const active = activeView === t.key;
        return (
          <Link
            key={t.key}
            to="/engine/projects/$projectId/roadmap"
            params={{ projectId }}
            search={(prev: Record<string, unknown>) => ({ ...prev, view: t.key, ...(activePhaseKey ? { phase: activePhaseKey } : {}) })}
            role="tab"
            aria-selected={active}
            className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs ${
              active ? "bg-ink text-white" : "text-ink/70 hover:bg-muted"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}

// ------------- strategic journey band -------------

function StrategicJourneyBand({
  projectId,
  phases,
  activePhaseKey,
}: {
  projectId: string;
  phases: RoadmapPhase[];
  activePhaseKey: string | null;
}) {
  if (phases.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/60 p-6 text-center text-sm text-ink/60">
        No phases yet. Approve Point A and Point B to generate a draft roadmap.
      </div>
    );
  }
  return (
    <section
      className="rounded-xl border border-border bg-card p-4 shadow-sm"
      data-qa-section="strategic-journey"
      aria-label="Strategic journey"
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink/50">Strategic journey</div>
          <h2 className="font-display text-lg text-ink">Point A → Point B</h2>
        </div>
        <div className="hidden text-[11px] text-ink/50 sm:block">Click a phase to filter below</div>
      </div>
      <ol className="mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1">
        <li className="shrink-0 self-stretch">
          <EndpointCard label="Point A" title="Where we are today" tone="a" />
        </li>
        {phases.map((p, i) => {
          const active = activePhaseKey === p.key;
          return (
            <li key={p.key} className="flex shrink-0 items-stretch gap-3">
              <PhaseArrow />
              <Link
                to="/engine/projects/$projectId/roadmap"
                params={{ projectId }}
                search={(prev: Record<string, unknown>) => {
                  if (active) {
                    const rest = { ...prev } as Record<string, unknown>;
                    delete rest.phase;
                    return rest as { view: "journey" | "timeline" | "table"; phase?: string; versionId?: string };
                  }
                  return { ...prev, phase: p.key };
                }}
                aria-pressed={active}
                className={`group snap-start block w-56 shrink-0 rounded-lg border p-3 text-left transition ${
                  active
                    ? "border-royal bg-royal/5 shadow-sm"
                    : "border-border bg-white hover:border-ink/40"
                }`}
              >
                <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-[0.2em] text-ink/50">
                  <span>Phase {i + 1}</span>
                  <StatusChip status={p.status} />
                </div>
                <div className="mt-1 font-display text-[15px] text-ink line-clamp-2">{p.name}</div>
                {p.outcome && <div className="mt-1 text-[11px] text-ink/60 line-clamp-2">{p.outcome}</div>}
                <div className="mt-3 flex items-center justify-between text-[11px] text-ink/60">
                  <span>
                    {p.completed_count}/{p.milestone_count} done
                  </span>
                  <HealthPill health={p.health} />
                </div>
              </Link>
            </li>
          );
        })}
        <li className="flex shrink-0 items-stretch gap-3">
          <PhaseArrow />
          <EndpointCard label="Point B" title="Where we're going" tone="b" />
        </li>
      </ol>
    </section>
  );
}

function PhaseArrow() {
  return (
    <div className="flex items-center text-ink/30" aria-hidden>
      <ChevronRight className="h-5 w-5" />
    </div>
  );
}

function EndpointCard({ label, title, tone }: { label: string; title: string; tone: "a" | "b" }) {
  return (
    <div
      className={`flex h-full w-40 flex-col justify-between rounded-lg border p-3 ${
        tone === "a" ? "border-ink/20 bg-ink/5" : "border-royal/40 bg-royal/10"
      }`}
    >
      <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-ink/60">{label}</div>
      <div className="font-display text-sm text-ink">{title}</div>
    </div>
  );
}

function StatusChip({ status }: { status: RoadmapPhaseStatus }) {
  const map: Record<RoadmapPhaseStatus, { label: string; cls: string }> = {
    planned: { label: "Planned", cls: "bg-ink/10 text-ink/70" },
    ready: { label: "Ready", cls: "bg-sky-100 text-sky-900" },
    active: { label: "Active", cls: "bg-royal/15 text-royal" },
    at_risk: { label: "At risk", cls: "bg-amber-100 text-amber-900" },
    blocked: { label: "Blocked", cls: "bg-rose-100 text-rose-900" },
    complete: { label: "Done", cls: "bg-emerald-100 text-emerald-900" },
  };
  const it = map[status];
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${it.cls}`}>{it.label}</span>;
}

function HealthPill({ health }: { health: RoadmapPhaseHealth }) {
  const map: Record<RoadmapPhaseHealth, { label: string; cls: string }> = {
    on_track: { label: "On track", cls: "text-emerald-700 bg-emerald-50 border-emerald-200" },
    needs_attention: { label: "Watch", cls: "text-amber-700 bg-amber-50 border-amber-200" },
    at_risk: { label: "At risk", cls: "text-rose-700 bg-rose-50 border-rose-200" },
    unknown: { label: "—", cls: "text-ink/50 bg-ink/5 border-border" },
  };
  const it = map[health];
  return <span className={`rounded border px-1.5 py-0.5 text-[10px] ${it.cls}`}>{it.label}</span>;
}

// ------------- phases detail list (journey view) -------------

function PhasesDetailList({
  phases,
  milestones,
  activePhaseKey,
}: {
  phases: RoadmapPhase[];
  milestones: RoadmapMilestoneView[];
  activePhaseKey: string | null;
}) {
  const list = activePhaseKey ? phases.filter((p) => p.key === activePhaseKey) : phases;
  if (list.length === 0) return null;
  return (
    <section className="space-y-3" data-qa-section="phase-details">
      {list.map((p) => {
        const ms = milestones.filter((m) => p.milestone_ids.includes(m.id));
        return (
          <div key={p.key} className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.22em] text-ink/50">
                  Phase {p.order + 1}
                  <StatusChip status={p.status} />
                  <HealthPill health={p.health} />
                </div>
                <h3 className="mt-1 font-display text-lg text-ink">{p.name}</h3>
                {p.outcome && <p className="mt-1 max-w-2xl text-sm text-ink/70">{p.outcome}</p>}
                {p.rationale && (
                  <p className="mt-1 max-w-2xl text-[12px] italic text-ink/50">Why: {p.rationale}</p>
                )}
              </div>
              <div className="text-right text-[11px] text-ink/60">
                {p.start && p.end && (
                  <div>
                    {new Date(p.start).toLocaleDateString()} – {new Date(p.end).toLocaleDateString()}
                  </div>
                )}
                <div>
                  {p.completed_count}/{p.milestone_count} milestones done
                </div>
                {p.blocked_count > 0 && (
                  <div className="text-rose-700">{p.blocked_count} blocked</div>
                )}
              </div>
            </div>
            {ms.length > 0 ? (
              <ul className="mt-3 divide-y divide-border rounded-lg border border-border/70">
                {ms.map((m) => (
                  <MilestoneRow key={m.id} m={m} />
                ))}
              </ul>
            ) : (
              <div className="mt-3 rounded-md border border-dashed border-border p-3 text-xs text-ink/50">
                No milestones in this phase yet.
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

function MilestoneRow({ m }: { m: RoadmapMilestoneView }) {
  return (
    <li className="flex flex-wrap items-center gap-3 p-3">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {m.on_critical_path && (
          <span title="On critical path" className="rounded bg-royal/15 px-1.5 py-0.5 text-[10px] font-medium text-royal">
            CP
          </span>
        )}
        <span className="truncate font-medium text-ink">{m.name}</span>
        {m.owner && <span className="hidden text-[11px] text-ink/50 sm:inline">· {m.owner}</span>}
      </div>
      <div className="flex items-center gap-2 text-[11px]">
        {m.due_date && <span className="text-ink/60">Due {new Date(m.due_date).toLocaleDateString()}</span>}
        <HealthPill health={m.health} />
        <StatusChip status={mapMilestoneStatus(m.status)} />
      </div>
    </li>
  );
}

function mapMilestoneStatus(s: string): RoadmapPhaseStatus {
  switch (s) {
    case "complete":
    case "done":
      return "complete";
    case "blocked":
      return "blocked";
    case "in_progress":
    case "active":
      return "active";
    case "ready":
      return "ready";
    default:
      return "planned";
  }
}

// ------------- timeline view -------------

function CriticalPathBanner({
  critical,
}: {
  critical: ProjectRoadmapPayload["view"]["critical_path"];
}) {
  if (!critical.bottleneck_id && !critical.bottleneck_name) {
    return (
      <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
        No critical-path bottleneck detected. Milestones on the critical path
        are highlighted in indigo below.
      </div>
    );
  }
  return (
    <section
      className="rounded-md border border-royal/30 bg-royal/5 px-3 py-2 text-xs text-ink"
      role="status"
      data-qa-section="critical-path-banner"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-royal/15 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-royal">
          Critical path
        </span>
        <span className="font-medium">{critical.bottleneck_name}</span>
        {critical.delay_days != null && (
          <span className="text-rose-700">· projected delay ≈ {critical.delay_days}d</span>
        )}
        {critical.downstream_impact_count > 0 && (
          <span className="text-ink/60">
            · blocks {critical.downstream_impact_count} downstream
          </span>
        )}
      </div>
      {critical.reason && <div className="mt-1 text-ink/70">Why: {critical.reason}</div>}
      {critical.recovery && (
        <div className="mt-0.5 text-ink/70">Recovery: {critical.recovery}</div>
      )}
    </section>
  );
}

function RoadmapTimeline({
  phases,
  milestones,
  bottleneckId,
}: {
  phases: RoadmapPhase[];
  milestones: RoadmapMilestoneView[];
  bottleneckId: string | null;
}) {
  const dated = milestones.filter((m) => m.due_date);
  if (dated.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/60 p-6 text-sm text-ink/60">
        No dated milestones yet. Add due dates to see the timeline.
      </div>
    );
  }
  const times = dated.map((m) => new Date(m.due_date!).getTime());
  const min = Math.min(...times);
  const max = Math.max(...times);
  const span = Math.max(max - min, 1);
  const cpIds = new Set(dated.filter((m) => m.on_critical_path).map((m) => m.id));
  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm" data-qa-section="roadmap-timeline">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink/50">Timeline</div>
          <h2 className="font-display text-base text-ink">Milestones by due date</h2>
        </div>
        <div className="text-[11px] text-ink/50">
          {new Date(min).toLocaleDateString()} – {new Date(max).toLocaleDateString()}
        </div>
      </div>
      <div className="space-y-4">
        {phases.map((p) => {
          const ms = dated.filter((m) => p.milestone_ids.includes(m.id));
          if (ms.length === 0) return null;
          const cpMsInPhase = ms.filter((m) => cpIds.has(m.id));
          const phaseOnCp = cpMsInPhase.length > 0;
          return (
            <div key={p.key}>
              <div className="mb-1 flex items-center gap-2 text-[11px] text-ink/60">
                <span className="font-medium text-ink">{p.name}</span>
                <StatusChip status={p.status} />
                {phaseOnCp && (
                  <PhaseCpExplainer phase={p} milestonesOnCp={cpMsInPhase}>
                    <button
                      type="button"
                      className="rounded bg-royal/15 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-royal hover:bg-royal/25"
                      aria-label={`Why ${p.name} is on the critical path`}
                    >
                      CP · why?
                    </button>
                  </PhaseCpExplainer>
                )}
              </div>
              <div
                className={`relative h-9 rounded-md ${phaseOnCp ? "bg-royal/10 ring-1 ring-royal/25" : "bg-ink/5"}`}
              >
                {ms.map((m) => {
                  const t = new Date(m.due_date!).getTime();
                  const left = ((t - min) / span) * 100;
                  const tone =
                    m.status === "blocked"
                      ? "bg-rose-500"
                      : m.health === "at_risk"
                        ? "bg-amber-500"
                        : m.status === "complete" || m.status === "done"
                          ? "bg-emerald-500"
                          : m.on_critical_path
                            ? "bg-royal"
                            : "bg-slate-500";
                  const isBottleneck = m.id === bottleneckId;
                  return (
                    <MilestoneCpExplainer
                      key={m.id}
                      milestone={m}
                      isBottleneck={isBottleneck}
                    >
                      <button
                        type="button"
                        aria-label={`${m.name} — critical-path rules`}
                        className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full ${tone} ${
                          m.on_critical_path ? "ring-2 ring-royal shadow-md" : "ring-2 ring-white"
                        } focus:outline-none focus:ring-royal/70 hover:scale-110 transition-transform`}
                        style={{
                          left: `${left}%`,
                          width: m.on_critical_path ? 16 : 12,
                          height: m.on_critical_path ? 16 : 12,
                        }}
                      />
                    </MilestoneCpExplainer>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 rounded-md border border-dashed border-border bg-muted/30 p-2 text-[11px] text-ink/60">
        <span className="font-mono uppercase tracking-wider text-ink/50">Critical-path rules · </span>
        R1 longest dependency chain · R2 first blocked or at-risk on chain (bottleneck) · R3 gated by upstream · R4 phase inherits from its milestones. Click any dot or the phase chip to see which rules apply.
      </div>
    </section>
  );
}


// ------------- table view -------------

function MilestoneTable({
  projectId,
  milestones,
}: {
  projectId: string;
  milestones: RoadmapMilestoneView[];
}) {
  if (milestones.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/60 p-6 text-sm text-ink/60">
        No milestones match the current filter.
      </div>
    );
  }
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm" data-qa-section="milestone-table">
      <table className="w-full text-sm">
        <thead className="bg-muted/60 text-[10px] font-mono uppercase tracking-[0.2em] text-ink/60">
          <tr>
            <th className="px-3 py-2 text-left">Milestone</th>
            <th className="px-3 py-2 text-left">Phase</th>
            <th className="px-3 py-2 text-left">Owner</th>
            <th className="px-3 py-2 text-left">Due</th>
            <th className="px-3 py-2 text-left">Status</th>
            <th className="px-3 py-2 text-left">Health</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {milestones.map((m) => (
            <tr key={m.id} className="hover:bg-muted/40">
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  {m.on_critical_path && (
                    <span className="rounded bg-royal/15 px-1.5 py-0.5 text-[10px] font-medium text-royal">CP</span>
                  )}
                  <span className="font-medium text-ink">{m.name}</span>
                </div>
                {m.blocked_by.length > 0 && (
                  <div className="mt-0.5 text-[11px] text-ink/50">Blocked by {m.blocked_by.length} upstream</div>
                )}
              </td>
              <td className="px-3 py-2 text-ink/70">{m.phase ?? "—"}</td>
              <td className="px-3 py-2 text-ink/70">{m.owner ?? "—"}</td>
              <td className="px-3 py-2 text-ink/70">
                {m.due_date ? new Date(m.due_date).toLocaleDateString() : "—"}
              </td>
              <td className="px-3 py-2"><StatusChip status={mapMilestoneStatus(m.status)} /></td>
              <td className="px-3 py-2"><HealthPill health={m.health} /></td>
              <td className="px-3 py-2 text-right">
                <Link
                  to="/engine/projects/$projectId/work"
                  params={{ projectId }}
                  className="inline-flex items-center gap-1 text-xs text-royal hover:underline"
                >
                  Open <ArrowUpRight className="h-3 w-3" />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

// ------------- right rail cards -------------

function CaptainBriefCard({
  brief,
  projectId,
}: {
  brief: ProjectRoadmapPayload["view"]["captain_brief"];
  projectId: string;
}) {
  const items: Array<{ label: string; body: string | null }> = [
    { label: "What changed", body: brief.what_changed },
    { label: "What matters now", body: brief.what_matters_now },
    { label: "Recommendation", body: brief.recommendation },
    { label: "Watch for", body: brief.watch_for },
  ];
  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm" data-qa-section="roadmap-captain-brief">
      <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.22em] text-ink/50">
        <Sparkles className="h-3.5 w-3.5" />
        Captain brief
      </div>
      <ul className="mt-3 space-y-3">
        {items.map((it) => (
          <li key={it.label}>
            <div className="text-[11px] font-medium uppercase tracking-wider text-ink/60">{it.label}</div>
            <div className="mt-0.5 text-sm text-ink/80">{it.body ?? <span className="text-ink/40">—</span>}</div>
          </li>
        ))}
      </ul>
      <CaptainPrompts projectId={projectId} />
    </section>
  );
}

function ChangeSummaryCard({
  change,
  versions,
  onOpenCompare,
}: {
  change: ProjectRoadmapPayload["view"]["change_summary"];
  versions: ProjectRoadmapPayload["versions"];
  onOpenCompare: () => void;
}) {
  const has = change.added.length + change.changed.length + change.removed.length + change.resequenced.length > 0;
  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm" data-qa-section="roadmap-change-summary">
      <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.22em] text-ink/50">
        <GitBranch className="h-3.5 w-3.5" />
        What changed
        {change.since_label && <span className="text-ink/40">since {change.since_label}</span>}
      </div>
      {has ? (
        <ul className="mt-3 space-y-1.5 text-sm">
          {change.added.length > 0 && <li className="text-emerald-800">+ Added: {change.added.slice(0, 3).join(", ")}{change.added.length > 3 ? "…" : ""}</li>}
          {change.changed.length > 0 && <li className="text-amber-800">~ Changed: {change.changed.slice(0, 3).join(", ")}{change.changed.length > 3 ? "…" : ""}</li>}
          {change.removed.length > 0 && <li className="text-rose-800">− Removed: {change.removed.slice(0, 3).join(", ")}{change.removed.length > 3 ? "…" : ""}</li>}
          {change.resequenced.length > 0 && <li className="text-sky-800">↕ Resequenced: {change.resequenced.slice(0, 3).join(", ")}{change.resequenced.length > 3 ? "…" : ""}</li>}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-ink/50">No changes since the last baseline.</p>
      )}
      {versions.length > 1 && (
        <>
          <div className="mt-3 flex flex-wrap gap-1 text-[11px]">
            {versions.slice(0, 5).map((v) => (
              <span key={v.id} className="rounded border border-border bg-white px-1.5 py-0.5 text-ink/70">
                {v.label ?? v.id.slice(0, 6)} · {v.status}
              </span>
            ))}
          </div>
          <button
            type="button"
            onClick={onOpenCompare}
            className="mt-2 inline-flex items-center gap-1 rounded-md border border-border bg-white px-2.5 py-1 text-[11px] text-ink hover:border-ink/40"
          >
            <GitBranch className="h-3 w-3" />
            Compare versions
          </button>
        </>
      )}
    </section>
  );
}

function CrossProjectCard({ family }: { family: ProjectRoadmapPayload["view"]["cross_project_dependencies"] }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm" data-qa-section="roadmap-family">
      <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.22em] text-ink/50">
        <Users className="h-3.5 w-3.5" />
        Family & dependencies
      </div>
      {family.length === 0 ? (
        <p className="mt-3 text-sm text-ink/50">No cross-project dependencies.</p>
      ) : (
        <ul className="mt-3 space-y-1.5 text-sm">
          {family.map((f) => (
            <li key={f.id} className="flex items-center justify-between">
              <span className="truncate text-ink/80">{f.label}</span>
              <HealthPill health={f.status === "on_track" ? "on_track" : f.status === "at_risk" ? "at_risk" : "at_risk"} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ChangeRequestCta({
  permissions,
  projectId,
}: {
  permissions: ProjectRoadmapPayload["permissions"];
  projectId: string;
}) {
  const [open, setOpen] = useState(false);
  if (!permissions.can_submit_change_request) return null;
  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-ink/50">Change request</div>
      <p className="mt-1 text-sm text-ink/70">
        Propose a change to scope, dates, or dependencies. It becomes an approval item, not a silent edit.
      </p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-ink/20 bg-white px-3 py-1.5 text-xs text-ink hover:border-ink/40"
      >
        Submit change request
      </button>
      {open && <ChangeRequestModal projectId={projectId} onClose={() => setOpen(false)} />}
    </section>
  );
}

function ChangeRequestModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-lg">
        <div className="font-display text-lg text-ink">Submit a change request</div>
        <p className="mt-1 text-sm text-ink/60">
          Change requests are routed through Approvals for this project. Wired to the full server flow in the next pass.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md border border-border px-3 py-1.5 text-xs text-ink hover:bg-muted">
            Close
          </button>
          <Link
            to="/engine/projects/$projectId/approvals"
            params={{ projectId }}
            onClick={onClose}
            className="rounded-md bg-ink px-3 py-1.5 text-xs text-white hover:bg-ink/90"
          >
            Open Approvals
          </Link>
        </div>
      </div>
    </div>
  );
}

// ------------- empty / draft states -------------

function NoTruthState({ projectId, missing }: { projectId: string; missing: string[] }) {
  const qc = useQueryClient();
  const fillMissingFn = useServerFn(fillMissingSpineDetailsFromIntake);
  const approveDraftedTruthFn = useServerFn(batchApproveDraftedSpineTruth);
  const invalidateRoadmapTruth = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["engine", "roadmap", projectId] }),
      qc.invalidateQueries({ queryKey: ["engine", "spine", projectId] }),
      qc.invalidateQueries({ queryKey: ["engine", "workspace", projectId] }),
      qc.invalidateQueries({ queryKey: ["engine", "spine-status", projectId] }),
      qc.invalidateQueries({ queryKey: ["engine", "ceremony-summary", projectId] }),
    ]);
  };
  const fillMutation = useMutation({
    mutationFn: () => fillMissingFn({ data: { projectId } }),
    onSuccess: async (result) => {
      await invalidateRoadmapTruth();
      toast.success(
        result.changed.length
          ? `AI Product Manager drafted ${result.changed.length} missing Spine field${result.changed.length === 1 ? "" : "s"}.`
          : "AI Product Manager reviewed the Spine. No blank fields were changed.",
      );
    },
    onError: (e) => {
      toast.error((e as Error).message || "AI Product Manager could not fill missing details.");
    },
  });
  const approveDraftedMutation = useMutation({
    mutationFn: () => approveDraftedTruthFn({ data: { projectId } }),
    onSuccess: async (result) => {
      await invalidateRoadmapTruth();
      if (result.approved.length) {
        toast.success(`Approved ${result.approved.length} drafted Spine truth${result.approved.length === 1 ? "" : "s"}.`);
      } else {
        toast.info("No AI-drafted Spine truth was ready for approval. Open the Spine tab to review remaining fields.");
      }
    },
    onError: (e) => {
      toast.error((e as Error).message || "Drafted Spine truth could not be approved.");
    },
  });
  return (
    <section className="rounded-xl border border-border bg-card p-6 shadow-sm text-sm" data-qa-state="roadmap-no-truth">
      <div className="flex items-center gap-2 text-ink">
        <MapIcon className="h-4 w-4" />
        <h2 className="font-display text-xl">Roadmap needs project truth</h2>
      </div>
      <p className="mt-2 max-w-2xl text-ink/60">
        The roadmap is generated from approved Point A and Point B. Approve the Spine truths and the draft roadmap appears here automatically.
      </p>
      {missing.length > 0 && (
        <ul className="mt-3 list-disc pl-5 text-ink/70">
          {missing.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => fillMutation.mutate()}
          disabled={fillMutation.isPending}
          className="inline-flex items-center gap-1.5 rounded-md bg-royal px-3 py-1.5 text-xs text-white hover:bg-royal/90 disabled:opacity-50"
        >
          <Sparkles className="h-3.5 w-3.5" />
          {fillMutation.isPending ? "Filling details…" : "Fill missing Spine details"}
        </button>
        <button
          type="button"
          onClick={() => approveDraftedMutation.mutate()}
          disabled={approveDraftedMutation.isPending}
          className="inline-flex items-center gap-1.5 rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-950 hover:border-emerald-500 disabled:opacity-50"
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          {approveDraftedMutation.isPending ? "Approving truth…" : "Approve drafted Spine truth"}
        </button>
        <Link
          to="/engine/projects/$projectId/spine"
          params={{ projectId }}
          className="inline-flex items-center gap-1.5 rounded-md bg-ink px-3 py-1.5 text-xs text-white hover:bg-ink/90"
        >
          Open Spine <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </section>
  );
}

function DraftGeneratingState({ projectId }: { projectId: string }) {
  return (
    <section className="rounded-xl border border-border bg-card p-6 shadow-sm text-sm" data-qa-state="roadmap-draft-generating">
      <div className="flex items-center gap-2 text-ink">
        <Sparkles className="h-4 w-4" />
        <h2 className="font-display text-xl">Draft roadmap forming</h2>
      </div>
      <p className="mt-2 max-w-2xl text-ink/60">
        Point A and Point B are approved. Milestones haven't been sequenced yet. Open the builder to arrange phases and milestones.
      </p>
      <Link
        to="/engine/projects/$projectId/builder"
        params={{ projectId }}
        className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-ink px-3 py-1.5 text-xs text-white hover:bg-ink/90"
      >
        Open builder <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </section>
  );
}

function RoadmapLoadingSkeleton() {
  return (
    <div className="space-y-4" data-qa-state="roadmap-loading">
      <div className="h-24 animate-pulse rounded-xl border border-border bg-card" />
      <div className="h-20 animate-pulse rounded-xl border border-border bg-card" />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-3">
          <div className="h-32 animate-pulse rounded-xl border border-border bg-card" />
          <div className="h-48 animate-pulse rounded-xl border border-border bg-card" />
        </div>
        <div className="space-y-3">
          <div className="h-40 animate-pulse rounded-xl border border-border bg-card" />
          <div className="h-24 animate-pulse rounded-xl border border-border bg-card" />
        </div>
      </div>
    </div>
  );
}
