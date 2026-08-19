import { nextStep, canOfferEarlyExit, objectiveCoverage, completeness, type ConversationState } from "@/lib/website-intake/adaptive";
import { buildReflection, conversationThemes } from "@/lib/website-intake/reflection";
import { deriveStructured, buildSignals } from "@/lib/website-intake/structure";
import type { VerbatimAnswer } from "@/lib/website-intake/types";
import { archetypes } from "./archetypes";

for (const arch of archetypes) {
  const state: ConversationState = { answers: [], skipped: [], followUpsAsked: [] };
  const log: string[] = [];
  let asked = 0;
  let exitOffered = -1;
  for (let i = 0; i < 40; i++) {
    const step = nextStep(state);
    if (step.kind === "contact") { log.push("→ CONTACT"); break; }
    asked++;
    const key = step.kind === "followup" ? `${step.forKey}__followup_${step.key}` : step.key;
    const reply = arch.reply(step.kind === "followup" ? step.forKey : step.key, step.kind === "followup" ? step.key : null);
    log.push(`${asked}. [${step.kind}] ${step.prompt}`);
    if (reply === null) {
      log.push(`   ⏭ SKIP`);
      if (step.kind === "followup") state.followUpsAsked.push(step.key as never);
      else state.skipped.push(step.key);
    } else {
      log.push(`   💬 ${reply.slice(0, 160)}${reply.length > 160 ? "…" : ""}`);
      state.answers.push({ key: key as VerbatimAnswer["key"], question: step.prompt, answer: reply, modality: "text", media_ref: null, answered_at: new Date().toISOString() });
      if (step.kind === "followup") state.followUpsAsked.push(step.key as never);
    }
    if (exitOffered < 0 && canOfferEarlyExit(state)) { exitOffered = asked; log.push(`   ✦ early exit available`); }
  }
  const cov = objectiveCoverage(state);
  const refl = buildReflection(state.answers);
  const structured = deriveStructured(state.answers);
  console.log(`\n=========== ${arch.name} ===========`);
  console.log(log.join("\n"));
  console.log(`\nquestions asked: ${asked} | coverage ${cov} | completeness ${completeness(state)} | early exit at Q${exitOffered}`);
  console.log(`themes: ${conversationThemes(state.answers).map(t=>t.id).join(", ") || "(none)"}`);
  console.log("REFLECTION:");
  for (const r of refl) console.log(`  - ${r.label}: ${r.text}`);
  console.log("STRUCTURED counts:", Object.fromEntries(Object.entries(structured).map(([k,v])=>[k, Array.isArray(v)?v.length:v])));
  console.log("SIGNALS:", buildSignals(state.answers, cov, completeness(state)));
}
