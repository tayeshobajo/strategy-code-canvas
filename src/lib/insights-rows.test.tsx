/**
 * Verifies the rendering mode the /insights page uses for small lists:
 * fewer than VIRTUALIZE_THRESHOLD items must render in normal document
 * flow (no absolute positioning), so rows cannot overlap.
 *
 * The test renders a minimal list using the same className/style decisions
 * as src/routes/insights.tsx without pulling in the router.
 */
import { describe, it, expect } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { INSIGHTS } from "./insights-data";
import {
  VIRTUALIZE_THRESHOLD,
  shouldVirtualize,
} from "./insights-virtualization";

afterEach(cleanup);

function FlowList({ count }: { count: number }) {
  const shown = INSIGHTS.slice(0, count);
  const useVirtual = shouldVirtualize(shown.length, VIRTUALIZE_THRESHOLD);
  return (
    <ul
      data-testid="rows"
      className={useVirtual ? "relative w-full" : "divide-y divide-rule/70"}
      style={useVirtual ? { height: "5000px", position: "relative" } : undefined}
    >
      {shown.map((a, i) => {
        const isLast = i === shown.length - 1;
        return (
          <li
            key={a.slug}
            data-index={i}
            data-testid="row"
            className={
              useVirtual
                ? `absolute left-0 top-0 w-full ${isLast ? "" : "border-b"}`
                : ""
            }
            style={useVirtual ? { position: "absolute", top: 0, left: 0 } : undefined}
          >
            <h3>{a.title}</h3>
          </li>
        );
      })}
    </ul>
  );
}

describe("insights rows rendering mode", () => {
  it("uses normal document flow for small lists (< threshold)", () => {
    const count = Math.min(10, VIRTUALIZE_THRESHOLD - 1);
    const { getAllByTestId, getByTestId } = render(<FlowList count={count} />);

    const list = getByTestId("rows");
    expect(list.getAttribute("style") ?? "").not.toMatch(/position:\s*relative/);

    const rows = getAllByTestId("row");
    expect(rows).toHaveLength(count);
    for (const row of rows) {
      // No absolute positioning => rows stack naturally and cannot overlap.
      expect(row.className).not.toMatch(/\babsolute\b/);
      const style = row.getAttribute("style") ?? "";
      expect(style).not.toMatch(/position:\s*absolute/);
      expect(style).not.toMatch(/transform:\s*translateY/);
    }
  });

  it("switches to virtualized (absolute) rendering at the threshold", () => {
    const { getAllByTestId } = render(<FlowList count={VIRTUALIZE_THRESHOLD} />);
    const rows = getAllByTestId("row");
    expect(rows).toHaveLength(VIRTUALIZE_THRESHOLD);
    for (const row of rows) {
      expect(row.className).toMatch(/\babsolute\b/);
    }
  });
});
