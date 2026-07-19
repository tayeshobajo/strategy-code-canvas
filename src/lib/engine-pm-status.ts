/**
 * Shared registry that tracks whether the AI Product Manager is auto-running
 * a synthesis pass for a given project. Any component can subscribe and show
 * a "AI PM drafting…" chip without triggering duplicate runs.
 *
 * Mirrors the shape of engine-milestone-enrichment-status so the two feel
 * consistent.
 */

type PmState = {
  running: boolean;
  step: string | null;
  lastRunAt: number | null;
  lastError: string | null;
};

const state = new Map<string, PmState>();
const listeners = new Set<() => void>();

const DEFAULT: PmState = { running: false, step: null, lastRunAt: null, lastError: null };

function emit() {
  for (const fn of listeners) fn();
}

export function subscribePm(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function getPmState(projectId: string): PmState {
  return state.get(projectId) ?? DEFAULT;
}

export function isPmRunning(projectId: string): boolean {
  return state.get(projectId)?.running ?? false;
}

/** Minimum ms between two auto-runs on the same project. */
export const PM_RERUN_COOLDOWN_MS = 5 * 60_000;

export function canAutoRun(projectId: string): boolean {
  const s = state.get(projectId);
  if (!s) return true;
  if (s.running) return false;
  if (s.lastRunAt && Date.now() - s.lastRunAt < PM_RERUN_COOLDOWN_MS) return false;
  return true;
}

/**
 * Fire an auto-run in the background. Caller supplies the actual server-fn
 * caller — this module is deliberately UI-side, no server imports.
 */
export function runPmInBackground(
  projectId: string,
  run: (input: { data: { projectId: string; mode: "repair" | "refresh" | "rebuild_draft" } }) => Promise<unknown>,
  opts: {
    step?: string;
    onSettled?: (result: { ok: boolean; error?: string }) => void;
    mode?: "repair" | "refresh" | "rebuild_draft";
    /** Bypass the cooldown — use for user-initiated "Run now" clicks. */
    force?: boolean;
  } = {},
): boolean {
  if (!opts.force && !canAutoRun(projectId)) return false;
  // User-forced runs still shouldn't stack on top of a live run.
  if (state.get(projectId)?.running) return false;

  state.set(projectId, {
    running: true,
    step: opts.step ?? "Drafting missing artifacts…",
    lastRunAt: state.get(projectId)?.lastRunAt ?? null,
    lastError: null,
  });
  emit();
  void run({ data: { projectId, mode: opts.mode ?? "repair" } })
    .then(() => {
      state.set(projectId, { running: false, step: null, lastRunAt: Date.now(), lastError: null });
      opts.onSettled?.({ ok: true });
    })
    .catch((e: unknown) => {
      const msg = (e as Error)?.message ?? "AI PM run failed";
      state.set(projectId, { running: false, step: null, lastRunAt: Date.now(), lastError: msg });
      opts.onSettled?.({ ok: false, error: msg });
    })
    .finally(() => {
      emit();
    });
  return true;
}

