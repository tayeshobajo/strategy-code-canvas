/**
 * Founder conversation simulator — local/preview only.
 *
 * Runs the real adaptive conversation logic against a handful of founder
 * archetypes and prints the pacing summary for each, plus a table at the end.
 * Nothing here touches the database, the network, or Scout.
 *
 *   bun scripts/intake/simulate.ts            # all archetypes
 *   bun scripts/intake/simulate.ts thin       # only matching archetypes
 */

import {
  nextStep,
  objectiveCoverage,
  completeness,
  type ConversationState,
} from "../../src/lib/website-intake/adaptive";
import { buildReflection, traceToAnswer } from "../../src/lib/website-intake/reflection";
import { formatPacing, measurePacing } from "../../src/lib/website-intake/pacing";
import { deriveSignals } from "../../src/lib/website-intake/structure";
import type { IntakeObjectiveKey } from "../../src/lib/website-intake/questions";
import type { VerbatimAnswer } from "../../src/lib/website-intake/types";

type Archetype = {
  name: string;
  /** Seconds a founder plausibly spends composing each answer. */
  secondsPerAnswer: number;
  /** Objectives this founder chooses to skip. */
  skips?: IntakeObjectiveKey[];
  /** Answer for a prompt; the fallback is used when nothing matches. */
  reply: (prompt: string, key: string) => string;
};

const pick =
  (rules: Array<[RegExp, string]>, fallback: string) => (prompt: string, key: string) => {
    const hay = `${key} ${prompt}`.toLowerCase();
    for (const [rx, text] of rules) if (rx.test(hay)) return text;
    return fallback;
  };

const ARCHETYPES: Archetype[] = [
  {
    name: "1. Established local service business",
    secondsPerAnswer: 55,
    reply: pick(
      [
        [/who_you_are/, "I'm Dave, I run a plumbing and heating firm in Bristol with twelve people."],
        [
          /the_business/,
          "We do boiler installs, servicing and emergency callouts for homeowners and landlords across Bristol. People use us because we turn up when we say we will.",
        ],
        [
          /future_day/,
          "I'd walk in, look at the board and the day would already be sorted without me touching it. I'd be out quoting the bigger commercial jobs instead of firefighting.",
        ],
        [/future_you/, "Quoting the big jobs and training apprentices, not answering the phone at half seven at night."],
        [/future_customer/, "They'd say we're the ones who actually call you back."],
        [/whats_working/, "Referrals. Nearly all our work is word of mouth and we're always busy."],
        [/recurring_problem/, "Scheduling and quotes. Every job change and every price question comes back through me."],
        [/cost_of_standing_still/, "I'd burn out or just cap the business where it is. My wife has already said something."],
        [/already_tried/, "We tried a job management app two years ago and the lads never used it, so we went back to paper."],
        [/whats_in_the_way/, "Time mostly, and honestly I'm not a computer person."],
        [/existing_assets/, "Four thousand past customers on a spreadsheet and hundreds of reviews we've never used."],
        [/ninety_day_wish/, "Jobs booked and quoted without me in the middle of it."],
      ],
      "It's mostly about getting the day to day off my plate so the business can grow.",
    ),
  },
  {
    name: "2. Early-stage founder, vague model",
    secondsPerAnswer: 40,
    reply: pick(
      [
        [/who_you_are/, "Priya, I'm building this on my own alongside a part-time job."],
        [
          /the_business/,
          "It's sort of a platform for helping parents find good local tutors, though I'm still figuring out exactly who pays. Right now it's a landing page and some spreadsheets.",
        ],
        [/future_day/, "I'd wake up and it would just be running. People signing up, matches happening, me working on the interesting parts."],
        [/future_you/, "Talking to tutors and improving the matching, not doing admin."],
        [/recurring_problem/, "I keep changing my mind about the model. Subscription, commission, ads. I go round in circles."],
        [/cost_of_standing_still/, "I'd lose momentum and probably shelve it."],
        [/whats_in_the_way/, "No money to hire anyone and I can't build it myself."],
        [/existing_assets/, "I've got a waiting list of about three hundred parents who signed up."],
        [/ninety_day_wish/, "Decide the model and get twenty real paying matches."],
      ],
      "Honestly I'm still working that out, which is part of why I'm here.",
    ),
  },
  {
    name: "3. Growing professional services",
    secondsPerAnswer: 65,
    reply: pick(
      [
        [/who_you_are/, "Mark, managing partner. Nineteen years in, thirty-four staff."],
        [
          /the_business/,
          "We do compliance, audit and advisory work for owner-managed businesses turning over one to twenty million across the East Midlands.",
        ],
        [/future_day/, "The partners would spend the day with clients on advisory work instead of chasing internal deadlines and reviewing files at eleven at night."],
        [/future_customer/, "They'd say we tell them what's coming rather than what already happened."],
        [/whats_working/, "Our reputation and a very strong referral network with local solicitors."],
        [/recurring_problem/, "Work in progress and review bottlenecks. Everything piles onto three senior people and nothing moves until they touch it."],
        [/cost_of_standing_still/, "We'd stop growing and probably lose two of our best managers."],
        [/whats_in_the_way/, "Partner time and a culture where nobody trusts a file until a partner signs it."],
        [/existing_assets/, "Nineteen years of client data and a very strong referral network."],
        [/ninety_day_wish/, "Get review turnaround under a week without partners working evenings."],
      ],
      "It comes back to capacity in the senior team more than anything else.",
    ),
  },
  {
    name: "4. Thin answers and skips",
    secondsPerAnswer: 18,
    skips: ["future_customer", "already_tried", "cost_of_standing_still"],
    reply: pick(
      [
        [/who_you_are/, "Sam, photographer."],
        [/the_business/, "Weddings mostly."],
        [/future_day/, "Busier, I guess."],
        [/recurring_problem/, "Editing takes forever."],
        [/whats_in_the_way/, "Time."],
        [/existing_assets/, "Got a big back catalogue of photos."],
        [/ninety_day_wish/, "More time."],
      ],
      "Not sure.",
    ),
  },
  {
    name: "5. Rich, wide-ranging answers",
    secondsPerAnswer: 95,
    reply: pick(
      [
        [/who_you_are/, "Ellie. My mum started the bakery in 1988 and I took it over six years ago."],
        [
          /the_business/,
          "I run a family bakery in Norwich with two shops, and we supply about forty cafés and restaurants across the county, which is now more than half the revenue. In two years I'd want the wholesale side doubled, ordering running itself, and me back developing new products instead of taking orders by text at six in the morning.",
        ],
        [
          /future_day/,
          "An ordinary Tuesday I'd be in at six baking, out by two, and the afternoon orders would already be handled. Wholesale would be double and I'd be developing new things again.",
        ],
        [/recurring_problem/, "Orders coming to my personal phone by text. Everything comes back to me."],
        [/cost_of_standing_still/, "I'd sell up, which I don't want."],
        [/whats_in_the_way/, "There's never a quiet hour to fix anything properly."],
        [/existing_assets/, "Six years of order history in my phone and forty trade customers who'd buy more."],
        [/ninety_day_wish/, "Trade customers ordering without texting me."],
      ],
      "It all comes back to the ordering process being stuck in my phone.",
    ),
  },
];

