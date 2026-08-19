import { describe, expect, it } from "vitest";
import { classifyPosture, planTurn, renderTurn, type Posture } from "./posture";
import type { ConversationState } from "./adaptive";
import type { VerbatimAnswer } from "./types";

function answer(key: VerbatimAnswer["key"], text: string): VerbatimAnswer {
  return {
    key,
    question: "q",
    answer: text,
    modality: "text",
    media_ref: null,
    answered_at: new Date().toISOString(),
  };
}

const empty: ConversationState = { answers: [], skipped: [], followUpsAsked: [] };

function plan(latest: string, state: ConversationState = empty, currentObjective: never | null = null) {
  return planTurn({ state, latest, currentObjective });
}

function questionCount(text: string) {
  return (text.match(/\?/g) ?? []).length;
}

describe("posture classification", () => {
  const cases: Array<[string, Posture]> = [
    ["hey", "greeting"],
    ["Hi there!", "greeting"],
    ["How are you?", "social_or_relational"],
    ["What does Trust Tai actually do?", "social_or_relational"],
    ["I honestly don't know where to start", "uncertain"],
    ["I'm exhausted. Everything depends on me and I never switch off.", "emotional_or_frustrated"],
    ["I keep picturing a business that runs without me — I'd love that", "excited_or_visionary"],
    ["No, that's not what I said.", "correction_or_disagreement"],
    ["One more thing before we finish", "wants_to_keep_talking"],
    ["We need more leads, the problem is nothing converts", "direct_problem_statement"],
  ];
  it.each(cases)("classifies %s", (text, expected) => {
    expect(classifyPosture(text)).toBe(expected);
  });

  it("treats a long considered reply as rich", () => {
    expect(classifyPosture("We run a dental practice. ".repeat(30))).toBe("detailed_or_rich");
  });
});

describe("Spirit First response policy", () => {
  it("greets back and never opens with the agenda", () => {
    const t = plan("hey");
    expect(t.move).toBe("CONNECT");
    expect(t.objective).toBeNull();
    expect(renderTurn(t).toLowerCase()).toContain("good to meet you");
  });

  it("answers a question about us before asking anything", () => {
    const t = plan("What do you actually do?");
    expect(t.acknowledgement.length).toBeGreaterThan(20);
    expect(t.objective).toBeNull();
  });

  it("never consumes an objective on a social turn", () => {
    for (const text of ["hey", "how are you?", "thanks for that"]) {
      const t = plan(text);
      expect(t.addressed_objectives).toEqual([]);
      expect(t.should_advance).toBe(false);
    }
  });

  it("lowers the burden when the founder is unsure", () => {
    const t = plan("I don't know, not sure really");
    expect(t.move).toBe("RECEIVE");
    expect(t.acknowledgement.toLowerCase()).toContain("that's okay");
    expect(questionCount(renderTurn(t))).toBe(1);
  });

  it("acknowledges weight before asking anything", () => {
    const t = plan("I'm burnt out and drowning in it");
    expect(t.move).toBe("RECEIVE");
    expect(t.acknowledgement).not.toBe("");
    expect(renderTurn(t).indexOf(t.acknowledgement)).toBe(0);
  });

  it("follows energy when the founder is visionary", () => {
    const t = plan("I dream about a business that runs without me");
    expect(t.move).toBe("EXPLORE");
    expect(t.objective).toBe("future_day");
  });

  it("reflects a rich answer in the founder's own words", () => {
    const rich = `We fit out dental practices. ${"It takes months of back and forth with suppliers. ".repeat(8)}`;
    const t = plan(rich);
    expect(t.move).toBe("REFLECT");
    expect(t.acknowledgement).toContain("We fit out dental practices");
  });

  it("clarifies rather than assuming a solution", () => {
    const t = plan("We need a new website, the problem is nobody enquires");
    expect(t.move).toBe("CLARIFY");
    expect(renderTurn(t).toLowerCase()).not.toContain("website is the answer");
  });

  it("lets the founder's correction win", () => {
    const t = plan("No, that's not what I meant at all");
    expect(t.move).toBe("RECEIVE");
    expect(t.acknowledgement.toLowerCase()).toContain("correcting me");
  });

  it("holds the floor open when there is more to say", () => {
    const state: ConversationState = {
      answers: [answer("who_you_are", "x"), answer("the_business", "y")],
      skipped: [],
      followUpsAsked: [],
    };
    const t = planTurn({ state, latest: "One more thing I should mention" });
    expect(t.move).toBe("STAY");
    expect(t.should_end).toBe(false);
  });

  it("asks at most one question and never stacks", () => {
    const texts = [
      "hey",
      "how are you?",
      "I don't know",
      "I'm exhausted",
      "I dream of scaling",
      "We need more leads, the problem is nothing converts",
      "No, that's wrong",
      "one more thing",
      "We run a plumbing firm in Leeds with six vans",
    ];
    for (const text of texts) {
      expect(questionCount(renderTurn(plan(text)))).toBeLessThanOrEqual(1);
    }
  });

  it("never uses process, scoring or framework language", () => {
    const banned = /\b(objective|coverage|step \d|framework|score|phase \d|module|onboarding flow)\b/i;
    for (const text of ["hey", "I don't know", "I'm exhausted", "we need leads"]) {
      expect(renderTurn(plan(text))).not.toMatch(banned);
    }
  });
});

describe("asides never consume objectives", () => {
  it("keeps coverage flat across social turns", async () => {
    const { objectiveCoverage } = await import("./adaptive");
    const base: ConversationState = {
      answers: [answer("who_you_are", "I'm Sam, I run a bakery in Bristol.")],
      skipped: [],
      followUpsAsked: [],
    };
    const withAside: ConversationState = {
      ...base,
      answers: [...base.answers, answer("aside__1" as VerbatimAnswer["key"], "how are you?")],
    };
    expect(objectiveCoverage(withAside)).toBe(objectiveCoverage(base));
  });
});
