import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Menu } from "lucide-react";
import { getProjectWorkspace } from "@/lib/engine.functions";
import {
  ProjectHeaderStrip,
  WorkspaceToolbar,
} from "@/components/engine/WorkspaceHeader";
import {
  LeftProjectRail,
  MobileRailDrawer,
} from "@/components/engine/LeftProjectRail";
import { LatestAmendmentsPanel } from "@/components/engine/LatestAmendmentsPanel";
import { useRoomScrollRestoration } from "@/hooks/use-room-scroll-restoration";


export const workspaceQueryOptions = (
  projectId: string,
  fn: (input: { data: { id: string } }) => Promise<unknown>,
) =>
  queryOptions({
    queryKey: ["engine", "workspace", projectId],
    queryFn: () => fn({ data: { id: projectId } }),
  });

export const Route = createFileRoute("/engine/projects/$projectId")({
  component: WorkspaceLayout,
  errorComponent: ({ error }) => (
    <div className="text-red-700 text-sm">Failed to load project: {(error as Error).message}</div>
  ),
});

function WorkspaceLayout() {
  const { projectId } = Route.useParams();
  useRoomScrollRestoration(`project:${projectId}`);
  const fn = useServerFn(getProjectWorkspace);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const { data, error, isError, isPending } = useQuery(
    workspaceQueryOptions(projectId, fn as unknown as (i: { data: { id: string } }) => Promise<unknown>),
  );
  const workspace = data as { project: import("@/lib/engine-workspace").WorkspaceProject };

  if (isPending) {
    return (
      <div className="max-w-[1500px] space-y-4" data-qa-state="workspace-loading">
        <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink/50">Loading project workspace</div>
          <div className="mt-2 h-2 w-56 overflow-hidden rounded-full bg-border">
            <div className="h-full w-1/2 animate-pulse bg-royal/60" />
          </div>
        </div>
        <Outlet />
      </div>
    );
  }

  if (isError || !workspace?.project) {
    return (
      <div className="max-w-[1500px] space-y-4" data-qa-state="workspace-error">
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-5 text-red-900 shadow-sm">
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-red-700/70">Project workspace failed</div>
          <div className="mt-1 text-sm">{(error as Error | null)?.message ?? "The project workspace data did not load."}</div>
        </div>
        <Outlet />
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-[1500px]">
      <ProjectHeaderStrip project={workspace.project} />

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open project navigation"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs text-ink hover:bg-muted xl:hidden"
          >
            <Menu className="h-3.5 w-3.5" />
            Rooms
          </button>
          <Link
            to="/engine/projects/$projectId/family"
            params={{ projectId }}
            className="rounded-md border border-border bg-card px-3 py-1.5 text-xs text-ink hover:bg-muted"
          >
            Family
          </Link>
        </div>
        <WorkspaceToolbar projectId={projectId} project={workspace.project} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[220px_minmax(0,1fr)]">
        <div className="hidden xl:block">
          <LeftProjectRail projectId={projectId} />
        </div>
        <div className="min-w-0">
          <Outlet />
        </div>
      </div>

      <MobileRailDrawer
        open={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        projectId={projectId}
      />
    </div>
  );
}
