import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  renderPortalMagicLinkHtml,
  renderPortalMagicLinkText,
} from "@/lib/email-templates/portal-magic-link-html";
import {
  diagnoseAccessMismatch,
  generateCorrelationId,
  normalizeCorrelationId,
} from "@/lib/portal-access-diagnosis";

import { hasRoleForEmail, isAdminEmail } from "@/lib/ops/access";

// Sync allowlist fallback used for rendering (returned in `hasClientAccess`).
// The authoritative check is `assertOperator` which also consults the
// `user_roles` table via the `has_role_email` RPC.
function isOperator(email: string | null | undefined) {
  return isAdminEmail(email);
}

// Read the inbound correlation ID from the request or mint a fresh one.
// Used to trace one magic-link flow across every portal_access_events row.
async function currentCorrelationId(): Promise<string> {
  try {
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const inbound = normalizeCorrelationId(getRequestHeader("x-correlation-id"));
    if (inbound) return inbound;
  } catch {
    // request context unavailable (unit tests, module load)
  }
  return generateCorrelationId();
}


// Get-or-create an unsubscribe token for a recipient. Required by the
// transactional email sender.
async function ensureUnsubscribeToken(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseAdmin: any,
  email: string,
): Promise<string> {
  const { data: existing } = await supabaseAdmin
    .from("email_unsubscribe_tokens")
    .select("token")
    .ilike("email", email)
    .limit(1)
    .maybeSingle();
  if (existing?.token) return existing.token as string;
  const token = (globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random()}`) as string;
  await supabaseAdmin
    .from("email_unsubscribe_tokens")
    .insert({ token, email });
  return token;
}

// -------------------- Nav access check (client-facing) --------------------
export type PortalAccessStatus = "active" | "revoked" | "none";
export const checkPortalAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ status: PortalAccessStatus; hasAccess: boolean }> => {
    const email = context.claims?.email as string | undefined;
    if (!email) return { status: "none", hasAccess: false };

    // Check client_access + client_portal_permissions for any row (revoked or not).
    const [caRes, permRes] = await Promise.all([
      context.supabase
        .from("client_access")
        .select("id, revoked_at")
        .ilike("email", email),
      context.supabase
        .from("client_portal_permissions")
        .select("id, revoked_at")
        .ilike("email", email),
    ]);
    const rows = [...(caRes.data ?? []), ...(permRes.data ?? [])];
    if (rows.length === 0) return { status: "none", hasAccess: false };
    const anyActive = rows.some((r) => !r.revoked_at);
    if (anyActive) return { status: "active", hasAccess: true };
    return { status: "revoked", hasAccess: false };
  });

// -------------------- Magic link (public) --------------------

export const requestPortalMagicLink = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => z.object({ email: z.string().email() }).parse(raw))
  .handler(async ({ data }) => {
    const email = data.email.trim().toLowerCase();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Verify Stripe-confirmed portal access exists for this email.
    const [{ data: perm }, { data: legacy }] = await Promise.all([
      supabaseAdmin
        .from("client_portal_permissions")
        .select("id, revoked_at, email")
        .ilike("email", email)
        .is("revoked_at", null)
        .limit(1),
      supabaseAdmin
        .from("client_access")
        .select("id, revoked_at, email")
        .ilike("email", email)
        .is("revoked_at", null)
        .limit(1),
    ]);

    const hasAccess = (perm?.length ?? 0) > 0 || (legacy?.length ?? 0) > 0;
    // Always return a generic response — don't reveal whether email is known.
    if (!hasAccess) {
      console.log("[portal.magic-link] no access for", email);
      return { ok: true as const };
    }

    // Generate the magic link via Auth Admin (bypasses disable_signup for existing users).
    const redirectTo = (process.env.PUBLIC_SITE_URL ?? "https://trusttai.com") + "/portal";
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo },
    });

    if (linkError || !linkData?.properties?.action_link) {
      console.error("[portal.magic-link] generateLink failed", linkError);
      return { ok: true as const };
    }

    const actionLink = linkData.properties.action_link;
    const messageId = (globalThis.crypto?.randomUUID?.() ??
      `${Date.now()}-${Math.random()}`) as string;
    const unsubscribeToken = await ensureUnsubscribeToken(supabaseAdmin, email);

    const html = renderPortalMagicLinkHtml({ actionLink });
    const text = renderPortalMagicLinkText(actionLink);

    const { error: enqError } = await (
      supabaseAdmin.rpc as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ error: unknown }>
    )("enqueue_email", {
      queue_name: "transactional_emails",
      payload: {
        message_id: messageId,
        queued_at: new Date().toISOString(),
        to: email,
        from: "Trust Tai <hello@trusttai.com>",
        sender_domain: "notify.trusttai.com",
        subject: "Your Trust Tai portal sign-in link",
        html,
        text,
        label: "portal-magic-link",
        purpose: "transactional",
        idempotency_key: `portal-magic-${email}-${Date.now()}`,
        unsubscribe_token: unsubscribeToken,
      },
    });

    if (enqError) console.error("[portal.magic-link] enqueue failed", enqError);

    // Log activity if we can find the project.
    const { data: projects } = await supabaseAdmin
      .from("client_portal_projects")
      .select("id")
      .ilike("primary_email", email)
      .limit(1);
    const projectId = projects?.[0]?.id;
    if (projectId) {
      await (
        supabaseAdmin.rpc as unknown as (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ error: unknown }>
      )("log_client_portal_activity", {
        _project_id: projectId,
        _actor_type: "system",
        _actor_email: email,
        _event_type: "magic_link_sent",
        _summary: "Portal sign-in link requested",
        _client_visible: false,
        _metadata: {},
      });
    }

    return { ok: true as const };
  });

// -------------------- Access telemetry --------------------
async function logPortalAccessEvent(fields: {
  event_type: string;
  email?: string | null;
  user_id?: string | null;
  has_client_access?: boolean;
  has_permission?: boolean;
  has_project?: boolean;
  project_id?: string | null;
  route?: string | null;
  correlation_id?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const row = {
    event_type: fields.event_type,
    email: fields.email ?? null,
    user_id: fields.user_id ?? null,
    has_client_access: fields.has_client_access ?? null,
    has_permission: fields.has_permission ?? null,
    has_project: fields.has_project ?? null,
    project_id: fields.project_id ?? null,
    route: fields.route ?? null,
    correlation_id: fields.correlation_id ?? null,
    metadata: fields.metadata ?? {},
  };
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let userAgent: string | null = null;
    try {
      const { getRequestHeader } = await import("@tanstack/react-start/server");
      userAgent = getRequestHeader("user-agent") ?? null;
    } catch {
      // request context unavailable
    }
    const { error } = await supabaseAdmin.from("portal_access_events").insert({
      ...row,
      user_agent: userAgent,
      metadata: row.metadata as never,
    });
    if (error) throw error;
  } catch (err) {
    // Never break the login flow if telemetry is down. Emit a structured line
    // so ops can still recover the event from platform logs.
    try {
      console.error(
        "[portal.telemetry.fallback] " +
          JSON.stringify({
            ...row,
            error: err instanceof Error ? err.message : String(err),
            logged_at: new Date().toISOString(),
          }),
      );
    } catch {
      // Absolute last resort: swallow. The user's flow must proceed.
    }
  }
}

// -------------------- Client-facing context --------------------
export const getPortalContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const correlationId = await currentCorrelationId();
    const email = context.claims?.email as string | undefined;
    const userId = context.userId as string | undefined;
    if (!email) {
      await logPortalAccessEvent({
        event_type: "missing_email_claim",
        user_id: userId ?? null,
        route: "getPortalContext",
        correlation_id: correlationId,
      });
      return { hasAccess: false as const, correlationId };
    }

    const { data: project } = await context.supabase
      .from("client_portal_projects")
      .select("*")
      .ilike("primary_email", email)
      .maybeSingle();

    if (!project) {
      // Diagnose: is there a client_access or permission row for this email?
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const [caRes, permRes] = await Promise.all([
        supabaseAdmin
          .from("client_access")
          .select("id, revoked_at, stripe_session_id")
          .ilike("email", email),
        supabaseAdmin
          .from("client_portal_permissions")
          .select("id, revoked_at, project_id")
          .ilike("email", email),
      ]);
      const diagnosis = diagnoseAccessMismatch({
        clientAccess: caRes.data ?? [],
        permissions: permRes.data ?? [],
      });
      await logPortalAccessEvent({
        event_type: diagnosis.event_type,
        email,
        user_id: userId ?? null,
        has_client_access: diagnosis.has_client_access,
        has_permission: diagnosis.has_permission,
        has_project: false,
        route: "getPortalContext",
        correlation_id: correlationId,
        metadata: diagnosis.metadata,
      });
      return { hasAccess: false as const, email, correlationId };
    }

    // Sync client_access user_id linkage
    await context.supabase.rpc("sync_client_access_user").throwOnError();

    const [onboardingRes, roadmapRes, billingRes] = await Promise.all([
      context.supabase
        .from("client_portal_onboarding")
        .select("*")
        .eq("project_id", project.id)
        .maybeSingle(),
      context.supabase
        .from("client_portal_roadmaps")
        .select("*")
        .eq("project_id", project.id)
        .not("approved_at", "is", null)
        .order("approved_at", { ascending: false })
        .limit(1),
      context.supabase
        .from("client_portal_billing")
        .select("*")
        .eq("project_id", project.id)
        .order("created_at", { ascending: false })
        .limit(3),
    ]);

    return {
      hasAccess: true as const,
      email,
      project,
      onboarding: onboardingRes.data,
      approvedRoadmap: roadmapRes.data?.[0] ?? null,
      billing: billingRes.data ?? [],
      isOperator: isOperator(email),
      correlationId,
    };
  });

// -------------------- Admin (operator) --------------------
async function assertOperator(context: { claims?: { email?: string }; supabase: unknown }) {
  const email = context.claims?.email;
  if (!email) throw new Error("Forbidden");
  const supa = context.supabase as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  };
  const ok = isOperator(email) || (await hasRoleForEmail(supa, email, "admin"));
  if (!ok) throw new Error("Forbidden");
  return email;
}

export const adminListPortals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertOperator(context);
    const { data, error } = await context.supabase
      .from("client_portal_projects")
      .select(
        "id, primary_email, contact_name, company_name, package_name, portal_status, current_phase, next_milestone, next_milestone_due_at, purchase_date, last_client_activity_at, updated_at",
      )
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return { projects: data ?? [] };
  });

export const adminGetPortal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ context, data }) => {
    await assertOperator(context);
    const [proj, onboarding, roadmaps, activity, perms, billing] = await Promise.all([
      context.supabase.from("client_portal_projects").select("*").eq("id", data.id).maybeSingle(),
      context.supabase
        .from("client_portal_onboarding")
        .select("*")
        .eq("project_id", data.id)
        .maybeSingle(),
      context.supabase
        .from("client_portal_roadmaps")
        .select("id, title, version_label, status, approved_at, created_at")
        .eq("project_id", data.id)
        .order("created_at", { ascending: false }),
      context.supabase
        .from("client_portal_activity")
        .select("*")
        .eq("project_id", data.id)
        .order("created_at", { ascending: false })
        .limit(30),
      context.supabase.from("client_portal_permissions").select("*").eq("project_id", data.id),
      context.supabase
        .from("client_portal_billing")
        .select("*")
        .eq("project_id", data.id)
        .order("created_at", { ascending: false }),
    ]);

    return {
      project: proj.data,
      onboarding: onboarding.data,
      roadmaps: roadmaps.data ?? [],
      activity: activity.data ?? [],
      permissions: perms.data ?? [],
      billing: billing.data ?? [],
    };
  });

const AdminUpdateInput = z.object({
  id: z.string().uuid(),
  portal_status: z.string().optional(),
  current_phase: z.string().optional(),
  next_milestone: z.string().nullish(),
  next_milestone_due_at: z.string().nullish(),
  approved_roadmap_id: z.string().uuid().nullish(),
  scheduling_url: z.string().nullish(),
});

export const adminUpdatePortal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => AdminUpdateInput.parse(raw))
  .handler(async ({ context, data }) => {
    const email = await assertOperator(context);
    const patch: Record<string, any> = {};
    for (const [k, v] of Object.entries(data)) {
      if (k === "id") continue;
      if (v !== undefined) patch[k] = v;
    }
    if (Object.keys(patch).length === 0) return { ok: true as const };
    patch.updated_at = new Date().toISOString();

    const { error } = await (
      context.supabase.from("client_portal_projects") as unknown as {
        update: (v: Record<string, unknown>) => {
          eq: (k: string, v: string) => Promise<{ error: unknown }>;
        };
      }
    )
      .update(patch)
      .eq("id", data.id);
    if (error) throw error as Error;

    await context.supabase.rpc("log_client_portal_activity", {
      _project_id: data.id,
      _actor_type: "tai",
      _actor_email: email,
      _event_type: "portal_updated",
      _summary: `Operator updated portal (${Object.keys(patch)
        .filter((k) => k !== "updated_at")
        .join(", ")})`,
      _client_visible: false,
      _metadata: patch as unknown as never,
    });

    return { ok: true as const };
  });

// -------------------- Roadmap documents (client-facing) --------------------
export type PortalRoadmapDoc = {
  id: string;
  title: string;
  body_md: string | null;
  file_url: string | null;
  published_at: string | null;
  updated_at: string | null;
};

export const getPortalRoadmapDocs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const email = context.claims?.email as string | undefined;
    if (!email) return { docs: [] as PortalRoadmapDoc[], revoked: false as const };

    const { data: access } = await context.supabase
      .from("client_access")
      .select("id, revoked_at")
      .ilike("email", email)
      .is("revoked_at", null)
      .limit(1);
    if (!access || access.length === 0) {
      return { docs: [] as PortalRoadmapDoc[], revoked: true as const };
    }

    const { data, error } = await context.supabase
      .from("roadmap_documents")
      .select("id, title, body_md, file_url, published_at, updated_at")
      .ilike("client_email", email)
      .order("published_at", { ascending: false });
    if (error) throw error;
    return { docs: (data ?? []) as PortalRoadmapDoc[], revoked: false as const };
  });

// -------------------- Resend welcome/magic link (client self-serve) --------------------
async function sendWelcomeMagicLink(email: string) {
  const normalized = email.trim().toLowerCase();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Require Stripe-confirmed access (client_access row with a stripe_session_id, not revoked).
  const { data: access } = await supabaseAdmin
    .from("client_access")
    .select("id, revoked_at, stripe_session_id")
    .ilike("email", normalized)
    .is("revoked_at", null)
    .limit(1);

  const row = access?.[0];
  if (!row || !row.stripe_session_id) {
    return { ok: false as const, reason: "no_confirmed_access" as const };
  }

  const redirectTo = (process.env.PUBLIC_SITE_URL ?? "https://trusttai.com") + "/portal";
  const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email: normalized,
    options: { redirectTo },
  });
  if (linkError || !linkData?.properties?.action_link) {
    console.error("[portal.resend-welcome] generateLink failed", linkError);
    return { ok: false as const, reason: "generate_failed" as const };
  }

  const actionLink = linkData.properties.action_link;
  const messageId = (globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random()}`) as string;
  const unsubscribeToken = await ensureUnsubscribeToken(supabaseAdmin, normalized);

  const intro = "Here is a fresh secure link to enter your Trust Tai client portal. It expires in 60 minutes.";
  const html = renderPortalMagicLinkHtml({ actionLink, intro });
  const text = renderPortalMagicLinkText(actionLink, intro);

  await (
    supabaseAdmin.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ error: unknown }>
  )("enqueue_email", {
    queue_name: "transactional_emails",
    payload: {
      message_id: messageId,
      queued_at: new Date().toISOString(),
      to: normalized,
      from: "Trust Tai <hello@trusttai.com>",
      sender_domain: "notify.trusttai.com",
      subject: "Your Trust Tai portal sign-in link",
      html,
      text,
      label: "portal-welcome-resend",
      purpose: "transactional",
      idempotency_key: `portal-welcome-${normalized}-${Date.now()}`,
      unsubscribe_token: unsubscribeToken,
    },
  });

  const { data: projects } = await supabaseAdmin
    .from("client_portal_projects")
    .select("id")
    .ilike("primary_email", normalized)
    .limit(1);
  const projectId = projects?.[0]?.id;
  if (projectId) {
    await (
      supabaseAdmin.rpc as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ error: unknown }>
    )("log_client_portal_activity", {
      _project_id: projectId,
      _actor_type: "system",
      _actor_email: normalized,
      _event_type: "welcome_resent",
      _summary: "Welcome / sign-in link re-sent",
      _client_visible: false,
      _metadata: {},
    });
  }

  return { ok: true as const };
}

