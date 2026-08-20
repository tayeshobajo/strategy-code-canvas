import { describe, expect, it } from "vitest";
import { showRoadmapInvite } from "@/lib/roadmap-invite-visibility";
import { INVITE_COPY } from "@/components/RoadmapInvite";

describe("roadmap invite visibility", () => {
  it("shows on public marketing routes", () => {
    for (const p of ["/", "/what-we-build", "/investment", "/about", "/insights", "/insights/a", "/walks"]) {
      expect(showRoadmapInvite(p)).toBe(true);
    }
  });

  it("hides on the intake and internal routes", () => {
    for (const p of [
      "/build-my-roadmap",
      "/build-my-roadmap/",
      "/checkout/roadmap",
      "/api/public/x",
      "/admin",
      "/auth/login",
      "/engine/projects",
      "/portal",
      "/unsubscribe",
      "/lovable/email/preview",
    ]) {
      expect(showRoadmapInvite(p)).toBe(false);
    }
  });
});

describe("roadmap invite copy", () => {
  const strings = [
    INVITE_COPY.pill,
    INVITE_COPY.marker,
    INVITE_COPY.eyebrow,
    INVITE_COPY.headline,
    INVITE_COPY.body,
    INVITE_COPY.cta,
    INVITE_COPY.time,
    INVITE_COPY.footer,
    ...INVITE_COPY.cards.flatMap((c) => [c.title, c.note]),
  ];

  it("uses no em dash or en dash", () => {
    for (const s of strings) expect(s).not.toMatch(/[—–]/);
  });

  it("uses no chatbot or AI wording", () => {
    for (const s of strings) expect(s.toLowerCase()).not.toMatch(/\b(ai|bot|chat with|assistant)\b/);
  });
});
