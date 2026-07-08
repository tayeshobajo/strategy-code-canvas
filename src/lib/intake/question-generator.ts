/**
 * Question generator — prompt contract + voice check.
 *
 * The server fn in `question-generator.functions.ts` calls the model;
 * this file holds the pure pieces (voice rules, prompt construction,
 * fallback selection) so tests can run without a network.
 */

import type { FieldProfile } from "./frame-profiles";
import type { IntakeMemory, KnownFact } from "./intake-memory";

const BANNED =
  /[—!]|(\bjust\b|\bvery\b|\breally\b|\bsimply\b|\bsolutions\b|\bsmart\b|\bintelligent\b|\bseamless\b|\bcutting-edge\b|\bhelp\b|\bdeliver\b|\bprovide\b|\boffer\b|\bleverage\b|\bunlock\b|\bempower\b)/i;

export function passesVoiceCheck(candidate: string, history: string[]): boolean {
  const clean = candidate.trim();
  if (!clean) return false;
  if (clean.length < 8 || clean.length > 260) return false;
  if (BANNED.test(clean)) return false;
  if (/^(sure|here|okay|got it|of course)\b/i.test(clean)) return false;
  const normalized = clean.toLowerCase().replace(/\s+/g, " ");
  for (const prior of history) {
    const p = prior.toLowerCase().replace(/\s+/g, " ");
    if (p === normalized) return false;
    // Reject near-duplicates: same first 6 words.
    const a = normalized.split(" ").slice(0, 6).join(" ");
    const b = p.split(" ").slice(0, 6).join(" ");
    if (a && a === b) return false;
  }
  return true;
}

export function buildGeneratorPrompt(input: {
  frameLabel: string;
  target: FieldProfile;
  memory: IntakeMemory;
  anchor: string;
}): string {
  const facts = Object.entries(input.memory.knownFacts)
    .filter(([, f]: [string, KnownFact]) => f.confidence > 0.3 && f.evidence)
    .map(([key, f]) => `- ${key}: ${f.evidence}`)
    .join("\n");
  const ctxEntries = Object.entries(input.memory.contextFacts ?? {});
  const context = ctxEntries.length
    ? ctxEntries.map(([k, v]) => `- ${k}: ${v.value}`).join("\n")
    : "(none)";
  const asked = input.memory.questionHistory
    .map((h, i) => `${i + 1}. ${h.question}`)
    .join("\n");
  return [
    "You are the voice of Trust Tai on an adaptive intake.",
    "A conversation planner has already chosen the next field to learn about.",
    "Your job: (a) optionally acknowledge in one calm clause what the founder just told you, then (b) write ONE calm sentence that asks about the field, referencing what they already told you.",
    "",
    "Rules:",
    "- sentence case, one sentence per field, ideally under 22 words",
    "- no em-dashes, no exclamation points",
    "- do not use: just, very, really, simply, solutions, smart, seamless, help, deliver, provide, offer, leverage, unlock, empower",
    "- do NOT repeat any prior question below",
    "- do NOT ask about anything outside the target field",
    "- if you have specific facts to reference, use them; otherwise stay close to the anchor",
    "- the acknowledgement is optional; include it only when you can name back a specific prior fact (from Context or Known below), never invent one, never end it with a question mark",
    "",
    `Frame: ${input.frameLabel}`,
    `Target field (internal, do not name): ${input.target.label}`,
    `Anchor question (fallback wording): ${input.anchor}`,
    "",
    "Context (side facts you may name back — honoree, event type, city, etc.):",
    context,
    "",
    "What we already know:",
    facts || "(nothing yet)",
    "",
    "Previously asked questions (do not repeat):",
    asked || "(none yet)",
    "",
    'Return JSON only: { "acknowledgement": "<optional one clause>", "question": "<one line>" }',
  ].join("\n");
}
