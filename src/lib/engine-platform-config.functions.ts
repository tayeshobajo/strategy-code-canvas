/**
 * engine-platform-config.functions.ts
 *
 * Phase 1C — Platform Configuration Layer
 *
 * Provides workspace-level settings, project type templates, and the
 * per-project override mechanism. Config is stored as a static object
 * (no new DB tables required); workspace defaults can be extended to
 * read from a DB column in a future migration without changing the
 * public API surface.
 *
 * Server functions:
 *   getPlatformConfig(workspaceId)  — workspace-level settings
 *   savePlatformConfig(workspaceId, config) — write back (in-memory stub;
 *                                            extend to DB when engine_workspaces exists)
 *   getProjectTypeTemplates()       — list of project type templates
 *   getProjectTypeTemplate(id)      — single template by id
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasRoleForEmail } from "@/lib/ops/access";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GovernanceGateThreshold = {
  /** step key from WORKSPACE_STEPS */
  step: string;
  /** how many open decisions block advancement */
  max_open_decisions: number;
  /** whether client ack is required before advancing past this gate */
  require_client_ack: boolean;
  /** whether delivery readiness check is required */
  require_delivery_readiness: boolean;
};

export type DeliveryChecklistItem = {
  id: string;
  label: string;
  required: boolean;
};

export type WorkspaceConfig = {
  workspace_id: string;
  /** default project type for new projects */
  default_project_type: string;
  /** governance gate thresholds */
  governance_gates: GovernanceGateThreshold[];
  /** global client-facing delivery checklist */
  delivery_checklist: DeliveryChecklistItem[];
  /** whether proposals require explicit approval before spine write */
  require_proposal_approval: boolean;
  /** max days before roadmap is considered stale and flagged */
  roadmap_staleness_days: number;
  /** updated_at ISO string */
  updated_at: string;
  /** who last saved this config */
  updated_by: string | null;
};

export type ProjectTypeStep = {
  key: string;
  label: string;
  required: boolean;
};

export type ProjectTypeTemplate = {
  id: string;
  name: string;
  description: string;
  /** ordered list of steps */
  default_steps: ProjectTypeStep[];
  /** default governance rules for this type */
  default_governance: {
    require_client_ack_before_delivery: boolean;
    require_delivery_readiness_gate: boolean;
    max_open_decisions_before_delivery: number;
  };
  /** tags for display */
  tags: string[];
};

// ---------------------------------------------------------------------------
// Static defaults — source of truth until engine_workspaces table exists
// ---------------------------------------------------------------------------

const DEFAULT_DELIVERY_CHECKLIST: DeliveryChecklistItem[] = [
  { id: "spine-approved", label: "Project spine approved by operator", required: true },
  { id: "client-ack", label: "Client formally acknowledged roadmap", required: true },
  { id: "investment-confirmed", label: "Investment plan confirmed", required: true },
  { id: "milestones-complete", label: "All milestones marked complete", required: true },
  { id: "qa-evidence", label: "QA evidence attached to all milestones", required: false },
  { id: "portal-preview-reviewed", label: "Client portal preview reviewed by operator", required: false },
];

const DEFAULT_GOVERNANCE_GATES: GovernanceGateThreshold[] = [
  { step: "builder",  max_open_decisions: 3,  require_client_ack: false, require_delivery_readiness: false },
  { step: "preview",  max_open_decisions: 1,  require_client_ack: false, require_delivery_readiness: false },
  { step: "delivery", max_open_decisions: 0,  require_client_ack: true,  require_delivery_readiness: true  },
];

const DEFAULT_WORKSPACE_CONFIG: Omit<WorkspaceConfig, "workspace_id" | "updated_at" | "updated_by"> = {
  default_project_type: "web-app",
  governance_gates: DEFAULT_GOVERNANCE_GATES,
  delivery_checklist: DEFAULT_DELIVERY_CHECKLIST,
  require_proposal_approval: true,
  roadmap_staleness_days: 30,
};

// In-memory override store. Keyed by workspaceId.
// This survives server restarts only in dev; in production extend to DB.
const _configCache = new Map<string, WorkspaceConfig>();

