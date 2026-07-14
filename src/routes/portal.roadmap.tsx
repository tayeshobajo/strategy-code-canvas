import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  useSuspenseQuery,
  queryOptions,
} from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import {
  getPortalRoadmapDocs,
  recordPortalRoadmapEvent,
  type PortalRoadmapDoc,
} from "@/lib/portal.functions";
import { buildRoadmapJourney, type PhaseKey, type MilestoneStatus } from "@/lib/portal-roadmap-model";
import { RoadmapFilters, FILTERABLE_STATUSES } from "@/components/portal/roadmap/RoadmapFilters";
import { targetBounds } from "@/components/portal/roadmap/roadmap-layout";
import { DEMO_ROADMAP_RAW, DEMO_PROJECT } from "@/lib/portal-roadmap-demo-fixture";
import { usePortalContext } from "@/hooks/use-portal-context";
import { usePortalViewLogger } from "@/hooks/use-portal-view-logger";

import { Button } from "@/components/ui/button";
import { RoadmapAcknowledgmentBanner } from "@/components/portal/RoadmapAcknowledgmentBanner";
import {
  Loader2,
  Download,
  Calendar,
  MessageSquare,
  Eye,
} from "lucide-react";
import { MapCanvas } from "@/components/portal/roadmap/MapCanvas";
import { MilestoneSheet } from "@/components/portal/roadmap/MilestoneSheet";
import { SelectionConnector } from "@/components/portal/roadmap/SelectionConnector";
import { MapLegend } from "@/components/portal/roadmap/RoadmapOverviewStrip";
import { RoadmapOverviewMiniMap } from "@/components/portal/roadmap/RoadmapOverviewMiniMap";
import { StatusOverlayCard } from "@/components/portal/roadmap/StatusOverlayCard";
import { MobilePhaseStack } from "@/components/portal/roadmap/MobilePhaseStack";
import { ClarificationModal } from "@/components/portal/roadmap/ClarificationModal";
import { BookCallModal } from "@/components/portal/roadmap/BookCallModal";
import {
  RoadmapCanvasProvider,
  useRoadmapCanvas,
} from "@/components/portal/roadmap/canvas-context";
import {
  computeMatchingSlugs,
  computeMarkerVisibility,
  DEFAULT_MUTED_KINDS,
  DEFAULT_VISIBLE_KINDS,
  VIEW_MODE_LABEL,
  type RoadmapViewMode,
} from "@/components/portal/roadmap/view-mode";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Activity, Maximize, Target } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";

const VIEW_MODES = [
  "all",
  "decisions",
  "deliverables",
  "deadlines",
  "current",
  "client-actions",
  "critical-path",
] as const;

const PHASE_KEYS = ["pointA", "now", "next", "later", "pointB"] as const;

const searchSchema = z.object({
  m: fallback(z.string().optional(), undefined),
  item: fallback(z.string().optional(), undefined),
  decision: fallback(z.string().optional(), undefined),
  deliverable: fallback(z.string().optional(), undefined),
  view: fallback(z.enum(VIEW_MODES).optional(), undefined),
  phase: fallback(z.enum(PHASE_KEYS).optional(), undefined),
  __visual: fallback(z.enum(["demo"]).optional(), undefined),
});

const LS_VIEW_MODE = "portal.roadmap.viewMode";
const LS_PHASE_KEY = "portal.roadmap.phaseKey";

function readStoredView(): RoadmapViewMode | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(LS_VIEW_MODE);
    if (v && (VIEW_MODES as readonly string[]).includes(v)) return v as RoadmapViewMode;
  } catch {
    /* ignore */
  }
  return null;
}

export const Route = createFileRoute("/portal/roadmap")({
  loader: async () => {
    const data = await getPortalRoadmapDocs();
    if (data.revoked) {
      throw redirect({ to: "/portal/access-denied" });
    }
    if (data.docs.length === 0) {
      throw redirect({ to: "/portal/home" });
    }
    return null;
  },
  validateSearch: zodValidator(searchSchema),
  head: () => ({
    meta: [
      { title: "Your Roadmap Canvas — Trust Tai portal" },
      { name: "robots", content: "noindex" },
    ],
  }),
  errorComponent: ({ error, reset }) => <FailedToLoad error={error} reset={reset} />,
  component: () => {
    const search = Route.useSearch();
    if (import.meta.env.DEV && search.__visual === "demo") {
      return (
        <RoadmapCanvasProvider>
          <DemoRoadmapView />
        </RoadmapCanvasProvider>
      );
    }
    return (
      <Suspense fallback={<Loading />}>
        <RoadmapView />
      </Suspense>
    );
  },
});

function Loading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="max-w-3xl mx-auto rounded-2xl bg-card border border-border p-8 lg:p-10 shadow-sm"
    >
      <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal">
        Roadmap
      </div>
      <div className="mt-3 flex items-center gap-3 text-ink/80">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-[15px]">Loading your roadmap canvas…</span>
      </div>
      <p className="text-[13px] text-ink/55 mt-1.5">
        Preparing the latest approved version.
      </p>
      <div className="mt-6 space-y-3" aria-hidden="true">
        <div className="h-4 w-2/3 rounded bg-ink/5 animate-pulse" />
        <div className="h-4 w-1/2 rounded bg-ink/5 animate-pulse" />
        <div className="h-40 w-full rounded-xl bg-ink/5 animate-pulse" />
      </div>
    </div>
  );
}

