/**
 * Tracks in-flight AI enrichment for milestone acceptance criteria so any
 * component in the Work tab can render a "Drafting AI enrichment…" indicator
 * without blocking access to the baseline content that's already visible.
 *
 * Single module-level registry keyed by projectId. Subscribers are notified
 * whenever a project's enrichment status flips between running/idle.
 */

const running = new Set<string>();
const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}

export function subscribeEnrichment(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function isEnrichmentRunning(projectId: string): boolean {
  return running.has(projectId);
}

/**
 * Fire enrichment in the background. Multiple callers for the same project
 * share the same in-flight promise so we don't stack duplicate AI runs.
 */
export function runEnrichmentInBackground(
  projectId: string,
  enrich: (input: { data: { projectId: string } }) => Promise<unknown>,
  onSettled?: () => void,
): void {
  if (running.has(projectId)) return;
  running.add(projectId);
  emit();
  void enrich({ data: { projectId } })
    .catch(() => {
      /* baseline defaults already visible; swallow */
    })
    .finally(() => {
      running.delete(projectId);
      emit();
      onSettled?.();
    });
}