function buildDefaultConfig(workspaceId: string): WorkspaceConfig {
  return {
    ...DEFAULT_WORKSPACE_CONFIG,
    workspace_id: workspaceId,
    updated_at: new Date().toISOString(),
    updated_by: null,
  };
}

// ---------------------------------------------------------------------------
// Project type templates (static catalogue)
// ---------------------------------------------------------------------------

export const PROJECT_TYPE_TEMPLATES: ProjectTypeTemplate[] = [
  {
    id: "web-app",
    name: "Web Application",
    description: "Standard web application with frontend, backend, and database. Suitable for SaaS, portals, and tools.",
    default_steps: [
      { key: "intelligence", label: "Intelligence Layer", required: true },
      { key: "extraction",   label: "Signal Extraction",  required: true },
      { key: "point-a",      label: "Point A Diagnosis",  required: true },
      { key: "point-b",      label: "Point B Definition", required: true },
      { key: "hidden-assets",label: "Hidden Asset Map",   required: false },
      { key: "gap-map",      label: "Gap Map",            required: true },
      { key: "blueprint",    label: "System Blueprint",   required: true },
      { key: "builder",      label: "Roadmap Builder",    required: true },
      { key: "sequencing",   label: "Sequencing View",    required: true },
      { key: "deadlines",    label: "Deadline Plan",      required: true },
      { key: "investment",   label: "Investment Builder", required: true },
      { key: "preview",      label: "Client Preview",     required: true },
      { key: "delivery",     label: "Delivery Prep",      required: true },
    ],
    default_governance: {
      require_client_ack_before_delivery: true,
      require_delivery_readiness_gate: true,
      max_open_decisions_before_delivery: 0,
    },
    tags: ["saas", "portal", "product"],
  },
  {
    id: "marketing-site",
    name: "Marketing Site",
    description: "Public-facing marketing or brochure site. Lighter governance; fewer steps required.",
    default_steps: [
      { key: "intelligence", label: "Intelligence Layer", required: true },
      { key: "point-a",      label: "Point A Diagnosis",  required: true },
      { key: "point-b",      label: "Point B Definition", required: true },
      { key: "blueprint",    label: "System Blueprint",   required: false },
      { key: "builder",      label: "Roadmap Builder",    required: true },
      { key: "sequencing",   label: "Sequencing View",    required: true },
      { key: "investment",   label: "Investment Builder", required: true },
      { key: "preview",      label: "Client Preview",     required: true },
      { key: "delivery",     label: "Delivery Prep",      required: true },
    ],
    default_governance: {
      require_client_ack_before_delivery: true,
      require_delivery_readiness_gate: false,
      max_open_decisions_before_delivery: 2,
    },
    tags: ["marketing", "brochure", "landing"],
  },
  {
    id: "mobile-app",
    name: "Mobile Application",
    description: "Native or hybrid mobile app (iOS / Android). Full governance; includes QA evidence gates.",
    default_steps: [
      { key: "intelligence",  label: "Intelligence Layer", required: true },
      { key: "signal-room",   label: "Signal Room",        required: true },
      { key: "extraction",    label: "Signal Extraction",  required: true },
      { key: "point-a",       label: "Point A Diagnosis",  required: true },
      { key: "point-b",       label: "Point B Definition", required: true },
      { key: "hidden-assets", label: "Hidden Asset Map",   required: false },
      { key: "gap-map",       label: "Gap Map",            required: true },
      { key: "blueprint",     label: "System Blueprint",   required: true },
      { key: "builder",       label: "Roadmap Builder",    required: true },
      { key: "sequencing",    label: "Sequencing View",    required: true },
      { key: "deadlines",     label: "Deadline Plan",      required: true },
      { key: "investment",    label: "Investment Builder", required: true },
      { key: "preview",       label: "Client Preview",     required: true },
      { key: "delivery",      label: "Delivery Prep",      required: true },
    ],
    default_governance: {
      require_client_ack_before_delivery: true,
      require_delivery_readiness_gate: true,
      max_open_decisions_before_delivery: 0,
    },
    tags: ["mobile", "ios", "android", "hybrid"],
  },
  {
    id: "api-integration",
    name: "API / Integration",
    description: "Backend service, API build, or third-party integration project. Architecture-heavy, lighter UX steps.",
    default_steps: [
      { key: "intelligence", label: "Intelligence Layer", required: true },
      { key: "extraction",   label: "Signal Extraction",  required: false },
      { key: "point-a",      label: "Point A Diagnosis",  required: true },
      { key: "point-b",      label: "Point B Definition", required: true },
      { key: "blueprint",    label: "System Blueprint",   required: true },
      { key: "builder",      label: "Roadmap Builder",    required: true },
      { key: "sequencing",   label: "Sequencing View",    required: true },
      { key: "investment",   label: "Investment Builder", required: true },
      { key: "preview",      label: "Client Preview",     required: true },
      { key: "delivery",     label: "Delivery Prep",      required: true },
    ],
    default_governance: {
      require_client_ack_before_delivery: true,
      require_delivery_readiness_gate: false,
      max_open_decisions_before_delivery: 1,
    },
    tags: ["api", "integration", "backend", "service"],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function assertAdmin(context: { supabase: unknown; claims?: { email?: string } }) {
  const email = context.claims?.email ?? undefined;
  const ok = await hasRoleForEmail(context.supabase as never, email, "admin");
  if (!ok) throw new Error("Forbidden: admin role required");
}

// ---------------------------------------------------------------------------
// Server functions
// ---------------------------------------------------------------------------

/**
 * getPlatformConfig — read workspace-level platform settings.
 * Falls back to hardcoded defaults if no override has been saved.
 */
export const getPlatformConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ workspaceId: z.string().min(1).max(128).default("default") }).parse(raw),
  )
  .handler(async ({ context, data }): Promise<{ config: WorkspaceConfig }> => {
    await assertAdmin(context as never);
    const cached = _configCache.get(data.workspaceId);
    if (cached) return { config: cached };
    return { config: buildDefaultConfig(data.workspaceId) };
  });

