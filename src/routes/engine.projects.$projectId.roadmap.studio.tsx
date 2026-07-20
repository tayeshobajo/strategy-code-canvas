import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getProjectRoadmap, type ProjectRoadmapPayload } from "@/lib/engine-roadmap.functions";
import { RoadmapStudioShell } from "@/components/engine/roadmap/studio/RoadmapStudioShell";

export const Route = createFileRoute("/engine/projects/$projectId/roadmap/studio")({
  component: RoadmapStudioRoute,
  head: () => ({
    meta: [
      { title: "Roadmap Studio — Trust Tai" },
      { name: "robots", content: "noindex" },
    ],
  }),
  errorComponent: ({ error }) => (
    <div className="grid h-screen place-items-center bg-paper px-6 text-center">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-rose-700">Studio failed to load</div>
        <p className="mt-2 max-w-md text-sm text-ink/70">{error.message}</p>
      </div>
    </div>
  ),
  notFoundComponent: () => (
    <div className="grid h-screen place-items-center bg-paper text-sm text-ink/60">Studio not found.</div>
  ),
});

function RoadmapStudioRoute() {
  const { projectId } = Route.useParams();
  const fn = useServerFn(getProjectRoadmap);
  const { data, isPending, isError, error } = useQuery(
    queryOptions({
      queryKey: ["engine", "roadmap", projectId, "studio"],
      queryFn: () =>
        (fn as unknown as (i: { data: { id: string } }) => Promise<ProjectRoadmapPayload>)({
          data: { id: projectId },
        }),
    }),
  );

  if (isPending) {
    return (
      <div className="grid h-screen place-items-center bg-paper text-sm text-ink/60">
        Loading Roadmap Studio…
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="grid h-screen place-items-center bg-paper text-sm text-rose-700">
        {(error as Error | null)?.message ?? "Studio data did not load."}
      </div>
    );
  }

  const { view } = data;
  if (view.mode === "no_truth" || view.mode === "draft_generating") {
    return <StudioEmpty projectId={projectId} mode={view.mode} />;
  }

  return <RoadmapStudioShell projectId={projectId} view={view} />;
}

function StudioEmpty({ projectId, mode }: { projectId: string; mode: string }) {
  return (
    <div className="grid h-screen place-items-center bg-paper px-6 text-center">
      <div className="max-w-lg">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink/45">Roadmap Studio</div>
        <h1 className="mt-2 font-display text-2xl text-ink">
          {mode === "no_truth" ? "The journey has not been mapped yet." : "Captain is assembling the first route."}
        </h1>
        <p className="mt-3 text-sm text-ink/65">
          {mode === "no_truth"
            ? "Approve Point A, Point B and the Strategic Thesis to generate the first roadmap direction."
            : "It's using the approved project truth, industry direction, execution boundary and strategic thesis."}
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <Link
            to="/engine/projects/$projectId/spine"
            params={{ projectId }}
            className="rounded-md border border-rule bg-white px-3 py-1.5 text-xs text-ink hover:border-ink/40"
          >
            Open Project Spine
          </Link>
          <Link
            to="/engine/projects/$projectId/roadmap"
            params={{ projectId }}
            className="rounded-md bg-ink px-3 py-1.5 text-xs text-white hover:bg-ink/90"
          >
            Back to Roadmap
          </Link>
        </div>
      </div>
    </div>
  );
}
