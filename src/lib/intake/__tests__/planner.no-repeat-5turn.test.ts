/**
 * Phase 14 automated invariant (extended):
 *   Across a 5+ turn synthetic conversation, the planner MUST NOT pick a
 *   field as the next question if that field already sits at or above the
 *   frame's confidence threshold in knownFacts.
 *
 * This extends planner.no-repeat-when-known.test.ts with longer scripts
 * (6 answered turns per scenario) to catch regressions that only appear
 * once the memory is dense and the planner is forced to pick from a
 * narrower pool of still-open gaps. It also asserts that no field key
 * is ever picked twice while it remains ≥ threshold.
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
      "Budget is around $500 total. I'll manage it myself, no dev team.",
      "Success looks like 100+ confirmed RSVPs with meal counts before August 15.",
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
      "Current revenue is $900K ARR with 60% margin. Team of two contractors.",
      "First 90 days I would hire the CS lead and document the onboarding SOP.",
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
      "Two people will use it — me and my assistant. Assistant handles first-touch.",
      "Success: zero dropped follow-ups over 30 days and a weekly pipeline snapshot.",
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
      "Output should be a shared Google Doc per client plus a summary dashboard.",
      "Success: ops team spends under 1 hour per week reviewing instead of 8.",
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

describe("planner — never re-asks a known field across 5+ turn conversations", () => {
  for (const sc of SCENARIOS) {
    it(`${sc.frame} — ${sc.turns.length}-turn walk never repeats a satisfied field`, () => {
      const profile = getFrameProfile(sc.frame)!;
      const threshold = profile.confidenceThreshold;
      let memory = emptyMemory(sc.frame);
      memory = applyText(memory, sc.frame, sc.opener);

      const violations: string[] = [];
      const repeats: string[] = [];
      const askedWhileSatisfied = new Set<string>();
      const askedKeys: string[] = [];

      for (let turn = 0; turn < sc.turns.length; turn += 1) {
        const decision = planNextTurn(sc.frame, memory);
        if (decision.kind !== "ask") break;

        const fk = decision.gap.field.key;
        const prior = memory.knownFacts[fk]?.confidence ?? 0;

        if (prior >= threshold) {
          violations.push(
            `turn ${turn}: picked '${fk}' with prior confidence ${prior.toFixed(
              2,
            )} ≥ threshold ${threshold}`,
          );
        }

        // Repeat guard: a key must not appear twice while it is at/above threshold.
        if (askedWhileSatisfied.has(fk)) {
          repeats.push(`turn ${turn}: re-picked '${fk}' after it was already satisfied`);
        }

        memory = recordQuestion(memory, {
          fieldKey: fk,
          question: decision.gap.field.label,
          askedAt: new Date().toISOString(),
        });
        const answer = sc.turns[turn];
        memory = recordAnswer(memory, {
          fieldKey: fk,
          response: answer,
          answeredAt: new Date().toISOString(),
        });
        memory = applyText(memory, sc.frame, answer);
        askedKeys.push(fk);

        const post = memory.knownFacts[fk]?.confidence ?? 0;
        if (post >= threshold) askedWhileSatisfied.add(fk);
      }

      expect(violations, violations.join("\n")).toEqual([]);
      expect(repeats, repeats.join("\n")).toEqual([]);

      // Either the planner ran ≥5 productive turns, or it legitimately
      // reached "done" (enough_signal) — both are acceptable outcomes.
      const finalDecision = planNextTurn(sc.frame, memory);
      expect(askedKeys.length >= 5 || finalDecision.kind === "done").toBe(true);
    });
  }
});
