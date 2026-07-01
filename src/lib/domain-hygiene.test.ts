// CI hygiene: fail the build if legacy domain strings sneak back into
// production source. Legacy email aliases (tai@trust-tai.com, etc.) are
// intentionally allowlisted for backward-compat operator matching.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { LEGACY_URL_FRAGMENTS } from "./site-url";

const ROOT = join(__dirname, "..");

// Files/paths where legacy references are intentional (aliases, this test,
// the hygiene helper itself, and the sitemap knowledge doc references).
const ALLOWLIST = new Set(
  [
    "lib/site-url.ts",
    "lib/site-url.test.ts",
    "lib/domain-hygiene.test.ts",
    "lib/ops/access.ts", // legacy email aliases
    "lib/portal.functions.ts", // legacy email aliases
  ].map((p) => p.replace(/\//g, require("node:path").sep)),
);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js|jsx|css|html)$/.test(name)) out.push(p);
  }
  return out;
}

describe("legacy domain hygiene", () => {
  const files = walk(ROOT).map((p) => ({ p, rel: relative(ROOT, p) }));

  it("has no hardcoded legacy URL fragments", () => {
    const offenders: string[] = [];
    for (const { p, rel } of files) {
      if (ALLOWLIST.has(rel)) continue;
      const src = readFileSync(p, "utf8");
      for (const frag of LEGACY_URL_FRAGMENTS) {
        if (src.includes(frag)) offenders.push(`${rel}: ${frag}`);
      }
    }
    expect(offenders, `Legacy domains found:\n${offenders.join("\n")}`).toEqual([]);
  });
});
