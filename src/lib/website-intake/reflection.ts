/**
 * Reflection + journey language for the conversational intake room.
 *
 * Pure, client-safe, deterministic. Nothing here is authoritative: the
 * verbatim answers remain the truth. These helpers only shape what the
 * founder sees while they talk, and what they are asked to confirm.
 */

import type { IntakeObjectiveKey } from "./questions";
import type { VerbatimAnswer } from "./types";

export type ReflectionStatement = {
  id: string;
  label: string;
  text: string;
};

export type ConversationTheme = {
  id: string;
  label: string;
  support: string;
};

/** Soft journey language. Never a step counter. */
export function phaseLabel(coverage: number): string {
  if (coverage < 0.4) return "Getting the picture";
  if (coverage < 0.72) return "Seeing the possibilities";
  return "Finding the path";
}

function baseKey(key: VerbatimAnswer["key"]): IntakeObjectiveKey {
  return key.split("__followup_")[0] as IntakeObjectiveKey;
}

function textFor(answers: VerbatimAnswer[], keys: IntakeObjectiveKey[]): string | null {
  for (const key of keys) {
    // Prefer the fullest thing they said on this ground, including any
    // follow-up, rather than whichever came first.
    const hits = answers
      .filter((a) => baseKey(a.key) === key && !a.skipped && (a.answer ?? "").trim().length > 0)
      .map((a) => a.answer.trim())
      .sort((a, b) => b.length - a.length);
    if (hits.length > 0) return hits[0];
  }
  return null;
}

/** Trim to a readable statement without inventing words. */
export function condense(text: string, max = 220): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("; "));
  if (stop > max * 0.5) return cut.slice(0, stop + 1);
  const space = cut.lastIndexOf(" ");
  return `${cut.slice(0, space > 0 ? space : max)}…`;
}

const SLOTS: Array<{ id: string; label: string; keys: IntakeObjectiveKey[] }> = [
  { id: "current", label: "Where you are", keys: ["the_business", "who_you_are", "whats_working"] },
  {
    id: "future",
    label: "Where you're heading",
    keys: ["future_day", "future_you", "future_customer"],
  },
  { id: "friction", label: "What's getting in the way", keys: ["recurring_problem", "whats_in_the_way"] },
  { id: "why", label: "Why it matters", keys: ["cost_of_standing_still"] },
  { id: "leverage", label: "What you already have going for you", keys: ["existing_assets", "whats_working"] },
  { id: "next", label: "What you'd change first", keys: ["ninety_day_wish", "how_youd_know"] },
];

/** Below this there is nothing to reflect back; echoing it would overstate understanding. */
const REFLECTABLE_CHARS = 10;

/**
 * Three to five grounded statements, drawn only from what was actually said.
 * Nothing is inferred, nothing is prescribed, and a slot with no real source
 * is dropped rather than filled.
 */
export function buildReflection(answers: VerbatimAnswer[]): ReflectionStatement[] {
  const used = new Set<string>();
  const out: ReflectionStatement[] = [];
  for (const slot of SLOTS) {
    const text = textFor(answers, slot.keys);
    if (!text || text.length < REFLECTABLE_CHARS) continue;
    const condensed = condense(text);
    if (used.has(condensed)) continue;
    used.add(condensed);
    out.push({ id: slot.id, label: slot.label, text: condensed });
  }
  return out.slice(0, 5);
}


const THEME_RULES: Array<{ id: string; label: string; support: string; pattern: RegExp }> = [
  {
    id: "referrals",
    label: "Strong referral reputation",
    support: "Most of the work arrives through people who already trust you.",
    pattern: /\b(referral|word of mouth|recommend|repeat client|reputation)\w*\b/i,
  },
  {
    id: "founder_dependency",
    label: "Founder dependency",
    support: "Too much still runs through you personally.",
    pattern: /\b(everything comes back to me|on my plate|only i|i have to|depends on me|bottleneck)\b/i,
  },
  {
    id: "demand",
    label: "Predictable demand",
    support: "There is steady appetite for what you do.",
    pattern: /\b(busy|demand|waiting list|booked|steady|full)\b/i,
  },
  {
    id: "team",
    label: "Team autonomy",
    support: "The team could carry more with clearer structure.",
    pattern: /\b(team|staff|hire|employees|contractors|delegate)\b/i,
  },
  {
    id: "manual",
    label: "Manual, repeated work",
    support: "Work is being redone by hand more often than it should be.",
    pattern: /\b(manually|by hand|spreadsheet|copy and paste|admin|paperwork|repetitive)\b/i,
  },
  {
    id: "assets",
    label: "Unused assets",
    support: "There is value already built that isn't working hard yet.",
    pattern: /\b(email list|audience|database|content|archive|course|community|testimonials)\b/i,
  },
];

/** Quiet mirror of what is being heard. Confidence-building, never a score. */
export function conversationThemes(answers: VerbatimAnswer[], max = 4): ConversationTheme[] {
  const text = answers
    .filter((a) => !a.skipped)
    .map((a) => a.answer ?? "")
    .join("\n")
    .toLowerCase();
  if (text.trim().length < 80) return [];
  return THEME_RULES.filter((r) => r.pattern.test(text))
    .slice(0, max)
    .map(({ id, label, support }) => ({ id, label, support }));
}

/** Enough signal to justify showing the reflection rail at all. */
export function hasEnoughSignal(answers: VerbatimAnswer[]): boolean {
  const substantive = answers.filter((a) => !a.skipped && (a.answer ?? "").trim().length >= 40);
  return substantive.length >= 3;
}
