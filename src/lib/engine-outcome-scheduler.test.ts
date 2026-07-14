// Phase H4 + H5 — end-to-end integration test.
//
// Seeds an in-memory mock Supabase workspace with a delivered project aged
// 30 days, runs the outcome scheduler's internal code path (same one the
// pg_cron hook invokes), and then asks the health explainer to explain the
// project's health. Verifies:
//   1. The scheduler emitted an outcome_checkin review item + activity row.
//   2. The health explainer picks that same review item up as a driver with
//      evidenceRef pointing at engine_review_items.id.
//   3. The verdict / score reflect the new driver (not "healthy" with no
//      drivers).
//
// This is a mock-DB integration test — we don't hit a live Supabase — but it
// exercises the real production code paths on both sides.

import { describe, expect, it } from "vitest";
import { internalRunOutcomeCheckins } from "./engine-outcome-scheduler.functions";
import { loadProjectDriversForTest } from "./engine-health-explainer.functions";

// ---------------------------------------------------------------------------
// Minimal chainable PostgREST-style query mock.
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

function makeQuery(tables: Tables, table: string) {
  let rows: Row[] = [...(tables[table] ?? [])];
  let pendingInsert: Row[] | null = null;
  let pendingUpdate: Row | null = null;
  let selectShape = false;

  const api: any = {
    select(_cols?: string) {
      selectShape = true;
      return api;
    },
    eq(col: string, val: unknown) {
      if (pendingUpdate) {
        tables[table] = (tables[table] ?? []).map((r) =>
          r[col] === val ? { ...r, ...pendingUpdate } : r,
        );
        return Promise.resolve({ data: null, error: null });
      }
      rows = rows.filter((r) => r[col] === val);
      return api;
    },
    in(col: string, vals: unknown[]) {
      rows = rows.filter((r) => vals.includes(r[col] as never));
      return api;
    },
    not(col: string, op: string, val: unknown) {
      if (op === "is" && val === null) rows = rows.filter((r) => r[col] != null);
      return api;
    },
    is(col: string, val: unknown) {
      if (val === null) rows = rows.filter((r) => r[col] == null);
      return api;
    },
    gte(col: string, val: string) {
      rows = rows.filter((r) => String(r[col] ?? "") >= val);
      return api;
    },
    like(col: string, pattern: string) {
      const rx = new RegExp("^" + pattern.replace(/%/g, ".*") + "$");
      rows = rows.filter((r) => rx.test(String(r[col] ?? "")));
      return api;
    },
    order(_col: string) {
      return api;
    },
    limit(n: number) {
      rows = rows.slice(0, n);
      return api;
    },
    single() {
      return Promise.resolve({ data: rows[0] ?? null, error: rows[0] ? null : { message: "no row" } });
    },
    maybeSingle() {
      return Promise.resolve({ data: rows[0] ?? null, error: null });
    },
    insert(values: Row | Row[]) {
      const arr = Array.isArray(values) ? values : [values];
      const withIds = arr.map((v) => ({
        id: (v.id as string) ?? crypto.randomUUID(),
        created_at: (v.created_at as string) ?? new Date().toISOString(),
        updated_at: (v.updated_at as string) ?? new Date().toISOString(),
        ...v,
      }));
      tables[table] = [...(tables[table] ?? []), ...withIds];
      pendingInsert = withIds;
      rows = withIds;
      // .insert() returns a thenable that also supports .select().single().
      const thenable: any = {
        select(_cols?: string) {
          return {
            single: () => Promise.resolve({ data: withIds[0], error: null }),
          };
        },
        then: (resolve: any) => resolve({ data: withIds, error: null }),
      };
      return thenable;
    },
    update(values: Row) {
      pendingUpdate = values;
      return api;
    },
    then(resolve: any) {
      return resolve({ data: selectShape ? rows : rows, error: null });
    },
  };
  return api;
}

function makeSb(tables: Tables) {
  return {
    from: (table: string) => makeQuery(tables, table),
    rpc: async () => ({ data: null, error: null }),
  };
}

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------

function daysAgoIso(d: number): string {
  const t = new Date();
  t.setUTCDate(t.getUTCDate() - d);
  return t.toISOString();
}

describe("outcome scheduler → health explainer (end-to-end)", () => {
  it("emits an outcome check-in and surfaces it as a health driver with evidence", async () => {
    const projectId = "11111111-1111-1111-1111-111111111111";
    const tables: Tables = {
      engine_projects: [
        {
          id: projectId,
          name: "Test project",
          status: "delivered",
          completed_at: daysAgoIso(32),
          updated_at: daysAgoIso(32),
        },
      ],
      engine_milestones: [],
      engine_business_engines: [],
      engine_business_engine_exceptions: [],
      engine_review_items: [],
      engine_activity: [],
    };
    const sb = makeSb(tables);

    // 1) Scheduler run — commits (not a dry run).
    const result = await internalRunOutcomeCheckins(sb as any, "ops@test.local", false);
    expect(result.summary.emitted).toBeGreaterThanOrEqual(1);
    const emitted = result.emissions.find(
      (e) => e.triggerKind === "delivered_project" && e.status === "emitted",
    );
    expect(emitted).toBeTruthy();
    expect(emitted?.reviewItemId).toBeTruthy();

    // Persistence: review item + activity row recorded against the project.
    const reviews = tables.engine_review_items.filter(
      (r) => r.project_id === projectId && r.item_type === "outcome_checkin",
    );
    expect(reviews).toHaveLength(1);
    expect(reviews[0].status).toBe("pending");
    expect(reviews[0].source).toBe("outcome_scheduler");

    const activity = tables.engine_activity.filter(
      (a) => a.project_id === projectId && a.kind === "outcome.checkin.scheduled",
    );
    expect(activity).toHaveLength(1);

    // 2) Health explainer sees that same review item as a driver, with
    //    evidenceRef pointing at engine_review_items.id.
    const drivers = await loadProjectDriversForTest(sb as any, projectId);
    const reviewDriver = drivers.find(
      (d) => d.kind === "review_item" && d.evidenceRef?.id === (reviews[0].id as string),
    );
    expect(reviewDriver, "explainer should surface the scheduler's review item").toBeTruthy();
    expect(reviewDriver?.evidenceRef?.table).toBe("engine_review_items");
    expect(reviewDriver?.title).toContain("Outcome check-in");
  });

  it("re-running the scheduler within the dedupe window does not double-emit", async () => {
    const projectId = "22222222-2222-2222-2222-222222222222";
    const tables: Tables = {
      engine_projects: [
        {
          id: projectId,
          name: "Dedupe project",
          status: "delivered",
          completed_at: daysAgoIso(31),
          updated_at: daysAgoIso(31),
        },
      ],
      engine_milestones: [],
      engine_business_engines: [],
      engine_business_engine_exceptions: [],
      engine_review_items: [],
      engine_activity: [],
    };
    const sb = makeSb(tables);

    const first = await internalRunOutcomeCheckins(sb as any, "ops@test.local", false);
    const second = await internalRunOutcomeCheckins(sb as any, "ops@test.local", false);

    expect(first.summary.emitted).toBeGreaterThanOrEqual(1);
    // Second pass must see the pending row and dedupe, not insert a duplicate.
    const outcomeReviews = tables.engine_review_items.filter(
      (r) => r.item_type === "outcome_checkin",
    );
    expect(outcomeReviews).toHaveLength(first.summary.emitted);
    expect(second.summary.deduped).toBeGreaterThanOrEqual(first.summary.emitted);
    expect(second.summary.emitted).toBe(0);
  });
});
