import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Suspense, useEffect, useMemo, useState } from "react";
import {
  useSuspenseQuery,
  queryOptions,
  useMutation,
} from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import {
  getPortalRoadmapDocs,
  recordPortalRoadmapEvent,
  type PortalRoadmapDoc,
} from "@/lib/portal.functions";
import { buildRoadmapJourney } from "@/lib/portal-roadmap-model";
import { DEMO_ROADMAP_RAW, DEMO_PROJECT } from "@/lib/portal-roadmap-demo-fixture";
import { usePortalContext } from "@/hooks/use-portal-context";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  Loader2,
  Download,
  Calendar,
  MessageSquare,
  Eye,
} from "lucide-react";
import { MapCanvas } from "@/components/portal/roadmap/MapCanvas";
import { MilestoneSheet } from "@/components/portal/roadmap/MilestoneSheet";
import {
  RoadmapOverviewStrip,
  MapLegend,
} from "@/components/portal/roadmap/RoadmapOverviewStrip";
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
import { Activity, Maximize } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";

const searchSchema = z.object({
  m: fallback(z.string().optional(), undefined),
  item: fallback(z.string().optional(), undefined),
  decision: fallback(z.string().optional(), undefined),
  deliverable: fallback(z.string().optional(), undefined),
  __visual: fallback(z.enum(["demo"]).optional(), undefined),
});

export const Route = createFileRoute("/portal/roadmap")({
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
    if (search.__visual === "demo") {
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
          <Link to="/portal/messages">Contact Trust Tai</Link>
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
          <Link to="/portal/messages">Contact Tai</Link>
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
          <Link to="/portal/messages">Contact Trust Tai</Link>
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
        search: () => ({ m: requestedSlug }),
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
      navigate({ search: () => ({}), replace: true });
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
      search: () => (slug ? { m: slug } : {}),
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
    const total = el.scrollWidth;
    const map: Record<string, number> = {
      pointA: 0,
      now: total * 0.15,
      next: total * 0.45,
      later: total * 0.75,
      pointB: total,
    };
    const target = map[key] ?? 0;
    el.scrollTo({ left: target, behavior: "smooth" });
  };

  const [headerClarifyOpen, setHeaderClarifyOpen] = useState(false);
  const [headerBookOpen, setHeaderBookOpen] = useState(false);
  const [viewMode, setViewMode] = useState<RoadmapViewMode>("all");
  const isMobile = useIsMobile();

  // Compute the set of milestone slugs that match the current view filter.
  const matchingSlugs = useMemo(
    () => (viewMode === "all" ? null : computeMatchingSlugs(journey, viewMode)),
    [journey, viewMode],
  );
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
          />
        )
      }
      below={
        <>
          <SupportingContext journey={journey} />
          <AcknowledgeBlock ctx={ctx} portalRoadmapId={portalRoadmapId} />
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
  canvas,
  below,
  children,
}: {
  header: React.ReactNode;
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
        <div className="flex-1 min-h-0 relative px-3 sm:px-4 lg:px-6 py-3">
          {canvas}
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
}: {
  journey: ReturnType<typeof buildRoadmapJourney>;
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
  viewMode: RoadmapViewMode;
  onJump: (key: "pointA" | "now" | "next" | "later" | "pointB") => void;
}) {
  // Inject the derived currentPhaseKey into the canvas context so all
  // surfaces (status card, pill, mini-map) read from one source of truth.
  const canvas = useRoadmapCanvas();
  useEffect(() => {
    canvas.setCurrentPhaseKey(journey.currentPhaseKey);
  }, [canvas, journey.currentPhaseKey]);

  return (
    <div className="relative h-full w-full">
      <MapCanvas
        journey={journey}
        selectedSlug={selectedSlug}
        onSelect={onSelect}
        viewMode={viewMode}
        fitHeight
      />
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
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 pointer-events-auto">
          <MapLegend />
        </div>
        <div className="absolute bottom-3 left-3 right-3 pointer-events-auto">
          <RoadmapOverviewStrip journey={journey} onJump={onJump} variant="floating" />
        </div>
      </div>
    </div>
  );
}


