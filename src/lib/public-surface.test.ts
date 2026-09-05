import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

function walk(dir: string, base = ""): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    return entry.isDirectory() ? walk(join(dir, entry.name), rel) : [rel];
  });
}

const routeFiles = walk("src/routes");
const srcFiles = walk("src").filter((f) => /\.(ts|tsx)$/.test(f) && !f.includes(".test."));

describe("public surface", () => {
  it("exposes no engine, admin or MCP routes", () => {
    const forbidden = routeFiles.filter((f) =>
      /^(engine|admin|\[\.mcp\]|\[\.well-known\])/.test(f),
    );
    expect(forbidden).toEqual([]);
  });

  it("keeps every client portal route out of search results", () => {
    const portalRoutes = routeFiles.filter((f) => /portal/.test(f));
    expect(portalRoutes.length).toBeGreaterThan(0);
    for (const file of portalRoutes) {
      const source = readFileSync(join("src/routes", file), "utf8");
      expect(source).toContain('name: "robots", content: "noindex"');
    }
  });


  it("has no QA account seeding endpoint", () => {
    expect(routeFiles.filter((f) => /seed[-_]?qa/i.test(f))).toEqual([]);
  });

  it("never creates roadmaps, projects or approvals from the website", () => {
    const offenders = srcFiles.filter((f) =>
      /engine-|spine|milestone|roadmap-studio|roadmap-synthesis/i.test(f),
    );
    expect(offenders).toEqual([]);
  });

  it("keeps the public marketing pages", () => {
    for (const page of [
      "index.tsx",
      "about.tsx",
      "what-we-build.tsx",
      "investment.tsx",
      "walks.tsx",
      "insights.tsx",
      "build-my-roadmap.index.tsx",
    ]) {
      expect(routeFiles).toContain(page);
    }
  });
});
