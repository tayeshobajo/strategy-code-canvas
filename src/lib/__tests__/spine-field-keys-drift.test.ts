/**
 * Phase 2B — Drift test for the DB-side spine field-key allowlist.
 *
 * `internal_spine_field_keys(uuid, text)` is a `SECURITY DEFINER` helper the
 * ceremony completion trigger uses to know which fields must be terminal.
 * Its static arrays MUST mirror `POINT_A_BASE_FIELD_KEYS` and
 * `POINT_B_FIELD_KEYS` from src/lib/engine-spine-fields.ts, or completion
 * either lets ceremonies pass with unclassified fields (false green) or
 * blocks them on fields the app doesn't know exist (false red).
 *
 * This test parses the CURRENT canonical SQL definition out of
 * supabase/migrations (last migration that redefines the function wins) and
 * diffs the two arrays against the TS registry. Pure filesystem read — runs
 * reliably in any environment, no DB connection required.
 *
 * Dynamic `diagnosis:<title>` keys are project-specific and intentionally
 * excluded from this test; they are covered separately by ceremony-level
 * integration tests that seed truth rows per project.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  POINT_A_BASE_FIELD_KEYS,
  POINT_B_FIELD_KEYS,
} from "@/lib/engine-spine-fields";

const MIGRATIONS_DIR = resolve(process.cwd(), "supabase/migrations");
const FN_NAME = "internal_spine_field_keys";

function loadLatestFunctionSource(): string {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  // The newest migration that mentions the function name wins — this
  // mirrors Postgres's CREATE OR REPLACE FUNCTION semantics.
  for (let i = files.length - 1; i >= 0; i--) {
    const body = readFileSync(resolve(MIGRATIONS_DIR, files[i]), "utf8");
    if (body.includes(`FUNCTION public.${FN_NAME}`) || body.includes(`FUNCTION ${FN_NAME}`)) {
      return body;
    }
  }
  throw new Error(
    `No migration defines ${FN_NAME}. Did the Phase 2 migration get removed?`,
  );
}

/**
 * Pull the string list from an `unnest(ARRAY[ ... ]::text[])` block that
 * belongs to a particular `_spine = '<point>'` branch of the plpgsql body.
 */
function extractStaticKeys(sql: string, spine: "point-a" | "point-b"): string[] {
  // Anchor on `_spine = '<spine>'` … up to the next `ELSIF` or `END IF;`.
  const branchRe = new RegExp(
    `_spine\\s*=\\s*'${spine}'[\\s\\S]*?(?=ELSIF|END\\s+IF;)`,
    "i",
  );
  const branchMatch = sql.match(branchRe);
  if (!branchMatch) {
    throw new Error(`Could not locate '_spine = '${spine}'' branch in ${FN_NAME}`);
  }
  const branch = branchMatch[0];

  const arrayRe = /unnest\s*\(\s*ARRAY\s*\[\s*([\s\S]*?)\s*\]\s*::\s*text\s*\[\s*\]\s*\)/i;
  const arrayMatch = branch.match(arrayRe);
  if (!arrayMatch) {
    throw new Error(`No unnest(ARRAY[...]::text[]) block found in ${spine} branch`);
  }
  const literalList = arrayMatch[1];
  const items = [...literalList.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  if (items.length === 0) {
    throw new Error(`Extracted zero keys from ${spine} branch — regex drift?`);
  }
  return items;
}

describe("Phase 2B — internal_spine_field_keys DB↔TS drift", () => {
  const source = loadLatestFunctionSource();

  it("Point A static keys match POINT_A_BASE_FIELD_KEYS", () => {
    const dbKeys = extractStaticKeys(source, "point-a");
    // Order and membership both matter — sorting hides accidental duplicates
    // and reordering that would break `diagnosis:*` prefix assumptions.
    expect(dbKeys).toEqual([...POINT_A_BASE_FIELD_KEYS]);
  });

  it("Point B static keys match POINT_B_FIELD_KEYS", () => {
    const dbKeys = extractStaticKeys(source, "point-b");
    expect(dbKeys).toEqual([...POINT_B_FIELD_KEYS]);
  });

  it("Point A branch does not hardcode any diagnosis:* key (dynamic-only)", () => {
    const dbKeys = extractStaticKeys(source, "point-a");
    for (const k of dbKeys) {
      expect(k.startsWith("diagnosis:")).toBe(false);
    }
  });
});
