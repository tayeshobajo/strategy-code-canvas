import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getProjectWorkspace } from "@/lib/engine.functions";
import { WORKSPACE_STEPS } from "@/lib/engine-workspace";
import { WorkspaceStepper } from "@/components/engine/WorkspaceStepper";
import {
  ProjectHeaderStrip,
  WorkspaceBreadcrumb,
  WorkspaceToolbar,
} from "@/components/engine/WorkspaceHeader";

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
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const fn = useServerFn(getProjectWorkspace);
  const { data, error, isError, isPending } = useQuery(
    workspaceQueryOptions(projectId, fn as unknown as (i: { data: { id: string } }) => Promise<unknown>),
  );
  const workspace = data as { project: import("@/lib/engine-workspace").WorkspaceProject };

  const currentStep =
    WORKSPACE_STEPS.find((s) => pathname.endsWith(`/${s.key}`))?.label ?? "Project Overview";

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
    <div className="space-y-5 max-w-[1500px]">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <WorkspaceBreadcrumb
          projectId={projectId}
          clientName={workspace.project.client_company}
          stepLabel={currentStep}
        />
        <WorkspaceToolbar projectId={projectId} project={workspace.project} />
      </div>
      <ProjectHeaderStrip project={workspace.project} />
      <WorkspaceStepper
        projectId={projectId}
        currentStepNum={workspace.project.current_step_num}
      />
      <Outlet />
    </div>
  );
}
