/**
 * Virtualization configuration for the /insights list.
 *
 * Below the threshold the list renders in normal document flow (no absolute
 * positioning, no measure-then-reposition), which keeps variable row heights
 * correct and avoids any chance of overlap. At or above the threshold we
 * switch to window virtualization to keep scrolling smooth.
 *
 * The threshold is configurable via the VITE_INSIGHTS_VIRTUALIZE_THRESHOLD
 * env var so it can be tuned from real usage without a code change.
 */

export const DEFAULT_VIRTUALIZE_THRESHOLD = 30;

function readEnvThreshold(): number {
  // import.meta.env is statically replaced by Vite; guard for non-Vite envs.
  try {
    const raw =
      typeof import.meta !== "undefined" &&
      (import.meta as { env?: Record<string, string | undefined> }).env?.[
        "VITE_INSIGHTS_VIRTUALIZE_THRESHOLD"
      ];
    if (!raw) return DEFAULT_VIRTUALIZE_THRESHOLD;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_VIRTUALIZE_THRESHOLD;
  } catch {
    return DEFAULT_VIRTUALIZE_THRESHOLD;
  }
}

export const VIRTUALIZE_THRESHOLD = readEnvThreshold();

export function shouldVirtualize(
  count: number,
  threshold: number = VIRTUALIZE_THRESHOLD,
): boolean {
  return count >= threshold;
}

type LogFn = (msg: string, meta?: Record<string, unknown>) => void;

const defaultLog: LogFn = (msg, meta) => {
  // eslint-disable-next-line no-console
  console.info(`[insights/virtualization] ${msg}`, meta ?? {});
};

/**
 * Logs a single transition event when virtualization toggles on or off.
 * Returns the new "enabled" value so callers can store it in a ref.
 */
export function logVirtualizationTransition(
  prevEnabled: boolean | null,
  count: number,
  threshold: number = VIRTUALIZE_THRESHOLD,
  log: LogFn = defaultLog,
): boolean {
  const enabled = shouldVirtualize(count, threshold);
  if (prevEnabled === enabled) return enabled;
  log(enabled ? "virtualization enabled" : "virtualization disabled", {
    count,
    threshold,
  });
  return enabled;
}
