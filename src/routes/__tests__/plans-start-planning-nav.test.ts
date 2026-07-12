/**
 * Guard test — Plans & Specifications "Start planning" navigates.
 *
 * Before the fix, the buttons ran `window.alert(...)` no-ops. Now they
 * must be TanStack Router <Link>s pointing at the milestone brief route.
 * The target brief route file must exist.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("Plans page — Start planning navigates to brief", () => {
  const plansPath = "src/routes/engine.projects.$projectId.plans.tsx";
  const briefPath =
    "src/routes/engine.projects.$projectId.milestones.$milestoneId.brief.tsx";
  const src = read(plansPath);

  it("target brief route file exists", () => {
    expect(existsSync(resolve(process.cwd(), briefPath))).toBe(true);
  });

  it("uses <Link> from @tanstack/react-router (no window.alert no-ops)", () => {
    expect(src).toMatch(
      /import\s*\{[^}]*\bLink\b[^}]*\}\s*from\s*["']@tanstack\/react-router["']/,
    );
    expect(src).not.toMatch(/window\.alert/);
  });

  it("Start planning + Prepare this link to the milestone brief route", () => {
    // Both entry points target the same typed route path with the two params.
    const targets = src.match(
      /to="\/engine\/projects\/\$projectId\/milestones\/\$milestoneId\/brief"/g,
    );
    expect(targets?.length ?? 0).toBeGreaterThanOrEqual(2);
    // Params for the link must include both projectId and milestoneId.
    expect(src).toMatch(/params=\{\s*\{[^}]*projectId[^}]*milestoneId[^}]*\}/);
  });

  it("both button labels are still present", () => {
    expect(src).toMatch(/Start planning/);
    expect(src).toMatch(/Prepare this/);
  });
});
