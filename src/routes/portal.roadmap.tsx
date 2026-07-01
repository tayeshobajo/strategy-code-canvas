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
    <div className="rounded-xl bg-white/70 border border-black/5 p-10 text-slate-500">
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
      <div className="max-w-3xl rounded-2xl bg-white border border-black/5 p-10 shadow-sm">
        <h1
          className="text-2xl text-[#0B1E3B]"
          style={{ fontFamily: "Georgia, serif" }}
        >
          Portal access is paused.
        </h1>
        <p className="text-slate-600 mt-3">
          Reach out to Tai to reinstate access to your Roadmap.
        </p>
        <Button
          asChild
          className="mt-6 bg-[#0B1E3B] hover:bg-[#0B1E3B]/90 text-white"
        >
          <Link to="/portal/messages">Contact Tai</Link>
        </Button>
      </div>
    );
  }

  if (data.docs.length === 0) {
    return (
      <div className="max-w-3xl rounded-2xl bg-white border border-black/5 p-10 shadow-sm">
        <div className="text-[11px] uppercase tracking-widest text-[#B08A3E]">
          Roadmap
        </div>
        <h1
          className="text-2xl text-[#0B1E3B] mt-2"
          style={{ fontFamily: "Georgia, serif" }}
        >
          Your Roadmap is not yet published.
        </h1>
        <p className="text-slate-600 mt-3 leading-relaxed">
          Once Tai finalizes your approved Roadmap, it will appear here for you to
          read, download, and revisit at any time.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-8">
      {data.docs.map((doc) => (
        <article
          key={doc.id}
          className="rounded-2xl bg-white border border-black/5 shadow-sm p-10"
        >
          <div className="flex items-start justify-between gap-6 mb-6">
            <div>
              <div className="text-[11px] uppercase tracking-widest text-[#B08A3E] flex items-center gap-2">
                <FileText className="w-3.5 h-3.5" /> Approved Roadmap
              </div>
              <h1
                className="text-3xl text-[#0B1E3B] mt-2"
                style={{ fontFamily: "Georgia, serif" }}
              >
                {doc.title}
              </h1>
              {doc.published_at && (
                <div className="text-xs text-slate-500 mt-2">
                  Published {new Date(doc.published_at).toLocaleDateString()}
                </div>
              )}
            </div>
            {doc.file_url && (
              <Button
                asChild
                variant="outline"
                className="border-[#0B1E3B]/20 text-[#0B1E3B]"
              >
                <a href={doc.file_url} target="_blank" rel="noreferrer">
                  <Download className="w-4 h-4 mr-2" /> Download
                </a>
              </Button>
            )}
          </div>

          {doc.body_md ? (
            <div
              className="prose prose-slate max-w-none prose-headings:font-serif prose-headings:text-[#0B1E3B] prose-a:text-[#0B1E3B]"
              style={{ fontFamily: "Georgia, serif" }}
            >
              <ReactMarkdown>{doc.body_md}</ReactMarkdown>
            </div>
          ) : (
            !doc.file_url && (
              <p className="text-slate-500 italic">
                This Roadmap has no written content yet.
              </p>
            )
          )}
        </article>
      ))}
    </div>
  );
}
