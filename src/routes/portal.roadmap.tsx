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
import { usePortalContext } from "@/hooks/use-portal-context";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  Loader2,
  Download,
  Calendar,
  MessageSquare,
} from "lucide-react";
import { JourneyCanvas } from "@/components/portal/roadmap/JourneyCanvas";
import { MilestoneSheet } from "@/components/portal/roadmap/MilestoneSheet";
import { PhaseJumpNav } from "@/components/portal/roadmap/PhaseJumpNav";
import { MiniMap } from "@/components/portal/roadmap/MiniMap";
import { MobilePhaseStack } from "@/components/portal/roadmap/MobilePhaseStack";
import { ClarificationModal } from "@/components/portal/roadmap/ClarificationModal";
import { BookCallModal } from "@/components/portal/roadmap/BookCallModal";
import {
  RoadmapCanvasProvider,
  useRoadmapCanvas,
} from "@/components/portal/roadmap/canvas-context";
import {
  computeMatchingSlugs,
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
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";

const searchSchema = z.object({
  m: fallback(z.string().optional(), undefined),
  item: fallback(z.string().optional(), undefined),
  decision: fallback(z.string().optional(), undefined),
  deliverable: fallback(z.string().optional(), undefined),
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
  component: () => (
    <Suspense fallback={<Loading />}>
      <RoadmapView />
    </Suspense>
  ),
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
  const canvas = useRoadmapCanvas();

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
    if (!matchingSlugs.has(selectedMilestone.slug)) setSelected(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode]);

  // A journey is "empty" when every phase only contains placeholder milestones.
  const hasRealMilestones = journey.milestones.some(
    (m) => !m.slug.endsWith("-placeholder"),
  );

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      <RoadmapHeader
        journey={journey}
        doc={doc}
        portalRoadmapId={portalRoadmapId}
        onClarify={() => setHeaderClarifyOpen(true)}
        onBookCall={() => setHeaderBookOpen(true)}
      />
      <ExecutiveSnapshot journey={journey} />
      {hasRealMilestones && (
        <ViewFilterBar
          value={viewMode}
          onChange={setViewMode}
          matchingCount={matchingCount}
          total={journey.milestones.length}
        />
      )}
      {!hasRealMilestones ? (
        <div className="rounded-2xl bg-card border border-border p-8 lg:p-10 text-center">
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
        <>
          <PhaseJumpNav journey={journey} onJump={jumpTo} />
          <JourneyCanvas
            journey={journey}
            selectedSlug={selectedMilestone?.slug ?? null}
            onSelect={(slug) => setSelected(slug)}
            matchingSlugs={matchingSlugs}
          />
          <MiniMap journey={journey} canvasWidth={canvas.scrollWidth || 1800} />
        </>
      )}
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
    </div>
  );
}

function ViewFilterBar({
  value,
  onChange,
  matchingCount,
  total,
}: {
  value: RoadmapViewMode;
  onChange: (v: RoadmapViewMode) => void;
  matchingCount: number;
  total: number;
}) {
  const active = value !== "all";
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-3">
        <label
          htmlFor="roadmap-view-filter"
          className="font-mono text-[10px] uppercase tracking-[0.28em] text-ink/55"
        >
          View
        </label>
        <Select value={value} onValueChange={(v) => onChange(v as RoadmapViewMode)}>
          <SelectTrigger
            id="roadmap-view-filter"
            className="h-9 w-[200px] bg-card border-border"
            aria-label="Filter roadmap view"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(
              ["all", "decisions", "deliverables", "deadlines", "current"] as const
            ).map((mode) => (
              <SelectItem key={mode} value={mode}>
                {VIEW_MODE_LABEL[mode]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {active && (
          <span className="text-[12px] text-ink/60">
            Showing {matchingCount} of {total}
          </span>
        )}
      </div>
      {active && (
        <button
          type="button"
          onClick={() => onChange("all")}
          className="text-[12px] font-medium text-royal hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-royal rounded"
        >
          Show full journey
        </button>
      )}
    </div>
  );
}

function RoadmapHeader({
  journey,
  doc,
  portalRoadmapId,
  onClarify,
}: {
  journey: ReturnType<typeof buildRoadmapJourney>;
  doc: PortalRoadmapDoc;
  portalRoadmapId: string | undefined;
  onClarify: () => void;
  onBookCall: () => void;
}) {
  const recordEvent = useServerFn(recordPortalRoadmapEvent);
  const handleDownload = () => {
    if (portalRoadmapId) {
      recordEvent({
        data: { roadmapId: portalRoadmapId, event: "downloaded" },
      }).catch(() => {});
    }
    if (doc.file_url) {
      window.open(doc.file_url, "_blank", "noopener,noreferrer");
      return;
    }
    if (typeof window !== "undefined") window.print();
  };
  return (
    <div className="flex items-start justify-between gap-6 flex-wrap">
      <div>
        <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal">
          Your Roadmap Canvas
        </div>
        <h1 className="font-display text-3xl sm:text-4xl text-ink mt-2 leading-tight">
          {journey.title}
        </h1>
        <p className="text-[14px] text-ink/65 mt-2 max-w-2xl">
          A clear view of the journey, the active work, and the decisions ahead.
        </p>
        <div className="flex items-center gap-2 flex-wrap mt-3">
          <span className="inline-flex items-center rounded-full bg-royal/10 text-royal border border-royal/20 px-2.5 py-1 text-[11px] font-medium">
            Approved
          </span>
          {journey.activeMilestone && (
            <span className="inline-flex items-center rounded-full bg-ink text-white px-2.5 py-1 text-[11px] font-medium">
              Current: {journey.activeMilestone.title}
            </span>
          )}
          {journey.approvedAt && (
            <span className="text-[12px] text-ink/55">
              Last updated {new Date(journey.approvedAt).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          variant="outline"
          className="border-ink/20"
          onClick={onClarify}
        >
          <MessageSquare className="w-4 h-4 mr-2" />
          Request clarification
        </Button>
        <Button
          onClick={handleDownload}
          variant="outline"
          className="border-ink/20"
          aria-label={
            doc.file_url
              ? "Download approved roadmap PDF"
              : "Save roadmap as PDF via browser print"
          }
        >
          <Download className="w-4 h-4 mr-2" /> Download PDF
        </Button>
        <Button asChild className="bg-ink hover:bg-ink/90 text-white">
          <Link to="/portal/messages">
            <Calendar className="w-4 h-4 mr-2" />
            Book next call
          </Link>
        </Button>
      </div>
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
