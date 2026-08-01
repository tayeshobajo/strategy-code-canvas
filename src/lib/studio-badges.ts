// Per-room badge counts. Only productions requiring Tai's input are counted.
// See design spec: badges count decisions housed in that room only.

import type { Production } from "@/data/studio"
import { nextGate } from "@/data/studio"

/** Productions waiting at Truth review -> Thinking Room badge */
export function thinkingRoomCount(productions: Production[]): number {
  return productions.filter((p) => nextGate(p) === "truth").length
}

/** Productions waiting at Post review -> Approval Desk badge */
export function approvalDeskCount(productions: Production[]): number {
  return productions.filter((p) => nextGate(p) === "post").length
}

/** Productions waiting at Concept, Keyframe, Shot, or Final review -> Film Studio badge */
export function filmStudioCount(productions: Production[]): number {
  return productions.filter((p) => {
    const g = nextGate(p)
    return g === "concept" || g === "keyframes" || g === "film"
  }).length
}

/** Total decisions across all rooms -> Command Center summary */
export function totalDecisionCount(productions: Production[]): number {
  return thinkingRoomCount(productions) +
    approvalDeskCount(productions) +
    filmStudioCount(productions)
}

/**
 * Deterministic dark gradient placeholder for a production thumbnail.
 * Returns a CSS linear-gradient string seeded from the production title.
 */
export function productionGradient(title: string): string {
  let hash = 0
  for (let i = 0; i < title.length; i++) {
    hash = (hash * 31 + title.charCodeAt(i)) >>> 0
  }
  const palettes: [string, string, string][] = [
    ["#0D1B2A", "#1B2838", "#0F2744"],
    ["#1A1A2E", "#16213E", "#0F3460"],
    ["#0A0E1A", "#1C2541", "#3A506B"],
    ["#12192B", "#1E2D40", "#0D2137"],
    ["#0E1621", "#1A253A", "#243B55"],
    ["#151B27", "#1E2A3A", "#0A192F"],
    ["#0D1117", "#1C2432", "#2D3748"],
    ["#0F1923", "#1A2B3C", "#152030"],
  ]
  const [a, b, c] = palettes[hash % palettes.length]
  const angle = 110 + (hash % 60)
  return `linear-gradient(${angle}deg, ${a} 0%, ${b} 55%, ${c} 100%)`
}
