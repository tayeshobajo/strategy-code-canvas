/**
 * Phase 14 — generator prompt includes the acknowledgement contract.
 */

import { describe, expect, it } from "vitest";
import { buildGeneratorPrompt, passesVoiceCheck } from "../question-generator";
import { getFrameProfile } from "../frame-profiles";
import { emptyMemory, mergeFacts } from "../intake-memory";

describe("question-generator — acknowledgement contract", () => {
  it("prompt mentions acknowledgement + question JSON shape", () => {
    const profile = getFrameProfile("project.event_site")!;
    const target = profile.requiredFields[0];
    const memory = mergeFacts(emptyMemory("project.event_site"), {
      audience: { confidence: 0.8, evidence: "Augustina, 60th birthday" },
    });
    const prompt = buildGeneratorPrompt({
      frameLabel: "a scoped event site",
      target,
      memory,
      anchor: target.examples?.[0] ?? "When is the event.",
    });
    expect(prompt).toContain('"acknowledgement"');
    expect(prompt).toContain('"question"');
    expect(prompt).toMatch(/acknowledgement is optional/i);
  });

  it("voice check still rejects banned words and empty strings", () => {
    expect(passesVoiceCheck("", [])).toBe(false);
    expect(passesVoiceCheck("we can help you unlock growth", [])).toBe(false);
    expect(passesVoiceCheck("what date works for the celebration", [])).toBe(true);
  });
});