export const resendPortalWelcome = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const email = context.claims?.email as string | undefined;
    if (!email) return { ok: false as const, reason: "no_session" as const };
    return sendWelcomeMagicLink(email);
  });

export const adminResendPortalWelcome = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ email: z.string().email(), project_id: z.string().uuid().optional() }).parse(raw),
  )
  .handler(async ({ context, data }) => {
    await assertOperator(context);
    return sendWelcomeMagicLink(data.email);
  });

// -------------------- Admin: revoke / restore client access --------------------
export const adminSetClientAccessRevoked = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        email: z.string().email(),
        revoked: z.boolean(),
        project_id: z.string().uuid().optional(),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }) => {
    const operatorEmail = await assertOperator(context);
    const email = data.email.trim().toLowerCase();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date().toISOString();
    const revokedValue = data.revoked ? now : null;

    const [caRes, permRes] = await Promise.all([
      (
        supabaseAdmin.from("client_access") as unknown as {
          update: (v: Record<string, unknown>) => {
            ilike: (k: string, v: string) => Promise<{ error: unknown }>;
          };
        }
      )
        .update({ revoked_at: revokedValue, updated_at: now })
        .ilike("email", email),
      (
        supabaseAdmin.from("client_portal_permissions") as unknown as {
          update: (v: Record<string, unknown>) => {
            ilike: (k: string, v: string) => Promise<{ error: unknown }>;
          };
        }
      )
        .update({ revoked_at: revokedValue })
        .ilike("email", email),
    ]);
    if (caRes.error) throw caRes.error as Error;
    if (permRes.error) throw permRes.error as Error;

    // If revoking, sign out all existing sessions for this user so the
    // active browser session cannot continue past its current token.
    if (data.revoked) {
      try {
        const { data: userLookup } = await supabaseAdmin.auth.admin.listUsers();
        const target = userLookup?.users?.find((u) => (u.email ?? "").toLowerCase() === email);
        if (target) await supabaseAdmin.auth.admin.signOut(target.id);
      } catch (e) {
        console.warn("[portal.revoke] signOut failed", e);
      }
    }

    if (data.project_id) {
      await (
        supabaseAdmin.rpc as unknown as (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ error: unknown }>
      )("log_client_portal_activity", {
        _project_id: data.project_id,
        _actor_type: "tai",
        _actor_email: operatorEmail,
        _event_type: data.revoked ? "access_revoked" : "access_restored",
        _summary: data.revoked ? `Access revoked for ${email}` : `Access restored for ${email}`,
        _client_visible: false,
        _metadata: {},
      });
    }

    return { ok: true as const, revoked_at: revokedValue };
  });

