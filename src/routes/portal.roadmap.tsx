import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSuspenseQuery, queryOptions, useMutation } from "@tanstack/react-query";
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

const searchSchema = z.object({
  m: fallback(z.string().optional(), undefined),
});

export const Route = createFileRoute("/portal/roadmap")({
  validateSearch: zodValidator(searchSchema),
  head: () => ({
    meta: [
      { title: "Roadmap — Trust Tai portal" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <Suspense fallback={<Loading />}>
      <RoadmapView />
    </Suspense>
  ),
});

function Loading() {
  return (
    <div className="rounded-xl bg-card border border-border p-10 text-ink/60">
      Loading your Roadmap…
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
          Your Roadmap is not yet published.
        </h1>
        <p className="text-[15px] leading-[1.75] text-ink/70 mt-3">
          Once Tai finalizes your approved Roadmap, it will appear here as an
          interactive journey — Point A to Point B, phase by phase.
        </p>
      </div>
    );
  }

  // Show the most recently approved roadmap as the primary journey; older
  // versions collapse into a compact history list below the canvas.
  const [primary, ...older] = data.docs;
  return <RoadmapJourneyView doc={primary} olderDocs={older} />;
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

  const selectedSlug = search.m ?? null;
  const selectedMilestone =
    journey.milestones.find((m) => m.slug === selectedSlug) ?? null;

  const setSelected = (slug: string | null) => {
    navigate({
      search: (prev) => ({ ...prev, m: slug ?? undefined }),
      replace: true,
    });
  };

  const [activePhaseKey, setActivePhaseKey] = useState<string | null>(
    journey.phases[0]?.key ?? null,
  );

  // Record a passive "viewed" event once per session.
  const portalRoadmapId =
    ctx.data && "approvedRoadmap" in ctx.data
      ? ctx.data.approvedRoadmap?.id
      : undefined;
  const recordEvent = useServerFn(recordPortalRoadmapEvent);
  useEffect(() => {
    if (!portalRoadmapId) return;
    recordEvent({
      data: { roadmapId: portalRoadmapId, event: "viewed" },
    }).catch(() => {});
  }, [portalRoadmapId, recordEvent]);

  const jumpTo = (key: string) => {
    setActivePhaseKey(key);
    const el = document.getElementById(`portal-canvas-scroll`);
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

  return (
    <div className="max-w-[1400px] mx-auto space-y-8">
      <RoadmapHeader journey={journey} doc={doc} />
      <ExecutiveSnapshot journey={journey} />
      <PhaseJumpNav
        journey={journey}
        onJump={jumpTo}
        activeKey={activePhaseKey}
      />
      <div id="portal-canvas-scroll" className="overflow-x-auto rounded-2xl">
        <JourneyCanvas
          journey={journey}
          selectedSlug={selectedSlug}
          onSelect={(slug) => setSelected(slug)}
        />
      </div>
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
        onClose={() => setSelected(null)}
      />
    </div>
  );
}

function RoadmapHeader({
  journey,
  doc,
}: {
  journey: ReturnType<typeof buildRoadmapJourney>;
  doc: PortalRoadmapDoc;
}) {
  return (
    <div className="flex items-start justify-between gap-6 flex-wrap">
      <div>
        <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal">
          Your Roadmap
        </div>
        <h1 className="font-display text-3xl sm:text-4xl text-ink mt-2 leading-tight">
          {journey.title}
        </h1>
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
        <Button asChild variant="outline" className="border-ink/20">
          <Link to="/portal/messages">
            <MessageSquare className="w-4 h-4 mr-2" />
            Request clarification
          </Link>
        </Button>
        {doc.file_url && (
          <Button asChild variant="outline" className="border-ink/20">
            <a href={doc.file_url} target="_blank" rel="noreferrer">
              <Download className="w-4 h-4 mr-2" /> Download PDF
            </a>
          </Button>
        )}
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
    { label: "Current focus", value: journey.currentFocus ?? journey.activeMilestone?.title ?? "—" },
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
                  {p.detail && <span className="text-ink/70"> — {p.detail}</span>}
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
  const visible = cards.filter(Boolean) as Array<{ label: string; body: React.ReactNode }>;
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
