import { createFileRoute, Link } from "@tanstack/react-router";
import { Suspense } from "react";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import ReactMarkdown from "react-markdown";
import { getPortalRoadmapDocs } from "@/lib/portal.functions";
import { Button } from "@/components/ui/button";
import { FileText, Download } from "lucide-react";

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
        <article
          key={doc.id}
          className="rounded-2xl bg-card border border-border shadow-sm p-8 lg:p-10"
        >
          <div className="flex items-start justify-between gap-6 mb-6">
            <div>
              <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal flex items-center gap-2">
                <FileText className="w-3.5 h-3.5" /> Approved Roadmap
              </div>
              <h1 className="font-display text-3xl text-ink mt-2">
                {doc.title}
              </h1>
              {doc.published_at && (
                <div className="text-[13px] text-ink/60 mt-2">
                  Published {new Date(doc.published_at).toLocaleDateString()}
                </div>
              )}
            </div>
            {doc.file_url && (
              <Button
                asChild
                variant="outline"
                className="border-ink/20 text-ink"
              >
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
              <p className="text-ink/60 italic">
                This Roadmap has no written content yet.
              </p>
            )
          )}
        </article>
      ))}
    </div>
  );
}
