import { describe, expect, it } from "vitest";
import {
  buildReflection,
  condense,
  conversationThemes,
  hasEnoughSignal,
  phaseLabel,
} from "./reflection";
import type { VerbatimAnswer } from "./types";

function answer(key: string, text: string): VerbatimAnswer {
  return {
    key: key as VerbatimAnswer["key"],
    question: "q",
    answer: text,
    modality: "text",
    answered_at: new Date().toISOString(),
  };
}

describe("phaseLabel", () => {
  it("uses journey language, never step counts", () => {
    expect(phaseLabel(0.1)).toBe("Getting the picture");
    expect(phaseLabel(0.5)).toBe("Seeing the possibilities");
    expect(phaseLabel(0.9)).toBe("Finding the path");
  });
});

describe("condense", () => {
  it("keeps short answers verbatim", () => {
    expect(condense("We fit kitchens.")).toBe("We fit kitchens.");
  });
  it("never invents words", () => {
    const long = "a".repeat(400);
    expect(condense(long).replace("…", "").length).toBeLessThanOrEqual(220);
  });
});

describe("buildReflection", () => {
  it("returns grounded statements drawn from real answers", () => {
    const answers = [
      answer("the_business", "We fit kitchens for homeowners across Kent."),
      answer("future_day", "I would be quoting less and the team would run installs."),
      answer("recurring_problem", "Quotes keep coming back to me every single week."),
      answer("ninety_day_wish", "A quoting process that does not need me."),
    ];
    const r = buildReflection(answers);
    expect(r.length).toBeGreaterThanOrEqual(3);
    expect(r.length).toBeLessThanOrEqual(5);
    expect(r[0].text).toContain("kitchens");
  });

  it("returns nothing when nothing was said", () => {
    expect(buildReflection([])).toEqual([]);
  });
});

describe("conversationThemes", () => {
  it("only surfaces themes once there is enough text", () => {
    expect(conversationThemes([answer("the_business", "kitchens")])).toEqual([]);
    const themes = conversationThemes([
      answer(
        "the_business",
        "Most of our work is word of mouth and referral based, we are always busy and the team could take more on but everything comes back to me.",
      ),
    ]);
    expect(themes.map((t) => t.id)).toContain("referrals");
  });
});

describe("hasEnoughSignal", () => {
  it("waits for three substantive answers", () => {
    const a = answer("the_business", "x".repeat(60));
    expect(hasEnoughSignal([a, a])).toBe(false);
    expect(hasEnoughSignal([a, a, a])).toBe(true);
  });
});
