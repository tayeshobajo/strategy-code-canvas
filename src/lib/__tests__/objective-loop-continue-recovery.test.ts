/**
 * Regression test — Phase 11 P1 fix: objective-loop Continue stall.
 *
 * The ObjectiveScreen's "Continue" button used to stay disabled for 45s+
 * after the first anchor answer. Two things caused it:
 *
 *   1. `advanceObjective` awaited the Anthropic scoring call inline, so a
 *      slow/hung model pinned `scoringNext=true` until the network settled.
 *   2. The button was gated on `scoring` (fine) but reflection was
 *      re-requested on click, coupling perceived latency to reflection.
 *
 * This test locks in the fix at the source-file level so a future refactor
 * cannot silently reintroduce the split-brain between UI state and async
 * scoring/reflection.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const src = readFileSync(
  resolve(process.cwd(), "src/routes/build-my-roadmap.write.tsx"),
  "utf8",
);

describe("objective-loop Continue recovery", () => {
  it("advanceObjective releases scoringNext in a finally block", () => {
    // The transition path must always clear the scoring lock, even if a
    // background request throws or times out.
    expect(src).toMatch(/finally\s*{\s*[^}]*setScoringNext\(false\)/);
  });

  it("model scoring is fired in the background, never awaited inline", () => {
    // The `scoreObjective` call must live inside a `void (async () => {})()`
    // so the transition cannot block on the network.
    expect(src).toMatch(
      /void\s*\(async\s*\(\)\s*=>\s*\{[\s\S]*?scoreObjective\(/,
    );
  });

  it("background scoring races against a hard timeout", () => {
    // A slow/hung Anthropic call must not silently pin state; the race
    // guarantees the background task resolves in bounded time.
    expect(src).toMatch(/Promise\.race\(\s*\[[\s\S]*?scoreObjective\(/);
    expect(src).toMatch(/setTimeout\(\s*\(\s*\)\s*=>\s*resolve\(null\)/);
  });

  it("current-objective changes always clear the scoring lock", () => {
    // Defense in depth: even if a stale closure or an unmounted request
    // tried to keep scoringNext=true, the effect below resets it whenever
    // the objective advances.
    expect(src).toMatch(
      /React\.useEffect\(\(\)\s*=>\s*\{\s*setScoringNext\(false\);?\s*\},\s*\[currentObjective\?\.key\]\)/,
    );
  });

  it("Continue click does not re-request reflection", () => {
    // Reflection is fire-and-forget from the textarea (debounced + onBlur).
    // Coupling it to Continue re-introduces perceived latency and — before
    // the fix — pinned the button when the reflection promise was slow.
    const onClickBlock = src.match(
      /continue:click[\s\S]{0,400}?onNext\(\)/,
    );
    expect(onClickBlock, "Continue onClick block not found").toBeTruthy();
    expect(onClickBlock![0]).not.toMatch(/requestReflection\(/);
  });

  it("Continue is disabled only for required-empty or scoring — never for reflection", () => {
    // The disabled expression must reference `requiredMet` and `scoring`,
    // and MUST NOT reference `reflecting` or `reflection` — reflection
    // state cannot gate the button.
    const btn = src.match(
      /continue:disabled[\s\S]{0,600}?Continue\s*<\/Button>/,
    );
    expect(btn, "Continue button block not found").toBeTruthy();
    expect(btn![0]).toMatch(/requiredMet/);
    expect(btn![0]).toMatch(/scoring/);
    expect(btn![0]).not.toMatch(/\breflecting\b/);
    // `reflection` (the state var) must not appear in the disabled path.
    // It's OK if it appears elsewhere in the component for the offer card.
    const disabledExpr = btn![0].match(/disabled=\{[\s\S]*?\}\}/);
    expect(disabledExpr, "disabled expression not found").toBeTruthy();
    expect(disabledExpr![0]).not.toMatch(/\breflection\b/);
  });
});