// -------------------- Client profile update --------------------
const PortalProfileInput = z.object({
  contact_name: z.string().trim().min(1, "Name is required").max(120),
  company_name: z.string().trim().max(160).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
});

export const updatePortalProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => PortalProfileInput.parse(raw))
  .handler(async ({ context, data }) => {
    const email = context.claims?.email as string | undefined;
    if (!email) throw new Error("No session");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const patch = {
      contact_name: data.contact_name.trim(),
      company_name: data.company_name?.trim() || null,
      updated_at: new Date().toISOString(),
    };

    const { data: proj, error } = await (
      supabaseAdmin.from("client_portal_projects") as unknown as {
        update: (v: Record<string, unknown>) => {
          ilike: (
            k: string,
            v: string,
          ) => {
            select: (
              cols: string,
            ) => Promise<{ data: Array<Record<string, unknown>> | null; error: unknown }>;
          };
        };
      }
    )
      .update(patch)
      .ilike("primary_email", email)
      .select("id, contact_name, company_name");
    if (error) throw error as Error;
    const row = (proj && proj.length > 0
      ? proj[0]
      : { id: "", contact_name: patch.contact_name, company_name: patch.company_name }) as {
      id: string;
      contact_name: string | null;
      company_name: string | null;
    };

    // Mirror name into client_access.metadata for consistency across dashboards.
    try {
      await (
        supabaseAdmin.from("client_access") as unknown as {
          update: (v: Record<string, unknown>) => {
            ilike: (k: string, v: string) => Promise<{ error: unknown }>;
          };
        }
      )
        .update({
          metadata: { contact_name: patch.contact_name, company_name: patch.company_name },
          updated_at: patch.updated_at,
        })
        .ilike("email", email);
    } catch (e) {
      console.warn("[portal.profile] client_access mirror failed", e);
    }

    return { ok: true as const, profile: row };
  });

