import { describe, expect, it } from "vitest";
import {
  activePhase,
  journeyPhases,
  namedGaps,
  pictureSoFar,
  readyForPicture,
} from "./journey";
import { coveredObjectives, nextStep, type ConversationState } from "./adaptive";
import { ESSENTIAL_KEYS, QUESTION_BY_KEY, type IntakeObjectiveKey } from "./questions";
import type { VerbatimAnswer } from "./types";

function answer(key: IntakeObjectiveKey, text: string): VerbatimAnswer {
  return {
    key,
    question: QUESTION_BY_KEY[key].prompt,
    answer: text,
    modality: "text",
    media_ref: null,
    answered_at: new Date().toISOString(),
  };
}

const empty: ConversationState = { answers: [], skipped: [], followUpsAsked: [] };

describe("journey phases", () => {
  it("starts on getting to know you, with exactly one phase active", () => {
    const phases = journeyPhases(empty);
    expect(phases).toHaveLength(4);
    expect(phases.filter((p) => p.state === "active")).toHaveLength(1);
    expect(activePhase(empty).key).toBe("getting_to_know_you");
  });

  it("moves the active phase forward as ground is covered", () => {
    const state: ConversationState = {
      ...empty,
      answers: [
        answer("who_you_are", "I run a four person dental practice in Leeds and I own it outright."),
      ],
    };
    const before = activePhase(empty).key;
    const after = activePhase(state).key;
    expect(before).toBe("getting_to_know_you");
    expect(["getting_to_know_you", "inside_the_business"]).toContain(after);
  });

  it("reads every phase complete once the essential ground is settled", () => {
    const answers = ESSENTIAL_KEYS.map((k) =>
      answer(k, `A considered answer about ${QUESTION_BY_KEY[k].label} with genuine detail.`),
    );
    const state: ConversationState = {
      ...empty,
      answers,
      followUpsAsked: ["thin_dream", "past_failure", "hidden_asset"],
    };
    expect(readyForPicture(state)).toBe(true);
    expect(journeyPhases(state).every((p) => p.state === "complete")).toBe(true);
    expect(nextStep(state)).toEqual({ kind: "contact" });
    expect(namedGaps(state)).toEqual([]);
  });

  it("names at most two remaining gaps in plain language", () => {
    const answers = ESSENTIAL_KEYS.slice(0, ESSENTIAL_KEYS.length - 1).map((k) =>
      answer(k, `A considered answer about ${QUESTION_BY_KEY[k].label} with genuine detail.`),
    );
    const gaps = namedGaps({ ...empty, answers });
    expect(gaps.length).toBeLessThanOrEqual(2);
    for (const g of gaps) expect(g).toBe(g.toLowerCase());
  });
});

describe("identity coverage", () => {
  it("asks who the founder is before anything else", () => {
    const step = nextStep(empty);
    expect(step.kind).toBe("question");
    expect((step as { key: string }).key).toBe("who_you_are");
  });

  it("never infers the two year ordinary Tuesday from other answers", () => {
    const rich = answer(
      "the_business",
      "We supply forty cafes and our customers keep coming back. Ideally in the future the team would run it. " +
        "I'd want my time back and to be developing products again.".repeat(3),
    );
    expect(coveredObjectives({ ...empty, answers: [rich] }).has("future_day")).toBe(false);
  });
});

describe("the picture so far", () => {
  it("reveals only grounded categories", () => {
    const state = [
      answer("who_you_are", "Sam, I own a small photography studio in Bristol."),
      answer("the_business", "We shoot weddings and a few brand jobs for local agencies."),
    ];
    const picture = pictureSoFar(state);
    expect(picture.map((p) => p.id)).toEqual(["you", "business"]);
    expect(picture.every((p) => p.text.length > 0)).toBe(true);
  });

  it("invents nothing when nothing has been said", () => {
    expect(pictureSoFar([])).toEqual([]);
  });

  it("ignores skipped answers and social asides", () => {
    const answers: VerbatimAnswer[] = [
      { ...answer("who_you_are", "skipped this one entirely"), skipped: true },
      {
        key: "aside__greeting",
        question: "hello",
        answer: "hey, how are you doing today then",
        modality: "text",
        media_ref: null,
        answered_at: new Date().toISOString(),
      },
    ];
    expect(pictureSoFar(answers)).toEqual([]);
  });
});
