/**
 * Guard test — Pillar 1 intake bridge linkage (re-audit §7).
 *
 * The manual bridge (prefilled /engine/projects/new form) existed, but
 * nothing durable connected intake_submissions.id to the created
 * engine_projects row: submissionId became a cosmetic source-name prefix,
 * and the "Previously bridged" check on the submission page looked for
 * audit actions (`bridged_to_engine`) that no code ever wrote.
 *
 * Now: submissionId flows through CreateInput into project creation, the
 * linkage is stored on engine_projects.signal_room, an engine_activity row
 * marks the bridge, and a `bridged_to_engine` review_audit_log row (with
 * engine_project_id metadata) is written to the intake DB — making the
 * previously-dead check reachable and double-creation detectable.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("submission → project durable linkage", () => {
  const intake = read("src/lib/engine-project-intake.functions.ts");

  it("CreateInput accepts submissionId", () => {
    expect(intake).toMatch(/submissionId:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/);
  });

  it("linkage is stored on the project row (signal_room)", () => {
    expect(intake).toMatch(/intake_submission_id:\s*data\.submissionId\s*\?\?\s*null/);
  });

  it("writes the bridged_to_engine audit row with the engine project id", () => {
    expect(intake).toMatch(/action:\s*"bridged_to_engine"/);
    expect(intake).toMatch(/engine_project_id:\s*projectId/);
    // Written to the intake DB via the dedicated client.
    expect(intake).toMatch(/getIntakeClient\(\)[\s\S]{0,120}review_audit_log/);
  });

  it("bridge records are written only AFTER the integrity gate (never for rolled-back projects)", () => {
    const gate = intake.indexOf("await rollbackHalfBornProject(sb, projectId)");
    const bridge = intake.indexOf('action: "bridged_to_engine"');
    expect(gate).toBeGreaterThan(-1);
    expect(bridge, "bridge write must come after the rollback branch").toBeGreaterThan(gate);
  });

  it("writes an engine_activity intake_bridge row", () => {
    expect(intake).toMatch(/kind:\s*"intake_bridge"/);
  });
});

describe("client flow carries the submission id", () => {
  it("engine.projects.new sends submissionId in the create payload", () => {
    const src = read("src/routes/engine.projects.new.tsx");
    expect(src).toMatch(/submissionId:\s*search\.submissionId/);
  });

  it("submission page bridged-check matches the action that is now written", () => {
    const src = read("src/routes/ops/submissions.$id.tsx");
    expect(src).toMatch(/bridged_to_engine/);
    // The action is part of the typed AuditAction union.
    const types = read("src/lib/ops/intake-types.ts");
    expect(types).toMatch(/"bridged_to_engine"/);
  });
});