// -------------------- Roadmap acknowledge (client-facing) --------------------
/**
 * Record a client-side event against their approved portal roadmap and mirror
 * it back into the internal Delivery Room so Tai can see reception state.
 * Supported events:
 *   - "viewed"        (idempotent — only writes first time)
 *   - "downloaded"    (records latest timestamp)
 *   - "acknowledged"  (records first ack + marks delivery item complete)
 */
export const recordPortalRoadmapEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        roadmapId: z.string().uuid(),
        event: z.enum(["viewed", "downloaded", "acknowledged"]),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const email = (context.claims?.email as string | undefined) ?? undefined;
    if (!email) return { error: "No email on account" } as const;

    // Load the portal roadmap and ensure the caller has permission to see it.
    const { data: cpr, error: cprErr } = await context.supabase
      .from("client_portal_roadmaps")
      .select("id, project_id, acknowledged_at, source_version_id")
      .eq("id", data.roadmapId)
      .maybeSingle();
    if (cprErr || !cpr) return { error: "Roadmap not found or not visible" } as const;

    const nowIso = new Date().toISOString();
    const patch: Record<string, any> = {};
    if (data.event === "acknowledged" && !cpr.acknowledged_at) {
      patch.acknowledged_at = nowIso;
      patch.acknowledged_by_email = email;
    }
    if (Object.keys(patch).length) {
      await context.supabase.from("client_portal_roadmaps").update(patch as never).eq("id", cpr.id);
    }

    // Client-visible activity in the portal timeline.
    const summaryByEvent: Record<string, string> = {
      viewed: "You opened your approved roadmap.",
      downloaded: "You downloaded your approved roadmap.",
      acknowledged: "You acknowledged your approved roadmap.",
    };
    await context.supabase.rpc("log_client_portal_activity", {
      _project_id: cpr.project_id,
      _actor_type: "client",
      _actor_email: email,
      _event_type: `roadmap_${data.event}`,
      _summary: summaryByEvent[data.event],
      _client_visible: true,
      _metadata: { portal_roadmap_id: cpr.id } as unknown as never,
    });

    // Mirror into the internal Delivery Room via admin client. This is a
    // trusted, verified caller (owner of the portal roadmap), and the write
    // targets the internal engine tables that clients cannot reach directly.
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: items } = await supabaseAdmin
        .from("engine_delivery_items")
        .select("id,status")
        .eq("client_portal_roadmap_id", cpr.id);
      const nextStatus =
        data.event === "acknowledged"
          ? "client_acknowledged"
          : data.event === "viewed"
            ? "client_viewed"
            : null; // "downloaded" is a timestamp bump only

      for (const it of (items ?? []) as Array<{ id: string; status: string }>) {
        const update: Record<string, any> = {};
        if (data.event === "viewed") update.client_viewed_at = nowIso;
        if (data.event === "downloaded") update.client_downloaded_at = nowIso;
        if (data.event === "acknowledged") {
          update.client_acknowledged_at = nowIso;
          update.client_acknowledged_by_email = email;
        }
        if (nextStatus && it.status !== nextStatus && it.status !== "client_acknowledged") {
          update.status = nextStatus;
          update.last_action = `${nextStatus.replace(/_/g, " ")} · ${new Date().toLocaleString()}`;
        }
        if (Object.keys(update).length) {
          await supabaseAdmin.from("engine_delivery_items").update(update as never).eq("id", it.id);
        }
        if (nextStatus && it.status !== nextStatus) {
          await supabaseAdmin.from("engine_delivery_history").insert({
            delivery_id: it.id,
            from_status: it.status,
            to_status: nextStatus,
            note: `Client ${data.event}`,
            actor: email,
          });
        }
      }
    } catch (e) {
      console.warn("[portal.roadmap-event] delivery mirror failed", e);
    }

    return { ok: true as const };
  });
