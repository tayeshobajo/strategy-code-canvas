/**
 * Guard test — Pillar 2 / re-audit New Issue #1: the durable intake-failure
 * log must actually be writable by the code path it was built for, and the
 * write result must be checked.
 *
 * Before this fix the insert ran through the user-scoped client (which the
 * migration grants SELECT-only) and the returned supabase-js { error } was
 * never checked — the insert failed 100% silently, then rollback wiped the
 * engine_activity fallback, leaving zero durable evidence of the failure.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  writeDurableIntakeFailure,
  type IntakeFailureInsert,
} from "@/lib/engine-intake-failure-log";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

const ROW: IntakeFailureInsert = {
  attempted_project_id: "00000000-0000-0000-0000-000000000001",
  attempted_project_name: "Test Project",
  attempted_client_id: null,
  actor_email: "ops@example.com",
  delivery_mode: "client_portal_required",
  failure_reason: "client_portal_permissions (owner)",
  payload: { source_type: "brief" },
};

function makeClient(result: { error: { message?: string } | null } | Error) {
  const calls: Array<{ table: string; row: IntakeFailureInsert }> = [];
  const client = {
    from(table: string) {
      return {
        insert(row: IntakeFailureInsert) {
          calls.push({ table, row });
          if (result instanceof Error) return Promise.reject(result);
          return Promise.resolve(result);
        },
      };
    },
  };
  return { client, calls };
}

describe("writeDurableIntakeFailure (behavioral)", () => {
  it("inserts into engine_project_intake_failures and returns null on success", async () => {
    const { client, calls } = makeClient({ error: null });
    const res = await writeDurableIntakeFailure(client, ROW);
    expect(res).toBeNull();
    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe("engine_project_intake_failures");
    expect(calls[0].row).toEqual(ROW);
  });

  it("returns the error message when supabase-js returns { error } (no silent drop)", async () => {
    const { client } = makeClient({
      error: { message: "new row violates row-level security policy" },
    });
    const res = await writeDurableIntakeFailure(client, ROW);
    expect(res).toBe("new row violates row-level security policy");
  });

  it("returns the message when the insert throws (never rethrows)", async () => {
    const { client } = makeClient(new Error("network down"));
    const res = await writeDurableIntakeFailure(client, ROW);
    expect(res).toBe("network down");
  });
});

describe("createProjectFromSource wiring (static)", () => {
  const intake = read("src/lib/engine-project-intake.functions.ts");

  it("writes the durable failure log through the service-role client (RLS blocks the user client)", () => {
    // The dynamic supabaseAdmin import and the durable write must both sit
    // inside the integrity-failure branch, before the rollback runs.
    const failureBranch = intake.slice(
      intake.indexOf("const failures = await assertProjectIntegrity"),
      intake.indexOf("rollbackHalfBornProject(sb, projectId"),
    );
    expect(failureBranch).toMatch(/await import\("@\/integrations\/supabase\/client\.server"\)/);
    expect(failureBranch).toMatch(/writeDurableIntakeFailure\(supabaseAdmin,/);
  });

  it("checks the durable-log result and surfaces a failure in the thrown error", () => {
    expect(intake).toMatch(/const durableLogError = await writeDurableIntakeFailure/);
    expect(intake).toMatch(/if \(durableLogError\)/);
    // A failed durable write must reach the caller, not just console.
    expect(intake).toMatch(/durable failure log write also failed/);
  });

  it("durable log write happens BEFORE rollbackHalfBornProject", () => {
    const idxLog = intake.indexOf("writeDurableIntakeFailure(supabaseAdmin,");
    const idxRollback = intake.indexOf("await rollbackHalfBornProject(sb, projectId");
    expect(idxLog).toBeGreaterThan(-1);
    expect(idxRollback).toBeGreaterThan(-1);
    expect(idxLog, "durable log must be persisted before rollback").toBeLessThan(idxRollback);
  });

  it("rollback never touches engine_project_intake_failures (the row must survive)", () => {
    const helperStart = intake.indexOf("async function rollbackHalfBornProject");
    const helperEnd = intake.indexOf("export type ProjectIntegrityReport", helperStart);
    expect(helperStart).toBeGreaterThan(-1);
    expect(helperEnd).toBeGreaterThan(helperStart);
    const helper = intake.slice(helperStart, helperEnd);
    expect(helper).not.toMatch(/engine_project_intake_failures/);
  });
});

describe("migrations (static)", () => {
  it("a migration grants INSERT + an INSERT policy on engine_project_intake_failures", () => {
    const dir = "supabase/migrations";
    const files = readdirSync(dir).sort();
    const contents = files.map((f) => read(`${dir}/${f}`)).join("\n");
    expect(contents).toMatch(
      /GRANT INSERT ON public\.engine_project_intake_failures TO authenticated/,
    );
    expect(contents).toMatch(
      /CREATE POLICY[\s\S]{0,200}engine_project_intake_failures[\s\S]{0,120}FOR INSERT/,
    );
  });
});
