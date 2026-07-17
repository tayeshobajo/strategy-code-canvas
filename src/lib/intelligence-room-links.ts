/**
 * Registry of validated deep-links from a Project Spine TruthCard into the
 * corresponding Intelligence Room (with an anchor). The intelligence-layer
 * route renders matching `<section id="…" />` anchors — keep this file and
 * that route in lockstep.
 */

export type IntelligencePoint = "A" | "B";

export type IntelligenceRoomLink = {
  to: "/engine/projects/$projectId/intelligence-layer";
  hash: "point-a" | "point-b";
};

const REGISTRY: Record<IntelligencePoint, IntelligenceRoomLink> = {
  A: { to: "/engine/projects/$projectId/intelligence-layer", hash: "point-a" },
  B: { to: "/engine/projects/$projectId/intelligence-layer", hash: "point-b" },
};

export const INTELLIGENCE_ROOM_ANCHORS: ReadonlyArray<IntelligenceRoomLink["hash"]> = [
  "point-a",
  "point-b",
];

export function getIntelligenceRoomLink(point: IntelligencePoint): IntelligenceRoomLink {
  return REGISTRY[point];
}

/**
 * Dev-only validation: after navigation, confirm the destination anchor
 * actually exists in the DOM. Fires a console.warn (never throws) so
 * misconfigured deep-links surface during development without breaking
 * production navigation.
 */
export function validateIntelligenceAnchor(hash: string): boolean {
  if (typeof document === "undefined") return true;
  const el = document.getElementById(hash);
  const ok = !!el;
  if (!ok && import.meta.env?.DEV) {
    // eslint-disable-next-line no-console
    console.warn(
      `[intelligence-room-links] Anchor #${hash} is missing on the destination page. ` +
        `Add <section id="${hash}" /> to intelligence-layer or remove the link.`,
    );
  }
  if (ok) el?.scrollIntoView({ behavior: "smooth", block: "start" });
  return ok;
}
