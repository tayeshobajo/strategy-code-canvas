import { createFileRoute, Link } from "@tanstack/react-router";
import { Suspense, useEffect, useState } from "react";
import { useSuspenseQuery, queryOptions, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import ReactMarkdown from "react-markdown";
import { getPortalRoadmapDocs, recordPortalRoadmapEvent } from "@/lib/portal.functions";
import { usePortalContext } from "@/hooks/use-portal-context";
import { Button } from "@/components/ui/button";
import { FileText, Download, CheckCircle2, Loader2 } from "lucide-react";

export const Route = createFileRoute("/portal/roadmap")({
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
        <Button
          asChild
          className="mt-6 bg-ink hover:bg-ink/90 text-white"
        >
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
          Once Tai finalizes your approved Roadmap, it will appear here for you to
          read, download, and revisit at any time.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {data.docs.map((doc) => (
        <RoadmapDoc key={doc.id} doc={doc} />
      ))}
    </div>
  );
}

function RoadmapDoc({ doc }: { doc: import("@/lib/portal.functions").PortalRoadmapDoc }) {
  const ctx = usePortalContext();
  const portalRoadmapId = ctx.data && "approvedRoadmap" in ctx.data
    ? ctx.data.approvedRoadmap?.id
    : undefined;
  const acknowledgedAt = ctx.data && "approvedRoadmap" in ctx.data
    ? ctx.data.approvedRoadmap?.acknowledged_at
    : null;

  const recordEvent = useServerFn(recordPortalRoadmapEvent);
  const [ackConfirm, setAckConfirm] = useState(false);

  // Idempotent "viewed" ping on mount (server dedupes when already recorded).
  useEffect(() => {
    if (!portalRoadmapId) return;
    recordEvent({ data: { roadmapId: portalRoadmapId, event: "viewed" } }).catch(() => {});
  }, [portalRoadmapId, recordEvent]);

  const ackMut = useMutation({
    mutationFn: () =>
      recordEvent({ data: { roadmapId: portalRoadmapId!, event: "acknowledged" } }),
    onSuccess: () => ctx.refetch(),
  });

  const dlMut = useMutation({
    mutationFn: () =>
      recordEvent({ data: { roadmapId: portalRoadmapId!, event: "downloaded" } }),
  });

  return (
    <article className="rounded-2xl bg-card border border-border shadow-sm p-8 lg:p-10">
      <div className="flex items-start justify-between gap-6 mb-6">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal flex items-center gap-2">
            <FileText className="w-3.5 h-3.5" /> Approved Roadmap
          </div>
          <h1 className="font-display text-3xl text-ink mt-2">{doc.title}</h1>
          {doc.published_at && (
            <div className="text-[13px] text-ink/60 mt-2">
              Published {new Date(doc.published_at).toLocaleDateString()}
            </div>
          )}
        </div>
        {doc.file_url && (
          <Button asChild variant="outline" className="border-ink/20 text-ink"
            onClick={() => portalRoadmapId && dlMut.mutate()}>
            <a href={doc.file_url} target="_blank" rel="noreferrer">
              <Download className="w-4 h-4 mr-2" /> Download
            </a>
          </Button>
        )}
      </div>

      {doc.body_md ? (
        <div
          className="prose prose-slate max-w-none prose-headings:font-display prose-headings:text-ink prose-a:text-ink"
          style={{ fontFamily: "var(--font-display), Georgia, serif" }}
        >
          <ReactMarkdown>{doc.body_md}</ReactMarkdown>
        </div>
      ) : (
        !doc.file_url && (
          <p className="text-ink/60 italic">This Roadmap has no written content yet.</p>
        )
      )}

      {portalRoadmapId && (
        <div className="mt-8 pt-6 border-t border-border">
          {acknowledgedAt ? (
            <div className="flex items-center gap-2 text-sm text-[#1f6b3b]">
              <CheckCircle2 className="w-4 h-4" />
              Acknowledged {new Date(acknowledgedAt).toLocaleDateString()}. Tai has been notified.
            </div>
          ) : (
            <div className="space-y-3">
              <label className="flex items-start gap-2 text-sm text-ink/80">
                <input
                  type="checkbox"
                  checked={ackConfirm}
                  onChange={(e) => setAckConfirm(e.target.checked)}
                  className="mt-1 accent-royal"
                />
                <span>
                  I've read the approved roadmap and I'm ready to move into execution.
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
      )}
    </article>
  );
}
