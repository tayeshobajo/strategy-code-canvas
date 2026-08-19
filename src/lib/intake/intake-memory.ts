/**
 * Small shared shapes for intake fact extraction.
 *
 * Kept deliberately tiny: the website only needs somewhere to hang a fact
 * plus the evidence sentence it came from. Everything richer belongs to
 * Trust Tai OS, not to the public site.
 */

export type ContextFact = {
  /** Normalised value we believe to be true. */
  value: string;
  /** The user's own words that produced the value. */
  evidence: string;
};

export type KnownFact = ContextFact & {
  /** 0..1 confidence from the heuristic scan. */
  confidence?: number;
};
