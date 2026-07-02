import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
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
  const { data } = useSuspenseQuery(
    workspaceQueryOptions(projectId, fn as unknown as (i: { data: { id: string } }) => Promise<unknown>),
  );
  const workspace = data as { project: import("@/lib/engine-workspace").WorkspaceProject };

  const currentStep =
    WORKSPACE_STEPS.find((s) => pathname.endsWith(`/${s.key}`))?.label ?? "Project Overview";

  return (
    <div className="space-y-5 max-w-[1500px]">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <WorkspaceBreadcrumb
          projectId={projectId}
          clientName={workspace.project.client_company}
          stepLabel={currentStep}
        />
        <WorkspaceToolbar projectId={projectId} />
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
