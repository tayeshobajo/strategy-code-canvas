/**
 * Guard test — rollback orphan cleanup (re-audit §6 / Remaining Gap #9).
 *
 * rollbackHalfBornProject deleted only 5 engine tables + the project row;
 * engine_clients, client_portal_projects and client_portal_permissions were
 * never rolled back — a client could be left with a live-looking portal
 * shell (portal_status "onboarding_pending", payment_status "paid") for a
 * project that no longer exists.
 *
 * The fix must also be SAFE: the portal upsert matches pre-existing rows by
 * primary_email, and clientId may reference a pre-existing client — rollback
 * may only delete rows CREATED by the failed call, never live client data.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const intake = readFileSync(
  resolve(process.cwd(), "src/lib/engine-project-intake.functions.ts"),
  "utf8",
);

const helperStart = intake.indexOf("async function rollbackHalfBornProject");
const helperEnd = intake.indexOf("export type ProjectIntegrityReport", helperStart);
const helper = intake.slice(helperStart, helperEnd);

describe("rollbackHalfBornProject cleans up portal + client siblings", () => {
  it("helper body was located", () => {
    expect(helperStart).toBeGreaterThan(-1);
    expect(helperEnd).toBeGreaterThan(helperStart);
  });

  for (const table of ["client_portal_permissions", "client_portal_projects", "engine_clients"]) {
    it(`deletes from ${table}`, () => {
      expect(helper).toMatch(new RegExp(`from\\("${table}"\\)\\s*\\.delete\\(\\)`));
    });
  }

  it("still deletes all previously covered tables + the project row", () => {
    for (const table of [
      "engine_project_agents",
      "engine_agent_permissions",
      "engine_roadmap_versions",
      "engine_activity",
      "engine_sources",
      "engine_projects",
    ]) {
      expect(helper, `must delete from ${table}`).toContain(`"${table}"`);
    }
  });

  it("portal project deletion is gated on portalProjectCreated (never deletes a matched live portal)", () => {
    const portalDelete = helper.indexOf('from("client_portal_projects")');
    const guard = helper.indexOf("ctx.portalProjectCreated");
    expect(guard).toBeGreaterThan(-1);
    expect(portalDelete).toBeGreaterThan(guard);
  });

  it("engine client deletion is gated on createdClientId (never deletes a pre-existing client)", () => {
    expect(helper).toMatch(/if \(ctx\.createdClientId\)[\s\S]{0,200}engine_clients/);
  });

  it("pre-existing portal keeps its row; only the added permission is removed", () => {
    expect(helper).toMatch(
      /ctx\.portalPermissionCreated[\s\S]{0,400}client_portal_permissions[\s\S]{0,200}\.eq\("email", ctx\.contactEmail\)/,
    );
  });
});

describe("createProjectFromSource tracks created-vs-matched rows", () => {
  it("records createdClientId only on the newClient insert path", () => {
    expect(intake).toMatch(/clientId = c\.id;\s*createdClientId = c\.id;/);
  });

  it("checks portal pre-existence BEFORE the upsert", () => {
    const preCheck = intake.indexOf("preExistingPortal");
    const upsert = intake.indexOf('from("client_portal_projects")\n        .upsert(');
    expect(preCheck).toBeGreaterThan(-1);
    expect(upsert).toBeGreaterThan(-1);
    expect(preCheck).toBeLessThan(upsert);
    expect(intake).toMatch(/portalProjectCreated = !preExistingPortal/);
  });

  it("checks permission pre-existence and passes the full rollback context", () => {
    expect(intake).toMatch(/portalPermissionCreated = !preExistingPerm/);
    expect(intake).toMatch(
      /rollbackHalfBornProject\(sb, projectId, \{\s*createdClientId,\s*portalProjectId: linkedPortalProjectId,\s*portalProjectCreated,\s*portalPermissionCreated,\s*contactEmail: resolvedContactEmail,\s*\}\)/,
    );
  });
});
