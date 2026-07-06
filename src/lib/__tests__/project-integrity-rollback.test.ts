/**
 * Guard test — Gap G-4: project creation must never leave a half-born
 * engine_projects row. Every required sibling is verified after inserts;
 * on any failure the project is rolled back and the caller sees an error.
 *
 * Two policy layers:
 *   - Always required: engine_project_agents, engine_agent_permissions,
 *     engine_roadmap_versions (v0.0 container).
 *   - Required when delivery_mode = 'client_portal_required':
 *     client_portal_project_id link + client_portal_projects row +
 *     non-revoked owner client_portal_permissions row.
 *
 * Internal-only projects with no portal linkage are OK; the intent is to
 * allow internal experiments without forcing a fake client portal.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("project creation integrity + rollback (G-4)", () => {
  const intake = read("src/lib/engine-project-intake.functions.ts");

  it("delivery_mode is resolved and stored on engine_projects insert", () => {
    expect(intake).toMatch(/const DELIVERY_MODES\s*=\s*\[\s*"internal_only"\s*,\s*"client_portal_required"\s*\]/);
    // deliveryMode passed to project insert
    expect(intake).toMatch(/delivery_mode:\s*deliveryMode/);
    // Auto-derive rule: contact email present → client_portal_required.
    expect(intake).toMatch(
      /deliveryMode[\s\S]{0,200}resolvedContactEmail[\s\S]{0,200}client_portal_required[\s\S]{0,80}internal_only/,
    );
  });

  it("client_portal_required with no contact email throws BEFORE any insert", () => {
    // The throw must appear between input resolution and the project insert.
    const upToProjectInsert = intake.slice(
      0,
      intake.indexOf('.from("engine_projects")\n      .insert('),
    );
    expect(upToProjectInsert).toMatch(
      /client_portal_required[\s\S]{0,200}!resolvedContactEmail[\s\S]{0,400}throw new Error/,
    );
  });

  it("assertProjectIntegrity is called BEFORE source insert / pipeline kick-off", () => {
    const idxAssert = intake.indexOf("assertProjectIntegrity(sb, projectId, deliveryMode)");
    const idxSourceInsert = intake.indexOf('.from("engine_sources")\n      .insert(');
    expect(idxAssert, "assertProjectIntegrity call missing").toBeGreaterThan(-1);
    expect(idxSourceInsert, "engine_sources insert missing").toBeGreaterThan(-1);
    expect(idxAssert, "integrity gate must run before source insert").toBeLessThan(idxSourceInsert);
  });

  it("integrity failure rolls back the project and throws", () => {
    // The rollback branch must delete engine_projects and throw.
    expect(intake).toMatch(/rollbackHalfBornProject\(sb,\s*projectId,/);
    expect(intake).toMatch(/throw new Error\(`Project creation failed integrity check/);
    // rollback helper deletes the project row.
    expect(intake).toMatch(
      /rollbackHalfBornProject[\s\S]*?\.from\("engine_projects"\)\s*\.delete\(\)\s*\.eq\("id",\s*projectId\)/,
    );
    // rollback also purges sibling tables to keep the DB clean.
    for (const table of [
      "engine_project_agents",
      "engine_agent_permissions",
      "engine_roadmap_versions",
      "engine_sources",
    ]) {
      expect(
        intake,
        `rollbackHalfBornProject must delete from ${table}`,
      ).toMatch(new RegExp(`rollbackHalfBornProject[\\s\\S]*?"${table}"`));
    }
  });

  it("assertProjectIntegrity requires portal linkage only when client_portal_required", () => {
    // The helper must gate the portal checks on deliveryMode.
    const helperStart = intake.indexOf("async function assertProjectIntegrity");
    const helperEnd = intake.indexOf("async function rollbackHalfBornProject");
    expect(helperStart).toBeGreaterThan(-1);
    expect(helperEnd).toBeGreaterThan(helperStart);
    const helper = intake.slice(helperStart, helperEnd);
    expect(helper).toMatch(/if\s*\(\s*deliveryMode\s*===\s*"client_portal_required"\s*\)/);
    // engine_project_agents / permissions / versions are unconditional.
    expect(helper).toMatch(/engine_project_agents/);
    expect(helper).toMatch(/engine_agent_permissions/);
    expect(helper).toMatch(/engine_roadmap_versions/);
  });

  it("verifyProjectIntegrity honours delivery_mode (internal_only projects can be ok without portal)", () => {
    const idxReport = intake.indexOf("export type ProjectIntegrityReport");
    const report = intake.slice(idxReport, idxReport + 800);
    expect(report).toMatch(/delivery_mode:\s*DeliveryMode\s*\|\s*null/);
    // Handler branches on internal_only.
    expect(intake).toMatch(/deliveryMode\s*===\s*"internal_only"[\s\S]{0,300}portal_project\s*=\s*null/);
  });

  it("migration adds delivery_mode with NOT NULL DEFAULT 'client_portal_required'", () => {
    const dir = "supabase/migrations";
    const files = readdirSync(dir).sort();
    const hits = files.filter((f) => {
      const c = read(`${dir}/${f}`);
      // Match the migration that actually DEFINES the delivery-mode enum —
      // incidental mentions of delivery_mode in later migrations (e.g. the
      // intake-failures log column) must not shadow it.
      return /CREATE TYPE public\.engine_delivery_mode/i.test(c);
    });
    expect(hits.length, "expected a migration that adds engine_projects.delivery_mode").toBeGreaterThan(0);
    const latest = read(`${dir}/${hits[hits.length - 1]}`);
    expect(latest).toMatch(/CREATE TYPE public\.engine_delivery_mode[\s\S]{0,120}internal_only[\s\S]{0,120}client_portal_required/);
    expect(latest).toMatch(
      /delivery_mode[\s\S]{0,120}NOT NULL[\s\S]{0,80}DEFAULT\s+'client_portal_required'/i,
    );
  });
});
