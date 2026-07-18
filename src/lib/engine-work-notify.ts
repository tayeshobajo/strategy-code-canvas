/**
 * Small helper so every Work action fans out to operator notifications
 * (bell + realtime) in a consistent shape without cluttering handlers.
 *
 * Never throws — notification writes must not fail the action.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySb = any;

export async function notifyOperators(
  sb: AnySb,
  args: {
    projectId: string | null;
    kind: string;
    title: string;
    body?: string | null;
    href?: string | null;
    actor?: string | null;
    extra?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await sb.from("operator_notifications").insert({
      kind: args.kind,
      title: args.title,
      body: args.body ?? null,
      href: args.href ?? null,
      metadata: {
        project_id: args.projectId,
        actor: args.actor ?? null,
        ...(args.extra ?? {}),
      },
    });
  } catch (e) {
    console.warn("[work-notify] insert failed", e);
  }
}

/** Marker written into engine_activity.body so we can filter per-task later. */
export function taskMarker(taskId: string): string {
  return `[task:${taskId}]`;
}
