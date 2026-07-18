/**
 * Phase RT-1 — Content-addressed input manifest + stable hashing.
 *
 * The hash of the canonical form of a StepInputManifest is what decides
 * staleness. Never use timestamps, never use counts.
 */

import type { StepInputManifest } from "./contract";

/** Deterministic, key-sorted JSON. Objects sorted recursively; arrays preserved. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const rec = value as Record<string, unknown>;
  const keys = Object.keys(rec).sort();
  const parts = keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(rec[k])}`);
  return `{${parts.join(",")}}`;
}

/**
 * Non-cryptographic 64-bit-ish hash suitable for staleness identity.
 * Runs in every runtime (browser, Worker, Node) without imports.
 */
export function stableHash(input: string): string {
  // FNV-1a 64-bit, returned as hex.
  let h1 = 0xcbf29ce4 >>> 0;
  let h2 = 0x84222325 >>> 0;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 ^= c;
    h2 ^= c >>> 8;
    // 32-bit FNV prime steps (approximate 64-bit spread via two lanes)
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 = Math.imul(h2, 0x01000193) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

export function hashManifest(manifest: StepInputManifest): string {
  return stableHash(canonicalJson(manifest));
}

/**
 * Build an empty manifest with the current prompt/model policy versions
 * so callers only need to fill the project-specific slots.
 */
export const PROMPT_VERSION = "rt-1.0.0";
export const MODEL_POLICY_VERSION = "rt-1.0.0";

export function baseManifest(overrides: Partial<StepInputManifest> = {}): StepInputManifest {
  return {
    source_versions: {},
    truth_versions: {},
    world_entry_version: null,
    execution_boundary_version: null,
    strategic_thesis_version: null,
    roadmap_version: null,
    capability_menu_version: "0.0.0",
    prompt_version: PROMPT_VERSION,
    model_policy_version: MODEL_POLICY_VERSION,
    ...overrides,
  };
}
