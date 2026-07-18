/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Phase RT-3 — DB-backed Trust Tai capability registry.
 *
 * Reads/writes `engine_capability_registry` (versioned rows) and
 * `engine_capability_menu_version` (singleton version tag). When the
 * tables have not been applied yet (pre-migration), all readers fall
 * back to the `CAPABILITY_MENU` constant in
 * `@/lib/roadmap-synthesis/capability-menu.ts` and version
 * `CAPABILITY_MENU_VERSION`, so the build stays green and RT-1
 * qualification keeps working.
 *
 * Writes are gated to admin/operator. Any successful mutation bumps
 * the singleton menu version, which participates in the synthesis
 * input manifest hash and therefore invalidates dependent steps.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdminOrOperator, type AuthCtx } from "@/lib/engine-epistemic.server";
import { insertEngineActivity } from "@/lib/engine-activity";
import {
  CAPABILITY_MENU,
  CAPABILITY_MENU_VERSION,
  type Capability,
  type CapabilityCategory,
} from "@/lib/roadmap-synthesis/capability-menu";

export type CapabilityRegistryRow = Capability & {
  version: number;
  retired_at: string | null;
  created_at: string;
  created_by_email: string | null;
  source: "registry" | "fallback";
};

const CATEGORY = z.enum([
  "positioning",
  "content",
  "audience_capture",
  "intelligence",
  "product_ai",
  "operations",
]);

const capabilityUpsertInput = z.object({
  capability_id: z.string().trim().min(2).max(80).regex(/^[a-z0-9._-]+$/i, {
    message: "capability_id must be a-z, 0-9, dot, underscore, or dash",
  }),
  label: z.string().trim().min(1).max(120),
  category: CATEGORY,
  execution_mode: z.enum(["trust_tai_build", "trust_tai_coordinate"]),
  description: z.string().trim().min(1).max(600),
  bump_version: z.boolean().default(true),
});

const retireInput = z.object({
  capability_id: z.string().trim().min(2).max(80),
  reason: z.string().trim().max(600).optional(),
});

function isMissingTable(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  if (!e) return false;
  if (e.code === "42P01") return true;
  const m = (e.message ?? "").toLowerCase();
  return m.includes("does not exist") || m.includes("relation") || m.includes("not found");
}

async function tryReadRegistry(sb: any): Promise<CapabilityRegistryRow[] | null> {
  const { data, error } = await sb
    .from("engine_capability_registry_current")
    .select("*");
  if (error) {
    if (isMissingTable(error)) return null;
    throw new Error(error.message ?? "Failed to read capability registry");
  }
  return (data ?? []).map((r: any): CapabilityRegistryRow => ({
    id: r.capability_id,
    label: r.label,
    category: r.category as CapabilityCategory,
    execution_mode: r.execution_mode,
    description: r.description ?? "",
    version: r.version ?? 1,
    retired_at: r.retired_at ?? null,
    created_at: r.created_at ?? new Date().toISOString(),
    created_by_email: r.created_by_email ?? null,
    source: "registry",
  }));
}

function fallbackRows(): CapabilityRegistryRow[] {
  return CAPABILITY_MENU.map((c) => ({
    ...c,
    version: 1,
    retired_at: null,
    created_at: "1970-01-01T00:00:00.000Z",
    created_by_email: null,
    source: "fallback" as const,
  }));
}

async function tryReadMenuVersion(sb: any): Promise<string | null> {
  const { data, error } = await sb
    .from("engine_capability_menu_version")
    .select("version")
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) return null;
    return null;
  }
  return (data?.version as string | undefined) ?? null;
}

/** Server-side loader — safe to call from other server fns / handlers. */
export async function loadCapabilityMenu(sb: any): Promise<CapabilityRegistryRow[]> {
  const rows = await tryReadRegistry(sb);
  return rows ?? fallbackRows();
}

