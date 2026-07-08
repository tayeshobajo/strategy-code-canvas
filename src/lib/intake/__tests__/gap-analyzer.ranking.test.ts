/**
 * Phase 14 — ranked candidate list and score composition.
 */

import { describe, expect, it } from "vitest";
import { analyzeGaps, rankAllCandidates } from "../gap-analyzer";
import { getFrameProfile } from "../frame-profiles";
import { emptyMemory } from "../intake-memory";

describe("gap-analyzer — ranking", () => {
  const profile = getFrameProfile("project.event_site")!;

  it("exposes information_gain, confidence_impact and flow_bonus on every gap", () => {
    const gaps = analyzeGaps(emptyMemory("project.event_site"), profile);
    expect(gaps.length).toBeGreaterThan(0);
    for (const g of gaps) {
      expect(g.information_gain).toBeGreaterThanOrEqual(0);
      expect(g.information_gain).toBeLessThanOrEqual(1);
      expect(g.confidence_impact).toBe(g.field.importance);
      expect(g.flow_bonus).toBeGreaterThanOrEqual(0);
      // score = information_gain * confidence_impact + flow_bonus
      const expected = g.information_gain * g.confidence_impact + g.flow_bonus;
      expect(Math.abs(g.score - expected)).toBeLessThan(1e-9);
    }
  });

  it("rankAllCandidates returns required + optional fields together", () => {
    const all = rankAllCandidates(emptyMemory("project.event_site"), profile);
    const keys = new Set(all.map((c) => c.field.key));
    for (const r of profile.requiredFields) expect(keys.has(r.key)).toBe(true);
    for (const o of profile.optionalFields) expect(keys.has(o.key)).toBe(true);
    // Highest-importance required should be at or near the top.
    expect(all[0].confidence_impact).toBeGreaterThanOrEqual(4);
  });
});