function run(a: Archetype) {
  const start = Date.now() - 1000 * 60 * 60; // deterministic-ish clock
  let clock = start;
  const state: ConversationState = { answers: [], skipped: [], followUpsAsked: [] };
  const transcript: string[] = [];

  for (let i = 0; i < 30; i++) {
    const step = nextStep(state);
    if (step.kind === "contact") break;
    clock += a.secondsPerAnswer * 1000;
    const answered_at = new Date(clock).toISOString();

    if (step.kind === "followup") {
      state.followUpsAsked.push(step.key);
      const text = a.reply(step.prompt, step.forKey);
      transcript.push(`  ↳ follow-up: ${step.prompt}`);
      state.answers.push({
        key: `${step.forKey}__followup_${step.key}` as VerbatimAnswer["key"],
        question: step.prompt,
        answer: text,
        modality: "text",
        media_ref: null,
        answered_at,
      });
      continue;
    }

    const skipping = a.skips?.includes(step.key);
    transcript.push(
      `  ${String(transcript.length + 1).padStart(2)}. ${step.transition ? `[${step.transition}] ` : ""}${step.prompt}`,
    );
    if (skipping) {
      state.skipped.push(step.key);
      state.answers.push({
        key: step.key,
        question: step.prompt,
        answer: "",
        modality: "text",
        media_ref: null,
        skipped: true,
        answered_at,
      });
      continue;
    }
    state.answers.push({
      key: step.key,
      question: step.prompt,
      answer: a.reply(step.prompt, step.key),
      modality: "text",
      media_ref: null,
      answered_at,
    });
  }

  const metrics = measurePacing(state, clock);
  const reflection = buildReflection(state.answers);
  const untraceable = reflection.filter((r) => traceToAnswer(r.text, state.answers) === null);
  const signals = deriveSignals(state.answers);

  console.log(`\n=== ${a.name} ===`);
  for (const line of transcript) console.log(line);
  console.log(`\n  PACING  ${formatPacing(metrics)}`);
  console.log(
    `  SIGNAL  coverage ${objectiveCoverage(state).toFixed(2)} · completeness ${completeness(state).toFixed(2)} · frame ${signals.frame} (${signals.frame_confidence.toFixed(2)})`,
  );
  console.log("  REFLECTION");
  for (const r of reflection) console.log(`   - [${r.source}] ${r.label}: ${r.text}`);
  if (untraceable.length > 0) {
    console.log(`  ⚠ UNTRACEABLE LINES: ${untraceable.map((r) => r.label).join(", ")}`);
  }
  return { name: a.name, metrics, untraceable: untraceable.length, reflection: reflection.length };
}

const filter = process.argv[2]?.toLowerCase();
const chosen = filter
  ? ARCHETYPES.filter((a) => a.name.toLowerCase().includes(filter))
  : ARCHETYPES;

const results = chosen.map(run);

console.log("\n================ SUMMARY ================");
console.log(
  ["archetype".padEnd(38), "Qs", "f/u", "skip", "mins", "refl", "trace"].join("  "),
);
for (const r of results) {
  console.log(
    [
      r.name.padEnd(38),
      String(r.metrics.questionsAsked).padStart(2),
      String(r.metrics.followUps).padStart(3),
      String(r.metrics.skipped).padStart(4),
      String(r.metrics.minutesToReflection ?? "-").padStart(4),
      String(r.reflection).padStart(4),
      (r.untraceable === 0 ? "ok" : `${r.untraceable} BAD`).padStart(5),
    ].join("  "),
  );
}
const avgQ = results.reduce((s, r) => s + r.metrics.questionsAsked, 0) / results.length;
const avgM = results.reduce((s, r) => s + (r.metrics.minutesToReflection ?? 0), 0) / results.length;
console.log(
  `\naverage: ${avgQ.toFixed(1)} questions · ${avgM.toFixed(1)} minutes to reflection · ` +
    `${results.every((r) => r.untraceable === 0) ? "all reflections traceable" : "TRACEABILITY FAILURE"}`,
);
