import { describe, expect, it } from "vitest";
import {
  CONTACT_PROMPT,
  canOfferEarlyExit,
  completeness,
  coveredObjectives,
  isBriefAnswerer,
  nextStep,
  objectiveCoverage,
  pendingFollowUp,
  type ConversationState,
} from "./adaptive";
import { INTAKE_QUESTIONS, QUESTION_BY_KEY, type IntakeObjectiveKey } from "./questions";
import { deriveStructured } from "./structure";
import { parseAttribution } from "./attribution";
import type { VerbatimAnswer } from "./types";

function answer(
  key: IntakeObjectiveKey,
  text: string,
  modality: "text" | "voice" = "text",
  media_ref: string | null = null,
): VerbatimAnswer {
  return {
    key,
    question: QUESTION_BY_KEY[key].prompt,
    answer: text,
    modality,
    media_ref,
    answered_at: new Date().toISOString(),
  };
}

const empty: ConversationState = { answers: [], skipped: [], followUpsAsked: [] };

describe("conversation flow", () => {
  it("starts with the first question and asks one thing at a time", () => {
    const step = nextStep(empty);
    expect(step).toEqual({
      kind: "question",
      key: "who_you_are",
      prompt: INTAKE_QUESTIONS[0].prompt,
    });
  });

  it("moves on after an answer", () => {
    const state = { ...empty, answers: [answer("who_you_are", "I run a small dental practice in Leeds.")] };
    expect(nextStep(state).kind).toBe("question");
    expect((nextStep(state) as { key: string }).key).not.toBe("who_you_are");
  });

  it("never punishes a skip and does not re-ask it", () => {
    const state: ConversationState = { ...empty, skipped: ["who_you_are"] };
    expect((nextStep(state) as { key: string }).key).toBe("the_business");
    expect(completeness(state)).toBeGreaterThan(0);
  });

  it("skips ground a rich answer already covered", () => {
    const rich = answer(
      "the_business",
      "We sell handmade furniture to interior designers. Our customers are mostly studios in London. " +
        "My team is four people plus contractors, we hired two last year and staff turnover has been fine. " +
        "Clients keep coming back and we make everything in house, which is the part that works well.".repeat(2),
    );
    const covered = coveredObjectives({ ...empty, answers: [rich] });
    expect(covered.has("future_team")).toBe(true);
    const step = nextStep({ ...empty, answers: [rich] });
    expect((step as { key: string }).key).not.toBe("future_team");
  });

  it("asks one warm follow-up on a thin dream answer, and only once", () => {
    const thin = answer("future_day", "Busier, I guess.");
    const state = { ...empty, answers: [thin] };
    const fu = pendingFollowUp(state, "future_day");
    expect(fu?.key).toBe("thin_dream");
    expect(nextStep(state).kind).toBe("followup");
    const after = { ...state, followUpsAsked: ["thin_dream" as const] };
    expect(nextStep(after).kind).toBe("question");
  });

  it("follows up when a past vendor failure appears", () => {
    const state = {
      ...empty,
      answers: [answer("already_tried", "We hired an agency and they never delivered anything.")],
    };
    expect(pendingFollowUp(state, "already_tried")?.key).toBe("past_failure");
  });

  it("follows up when an unused asset appears", () => {
    const state = {
      ...empty,
      answers: [answer("existing_assets", "We have an email list of nine thousand people.")],
    };
    expect(pendingFollowUp(state, "existing_assets")?.key).toBe("hidden_asset");
  });

  it("offers an early exit once the picture is strong", () => {
    const answers = INTAKE_QUESTIONS.slice(0, 12).map((q) =>
      answer(q.key, `A considered answer about ${q.label} that runs to a reasonable length.`),
    );
    const state = { ...empty, answers, followUpsAsked: ["thin_dream" as const] };
    expect(objectiveCoverage(state)).toBeGreaterThanOrEqual(0.7);
    expect(canOfferEarlyExit(state)).toBe(true);
  });

  it("collects contact details only at the very end", () => {
    const answers = INTAKE_QUESTIONS.map((q) => answer(q.key, `Answer about ${q.label}, at length.`));
    const state = { ...empty, answers, followUpsAsked: ["thin_dream" as const] };
    expect(nextStep(state)).toEqual({ kind: "contact" });
    expect(CONTACT_PROMPT).toBe("Where should I send what we uncover?");
  });
});

