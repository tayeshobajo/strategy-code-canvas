/**
 * Guard test — canvas truth gaps (re-audit §4/§5, Remaining Gap #7).
 *
 * The portal canvas must show the client THEIR data:
 *  - engine-authored Point A/B beats payload-canvas values beats derived
 *    filler (the precedence bug claimed the opposite in comments);
 *  - Point A/B carry a source tag ("authored" | "fallback") at both the
 *    publish and model layers;
 *  - phase labels come from journey data — no component may remap them to
 *    the demo copy ("Foundation", "Core Platform Build", "Scale Systems",
 *    "Scaled Impact");
 *  - the mobile canvas renders Point A/B at all.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildClientSafePayload, extractEnginePointText } from "@/lib/roadmap-publish";
import { buildRoadmapJourney } from "@/lib/portal-roadmap-model";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("publish layer: Point A/B precedence + source tagging (behavioral)", () => {
  const payloadWithCanvas = {
    client_safe_canvas: {
      pointA: { label: "Where you are", detail: "Stale canvas point A" },
      pointB: { detail: "Stale canvas point B" },
      phases: [],
      milestones: [],
    },
  };

  it("engine-authored fields beat payload-canvas values", () => {
    const safe = buildClientSafePayload({
      title: "T",
      version_label: "v1",
      payload: payloadWithCanvas,
      project_point_a: { key_diagnosis: "Engine-authored point A" },
      project_point_b: { "24_month_destination": "Engine-authored point B" },
    });
    expect(safe.client_safe_canvas.pointA.detail).toBe("Engine-authored point A");
    expect(safe.client_safe_canvas.pointB.detail).toBe("Engine-authored point B");
    expect(safe.client_safe_canvas.pointA.source).toBe("authored");
    expect(safe.client_safe_canvas.pointB.source).toBe("authored");
  });

  it("payload-canvas values are used (as authored) when the engine has none", () => {
    const safe = buildClientSafePayload({
      title: "T",
      version_label: "v1",
      payload: payloadWithCanvas,
    });
    expect(safe.client_safe_canvas.pointA.detail).toBe("Stale canvas point A");
    expect(safe.client_safe_canvas.pointA.source).toBe("authored");
    // Canvas-authored label reaches the client.
    expect(safe.client_safe_canvas.pointA.label).toBe("Where you are");
  });

  it("derived filler is tagged as fallback", () => {
    const safe = buildClientSafePayload({
      title: "T",
      version_label: "v1",
      payload: {
        current_diagnosis: "Derived diagnosis",
        executive_summary: "Derived summary",
      },
    });
    expect(safe.client_safe_canvas.pointA.detail).toBe("Derived diagnosis");
    expect(safe.client_safe_canvas.pointA.source).toBe("fallback");
    expect(safe.client_safe_canvas.pointB.detail).toBe("Derived summary");
    expect(safe.client_safe_canvas.pointB.source).toBe("fallback");
  });

  it("extractEnginePointText understands both workspace and AI module shapes", () => {
    expect(extractEnginePointText("plain string")).toBe("plain string");
    expect(extractEnginePointText({ key_diagnosis: "kd" })).toBe("kd");
    expect(extractEnginePointText({ diagnosis: "d", confidence: 80 })).toBe("d");
    expect(extractEnginePointText({ "24_month_destination": "dest" })).toBe("dest");
    expect(extractEnginePointText({ destination: "d2" })).toBe("d2");
    expect(extractEnginePointText(null)).toBeNull();
    expect(extractEnginePointText({})).toBeNull();
  });
});

describe("model layer: real labels + source tags (behavioral)", () => {
  it("uses authored canvas labels and propagates the source tag", () => {
    const journey = buildRoadmapJourney({
      title: "R",
      client_safe_canvas: {
        pointA: { label: "Today", detail: "A detail", source: "authored" },
        pointB: { label: "The summit", detail: "B detail", source: "fallback" },
        phases: [
          { id: "p1", label: "Stabilize", timeframe: "Q1", sequence: 0 },
          { id: "p2", label: "Build", timeframe: "Q2", sequence: 1 },
          { id: "p3", label: "Scale", timeframe: "Q3", sequence: 2 },
        ],
        milestones: [
          {
            id: "m1",
            title: "First milestone",
            type: "milestone",
            status: "upcoming",
            phaseId: "p1",
            sequence: 0,
          },
        ],
      },
    });
    expect(journey.pointA.label).toBe("Today");
    expect(journey.pointA.source).toBe("authored");
    expect(journey.pointB.label).toBe("The summit");
    expect(journey.pointB.source).toBe("fallback");
    expect(journey.phases.map((p) => p.label)).toEqual(["Stabilize", "Build", "Scale"]);
  });

  it("falls back to neutral labels and tags derived details as fallback", () => {
    const journey = buildRoadmapJourney({
      title: "R",
      current_diagnosis: "Derived A",
      executive_summary: "Derived B",
    });
    expect(journey.pointA.label).toBe("Current state");
    expect(journey.pointB.label).toBe("Destination");
    expect(journey.pointA.source).toBe("fallback");
    expect(journey.pointB.source).toBe("fallback");
  });
});

describe("no demo phase copy in client components (static)", () => {
  const CLIENT_FILES = [
    "src/components/portal/roadmap/MapCanvas.tsx",
    "src/components/portal/roadmap/StatusOverlayCard.tsx",
    "src/components/portal/roadmap/MilestoneSheet.tsx",
    "src/components/portal/roadmap/MarkerCluster.tsx",
    "src/components/portal/roadmap/RoadmapOverviewStrip.tsx",
    "src/components/portal/roadmap/MobilePhaseStack.tsx",
    "src/routes/portal.roadmap.tsx",
    "src/lib/portal-roadmap-model.ts",
    "src/lib/roadmap-publish.ts",
  ];
  // Demo copy lives ONLY in portal-roadmap-demo-fixture.ts (visual demo mode).
  const DEMO_STRINGS = ["Core Platform Build", "Scale Systems", "Scaled Impact", '"Foundation"'];

  for (const file of CLIENT_FILES) {
    it(`${file} contains no hardcoded demo phase names`, () => {
      const src = read(file);
      for (const s of DEMO_STRINGS) {
        expect(src, `${file} must not contain "${s}"`).not.toContain(s);
      }
    });
  }

  it("MobilePhaseStack renders Point A and Point B", () => {
    const src = read("src/components/portal/roadmap/MobilePhaseStack.tsx");
    expect(src).toMatch(/journey\.pointA\.detail/);
    expect(src).toMatch(/journey\.pointB\.detail/);
    expect(src).toMatch(/journey\.pointA\.label/);
    expect(src).toMatch(/journey\.pointB\.label/);
  });

  it("jump menu derives entries from journey phases", () => {
    const src = read("src/routes/portal.roadmap.tsx");
    expect(src).toMatch(/journey\.phases\.map\(\(p, i\) => \(\s*<DropdownMenuItem/);
    expect(src).toMatch(/Point A · \{journey\.pointA\.label\}/);
    expect(src).toMatch(/Point B · \{journey\.pointB\.label\}/);
  });
});
