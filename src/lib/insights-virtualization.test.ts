import { describe, it, expect, vi } from "vitest";
import {
  DEFAULT_VIRTUALIZE_THRESHOLD,
  VIRTUALIZE_THRESHOLD,
  shouldVirtualize,
  logVirtualizationTransition,
} from "./insights-virtualization";

describe("insights virtualization config", () => {
  it("defaults to 30", () => {
    expect(DEFAULT_VIRTUALIZE_THRESHOLD).toBe(30);
    expect(VIRTUALIZE_THRESHOLD).toBe(30);
  });

  it("does not virtualize below the threshold", () => {
    expect(shouldVirtualize(0)).toBe(false);
    expect(shouldVirtualize(8)).toBe(false);
    expect(shouldVirtualize(29)).toBe(false);
  });

  it("virtualizes at and above the threshold", () => {
    expect(shouldVirtualize(30)).toBe(true);
    expect(shouldVirtualize(120)).toBe(true);
  });

  it("honors a caller-supplied threshold", () => {
    expect(shouldVirtualize(10, 8)).toBe(true);
    expect(shouldVirtualize(7, 8)).toBe(false);
  });

  it("logs only on transition", () => {
    const log = vi.fn();
    let prev: boolean | null = null;
    prev = logVirtualizationTransition(prev, 5, 30, log);
    prev = logVirtualizationTransition(prev, 12, 30, log);
    expect(log).toHaveBeenCalledTimes(1); // initial "disabled"
    prev = logVirtualizationTransition(prev, 30, 30, log);
    expect(log).toHaveBeenCalledTimes(2); // toggled to enabled
    prev = logVirtualizationTransition(prev, 80, 30, log);
    expect(log).toHaveBeenCalledTimes(2); // still enabled, no log
    prev = logVirtualizationTransition(prev, 5, 30, log);
    expect(log).toHaveBeenCalledTimes(3); // toggled back to disabled
    expect(prev).toBe(false);
  });
});