const WorkspaceConfigInputSchema = z.object({
  workspaceId: z.string().min(1).max(128).default("default"),
  config: z.object({
    default_project_type: z.string().min(1).max(64),
    require_proposal_approval: z.boolean(),
    roadmap_staleness_days: z.number().int().min(7).max(365),
    governance_gates: z.array(
      z.object({
        step: z.string().min(1),
        max_open_decisions: z.number().int().min(0).max(99),
        require_client_ack: z.boolean(),
        require_delivery_readiness: z.boolean(),
      }),
    ),
    delivery_checklist: z.array(
      z.object({
        id: z.string().min(1),
        label: z.string().min(1).max(200),
        required: z.boolean(),
      }),
    ),
  }),
});

/**
 * savePlatformConfig — persist workspace-level settings.
 * Currently stores in the in-memory _configCache; extend to a DB column
 * when the engine_workspaces table is added via migration.
 */
export const savePlatformConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => WorkspaceConfigInputSchema.parse(raw))
  .handler(async ({ context, data }): Promise<{ ok: true; config: WorkspaceConfig }> => {
    await assertAdmin(context as never);
    const email = (context as { claims?: { email?: string } }).claims?.email ?? null;
    const next: WorkspaceConfig = {
      workspace_id: data.workspaceId,
      ...data.config,
      updated_at: new Date().toISOString(),
      updated_by: email,
    };
    _configCache.set(data.workspaceId, next);
    return { ok: true, config: next };
  });

/**
 * getProjectTypeTemplates — returns all available project type templates.
 */
export const getProjectTypeTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ templates: ProjectTypeTemplate[] }> => {
    await assertAdmin(context as never);
    return { templates: PROJECT_TYPE_TEMPLATES };
  });

/**
 * getProjectTypeTemplate — returns a single template by id.
 */
export const getProjectTypeTemplate = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().min(1) }).parse(raw))
  .handler(async ({ context, data }): Promise<{ template: ProjectTypeTemplate | null }> => {
    await assertAdmin(context as never);
    const template = PROJECT_TYPE_TEMPLATES.find((t) => t.id === data.id) ?? null;
    return { template };
  });
