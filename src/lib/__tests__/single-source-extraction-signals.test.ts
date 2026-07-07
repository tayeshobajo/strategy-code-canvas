/**
 * Behavioral test — Gap 8 (audit): extraction divergence.
 *
 * Before the fix, `processSingleSource` (the createSource / reprocessSource
 * path) extracted signals with AI but wrote only `engine_change_events` —
 * the categorized output was swallowed and `engine_extracted_signals`
 * (which feeds step evidence and the extraction page) stayed empty unless
 * the full intelligence pipeline ran.
 *
 * This suite invokes the real `processSingleSource` against a fake supabase
 * client and asserts categorized rows land in `engine_extracted_signals`.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const AI_RESPONSE = {
  signals: [
    { text: "Launch the new membership tier", category: "goal", module: "point_b", importance: "high", confidence: 90 },
    { text: "Manual invoicing eats 10 hrs/week", category: "pain", module: "point_a", importance: "medium", confidence: 80 },
    // Invalid category — must be dropped from engine_extracted_signals
    // (it would fail the Postgres enum) but still reach the change feed.
    { text: "Untaxonomized observation", category: "vibes", module: "roadmap", importance: "low" },
  ],
  confidence: 75,
};

vi.mock("@/lib/engine-ai.server", () => ({
  callLovableAi: vi.fn(async () => ({ text: JSON.stringify(AI_RESPONSE), cost_cents: 1 })),
  parseJsonOutput: (text: string) => JSON.parse(text),
}));

type Row = Record<string, unknown>;

function makeFakeSb(src: Row) {
  const inserts: Record<string, unknown[]> = {};
  const sb = {
    from(table: string) {
      return {
        update(_values: Row) {
          return { eq: async () => ({ error: null }) };
        },
        insert(values: unknown) {
          (inserts[table] ??= []).push(values);
          return Promise.resolve({ error: null });
        },
        select(_cols: string) {
          return { eq: () => ({ single: async () => ({ data: src, error: null }) }) };
        },
      };
    },
    storage: { from: () => ({ download: async () => ({ data: null }) }) },
  };
  return { sb, inserts };
}

describe("processSingleSource writes categorized engine_extracted_signals (Gap 8)", () => {
  it("persists valid-category signals with source linkage and per-signal confidence", async () => {
    const { processSingleSource } = await import("@/lib/engine-intelligence.functions");
    const src = {
      id: "source-1",
      project_id: "project-1",
      name: "Kickoff transcript",
      type: "transcript",
      url: null,
      raw_text: "Plenty of source text to extract from.",
      storage_path: null,
    };
    const { sb, inserts } = makeFakeSb(src);

    const result = await processSingleSource(sb, "source-1");
    expect(result.signals).toBe(3);
    expect(result.confidence).toBe(75);

    // Change feed still gets every signal (one insert per signal).
    expect(inserts["engine_change_events"]).toHaveLength(3);

    // Categorized store gets one batched insert with ONLY valid categories.
    const batches = inserts["engine_extracted_signals"];
    expect(batches, "engine_extracted_signals was never written").toBeDefined();
    expect(batches).toHaveLength(1);
    const rows = batches![0] as Row[];
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.category).sort()).toEqual(["goal", "pain"]);
    for (const row of rows) {
      expect(row.project_id).toBe("project-1");
      expect(row.source_id).toBe("source-1");
      expect(row.client_safe).toBe(false);
      expect(typeof row.label).toBe("string");
    }
    // Per-signal confidence wins over the run-level confidence.
    const goal = rows.find((r) => r.category === "goal")!;
    expect(goal.confidence).toBe(90);
  });
});

describe("createSource / reprocessSource route through processSingleSource (Gap 8 wiring)", () => {
  const src = readFileSync(
    resolve(process.cwd(), "src/lib/engine-intelligence.functions.ts"),
    "utf8",
  );

  it("createSource fires processSingleSource for the new source", () => {
    const start = src.indexOf("export const createSource");
    expect(start).toBeGreaterThan(-1);
    const body = src.slice(start, src.indexOf("export const removeSource"));
    expect(body).toMatch(/processSingleSource\s*\(\s*sb\s*,\s*row\.id\s*\)/);
  });

  it("reprocessSource awaits processSingleSource", () => {
    const start = src.indexOf("export const reprocessSource");
    expect(start).toBeGreaterThan(-1);
    const body = src.slice(start, start + 800);
    expect(body).toMatch(/await\s+processSingleSource\s*\(\s*sb\s*,\s*data\.id\s*\)/);
  });
});
