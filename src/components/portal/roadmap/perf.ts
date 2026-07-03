/**
 * Lightweight dev-only runtime instrumentation for the roadmap canvas.
 *
 * Wrap hot paths in `measure(label, fn)` to sample execution time. Samples
 * are kept in a rolling ring per label, and any sample exceeding the label's
 * warn-once threshold logs a single console.warn per label so regressions
 * (slow marker render, hover throttle regressions, expensive cluster
 * relayouts) surface early during development.
 *
 * In production builds the wrappers compile to a no-op fast path — they
 * still call the wrapped function but skip all timing / recording work.
 */

const IS_DEV =
  typeof import.meta !== "undefined" && (import.meta as unknown as {
    env?: { DEV?: boolean };
  }).env?.DEV === true;

const RING_SIZE = 60;

/** Warn-once thresholds in milliseconds. */
const THRESHOLDS: Record<string, number> = {
  "markers:render": 16,
  "markers:visibility": 8,
  "viewport:publish": 8,
  "hover:setHighlighted": 4,
  "cluster:relayout": 12,
  "connector:measure": 6,
};

type LabelState = {
  ring: Float64Array;
  count: number;
  warned: boolean;
};

const state: Map<string, LabelState> = new Map();

function getState(label: string): LabelState {
  let s = state.get(label);
  if (!s) {
    s = { ring: new Float64Array(RING_SIZE), count: 0, warned: false };
    state.set(label, s);
  }
  return s;
}

/** Record a single timing sample and check its warn-once threshold. */
export function recordSample(label: string, ms: number): void {
  if (!IS_DEV) return;
  const s = getState(label);
  s.ring[s.count % RING_SIZE] = ms;
  s.count += 1;
  const th = THRESHOLDS[label];
  if (th != null && ms > th && !s.warned) {
    s.warned = true;
    // eslint-disable-next-line no-console
    console.warn(
      `[roadmap-perf] ${label} took ${ms.toFixed(2)}ms (threshold ${th}ms)`,
    );
  }
}

/**
 * Time a synchronous function. Returns whatever the callback returns.
 * In production, calls the callback directly with no measurement overhead.
 */
export function measure<T>(label: string, fn: () => T): T {
  if (!IS_DEV) return fn();
  const t0 = performance.now();
  try {
    return fn();
  } finally {
    recordSample(label, performance.now() - t0);
  }
}

type LabelSummary = {
  label: string;
  samples: number;
  p50: number;
  p95: number;
  max: number;
  threshold: number | null;
  breached: boolean;
};

function summarizeLabel(label: string, s: LabelState): LabelSummary {
  const n = Math.min(s.count, RING_SIZE);
  const vals: number[] = [];
  for (let i = 0; i < n; i++) vals.push(s.ring[i]);
  vals.sort((a, b) => a - b);
  const q = (p: number) => (n === 0 ? 0 : vals[Math.min(n - 1, Math.floor(p * n))]);
  const threshold = THRESHOLDS[label] ?? null;
  const max = n === 0 ? 0 : vals[n - 1];
  return {
    label,
    samples: n,
    p50: +q(0.5).toFixed(3),
    p95: +q(0.95).toFixed(3),
    max: +max.toFixed(3),
    threshold,
    breached: threshold != null && q(0.95) > threshold,
  };
}

/** Snapshot the current state of all recorded labels. */
export function summary(): LabelSummary[] {
  return Array.from(state.entries())
    .map(([label, s]) => summarizeLabel(label, s))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** Reset every recorded label. */
export function reset(): void {
  state.clear();
}

// Expose a tiny debug handle in dev so the benchmark harness (and manual
// devtools inspection) can read out summaries.
declare global {
  interface Window {
    __roadmapPerf?: {
      summary: () => LabelSummary[];
      reset: () => void;
      thresholds: Record<string, number>;
    };
  }
}

if (IS_DEV && typeof window !== "undefined") {
  window.__roadmapPerf = {
    summary,
    reset,
    thresholds: { ...THRESHOLDS },
  };
}