describe("verbatim preservation", () => {
  it("keeps the exact words, modality and media reference", () => {
    const spoken = answer("the_business", "  it's a bakery, mostly weddings  ", "voice", "intake-voice/x/a.webm");
    const structured = deriveStructured([spoken]);
    expect(spoken.answer).toBe("  it's a bakery, mostly weddings  ");
    expect(spoken.modality).toBe("voice");
    expect(spoken.media_ref).toBe("intake-voice/x/a.webm");
    // The derived layer may trim; the verbatim record above must not change.
    expect(structured.current_state[0]).toBe("it's a bakery, mostly weddings");
  });

  it("does not replace an answer with its summary", () => {
    const spoken: VerbatimAnswer = { ...answer("the_business", "long spoken answer", "voice"), summary: "bakery" };
    expect(spoken.answer).toBe("long spoken answer");
    expect(spoken.summary).toBe("bakery");
  });

  it("routes answers into the right understanding buckets", () => {
    const s = deriveStructured([
      answer("recurring_problem", "invoicing keeps coming back to me"),
      answer("ninety_day_wish", "stop chasing payments"),
      answer("whats_in_the_way", "no time"),
    ]);
    expect(s.pains).toContain("invoicing keeps coming back to me");
    expect(s.goals).toContain("stop chasing payments");
    expect(s.constraints).toContain("no time");
  });
});

describe("attribution capture", () => {
  it("captures the clean first-touch facts", () => {
    const a = parseAttribution({
      url: "https://trusttai.com/insights/foo?utm_source=linkedin&utm_medium=social&utm_campaign=spring&gclid=abc",
      referrer: "https://www.linkedin.com/",
      sessionId: "sess-1",
      startedAt: "2026-01-01T00:00:00.000Z",
      pageViews: 2,
    });
    expect(a).toMatchObject({
      landing_path: "/insights/foo",
      entry_referrer: "https://www.linkedin.com/",
      utm_source: "linkedin",
      utm_medium: "social",
      utm_campaign: "spring",
      gclid: "abc",
      fbclid: null,
      session_id: "sess-1",
      page_views_before_intake: 2,
    });
  });
});

describe("pacing and respect", () => {
  const long = (label: string) =>
    `${label}. ` +
    "This is a considered answer with real detail about how the business actually runs day to day.";

  it("reaches the contact gate in roughly nine to twelve questions", () => {
    const state: ConversationState = { answers: [], skipped: [], followUpsAsked: [] };
    let asked = 0;
    for (let i = 0; i < 40; i++) {
      const step = nextStep(state);
      if (step.kind === "contact") break;
      if (step.kind === "question") {
        asked++;
        state.answers.push(answer(step.key, long(step.key)));
      } else {
        state.followUpsAsked.push(step.key);
      }
    }
    expect(asked).toBeGreaterThanOrEqual(9);
    expect(asked).toBeLessThanOrEqual(12);
  });

  it("always asks the two-year Tuesday in the founder's own words", () => {
    const rich = answer(
      "the_business",
      "We supply forty cafés and our customers keep coming back. Ideally in the future the team would run it. " +
        "I'd want to be developing products again and my time back.".repeat(2),
    );
    expect(coveredObjectives({ ...empty, answers: [rich] }).has("future_day")).toBe(false);
  });

  it("stops sooner and stops probing when answers stay short", () => {
    const state: ConversationState = {
      answers: [
        answer("who_you_are", "Sam, photographer."),
        answer("the_business", "Weddings."),
        answer("future_day", "Busier."),
      ],
      skipped: [],
      followUpsAsked: ["thin_dream"],
    };
    expect(isBriefAnswerer(state)).toBe(true);
    expect(pendingFollowUp(state, "future_day")).toBeNull();
    const step = nextStep(state);
    expect(step.kind).toBe("question");
    expect(QUESTION_BY_KEY[(step as { key: IntakeObjectiveKey }).key].essential).toBe(true);
  });

  it("never chains more than two follow-ups", () => {
    const state: ConversationState = {
      answers: [answer("existing_assets", "We have an email list of nine thousand people we never use.")],
      skipped: [],
      followUpsAsked: ["thin_dream", "past_failure"],
    };
    expect(pendingFollowUp(state, "existing_assets")).toBeNull();
  });

  it("does not ask what could be possible about something that failed", () => {
    const state: ConversationState = {
      answers: [answer("already_tried", "We tried a shared spreadsheet and nobody kept it updated.")],
      skipped: [],
      followUpsAsked: [],
    };
    expect(pendingFollowUp(state, "already_tried")?.key).not.toBe("hidden_asset");
  });
});
