/**
 * Guard test — Gap G-1: portal onboarding submission must auto-trigger
 * the intelligence extraction pipeline.
 *
 * Before the fix, submitPortalOnboarding inserted an engine_sources row
 * with status=queued but never called runIntelligencePipelineInternal,
 * so intake sat idle until an operator noticed and ran extraction manually.
 *
 * This test locks in the wiring so a future refactor can't silently
 * regress the intake → intelligence bridge.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const src = readFileSync(resolve(process.cwd(), "src/lib/portal.functions.ts"), "utf8");

describe("submitPortalOnboarding auto-fires the extraction pipeline (G-1)", () => {
  it("imports runIntelligencePipelineInternal from engine-intelligence", () => {
    const start = src.indexOf("export const submitPortalOnboarding");
    expect(start).toBeGreaterThan(-1);
    const body = src.slice(start);
    expect(body).toMatch(/runIntelligencePipelineInternal/);
    expect(body).toMatch(/@\/lib\/engine-intelligence\.functions/);
  });

  it("invokes the pipeline with the newly-inserted engine source id", () => {
    const start = src.indexOf("export const submitPortalOnboarding");
    const body = src.slice(start);
    // Must call the pipeline runner with projectId + sourceIds after the
    // engine_sources insert succeeds.
    expect(body).toMatch(
      /runIntelligencePipelineInternal\s*\(\s*supabaseAdmin\s*,\s*\{[\s\S]*?projectId\s*:[\s\S]*?sourceIds\s*:/,
    );
  });

  it("guards the pipeline call inside the success branch of the source insert", () => {
    const start = src.indexOf("export const submitPortalOnboarding");
    const body = src.slice(start);
    // The pipeline must run only after engineSourceId is set (i.e. inside
    // the else branch of the source-insert error check), never before it.
    const elseIdx = body.indexOf("engineSourceId = src.id");
    const pipeIdx = body.indexOf("runIntelligencePipelineInternal");
    expect(elseIdx).toBeGreaterThan(-1);
    expect(pipeIdx).toBeGreaterThan(elseIdx);
  });
});

describe("pipeline transitions engine_projects.status correctly (G-1)", () => {
  const pipeline = readFileSync(
    resolve(process.cwd(), "src/lib/engine-intelligence.functions.ts"),
    "utf8",
  );

  it("sets status='source_processing' at pipeline start", () => {
    expect(pipeline).toMatch(
      /\.update\(\{\s*status:\s*"source_processing"[\s\S]*?\}\)\s*\.eq\("id",\s*args\.projectId\)/,
    );
  });

  it("sets status='draft' when the AI version lands (success path)", () => {
    // The success-path module updates object must carry status: "draft".
    const anchor = "G-1 status transition: AI draft has landed";
    const idx = pipeline.indexOf(anchor);
    expect(idx, "expected success-path draft transition anchor comment").toBeGreaterThan(-1);
    const window = pipeline.slice(idx, idx + 400);
    expect(window).toMatch(/status:\s*"draft"/);
    expect(window).not.toMatch(/status:\s*"needs_review"/);
  });


  it("sets status='intake' when extraction fails (failure path)", () => {
    // In the catch block, project status must NOT be left as source_processing
    // and must NOT be misleadingly 'needs_review' — nothing was produced.
    const catchIdx = pipeline.indexOf("pipeline_failed");
    expect(catchIdx).toBeGreaterThan(-1);
    const window = pipeline.slice(Math.max(0, catchIdx - 800), catchIdx);
    expect(window).toMatch(
      /engine_projects"\)\.update\(\{\s*status:\s*"intake"\s*\}\)\.eq\("id",\s*args\.projectId\)/,
    );
  });
});

