import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PortalShell } from "@/components/portal/PortalShell";
import { getMyRoadmaps } from "@/lib/portal/portal.functions";

export const Route = createFileRoute("/_authenticated/portal/roadmap")({
  head: () => ({
    meta: [
      { title: "Your Roadmap | Trust Tai Client Portal" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PortalRoadmap,
});

function PortalRoadmap() {
  const fetchRoadmaps = useServerFn(getMyRoadmaps);
  const { data, isLoading } = useQuery({
    queryKey: ["portal", "roadmaps"],
    queryFn: () => fetchRoadmaps({ data: undefined }),
  });

  return (
    <PortalShell
      title="Your roadmap"
      intro="The route we agreed, exactly as it stands today."
    >
      {isLoading ? (
        <p className="text-muted-foreground">Loading your roadmap.</p>
      ) : (data?.roadmaps.length ?? 0) === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-8">
          <h2 className="text-xl">No roadmap linked yet</h2>
          <p className="mt-3 text-muted-foreground">
            Your roadmap appears here once Tai links it to {data?.email ?? "your email"}. If you
            expected to see one, ask a question and we will sort it.
          </p>
          <Link
            to="/portal/intake"
            className="mt-6 inline-flex h-11 items-center rounded-full bg-ink px-5 text-paper"
          >
            Ask a question
          </Link>
        </div>
      ) : (
        <ul className="grid gap-6 sm:grid-cols-2">
          {data!.roadmaps.map((r) => (
            <li key={r.slug} className="overflow-hidden rounded-2xl border border-border bg-card">
              <img src={r.cover} alt="" className="h-44 w-full object-cover" loading="lazy" />
              <div className="p-6">
                <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                  {r.client}
                </p>
                <h2 className="mt-2 text-xl">{r.headline}</h2>
                <p className="mt-3 text-sm text-muted-foreground">{r.summary}</p>
                <a
                  href={r.to}
                  className="mt-5 inline-flex h-11 items-center rounded-full border border-ink px-5 text-sm"
                >
                  Open the roadmap
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </PortalShell>
  );
}
