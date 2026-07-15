// Unit tests for the NBA source_count derivation.
//
// Regression coverage for the "missing source_count column" incident:
// engine_projects has no source_count column, so the NBA handler must derive
// it by aggregating engine_sources for the given projectId. We assert the
// exact query shape (table, count-only select, project_id filter) rather than
// spinning up the full server-fn handler.

import { describe, expect, it, vi } from "vitest";
import { deriveSourceCount } from "./engine-nba.functions";

function makeMockSb(count: number | null) {
  const eq = vi.fn().mockResolvedValue({ count, error: null });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  return { sb: { from }, from, select, eq };
}

describe("deriveSourceCount", () => {
  it("queries engine_sources with a count-only select filtered by project_id", async () => {
    const { sb, from, select, eq } = makeMockSb(7);
    const projectId = "11111111-1111-1111-1111-111111111111";

    const result = await deriveSourceCount(sb, projectId);

    expect(from).toHaveBeenCalledWith("engine_sources");
    expect(select).toHaveBeenCalledWith("id", { count: "exact", head: true });
    expect(eq).toHaveBeenCalledWith("project_id", projectId);
    expect(result).toBe(7);
  });

  it("returns 0 when the aggregate count is null", async () => {
    const { sb } = makeMockSb(null);
    const result = await deriveSourceCount(sb, "22222222-2222-2222-2222-222222222222");
    expect(result).toBe(0);
  });

  it("never selects from engine_projects (the missing-column bug)", async () => {
    const { sb, from } = makeMockSb(3);
    await deriveSourceCount(sb, "33333333-3333-3333-3333-333333333333");
    expect(from).not.toHaveBeenCalledWith("engine_projects");
  });
});
