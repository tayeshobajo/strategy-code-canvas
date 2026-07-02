import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getProjectWorkspace } from "@/lib/engine.functions";
import { workspaceQueryOptions } from "@/routes/engine.projects.$projectId";
import type { WorkspaceProject } from "@/lib/engine-workspace";

export function useWorkspace(projectId: string) {
  const fn = useServerFn(getProjectWorkspace);
  const { data } = useSuspenseQuery(
    workspaceQueryOptions(projectId, fn as unknown as (i: { data: { id: string } }) => Promise<unknown>),
  );
  return data as {
    project: WorkspaceProject;
    dates: Array<{ id: string; label: string; due_on: string; kind: string }>;
    activity: Array<{ id: string; kind: string; title: string; body: string | null; severity: string; created_at: string }>;
  };
}
