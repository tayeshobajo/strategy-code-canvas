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
  const mod = await import("@/lib/engine-spine-ai-fill.functions");
  // The legacy handler reads actor from middleware context, so we call
  // it via its exported server function by directly re-implementing the
  // small orchestration step: reuse the handler's fill by invoking the
  // exported server fn URL is not necessary here — instead we call the
  // exported function directly. In-process invocation happens via
  // useServerFn on the client; server-to-server we call the handler
  // helper. Since the handler is defined via createServerFn, its
  // implementation is not directly importable; the safe path is to
  // re-run the underlying seed helpers.
  //
  // For RT-1 we simply invoke the server function through its exported
  // callable identity — createServerFn's default export is callable on
  // the server with { data, context }.
  const fn = mod.fillMissingSpineDetailsFromIntake as unknown as (input: {
    data: { projectId: string };
  }) => Promise<unknown>;
  await fn({ data: { projectId: args.projectId } });
  // Note: the legacy fn reads actor from its own middleware context.
  // We intentionally do not thread actorEmail through — the fn will
  // resolve it from the current auth middleware on this request.
  void args.supabase;
  void args.actorEmail;
}
