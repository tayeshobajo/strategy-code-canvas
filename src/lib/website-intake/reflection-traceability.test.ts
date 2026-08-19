import { describe, expect, it } from "vitest";
import {
  buildReflection,
  condense,
  normalizeForTrace,
  traceToAnswer,
} from "./reflection";
import type { IntakeObjectiveKey } from "./questions";
import type { VerbatimAnswer } from "./types";

function answer(key: IntakeObjectiveKey, text: string): VerbatimAnswer {
  return {
    key,
    question: key,
    answer: text,
    modality: "text",
    media_ref: null,
    answered_at: new Date().toISOString(),
  };
}

const FOUNDER: VerbatimAnswer[] = [
  answer(
    "the_business",
    "We do boiler installs, servicing and emergency callouts for homeowners and landlords across Bristol. People use us because we turn up when we say we will.",
  ),
  answer(
    "future_day",
    "I'd walk in, look at the board, and the day would already be sorted without me touching anything. I'd be out quoting the bigger jobs instead of firefighting all morning, and the lads would know where they're going.",
  ),
  answer("recurring_problem", "Scheduling and quotes. Every job change comes back through me."),
  answer("cost_of_standing_still", "I'd burn out or just cap the business where it is."),
  answer(
    "existing_assets",
    "Four thousand past customers on a spreadsheet and hundreds of reviews we've never used.",
  ),
];

describe("reflection traceability guardrail", () => {
  it("says nothing the founder did not say", () => {
    const statements = buildReflection(FOUNDER);
    expect(statements.length).toBeGreaterThanOrEqual(3);
    for (const s of statements) {
      const origin = traceToAnswer(s.text, FOUNDER);
      expect(origin, `untraceable reflection line: "${s.text}"`).not.toBeNull();
    }
  });

  it("marks a line as shortened whenever it is not the founder's full answer", () => {
    for (const s of buildReflection(FOUNDER)) {
      const origin = traceToAnswer(s.text, FOUNDER)!;
      const full = origin.answer.replace(/\s+/g, " ").trim();
      if (s.source === "verbatim") {
        expect(s.text).toBe(full);
      } else {
        expect(s.source).toBe("shortened");
        expect(full.length).toBeGreaterThan(s.text.length);
      }
    }
  });

  it("holds for long answers that have to be cut", () => {
    const long = answer(
      "the_business",
      "We run a family bakery in Norwich. " +
        "We supply forty cafés and restaurants across the county and that side is now bigger than the shops. ".repeat(
          4,
        ),
    );
    const [statement] = buildReflection([long]);
    expect(statement.source).toBe("shortened");
    expect(traceToAnswer(statement.text, [long])).not.toBeNull();
  });

  it("rejects an interpretation that was never spoken", () => {
    expect(traceToAnswer("You need a CRM and a booking system.", FOUNDER)).toBeNull();
    expect(traceToAnswer("The founder is the bottleneck.", FOUNDER)).toBeNull();
  });

  it("never traces to something the founder skipped", () => {
    const skippedAnswer: VerbatimAnswer = {
      ...answer("existing_assets", "A big back catalogue of photos we never touch."),
      skipped: true,
    };
    expect(traceToAnswer("A big back catalogue of photos", [skippedAnswer])).toBeNull();
  });

  it("condensing only ever removes words", () => {
    const source = FOUNDER[1].answer;
    const short = condense(source, 60);
    expect(normalizeForTrace(source)).toContain(
      normalizeForTrace(short.replace(/…$/, "")).replace(/[.;,\s]+$/, ""),
    );
  });
});