function FailedToLoad({
  error,
  reset,
}: {
  error: unknown;
  reset: () => void;
}) {
  const message =
    error instanceof Error ? error.message : "Something went wrong.";
  return (
    <div
      role="alert"
      className="max-w-3xl mx-auto rounded-2xl bg-card border border-border p-8 lg:p-10 shadow-sm"
    >
      <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-[#a4283c]">
        Roadmap unavailable
      </div>
      <h1 className="font-display text-2xl text-ink mt-2">
        We could not load your roadmap.
      </h1>
      <p className="text-[15px] leading-[1.75] text-ink/70 mt-3">
        Please refresh the page. If this continues, contact Trust Tai and we
        will help.
      </p>
      <p className="text-[12px] text-ink/45 mt-3 font-mono break-all">
        {message}
      </p>
      <div className="flex gap-2 mt-6 flex-wrap">
        <Button
          onClick={() => reset()}
          className="bg-ink hover:bg-ink/90 text-white"
        >
          Refresh
        </Button>
        <Button asChild variant="outline" className="border-ink/20">
          <Link to="/portal/messages" search={{ milestone: undefined, prefill: undefined }}>Contact Trust Tai</Link>
        </Button>
      </div>
    </div>
  );
}

function RoadmapView() {
  const fetchDocs = useServerFn(getPortalRoadmapDocs);
  const { data } = useSuspenseQuery(
    queryOptions({
      queryKey: ["portal", "roadmap-docs"],
      queryFn: () => fetchDocs({}),
    }),
  );

  if (data.revoked) {
    return (
      <div className="max-w-3xl mx-auto rounded-2xl bg-card border border-border p-8 lg:p-10 shadow-sm">
        <h1 className="font-display text-2xl text-ink">
          Portal access is paused.
        </h1>
        <p className="text-[15px] leading-[1.75] text-ink/70 mt-3">
          Reach out to Tai to reinstate access to your Roadmap.
        </p>
        <Button asChild className="mt-6 bg-ink hover:bg-ink/90 text-white">
          <Link to="/portal/messages" search={{ milestone: undefined, prefill: undefined }}>Contact Tai</Link>
        </Button>
      </div>
    );
  }

  if (data.docs.length === 0) {
    return (
      <div className="max-w-3xl mx-auto rounded-2xl bg-card border border-border p-8 lg:p-10 shadow-sm">
        <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal">
          Roadmap
        </div>
        <h1 className="font-display text-2xl text-ink mt-2">
          Your roadmap is being prepared.
        </h1>
        <p className="text-[15px] leading-[1.75] text-ink/70 mt-3">
          Once your approved roadmap is ready, it will appear here as a visual
          journey from current state to future state.
        </p>
        <Button asChild className="mt-6 bg-ink hover:bg-ink/90 text-white">
          <Link to="/portal/messages" search={{ milestone: undefined, prefill: undefined }}>Contact Trust Tai</Link>
        </Button>
      </div>
    );
  }

  const [primary, ...older] = data.docs;
  return (
    <RoadmapCanvasProvider>
      <RoadmapJourneyView doc={primary} olderDocs={older} />
    </RoadmapCanvasProvider>
  );
}

function RoadmapJourneyView({
  doc,
  olderDocs,
}: {
  doc: PortalRoadmapDoc;
  olderDocs: PortalRoadmapDoc[];
}) {
  const navigate = useNavigate({ from: "/portal/roadmap" });
  const search = Route.useSearch();
  const ctx = usePortalContext();

  const journey = useMemo(
    () => buildRoadmapJourney(doc.raw ?? {}, doc.project ?? undefined),
    [doc],
  );

  // Resolve the selected marker across alias params (decision > deliverable > item > m).
  const requestedSlug =
    search.decision ?? search.deliverable ?? search.item ?? search.m ?? null;

  // Normalize any alias to canonical `?m=<slug>` shape.
  useEffect(() => {
    if (
      requestedSlug &&
      (search.decision || search.deliverable || search.item) &&
      search.m !== requestedSlug
    ) {
      navigate({
        search: (prev: z.infer<typeof searchSchema>) => ({ ...prev, m: requestedSlug ?? undefined }),
        replace: true,
      });
    }
  }, [requestedSlug, search.decision, search.deliverable, search.item, search.m, navigate]);

  const selectedMilestone = useMemo(
    () =>
      requestedSlug
        ? journey.milestones.find((m) => m.slug === requestedSlug) ?? null
        : null,
    [requestedSlug, journey.milestones],
  );

  // If a deep-link references an unknown slug, clear it with a calm toast.
  useEffect(() => {
    if (requestedSlug && !selectedMilestone) {
      toast.info("The selected item couldn't be found on this roadmap.");
      navigate({ search: (prev: z.infer<typeof searchSchema>) => ({ ...prev, m: undefined, item: undefined, decision: undefined, deliverable: undefined }), replace: true });
    }
  }, [requestedSlug, selectedMilestone, navigate]);

  // On mount / when the deep-linked marker changes, scroll it into view.
  useEffect(() => {
    if (!selectedMilestone) return;
    const el = document.querySelector<HTMLElement>(
      `[data-marker-slug="${CSS.escape(selectedMilestone.slug)}"]`,
    );
    if (el) {
      el.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }
  }, [selectedMilestone]);

  const setSelected = (slug: string | null) => {
    navigate({
      search: (prev: z.infer<typeof searchSchema>) => ({ ...prev, m: slug ?? undefined }),
      replace: true,
    });
  };

  const portalRoadmapId =
    ctx.data && "approvedRoadmap" in ctx.data
      ? ctx.data.approvedRoadmap?.id
      : undefined;
  const projectId =
    ctx.data && "project" in ctx.data ? ctx.data.project?.id : undefined;
  const authorEmail =
    ctx.data && "email" in ctx.data ? ctx.data.email : undefined;
  const acknowledgedAt =
    ctx.data && "approvedRoadmap" in ctx.data
      ? ctx.data.approvedRoadmap?.acknowledged_at ?? null
      : null;
  const schedulingUrl =
    ctx.data && "project" in ctx.data
      ? (ctx.data.project as { scheduling_url?: string | null } | null | undefined)
          ?.scheduling_url ?? null
      : null;

  const recordEvent = useServerFn(recordPortalRoadmapEvent);
  useEffect(() => {
    if (!portalRoadmapId) return;
    recordEvent({
      data: { roadmapId: portalRoadmapId, event: "viewed" },
    }).catch(() => {});
  }, [portalRoadmapId, recordEvent]);

  const jumpTo = (key: string) => {
    const el = document.getElementById("portal-canvas-scroll");
    if (!el) return;
    const bounds = targetBounds(
      journey,
      key === "pointA" || key === "pointB"
        ? (key as "pointA" | "pointB")
        : (key as "now" | "next" | "later"),
    );
    const targetLeft = Math.max(
      0,
      bounds.center * el.scrollWidth - el.clientWidth / 2,
    );
    el.scrollTo({ left: targetLeft, behavior: "smooth" });
  };

  const [headerClarifyOpen, setHeaderClarifyOpen] = useState(false);
  const [headerBookOpen, setHeaderBookOpen] = useState(false);
  // Seed viewMode from URL, then localStorage, else "all".
  const [viewMode, setViewModeState] = useState<RoadmapViewMode>(
    () => search.view ?? readStoredView() ?? "all",
  );
  const setViewMode = (v: RoadmapViewMode) => {
    setViewModeState(v);
    if (typeof window !== "undefined") {
      try {
        if (v === "all") window.localStorage.removeItem(LS_VIEW_MODE);
        else window.localStorage.setItem(LS_VIEW_MODE, v);
      } catch {
        /* ignore */
      }
    }
    navigate({
      search: (prev: z.infer<typeof searchSchema>) => ({
        ...prev,
        view: v === "all" ? undefined : v,
      }),
      replace: true,
    });
  };
  // Keep URL in sync if the user arrived without a `view` param but has one stored.
  useEffect(() => {
    if (!search.view && viewMode !== "all") {
      navigate({
        search: (prev: z.infer<typeof searchSchema>) => ({ ...prev, view: viewMode }),
        replace: true,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const isMobile = useIsMobile();

  // ---- Chip filters (status + phase, aka "quarters") ----
  const canvasCtx = useRoadmapCanvas();
  const [statusFilter, setStatusFilter] = useState<Set<MilestoneStatus>>(
    () => new Set(FILTERABLE_STATUSES),
  );
  const [phaseFilter, setPhaseFilter] = useState<Set<PhaseKey>>(() => new Set());
  const toggleStatusFilter = (s: MilestoneStatus) =>
    setStatusFilter((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      // never allow "nothing selected"; treat empty as reset-to-all.
      if (next.size === 0) return new Set(FILTERABLE_STATUSES);
      return next;
    });
  const togglePhaseFilter = (p: PhaseKey) =>
    setPhaseFilter((prev) => {
      // Empty set = "all phases". First click on a chip switches to
      // single-select; subsequent clicks toggle it in/out of that set.
      if (prev.size === 0) return new Set([p]);
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      if (next.size === journey.phases.length) return new Set();
      return next;
    });
  const resetFilters = () => {
    setStatusFilter(new Set(FILTERABLE_STATUSES));
    setPhaseFilter(new Set());
  };

  // Compute the set of milestone slugs that match the current view filter,
  // legend kind visibility, status chips and phase chips (intersected).
  const matchingSlugs = useMemo(() => {
    const base = viewMode === "all" ? null : computeMatchingSlugs(journey, viewMode);
    const allStatuses = statusFilter.size === FILTERABLE_STATUSES.length;
    const allPhases = phaseFilter.size === 0;
    // Legend hidden = visible & muted both false.
    const legendHidden = new Set<string>();
    for (const k of ["milestone", "decision", "deliverable", "meeting", "deadline"] as const) {
      if (!canvasCtx.visibleKinds.has(k) && !canvasCtx.mutedKinds.has(k)) {
        legendHidden.add(k);
      }
    }
    if (allStatuses && allPhases && legendHidden.size === 0 && !base) return null;
    const out = new Set<string>();
    for (const m of journey.milestones) {
      if (base && !base.has(m.slug)) continue;
      if (!allStatuses && !statusFilter.has(m.status)) continue;
      if (!allPhases && !phaseFilter.has(m.phase)) continue;
      const kindKey = m.dueDate && m.kind === "milestone" ? "deadline" : m.kind;
      if (legendHidden.has(kindKey)) continue;
      out.add(m.slug);
    }
    return out;
  }, [
    journey,
    viewMode,
    statusFilter,
    phaseFilter,
    canvasCtx.visibleKinds,
    canvasCtx.mutedKinds,
  ]);
  const matchingCount = matchingSlugs
    ? matchingSlugs.size
    : journey.milestones.length;


  // If a view filter hides the currently selected marker, deselect it so
  // the drawer stays consistent with what the canvas is showing.
  useEffect(() => {
    if (!selectedMilestone || !matchingSlugs) return;
    if (!matchingSlugs.has(selectedMilestone.slug)) {
      toast.info(
        `"${selectedMilestone.title}" is hidden by the current view. Selection cleared.`,
      );
      setSelected(null);
      // Return focus to the canvas so keyboard users aren't stranded.
      setTimeout(() => {
        const el = document.getElementById("portal-canvas-scroll");
        if (el) {
          if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
          (el as HTMLElement).focus({ preventScroll: true });
        }
      }, 60);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode]);

  // A journey is "empty" when every phase only contains placeholder milestones.
  const hasRealMilestones = journey.milestones.some(
    (m) => !m.slug.endsWith("-placeholder"),
  );

  return (
    <RoadmapViewport
      header={
        <RoadmapHeader
          journey={journey}
          doc={doc}
          portalRoadmapId={portalRoadmapId}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          matchingCount={matchingCount}
          totalCount={journey.milestones.length}
          onJump={jumpTo}
          onClarify={() => setHeaderClarifyOpen(true)}
          onBookCall={() => setHeaderBookOpen(true)}
        />
      }
      banner={
        portalRoadmapId && projectId && authorEmail ? (
          <RoadmapAcknowledgmentBanner
            portalRoadmapId={portalRoadmapId}
            projectId={projectId}
            clientEmail={authorEmail}
            acknowledgedAt={acknowledgedAt}
            onAcknowledged={() => {
              void ctx.refetch();
            }}
          />
        ) : null
      }
      canvas={
        !hasRealMilestones ? (
          <div className="m-6 rounded-2xl bg-card border border-border p-8 lg:p-10 text-center">
            <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal">
              Milestones coming soon
            </div>
            <h2 className="font-display text-xl text-ink mt-2">
              Your roadmap doesn't have any milestones yet.
            </h2>
            <p className="text-[15px] leading-[1.75] text-ink/70 mt-3 max-w-xl mx-auto">
              Tai is still shaping the phase-by-phase journey. As soon as
              milestones are added, they'll appear here as an interactive map.
            </p>
          </div>
        ) : isMobile ? (
          <MobilePhaseStack
            journey={journey}
            selectedSlug={selectedMilestone?.slug ?? null}
            onSelect={(slug) => setSelected(slug)}
            matchingSlugs={matchingSlugs}
          />
        ) : (
          <RoadmapCanvasStage
            journey={journey}
            selectedSlug={selectedMilestone?.slug ?? null}
            onSelect={(slug) => setSelected(slug)}
            viewMode={viewMode}
            onJump={jumpTo}
            matchingCount={matchingCount}
            matchingSlugs={matchingSlugs}
            onResetView={() => setViewMode("all")}
            statusFilter={statusFilter}
            phaseFilter={phaseFilter}
            onToggleStatus={toggleStatusFilter}
            onTogglePhase={togglePhaseFilter}
            onResetFilters={resetFilters}
          />
        )
      }
      below={
        <>
          <SupportingContext journey={journey} />
          {olderDocs.length > 0 && (
            <div className="rounded-2xl bg-card border border-border p-6">
              <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal mb-3">
                Earlier versions
              </div>
              <ul className="space-y-2">
                {olderDocs.map((d) => (
                  <li key={d.id} className="text-sm text-ink/70">
                    {d.title}
                    {d.published_at && (
                      <span className="text-ink/45">
                        {" "}
                        · {new Date(d.published_at).toLocaleDateString()}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      }
    >
      <MilestoneSheet
        milestone={selectedMilestone}
        roadmapId={portalRoadmapId}
        projectId={projectId}
        authorEmail={authorEmail}
        schedulingUrl={schedulingUrl}
        onClose={() => setSelected(null)}
        sequence={
          matchingSlugs
            ? journey.milestones
                .filter((m) => matchingSlugs.has(m.slug))
                .map((m) => m.slug)
            : journey.milestones.map((m) => m.slug)
        }
        onSelect={(slug) => setSelected(slug)}
        journey={journey}
      />
      <ClarificationModal
        open={headerClarifyOpen}
        onOpenChange={setHeaderClarifyOpen}
        projectId={projectId}
        authorEmail={authorEmail}
        context={null}
      />
      <BookCallModal
        open={headerBookOpen}
        onOpenChange={setHeaderBookOpen}
        projectId={projectId}
        authorEmail={authorEmail}
        schedulingUrl={schedulingUrl}
        context={null}
      />
    </RoadmapViewport>
  );
}

/**
 * Controlled viewport shell for the roadmap. Escapes the portal's page
 * padding so the header + canvas + mini-map fit inside 100vh at 100% zoom.
 * Supporting sections rendered under `below` remain page-scrollable.
 */
function RoadmapViewport({
  header,
  banner,
  canvas,
  below,
  children,
}: {
  header: React.ReactNode;
  banner?: React.ReactNode;
  canvas: React.ReactNode;
  below?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="-mx-4 sm:-mx-6 lg:-mx-10 -mt-10 lg:-mt-16 -mb-10 lg:-mb-16">
      <section
        className="flex flex-col bg-paper-soft"
        style={{ height: "calc(100vh - 0px)" }}
      >
        <div className="shrink-0 border-b border-ink/10 bg-white px-4 sm:px-6 lg:px-8 py-3">
          {header}
        </div>
        <div className="flex flex-1 min-h-0 flex-col gap-3 px-3 py-3 sm:px-4 lg:px-6">
          {banner ? <div className="shrink-0">{banner}</div> : null}
          <div className="relative flex-1 min-h-0">
            {canvas}
          </div>
        </div>
      </section>
      {below && (
        <div className="px-4 sm:px-6 lg:px-10 py-8 lg:py-12 space-y-5 max-w-[1500px] mx-auto">
          {below}
        </div>
      )}
      {children}
    </div>
  );
}

/**
 * The map canvas + floating overlays + sticky mini-map, all inside a single
 * bounded box so the client keeps "field awareness" without page scroll.
 */
function RoadmapCanvasStage({
  journey,
  selectedSlug,
  onSelect,
  viewMode,
  onJump,
  matchingCount,
  matchingSlugs,
  onResetView,
  statusFilter,
  phaseFilter,
  onToggleStatus,
  onTogglePhase,
  onResetFilters,
}: {
  journey: ReturnType<typeof buildRoadmapJourney>;
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
  viewMode: RoadmapViewMode;
  onJump: (key: "pointA" | "now" | "next" | "later" | "pointB") => void;
  matchingCount: number;
  matchingSlugs: Set<string> | null;
  onResetView: () => void;
  statusFilter: Set<MilestoneStatus>;
  phaseFilter: Set<PhaseKey>;
  onToggleStatus: (s: MilestoneStatus) => void;
  onTogglePhase: (p: PhaseKey) => void;
  onResetFilters: () => void;
}) {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/portal/roadmap" });
  // Inject the derived currentPhaseKey into the canvas context so all
  // surfaces (status card, pill, mini-map) read from one source of truth.
  const canvas = useRoadmapCanvas();
  useEffect(() => {
    canvas.setCurrentPhaseKey(journey.currentPhaseKey);
  }, [canvas, journey.currentPhaseKey]);

  // Seed selectedPhaseKey from URL on mount, then persist changes back.
  const didSeedPhase = useRef(false);
  useEffect(() => {
    if (didSeedPhase.current) return;
    didSeedPhase.current = true;
    const urlPhase = search.phase;
    if (!urlPhase) return;
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(LS_PHASE_KEY, urlPhase);
      } catch {
        /* ignore */
      }
    }
    if (urlPhase === "pointA" || urlPhase === "pointB") {
      onJump(urlPhase);
    } else {
      canvas.setSelectedPhaseKey(urlPhase);
      onJump(urlPhase);
    }
  }, [search.phase, canvas, onJump]);

  useEffect(() => {
    const key = canvas.selectedPhaseKey;
    const urlPhase = key ?? undefined;
    if (search.phase !== urlPhase) {
      navigate({
        search: (prev: z.infer<typeof searchSchema>) => ({ ...prev, phase: urlPhase }),
        replace: true,
      });
    }
    if (typeof window !== "undefined") {
      try {
        if (key) window.localStorage.setItem(LS_PHASE_KEY, key);
        else window.localStorage.removeItem(LS_PHASE_KEY);
      } catch {
        /* ignore */
      }
    }
  }, [canvas.selectedPhaseKey, search.phase, navigate]);

  // On first mount, run a short guided "journey" intro that pans from
  // Point A → Phase 1 → the current phase, so the map feels alive from load.
  // Session-scoped so we never replay it in the same browser session.
  const didInitialSnap = useRef(false);
  useEffect(() => {
    if (didInitialSnap.current) return;
    const el = document.getElementById("portal-canvas-scroll");
    if (!el || el.scrollWidth <= el.clientWidth) return;
    didInitialSnap.current = true;

    const total = el.scrollWidth;
    const phaseMap: Record<string, number> = {
      now: total * 0.15,
      next: total * 0.45,
      later: total * 0.75,
    };
    const currentTarget = phaseMap[journey.currentPhaseKey] ?? 0;

    // Honor reduced motion + only intro once per session.
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const alreadyPlayed =
      typeof window !== "undefined" &&
      window.sessionStorage.getItem("portal.roadmap.introPlayed") === "1";

    if (reduced || alreadyPlayed) {
      el.scrollTo({ left: currentTarget, behavior: "auto" });
      return;
    }

    // Start at Point A, then glide toward the current phase in two beats.
    el.scrollTo({ left: 0, behavior: "auto" });
    const firstBeat = window.setTimeout(() => {
      el.scrollTo({ left: total * 0.15, behavior: "smooth" });
    }, 350);
    const secondBeat = window.setTimeout(() => {
      el.scrollTo({ left: currentTarget, behavior: "smooth" });
    }, 1500);
    try {
      window.sessionStorage.setItem("portal.roadmap.introPlayed", "1");
    } catch {
      /* ignore */
    }
    return () => {
      window.clearTimeout(firstBeat);
      window.clearTimeout(secondBeat);
    };
  }, [journey.currentPhaseKey]);

  // Selecting a marker sets the "viewing" phase to that marker's phase AND
  // highlights the adjacent route segment on the main canvas so jumping
  // between milestones feels animated and premium.
  useEffect(() => {
    if (!selectedSlug) {
      canvas.setHighlightedSlug(null);
      return;
    }
    const m = journey.milestones.find((x) => x.slug === selectedSlug);
    if (!m) return;
    const phase = m.phase as PhaseKey;
    if (phase && phase !== canvas.selectedPhaseKey) {
      canvas.setSelectedPhaseKey(phase);
    }
    canvas.setHighlightedSlug(selectedSlug);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSlug]);

  // Phase-completion celebration: fire confetti + toast the first time a
  // phase hits 100%, once per phase per session. Reduced-motion skips the
  // confetti and keeps only the toast.
  useEffect(() => {
    let cancelled = false;
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    journey.phases.forEach((p, i) => {
      const real = p.milestones.filter((m) => !m.slug.endsWith("-placeholder"));
      if (real.length === 0) return;
      const done = real.filter((m) => m.status === "completed").length;
      if (done !== real.length) return;
      const key = `portal.roadmap.celebrated.${p.key}`;
      try {
        if (window.sessionStorage.getItem(key) === "1") return;
        window.sessionStorage.setItem(key, "1");
      } catch {
        /* ignore */
      }
      const label = `Phase ${i + 1}`;
      const message = p.summary?.trim() || p.label;
      window.setTimeout(() => {
        if (cancelled) return;
        toast.success(`${label} complete — ${message}`, {
          description: "One more chapter of the journey behind you.",
          duration: 6000,
        });
        if (!reduced) {
          import("canvas-confetti")
            .then(({ default: confetti }) => {
              const fire = (opts: Parameters<typeof confetti>[0]) =>
                confetti({
                  particleCount: 60,
                  spread: 70,
                  origin: { y: 0.7 },
                  colors: ["#2F7DFF", "#F0D282", "#7DCA54", "#FFFFFF"],
                  ticks: 200,
                  ...opts,
                });
              fire({ angle: 60, origin: { x: 0.15, y: 0.75 } });
              fire({ angle: 120, origin: { x: 0.85, y: 0.75 } });
              window.setTimeout(
                () => fire({ angle: 90, origin: { x: 0.5, y: 0.6 }, spread: 100 }),
                300,
              );
            })
            .catch(() => {
              /* confetti is a nice-to-have; failing silently is fine */
            });
        }
      }, 900);
    });
    return () => {
      cancelled = true;
    };
  }, [journey.phases]);


  return (
    <div className="relative h-full w-full">
      <MapCanvas
        journey={journey}
        selectedSlug={selectedSlug}
        onSelect={onSelect}
        viewMode={viewMode}
        fitHeight
      />
      <SelectionConnector selectedSlug={selectedSlug} active={!!selectedSlug} />
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-4 left-4 pointer-events-auto max-w-[280px]">
          <StatusOverlayCard
            journey={journey}
            onSelectNextAction={(slug) => onSelect(slug)}
          />
        </div>
        <div className="absolute top-4 right-4 max-w-md text-right pointer-events-none">
          <h2 className="font-display text-xl xl:text-2xl text-white leading-tight drop-shadow-[0_2px_10px_rgba(0,0,0,0.6)]">
            The journey from today to your scaled impact.
          </h2>
          <p className="text-[12px] xl:text-[13px] text-white/80 mt-1 drop-shadow-[0_1px_6px_rgba(0,0,0,0.55)]">
            A clear path. Strategic milestones. Real outcomes.
          </p>
        </div>
        <div className="absolute bottom-3 left-3 right-3 pointer-events-auto flex flex-col items-center gap-2">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <MapLegend />
            <RoadmapFilters
              journey={journey}
              activeStatuses={statusFilter}
              activePhases={phaseFilter}
              onToggleStatus={onToggleStatus}
              onTogglePhase={onTogglePhase}
              onReset={onResetFilters}
            />
          </div>
          <div className="w-full">
            <RoadmapOverviewMiniMap journey={journey} onJump={onJump} onSelect={onSelect} selectedSlug={selectedSlug} viewMode={viewMode} matchingSlugs={matchingSlugs} />
          </div>
        </div>
      </div>
      {viewMode !== "all" && matchingCount === 0 && (
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          data-testid="roadmap-empty-state"
        >
          <div className="pointer-events-auto max-w-md rounded-2xl bg-slate-950/85 border border-white/15 backdrop-blur px-6 py-5 text-white text-center shadow-[0_20px_60px_-20px_rgba(0,0,0,0.7)]">
            <div className="font-mono text-[10.5px] uppercase tracking-[0.28em] text-royal-glow">
              No matches in this view
            </div>
            <h3 className="font-display text-lg mt-1.5">
              Nothing on the map matches "{VIEW_MODE_LABEL[viewMode]}".
            </h3>
            <p className="text-[12.5px] text-white/70 mt-1.5 leading-snug">
              Try switching filters or clear the view to see every milestone.
            </p>
            <button
              type="button"
              onClick={onResetView}
              className="mt-3 inline-flex items-center justify-center rounded-md bg-white text-slate-900 text-[12px] font-medium px-3 py-1.5 hover:bg-white/90"
            >
              Show full journey
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


function CurrentPhasePill({ journey }: { journey: ReturnType<typeof buildRoadmapJourney> }) {
  const canvas = useRoadmapCanvas();
  // Operational truth only. Never reads selectedPhaseKey — browsing the map
  // must not change the "Current Phase" badge.
  const key = canvas.currentPhaseKey ?? journey.currentPhaseKey;
  const idx = journey.phases.findIndex((p) => p.key === key);
  const phaseName =
    journey.phases[idx]?.label ??
    journey.phases[0]?.label ??
    "Current Phase";

  return (
    <div
      className="inline-flex items-center gap-3 rounded-xl bg-slate-950 ring-1 ring-white/10 text-white px-4 py-2 shadow-[0_10px_28px_-16px_rgba(4,10,25,0.7)]"
      data-testid="current-phase-pill"
    >
      <div className="text-left">
        <div className="font-mono text-[9.5px] uppercase tracking-[0.28em] text-white/65">
          Current Phase
        </div>
        <div className="text-[13px] font-semibold leading-tight">
          {phaseName}
        </div>
      </div>
      <Activity className="w-4 h-4 text-royal-glow shrink-0" />
    </div>
  );
}

function RoadmapHeader({
  journey,
  doc,
  portalRoadmapId,
  viewMode,
  onViewModeChange,
  matchingCount,
  totalCount,
  onJump,
  onClarify,
  onBookCall,
}: {
  journey: ReturnType<typeof buildRoadmapJourney>;
  doc: PortalRoadmapDoc;
  portalRoadmapId: string | undefined;
  viewMode: RoadmapViewMode;
  onViewModeChange: (v: RoadmapViewMode) => void;
  matchingCount: number;
  totalCount: number;
  onJump: (key: "pointA" | "now" | "next" | "later" | "pointB") => void;
  onClarify: () => void;
  onBookCall: () => void;
}) {
  const recordEvent = useServerFn(recordPortalRoadmapEvent);
  const [dlError, setDlError] = useState<string | null>(null);
  const handleDownload = () => {
    setDlError(null);
    if (portalRoadmapId) {
      recordEvent({
        data: { roadmapId: portalRoadmapId, event: "downloaded" },
      }).catch(() => {});
    }
    try {
      if (doc.file_url) {
        const w = window.open(doc.file_url, "_blank", "noopener,noreferrer");
        if (!w) {
          setDlError("Popup blocked. Allow popups for this site, then try again.");
          toast.error("Download blocked by your browser.");
          return;
        }
        toast.success("Download started.");
        return;
      }
      if (typeof window !== "undefined") window.print();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong.";
      setDlError(msg);
      toast.error(`Could not start download: ${msg}`);
    }
  };

  const canvas = useRoadmapCanvas();

  const fitToField = () => {
    // "Fit to field" = information zoom out: Level 1 anchors only, whole map visible.
    canvas.setZoomLevel("strategic");
    canvas.setSelectedPhaseKey(null);
    const el = document.getElementById("portal-canvas-scroll");
    if (el) el.scrollTo({ left: 0, behavior: "smooth" });
  };

  const focusCurrentPhase = () => {
    const key = journey.currentPhaseKey;
    canvas.setZoomLevel("phase");
    canvas.setSelectedPhaseKey(key);
    if (key === "now") onJump("now");
    else if (key === "next") onJump("next");
    else onJump("later");
  };

  const viewFiltered = viewMode !== "all";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="font-display text-2xl sm:text-[26px] text-ink leading-tight truncate">
            {journey.title}
          </h1>
          <p className="text-[13px] text-ink/60 mt-1">
            {journey.currentFocus ?? "Roadmap to your next milestone"}
          </p>
          <div className="flex items-center gap-2 flex-wrap mt-2">
            <span className="inline-flex items-center rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 px-2 py-0.5 text-[10.5px] font-medium">
              Active
            </span>
            {journey.approvedAt && (
              <span className="text-[11.5px] text-ink/55">
                Last updated {new Date(journey.approvedAt).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 justify-end flex-wrap">
          <CurrentPhasePill journey={journey} />

          <Button
            variant="outline"
            size="sm"
            className="border-ink/15 h-9"
            onClick={focusCurrentPhase}
            data-testid="focus-current-phase"
          >
            <Target className="w-3.5 h-3.5 mr-1.5" />
            Focus current phase
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="border-ink/15 h-9"
            onClick={fitToField}
            data-testid="fit-to-field"
          >
            <Maximize className="w-3.5 h-3.5 mr-1.5" />
            Fit to field
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="border-ink/15 h-9">
                <Calendar className="w-3.5 h-3.5 mr-1.5" />
                Jump to
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {/* Real labels from journey data — no hardcoded demo copy. */}
              <DropdownMenuItem onSelect={() => onJump("pointA")}>
                Point A · {journey.pointA.label}
              </DropdownMenuItem>
              {journey.phases.map((p, i) => (
                <DropdownMenuItem key={p.key} onSelect={() => onJump(p.key)}>
                  Phase {i + 1} · {p.label}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem onSelect={() => onJump("pointB")}>
                Point B · {journey.pointB.label}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Select value={viewMode} onValueChange={(v) => onViewModeChange(v as RoadmapViewMode)}>
            <SelectTrigger
              className="h-9 w-[150px] border-ink/15 bg-white"
              aria-label="Filter roadmap view"
            >
              <span className="inline-flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5" />
                <SelectValue />
              </span>
            </SelectTrigger>
            <SelectContent>
              {(["all", "current", "critical-path", "decisions", "deliverables", "deadlines", "client-actions"] as const).map((mode) => (
                <SelectItem key={mode} value={mode}>
                  {VIEW_MODE_LABEL[mode]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            onClick={handleDownload}
            variant="outline"
            size="sm"
            className="border-ink/15 h-9"
            aria-label={
              doc.file_url
                ? "Download approved roadmap PDF"
                : "Save roadmap as PDF via browser print"
            }
          >
            <Download className="w-3.5 h-3.5 mr-1.5" /> Download PDF
          </Button>

          <Button
            onClick={onClarify}
            variant="outline"
            size="sm"
            className="border-ink/15 h-9"
          >
            <MessageSquare className="w-3.5 h-3.5 mr-1.5" />
            Ask a question
          </Button>

          <Button
            onClick={onBookCall}
            size="sm"
            className="bg-slate-900 hover:bg-slate-900/90 text-white h-9"
          >
            <Calendar className="w-3.5 h-3.5 mr-1.5" />
            Book next call
          </Button>
        </div>
      </div>

      {(viewFiltered || dlError) && (
        <div className="flex items-center justify-between gap-3 flex-wrap text-[12px]">
          {viewFiltered ? (
            <div className="flex items-center gap-3">
              <span className="text-ink/60">
                Showing {matchingCount} of {totalCount}
              </span>
              <button
                type="button"
                onClick={() => onViewModeChange("all")}
                className="font-medium text-royal hover:underline"
              >
                Show full journey
              </button>
            </div>
          ) : (
            <span />
          )}
          {dlError && (
            <div role="alert" className="text-[#a4283c] flex items-center gap-2">
              <span>{dlError}</span>
              <button
                type="button"
                onClick={handleDownload}
                className="font-medium underline underline-offset-2 hover:no-underline"
              >
                Try again
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ExecutiveSnapshot({
  journey,
}: {
  journey: ReturnType<typeof buildRoadmapJourney>;
}) {
  const stats = [
    {
      label: "Current focus",
      value:
        journey.currentFocus ?? journey.activeMilestone?.title ?? "—",
    },
    { label: "Active milestone", value: journey.activeMilestone?.title ?? "—" },
    {
      label: "Progress",
      value: (
        <div>
          <div className="text-ink font-medium">{journey.progressPercent}%</div>
          <div className="mt-1.5 h-1.5 rounded-full bg-ink/10 overflow-hidden">
            <div
              className="h-full bg-royal transition-all"
              style={{ width: `${journey.progressPercent}%` }}
            />
          </div>
        </div>
      ),
    },
    { label: "Next milestone", value: journey.nextMilestone?.title ?? "—" },
    {
      label: "Next review",
      value: journey.nextMeetingAt
        ? new Date(journey.nextMeetingAt).toLocaleDateString()
        : "—",
    },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {stats.map((s) => (
        <div
          key={s.label}
          className="rounded-xl bg-card border border-border p-4"
        >
          <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-royal">
            {s.label}
          </div>
          <div className="mt-2 text-[14px] text-ink/85 leading-tight">
            {s.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function SupportingContext({
  journey,
}: {
  journey: ReturnType<typeof buildRoadmapJourney>;
}) {
  const cards: Array<{ label: string; body: React.ReactNode } | null> = [
    journey.executiveSummary
      ? { label: "Executive summary", body: <p>{journey.executiveSummary}</p> }
      : null,
    journey.strategicPriorities.length > 0
      ? {
          label: "Strategic priorities",
          body: (
            <ol className="list-decimal pl-5 space-y-1.5">
              {journey.strategicPriorities.map((p, i) => (
                <li key={i}>
                  <span className="font-medium text-ink">{p.title}</span>
                  {p.detail && (
                    <span className="text-ink/70"> — {p.detail}</span>
                  )}
                </li>
              ))}
            </ol>
          ),
        }
      : null,
    journey.risksDependencies.length > 0
      ? {
          label: "Risks & dependencies",
          body: (
            <ul className="list-disc pl-5 space-y-1.5">
              {journey.risksDependencies.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          ),
        }
      : null,
    journey.recommendedNextMove
      ? {
          label: "Recommended next move",
          body: <p>{journey.recommendedNextMove}</p>,
        }
      : null,
  ];
  const visible = cards.filter(Boolean) as Array<{
    label: string;
    body: React.ReactNode;
  }>;
  if (visible.length === 0) return null;
  return (
    <div className="grid md:grid-cols-2 gap-4">
      {visible.map((c) => (
        <section
          key={c.label}
          className="rounded-2xl bg-card border border-border p-6"
        >
          <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal mb-3">
            {c.label}
          </div>
          <div className="text-[14.5px] leading-[1.7] text-ink/80">
            {c.body}
          </div>
        </section>
      ))}
    </div>
  );
}


// -------------------- Visual demo mode --------------------
// Rendered when the URL contains `?__visual=demo`. Zero server calls, zero
// auth, deterministic fixture — used by Playwright visual regression.
function DemoRoadmapView() {
  const journey = useMemo(
    () => buildRoadmapJourney(DEMO_ROADMAP_RAW, DEMO_PROJECT),
    [],
  );
  const [viewMode, setViewMode] = useState<RoadmapViewMode>("all");
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [clarifyOpen, setClarifyOpen] = useState(false);
  const [bookOpen, setBookOpen] = useState(false);
  const matchingSlugs = useMemo(
    () => (viewMode === "all" ? null : computeMatchingSlugs(journey, viewMode)),
    [journey, viewMode],
  );
  const matchingCount = matchingSlugs ? matchingSlugs.size : journey.milestones.length;

  const jumpTo = (key: string) => {
    const el = document.getElementById("portal-canvas-scroll");
    if (!el) return;
    const bounds = targetBounds(
      journey,
      key === "pointA" || key === "pointB"
        ? (key as "pointA" | "pointB")
        : (key as "now" | "next" | "later"),
    );
    const targetLeft = Math.max(
      0,
      bounds.center * el.scrollWidth - el.clientWidth / 2,
    );
    el.scrollTo({ left: targetLeft, behavior: "smooth" });
  };

  return (
    <RoadmapViewport
      header={
        <RoadmapHeader
          journey={journey}
          doc={{ id: "demo", title: journey.title, file_url: null, published_at: null } as unknown as PortalRoadmapDoc}
          portalRoadmapId={undefined}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          matchingCount={matchingCount}
          totalCount={journey.milestones.length}
          onJump={jumpTo}
          onClarify={() => setClarifyOpen(true)}
          onBookCall={() => setBookOpen(true)}
        />
      }
      canvas={
        <div data-testid="roadmap-canvas-wrap" className="h-full w-full">
          <RoadmapCanvasStage
            journey={journey}
            selectedSlug={selectedSlug}
            onSelect={setSelectedSlug}
            viewMode={viewMode}
            onJump={jumpTo}
            matchingCount={matchingCount}
            matchingSlugs={matchingSlugs}
            onResetView={() => setViewMode("all")}
            statusFilter={new Set(FILTERABLE_STATUSES)}
            phaseFilter={new Set()}
            onToggleStatus={() => {}}
            onTogglePhase={() => {}}
            onResetFilters={() => {}}
          />
        </div>
      }
      below={
        <div data-testid="unchanged-sections">
          <SupportingContext journey={journey} />
        </div>
      }
    >
      <MilestoneSheet
        milestone={
          selectedSlug
            ? journey.milestones.find((m) => m.slug === selectedSlug) ?? null
            : null
        }
        roadmapId={undefined}
        projectId={undefined}
        authorEmail={undefined}
        schedulingUrl={null}
        onClose={() => setSelectedSlug(null)}
      />
      <ClarificationModal
        open={clarifyOpen}
        onOpenChange={setClarifyOpen}
        projectId={undefined}
        authorEmail={undefined}
        context={null}
      />
      <BookCallModal
        open={bookOpen}
        onOpenChange={setBookOpen}
        projectId={undefined}
        authorEmail={undefined}
        schedulingUrl={null}
        context={null}
      />
    </RoadmapViewport>
  );
}
