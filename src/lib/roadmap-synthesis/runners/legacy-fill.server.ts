/**
 * RT-1 bridge runner: delegates to the existing monolithic fill.
 *
 * This is a temporary shim so the orchestrator has a working runner
 * today. Per-step runners can be lifted out of the legacy handler
 * without changing the orchestrator contract.
 */

type Sb = any;

export async function runLegacyFill(args: {
  projectId: string;
  supabase: Sb;
  actorEmail: string | null;
}): Promise<void> {
  const { seedAncillarySpineArtifacts } = await import("@/lib/engine-spine-ai-fill.functions");
  const { data: project, error } = await args.supabase
    .from("engine_projects")
    .select("id,name,blueprint,gap_map,hidden_assets,sequencing,roadmap,investment")
    .eq("id", args.projectId)
    .single();

  if (error || !project) {
    throw new Error((error as { message?: string } | null)?.message ?? "Project not found");
  }

  const result = await seedAncillarySpineArtifacts(args.supabase, {
    projectId: args.projectId,
    projectName: project.name ?? "this project",
    actorEmail: args.actorEmail,
    project,
  });

  if (result.changed.length === 0) return;
}
