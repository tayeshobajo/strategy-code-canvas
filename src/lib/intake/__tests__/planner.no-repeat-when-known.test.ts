/**
 * Phase 14 automated invariant:
 *   Across a 3+ turn synthetic conversation, the planner MUST NOT pick a
 *   field as the next question if that field already sits at or above the
 *   frame's confidence threshold in knownFacts.
 *
 * We simulate a real intake by walking planNextTurn → mergeFacts →
 * recordQuestion/Answer for each frame, using the frame's own heuristic
 * extractors on scripted answers. The invariant is checked on every turn.
 *
 * This is the automated counterpart to the Playwright QA in
 * scripts/qa/phase14-conversation-qa.py.
 */

import { describe, expect, it } from "vitest";
import { planNextTurn } from "../conversation-planner";
import { getFrameProfile } from "../frame-profiles";
import type { IntakeFrame } from "../../intake-frames";
import {
  emptyMemory,
  mergeFacts,
  recordAnswer,
  recordQuestion,
  type IntakeMemory,
} from "../intake-memory";

type Scenario = {
  frame: IntakeFrame;
  opener: string;
  turns: string[];
};

const SCENARIOS: Scenario[] = [
  {
    frame: "project.event_site",
    opener:
      "Private RSVP site for my mother's 60th birthday, August 30 2026 in Nashville, about 120 guests. Need RSVPs, meal choice, private schedule.",
    turns: [
      "Guests RSVP with meal choice (chicken, fish, veg) and allergies. Plus-ones if named.",
      "Password protected. Only invited guests see the schedule and address.",
      "Live by August 1 2026 so we can send invitations three weeks ahead.",
      "I have a Google Sheets guest list and a family photo for the landing page.",
    ],
  },
  {
    frame: "roadmap",
    opener:
      "Everything runs through me. Sales, onboarding, delivery. I want to step back to strategy and coaching.",
    turns: [
      "Biggest bottleneck is client onboarding. After they say yes, I run the kickoff and set up the account.",
      "In 12 months I want a $2M practice where I only run strategy calls. Everything else is a team member or a system.",
      "Practically I need a client success lead and an onboarding SOP with a portal.",
      "The one asset today is my delivery playbook in Notion.",
    ],
  },
  {
    frame: "project.crm",
    opener:
      "Leads from LinkedIn DMs, a Typeform, and referrals. Everything lives in my inbox and a messy spreadsheet. Follow-ups get dropped.",
    turns: [
      "Today I copy LinkedIn leads by hand. Typeform submissions email me and I forward them.",
      "Real gap is follow-up. Nothing happens after three days of silence. I want reminders and a pipeline view.",
      "About 40 new leads a month. Audience is B2B founders doing $1M-$5M revenue.",
      "We already pay for HubSpot Starter, Zapier, and Google Workspace.",
    ],
  },
  {
    frame: "project.internal_tool",
    opener:
      "Ops team of 6 rebuilds the same weekly client status report in Excel. Data from Stripe, our project tracker, and support tickets.",
    turns: [
      "Task is one weekly status doc per active client: revenue, open projects, tickets, health flag.",
      "Today Sarah exports Stripe CSVs, Marcus pulls the tracker, we merge by hand in Excel.",
      "Data lives in Stripe, Linear, and Zendesk. API access to all three. No devs on the team.",
      "About 40 active clients. Report needs to be generated automatically by 9am Monday.",
    ],
  },
];

function applyText(memory: IntakeMemory, frame: IntakeFrame, text: string): IntakeMemory {
  const profile = getFrameProfile(frame)!;
  const patch: Record<string, { confidence: number; evidence: string }> = {};
  for (const f of [...profile.requiredFields, ...profile.optionalFields]) {
    const ex = f.heuristicExtract(text);
    if (ex.confidence > 0) patch[f.key] = ex;
  }
  return mergeFacts(memory, patch);
}

describe("planner — never re-asks a field already ≥ threshold (3+ turn conversations)", () => {
  for (const sc of SCENARIOS) {
    it(`${sc.frame} — 4-turn walk stays truthful to known_facts`, () => {
      const profile = getFrameProfile(sc.frame)!;
      const threshold = profile.confidenceThreshold;
      let memory = emptyMemory(sc.frame);
      memory = applyText(memory, sc.frame, sc.opener);

      const violations: string[] = [];
      const asked: string[] = [];

      for (let turn = 0; turn < sc.turns.length; turn += 1) {
        const decision = planNextTurn(sc.frame, memory);
        if (decision.kind !== "ask") break; // planner is done — legitimate

        const fk = decision.gap.field.key;
        const prior = memory.knownFacts[fk]?.confidence ?? 0;

        // INVARIANT — never pick a field already at/above threshold.
        if (prior >= threshold) {
          violations.push(
            `turn ${turn}: picked '${fk}' with prior confidence ${prior.toFixed(
              2,
            )} ≥ threshold ${threshold}`,
          );
        }

        // Simulate asking + user answering.
        const question = decision.gap.field.label;
        memory = recordQuestion(memory, {
          fieldKey: fk,
          question,
          askedAt: new Date().toISOString(),
        });
        const answer = sc.turns[turn];
        memory = recordAnswer(memory, {
          fieldKey: fk,
          response: answer,
          answeredAt: new Date().toISOString(),
        });
        memory = applyText(memory, sc.frame, answer);
        asked.push(fk);
      }

      expect(violations, violations.join("\n")).toEqual([]);
      // At least 3 turns must have actually happened OR planner reached
      // enough_signal early (also acceptable — that's the whole point).
      expect(asked.length >= 3 || planNextTurn(sc.frame, memory).kind === "done").toBe(
        true,
      );
    });
  }
});