function CurrentPhasePill({ journey }: { journey: ReturnType<typeof buildRoadmapJourney> }) {
  const canvas = useRoadmapCanvas();
  // Single source of truth: derived currentPhaseKey. Selected/viewport phase
  // is used only when the user has explicitly navigated elsewhere.
  const key =
    canvas.selectedPhaseKey ??
    canvas.currentPhaseKey ??
    journey.currentPhaseKey;
  const idx = journey.phases.findIndex((p) => p.key === key);
  const phaseName =
    key === "now" || idx === 0
      ? "Phase 1: Foundation"
      : key === "next" || idx === 1
        ? "Phase 2: Core Platform Build"
        : key === "later" || idx === 2
          ? "Phase 3: Scale Systems"
          : key === "pointA"
            ? "Point A: Current State"
            : "Point B: Scaled Impact";
  return (
    <div
      className="inline-flex items-center gap-3 rounded-xl bg-slate-900 text-white px-4 py-2 shadow-[0_10px_28px_-16px_rgba(4,10,25,0.6)]"
      data-testid="current-phase-pill"
    >
      <div className="text-left">
        <div className="font-mono text-[9.5px] uppercase tracking-[0.28em] text-white/60">
          Current Phase
        </div>
        <div className="text-[13px] font-semibold leading-tight">
          {phaseName}
        </div>
      </div>
      <Activity className="w-4 h-4 text-royal shrink-0" />
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

  const fitToField = () => {
    const el = document.getElementById("portal-canvas-scroll");
    if (!el) return;
    el.scrollTo({ left: 0, behavior: "smooth" });
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
            onClick={fitToField}
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
              <DropdownMenuItem onSelect={() => onJump("pointA")}>Point A · Current State</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onJump("now")}>Phase 1 · Foundation</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onJump("next")}>Phase 2 · Core Platform Build</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onJump("later")}>Phase 3 · Scale Systems</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onJump("pointB")}>Point B · Scaled Impact</DropdownMenuItem>
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
              {(["all", "decisions", "deliverables", "deadlines", "current"] as const).map((mode) => (
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

function AcknowledgeBlock({
  ctx,
  portalRoadmapId,
}: {
  ctx: ReturnType<typeof usePortalContext>;
  portalRoadmapId: string | undefined;
}) {
  const acknowledgedAt =
    ctx.data && "approvedRoadmap" in ctx.data
      ? ctx.data.approvedRoadmap?.acknowledged_at
      : null;
  const recordEvent = useServerFn(recordPortalRoadmapEvent);
  const [ackConfirm, setAckConfirm] = useState(false);
  const ackMut = useMutation({
    mutationFn: () =>
      recordEvent({
        data: { roadmapId: portalRoadmapId!, event: "acknowledged" },
      }),
    onSuccess: () => ctx.refetch(),
  });
  if (!portalRoadmapId) return null;
  return (
    <div className="rounded-2xl bg-card border border-border p-6 lg:p-8">
      {acknowledgedAt ? (
        <div className="flex items-center gap-2 text-sm text-[#1f6b3b]">
          <CheckCircle2 className="w-4 h-4" />
          Roadmap acknowledged on{" "}
          {new Date(acknowledgedAt).toLocaleDateString()}. Tai has been
          notified.
        </div>
      ) : (
        <div className="space-y-3">
          <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal">
            Acknowledge roadmap
          </div>
          <label className="flex items-start gap-2 text-sm text-ink/80">
            <input
              type="checkbox"
              checked={ackConfirm}
              onChange={(e) => setAckConfirm(e.target.checked)}
              className="mt-1 accent-royal"
            />
            <span>
              I've read the approved roadmap and I'm ready to move into
              execution.
            </span>
          </label>
          <Button
            disabled={!ackConfirm || ackMut.isPending}
            onClick={() => ackMut.mutate()}
            className="bg-ink hover:bg-ink/90 text-white"
          >
            {ackMut.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4 mr-2" />
            )}
            Acknowledge roadmap
          </Button>
          {ackMut.isError && (
            <p className="text-xs text-[#a4283c]">
              Could not record acknowledgement. Please try again.
            </p>
          )}
        </div>
      )}
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
    const total = el.scrollWidth;
    const map: Record<string, number> = {
      pointA: 0,
      now: total * 0.15,
      next: total * 0.45,
      later: total * 0.75,
      pointB: total,
    };
    el.scrollTo({ left: map[key] ?? 0, behavior: "smooth" });
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

