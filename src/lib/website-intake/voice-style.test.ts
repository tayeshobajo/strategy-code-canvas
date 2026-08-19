/**
 * Voice guard: nothing a visitor reads may carry an em dash or stock
 * AI-assistant phrasing. Covers the deterministic fallback turns, the
 * question spine, the reflection labels and representative UI copy.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { planTurn, type Posture } from "./posture";
import { INTAKE_QUESTIONS, FOLLOW_UPS } from "./questions";
import { EARLY_EXIT_PROMPT, CONTACT_PROMPT, type ConversationState } from "./adaptive";
import { phaseLabel } from "./reflection";

const EM_DASH = /[\u2014\u2013]/;

const BANNED = [
  "what i'm hearing",
  "it sounds like",
  "got it",
  "understood",
  "that's a great",
  "i can hear",
  "let's unpack",
  "let's dive in",
  "thanks for sharing",
  "based on what you've shared",
];

function assertClean(label: string, text: string) {
  expect(EM_DASH.test(text), `${label} contains an em dash: ${text}`).toBe(false);
  const lower = text.toLowerCase();
  for (const phrase of BANNED) {
    expect(lower.includes(phrase), `${label} uses stock phrasing "${phrase}": ${text}`).toBe(false);
  }
}

const EMPTY_STATE: ConversationState = { answers: [], skipped: [], supported: [] };

const SAMPLES: Array<{ posture: Posture; latest: string }> = [
  { posture: "greeting", latest: "hey" },
  { posture: "social_or_relational", latest: "how are you?" },
  { posture: "uncertain", latest: "I don't know where to start" },
  {
    posture: "emotional_or_frustrated",
    latest: "I'm exhausted, everything comes back to me and I never switch off",
  },
  { posture: "excited_or_visionary", latest: "I keep picturing a business that runs itself" },
  { posture: "direct_problem_statement", latest: "The problem is we need more leads" },
  { posture: "correction_or_disagreement", latest: "No, that's not what I said" },
  { posture: "wants_to_keep_talking", latest: "One more thing before we finish" },
  {
    posture: "answer_to_current_objective",
    latest: "We run a small dental practice in Leeds with six staff.",
  },
];

describe("intake voice quality", () => {
  it("keeps every deterministic fallback turn clean", () => {
    for (const s of SAMPLES) {
      const plan = planTurn({ state: EMPTY_STATE, latest: s.latest, currentObjective: null });
      assertClean(`fallback:${s.posture}:ack`, plan.acknowledgement);
      assertClean(`fallback:${s.posture}:question`, plan.next_question);
    }
  });

  it("keeps the question spine and follow-ups clean", () => {
    for (const q of INTAKE_QUESTIONS) {
      assertClean(`question:${q.key}`, q.prompt);
      assertClean(`label:${q.key}`, q.label);
      if (q.transition) assertClean(`transition:${q.key}`, q.transition);
    }
    for (const [key, prompt] of Object.entries(FOLLOW_UPS)) {
      assertClean(`followup:${key}`, prompt);
    }
  });

  it("keeps journey and completion copy clean", () => {
    assertClean("early-exit", EARLY_EXIT_PROMPT);
    assertClean("contact", CONTACT_PROMPT);
    for (const c of [0, 0.5, 0.9]) assertClean(`phase:${c}`, phaseLabel(c));
  });

  it("keeps visitor-facing UI strings free of em dashes", () => {
    const files = [
      "src/components/intake/ConversationRoom.tsx",
      "src/components/intake/IntakeLanding.tsx",
      "src/components/intake/MessageActions.tsx",
      "src/components/intake/VoiceCapture.tsx",
      "src/routes/build-my-roadmap.index.tsx",
    ];
    for (const file of files) {
      const source = fs.readFileSync(path.join(process.cwd(), file), "utf8");
      const offenders = source
        .split("\n")
        // Code comments are not visitor-facing.
        .filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line))
        .filter((line) => EM_DASH.test(line));
      expect(offenders, `${file} has em dashes in visitor-facing copy`).toEqual([]);
    }
  });
});
