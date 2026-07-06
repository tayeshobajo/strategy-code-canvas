/**
 * Guard test — the operator delivery side door (re-audit Remaining Gap #2).
 *
 * transitionDelivery was gated only by assertOps, so a DB-granted operator
 * could move a delivery to "sent"/"execution" — and when the delivery item
 * had no linked project, the approved-snapshot check was skipped entirely,
 * leaving zero gates on shipping an unlinked delivery.
 *
 * The boundary: shipping or executing a roadmap is a sacred action.
 * Only admin may transition to sent/execution, the item must be linked to
 * a project, and that project must have an approved snapshot.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const src = readFileSync(resolve(process.cwd(), "src/lib/engine-ops.functions.ts"), "utf8");

const start = src.indexOf("export const transitionDelivery");
const end = src.indexOf("createServerFn", start + 100); // next server fn
const body = src.slice(start, end === -1 ? undefined : end);

describe("transitionDelivery sacred-action gates", () => {
  it("handler body was located", () => {
    expect(start).toBeGreaterThan(-1);
  });

  it("sent/execution transitions require the admin role (operator JWT rejected)", () => {
    // The admin check must live inside the sent/execution branch and throw
    // Forbidden for non-admins — assertOps alone is not sufficient.
    const branch = body.slice(body.indexOf('data.to === "sent" || data.to === "execution"'));
    expect(branch).toMatch(/hasRoleForEmail\([\s\S]{0,300}"admin"/);
    expect(branch).toMatch(
      /if \(!isAdmin\)[\s\S]{0,120}Forbidden: only Tai \(admin\) can move a delivery/,
    );
  });

  it("unlinked deliveries (project_id null) can never move to sent/execution", () => {
    expect(body).toMatch(/if \(!cur\?\.project_id\)[\s\S]{0,200}no linked project/);
    // The old skip pattern — approval check conditioned on project_id being
    // present — must be gone: the branch now applies to ALL sent/execution
    // transitions.
    expect(body).not.toMatch(
      /\(data\.to === "sent" \|\| data\.to === "execution"\) && cur\?\.project_id/,
    );
  });

  it("approved-snapshot check still guards linked deliveries", () => {
    expect(body).toMatch(/approved_snapshot/);
    expect(body).toMatch(/no approved roadmap version yet/);
  });

  it("gates run before the status update write", () => {
    const adminGate = body.indexOf("Forbidden: only Tai (admin) can move a delivery");
    const unlinkedGate = body.indexOf("no linked project");
    const write = body.search(/from\("engine_delivery_items"\)\.update\(/);
    expect(adminGate).toBeGreaterThan(-1);
    expect(unlinkedGate).toBeGreaterThan(-1);
    expect(write).toBeGreaterThan(-1);
    expect(adminGate).toBeLessThan(write);
    expect(unlinkedGate).toBeLessThan(write);
  });
});
