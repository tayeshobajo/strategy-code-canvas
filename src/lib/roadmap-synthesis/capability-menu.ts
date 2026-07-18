/**
 * Trust Tai capability menu.
 *
 * RT-1 seeded this from the World Entry Playbook as a compile-time
 * constant. RT-3 replaces it with a versioned, DB-backed registry
 * (`engine_capability_registry` + `engine_capability_menu_version`).
 *
 * The constant below is retained as a fallback so the app keeps
 * booting when the registry tables are missing (pre-migration) and
 * as an offline seed. Runtime code should prefer the loader helpers
 * exported from `@/lib/engine-capability-registry.functions`
 * (`loadCapabilityMenu`, `loadCapabilityMenuVersion`).
 *
 * The version participates in the input manifest hash so future
 * changes trigger staleness on affected synthesis steps.
 */

export type CapabilityCategory =
  | "positioning"
  | "content"
  | "audience_capture"
  | "intelligence"
  | "product_ai"
  | "operations";

export type Capability = {
  id: string;
  label: string;
  category: CapabilityCategory;
  execution_mode: "trust_tai_build" | "trust_tai_coordinate";
  description: string;
};

/** Fallback version used when the registry table has not been seeded. */
export const CAPABILITY_MENU_VERSION = "1.0.0";

export const CAPABILITY_MENU: readonly Capability[] = [
  {
    id: "web.category_site",
    label: "Category-defining website",
    category: "positioning",
    execution_mode: "trust_tai_build",
    description: "Site architecture, service pages, and category framing.",
  },
  {
    id: "web.decision_tool",
    label: "Interactive decision tool",
    category: "product_ai",
    execution_mode: "trust_tai_build",
    description: "Calculators, advisors, decision layers grounded in approved content.",
  },
  {
    id: "content.knowledge_hub",
    label: "Knowledge hub",
    category: "content",
    execution_mode: "trust_tai_build",
    description: "Editorial + educational library, category vocabulary.",
  },
  {
    id: "content.newsletter",
    label: "Editorial newsletter",
    category: "content",
    execution_mode: "trust_tai_coordinate",
    description: "Recurring publication tied to the strategic thesis.",
  },
  {
    id: "audience.lead_capture",
    label: "Lead capture systems",
    category: "audience_capture",
    execution_mode: "trust_tai_build",
    description: "Forms, offers, first-party data intake.",
  },
  {
    id: "intel.market_signals",
    label: "Market opportunity intelligence",
    category: "intelligence",
    execution_mode: "trust_tai_build",
    description: "Automated public-signal surfacing for the category.",
  },
  {
    id: "ai.approved_advisor",
    label: "Approved-content AI advisor",
    category: "product_ai",
    execution_mode: "trust_tai_build",
    description: "AI experience trained only on approved client + category content.",
  },
  {
    id: "ops.client_portal",
    label: "Client portal",
    category: "operations",
    execution_mode: "trust_tai_build",
    description: "Delivery-facing portal for milestones, roadmap, evidence.",
  },
] as const;

export function findCapability(id: string): Capability | undefined {
  return CAPABILITY_MENU.find((c) => c.id === id);
}

/**
 * A blocklist of names that indicate a milestone was written in generic
 * agency language rather than the client's world. Used by the language
 * gate in qualification. Case-insensitive substring match.
 */
export const GENERIC_MILESTONE_NAME_BLOCKLIST: readonly string[] = [
  "website redesign",
  "content marketing",
  "chatbot",
  "seo improvements",
  "resource center",
  "integration page",
  "brand refresh",
  "digital transformation",
  "growth strategy",
] as const;