export async function loadCapabilityMenuVersion(sb: any): Promise<string> {
  const v = await tryReadMenuVersion(sb);
  return v ?? CAPABILITY_MENU_VERSION;
}

// ---------- Server functions ----------

export const listCapabilityMenu = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as unknown as AuthCtx;
    const sb = ctx.supabase as any;
    const rows = await loadCapabilityMenu(sb);
    const version = await loadCapabilityMenuVersion(sb);
    return { version, capabilities: rows };
  });

export const upsertCapability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => capabilityUpsertInput.parse(raw))
  .handler(async ({ context, data }) => {
    const ctx = context as unknown as AuthCtx;
    const actor = await assertAdminOrOperator(ctx);
    const sb = ctx.supabase as any;

    // Read current head row (if any) to determine next version.
    const { data: existing, error: readErr } = await sb
      .from("engine_capability_registry")
      .select("version")
      .eq("capability_id", data.capability_id)
      .order("version", { ascending: false })
      .limit(1);
    if (readErr && !isMissingTable(readErr)) {
      throw new Error(readErr.message);
    }
    if (isMissingTable(readErr)) {
      throw new Error(
        "Capability registry table not yet applied. Migration pending Tai review.",
      );
    }
    const currentVersion = Array.isArray(existing) && existing.length ? Number(existing[0].version) : 0;
    const nextVersion = data.bump_version || currentVersion === 0 ? currentVersion + 1 : currentVersion;

    const row = {
      capability_id: data.capability_id,
      version: nextVersion,
      label: data.label,
      category: data.category,
      execution_mode: data.execution_mode,
      description: data.description,
      created_by_email: actor,
      retired_at: null,
    };

    const { error: upErr } = await sb
      .from("engine_capability_registry")
      .upsert(row, { onConflict: "capability_id,version" });
    if (upErr) throw new Error(upErr.message);

    await bumpMenuVersion(sb);
    await insertEngineActivity(sb, {
      project_id: null,
      kind: "capability_registered",
      title: `Capability ${data.capability_id} v${nextVersion} registered`,
      body: data.label,
      severity: "info",
      actor_email: actor,
    });

    return { ok: true, capability_id: data.capability_id, version: nextVersion };
  });

export const retireCapability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => retireInput.parse(raw))
  .handler(async ({ context, data }) => {
    const ctx = context as unknown as AuthCtx;
    const actor = await assertAdminOrOperator(ctx);
    const sb = ctx.supabase as any;
    const { error } = await sb
      .from("engine_capability_registry")
      .update({ retired_at: new Date().toISOString() })
      .eq("capability_id", data.capability_id)
      .is("retired_at", null);
    if (error) {
      if (isMissingTable(error)) throw new Error("Capability registry table not yet applied.");
      throw new Error(error.message);
    }
    await bumpMenuVersion(sb);
    await insertEngineActivity(sb, {
      project_id: null,
      kind: "capability_retired",
      title: `Capability ${data.capability_id} retired`,
      body: data.reason ?? null,
      severity: "info",
      actor_email: actor,
    });
    return { ok: true };
  });

async function bumpMenuVersion(sb: any): Promise<void> {
  const now = new Date().toISOString();
  // Version format: yyyy.mm.dd.n — deterministic bumps within a day.
  const day = now.slice(0, 10).replace(/-/g, ".");
  const { data: cur } = await sb
    .from("engine_capability_menu_version")
    .select("version")
    .maybeSingle();
  const prev = (cur?.version as string | undefined) ?? "";
  let n = 1;
  if (prev.startsWith(day)) {
    const parts = prev.split(".");
    n = Number(parts[parts.length - 1] ?? 0) + 1;
    if (!Number.isFinite(n)) n = 1;
  }
  const next = `${day}.${n}`;
  const { error } = await sb
    .from("engine_capability_menu_version")
    .upsert({ singleton: true, version: next, updated_at: now }, { onConflict: "singleton" });
  if (error && !isMissingTable(error)) throw new Error(error.message);
}
