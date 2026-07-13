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

import { hasRoleForEmail, isAdminEmail, isOperatorEmail } from "@/lib/ops/access";

// Sync allowlist fallback used for rendering (returned in `hasClientAccess`).
// The authoritative check is `assertOperator` which also consults the
// `user_roles` table via the `has_role_email` RPC. Mirror the same union
// used by `checkPortalAccess` so DB-only operators aren't ignored.
function isOperator(email: string | null | undefined) {
  return isAdminEmail(email) || isOperatorEmail(email);
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
// transactional email sender. Uses an atomic upsert (S19 audit fix) so
// two concurrent sends don't race and insert duplicate rows.
async function ensureUnsubscribeToken(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseAdmin: any,
  email: string,
): Promise<string> {
  const normalized = email.toLowerCase();
  const candidate = (globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random()}`) as string;
  const { data, error } = await supabaseAdmin
    .from("email_unsubscribe_tokens")
    .upsert({ email: normalized, token: candidate }, { onConflict: "email", ignoreDuplicates: true })
    .select("token")
    .maybeSingle();
  if (!error && data?.token) return data.token as string;
  // Row already existed (ignoreDuplicates returned nothing) — read it back.
  const { data: existing } = await supabaseAdmin
    .from("email_unsubscribe_tokens")
    .select("token")
    .ilike("email", normalized)
    .limit(1)
    .maybeSingle();
  return (existing?.token as string) ?? candidate;
}

// -------------------- Nav access check (client-facing) --------------------
export type PortalAccessStatus = "active" | "revoked" | "none";
export const checkPortalAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ status: PortalAccessStatus; hasAccess: boolean; isAdmin: boolean; email: string | null }> => {
    const email = (context.claims?.email as string | undefined) ?? null;
    const isAdmin = isAdminEmail(email);
    if (!email) return { status: "none", hasAccess: false, isAdmin: false, email: null };

    // Admin / operator staff always have portal access (they are not clients
    // themselves, but must be able to view any client-facing surface).
    if (isAdmin || isOperatorEmail(email)) {
      return { status: "active", hasAccess: true, isAdmin, email };
    }

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
    if (rows.length === 0) return { status: "none", hasAccess: false, isAdmin, email };
    const anyActive = rows.some((r) => !r.revoked_at);
    if (anyActive) return { status: "active", hasAccess: true, isAdmin, email };
    return { status: "revoked", hasAccess: false, isAdmin, email };
  });


// -------------------- Magic link (public) --------------------

export type MagicLinkStatus =
  | "sent"
  | "no_access"
  | "link_failed"
  | "suppressed"
  | "enqueue_failed";

export const requestPortalMagicLink = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => z.object({ email: z.string().email() }).parse(raw))
  .handler(async ({ data }): Promise<{ ok: true; status: MagicLinkStatus }> => {
    const email = data.email.trim().toLowerCase();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const t0 = Date.now();
    const log = (msg: string, extra?: Record<string, unknown>) =>
      console.log(
        `[portal.magic-link] ${msg}`,
        JSON.stringify({ email, elapsedMs: Date.now() - t0, ...(extra ?? {}) }),
      );

    // Verify Stripe-confirmed portal access OR an admin/operator role grant
    // exists for this email. Staff granted via user_roles don't necessarily
    // have a client_portal_permissions row, but they still need to sign in.
    const [{ data: perm }, { data: legacy }, { data: staffRole }] = await Promise.all([
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
      supabaseAdmin
        .from("user_roles")
        .select("id, role, email")
        .ilike("email", email)
        .in("role", ["admin", "operator"])
        .limit(1),
    ]);

    const accessSources = {
      client_portal_permissions: perm?.length ?? 0,
      client_access: legacy?.length ?? 0,
      user_roles_admin_operator: staffRole?.length ?? 0,
      staff_allowlist: isAdminEmail(email) || isOperatorEmail(email) ? 1 : 0,
    };
    const hasAccess =
      accessSources.client_portal_permissions > 0 ||
      accessSources.client_access > 0 ||
      accessSources.user_roles_admin_operator > 0 ||
      accessSources.staff_allowlist > 0;

    if (!hasAccess) {
      log("no_access — email has no portal permission or staff role", {
        accessSources,
      });
      await supabaseAdmin.from("email_send_log").insert({
        message_id: null,
        template_name: "portal-magic-link",
        recipient_email: email,
        status: "failed",
        error_message: "No active portal permission, admin role, operator role, or staff allowlist match for this email.",
        metadata: { source: "portal_login", accessSources },
      });
      return { ok: true, status: "no_access" };
    }
    log("access granted", { accessSources });

    // Ensure authorized portal/staff emails have an auth identity before generating a link.
    // Staff grants can be email-only, so this creates the identity on first sign-in request.
    const { data: createdUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { source: "portal_magic_link" },
    });
    if (createUserError) {
      const alreadyExists = /already|registered|exists/i.test(createUserError.message ?? "");
      log(alreadyExists ? "auth user already exists" : "auth user create skipped with error", {
        code: createUserError.code,
        message: createUserError.message,
        status: createUserError.status,
      });
      if (!alreadyExists) {
        // Continue to generateLink: if the user exists despite the create error, it can still succeed.
        // If not, the link_failed branch below gives a clear UI error and durable server log.
      }
    } else if (createdUser?.user?.id) {
      log("auth user created", { userId: createdUser.user.id });
      await supabaseAdmin
        .from("user_roles")
        .update({ user_id: createdUser.user.id })
        .ilike("email", email)
        .is("user_id", null);
    }

    // Generate the magic link via Auth Admin.
    const redirectTo = (process.env.PUBLIC_SITE_URL ?? "https://trusttai.com") + "/portal";
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo },
    });

    if (linkError || !linkData?.properties?.action_link) {
      console.error("[portal.magic-link] generateLink failed", {
        email,
        code: linkError?.code,
        message: linkError?.message,
        status: linkError?.status,
      });
      await supabaseAdmin.from("email_send_log").insert({
        message_id: null,
        template_name: "portal-magic-link",
        recipient_email: email,
        status: "failed",
        error_message: `Magic link generation failed${linkError?.message ? `: ${linkError.message}` : ""}`,
        metadata: { source: "portal_login", accessSources },
      });
      return { ok: true, status: "link_failed" };
    }
    log("magic link generated");

    const actionLink = linkData.properties.action_link;
    const messageId = (globalThis.crypto?.randomUUID?.() ??
      `${Date.now()}-${Math.random()}`) as string;

    const { data: suppressed, error: suppressionError } = await supabaseAdmin
      .from("suppressed_emails")
      .select("id, reason")
      .ilike("email", email)
      .limit(1)
      .maybeSingle();
    if (suppressionError) {
      console.warn("[portal.magic-link] suppression check failed", {
        email,
        messageId,
        error: suppressionError.message,
      });
    }
    if (suppressed) {
      await supabaseAdmin.from("email_send_log").insert({
        message_id: messageId,
        template_name: "portal-magic-link",
        recipient_email: email,
        status: "suppressed",
        error_message: `Recipient is suppressed${suppressed.reason ? `: ${suppressed.reason}` : ""}`,
        metadata: { source: "portal_login", accessSources },
      });
      log("email suppressed — not enqueued", { messageId, reason: suppressed.reason });
      return { ok: true, status: "suppressed" };
    }

    const unsubscribeToken = await ensureUnsubscribeToken(supabaseAdmin, email);

    const html = renderPortalMagicLinkHtml({ actionLink });
    const text = renderPortalMagicLinkText(actionLink);

    await supabaseAdmin.from("email_send_log").insert({
      message_id: messageId,
      template_name: "portal-magic-link",
      recipient_email: email,
      status: "pending",
      metadata: { source: "portal_login", accessSources },
    });

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

    if (enqError) {
      console.error("[portal.magic-link] enqueue_email failed", {
        email,
        messageId,
        error: enqError,
      });
      await supabaseAdmin.from("email_send_log").insert({
        message_id: messageId,
        template_name: "portal-magic-link",
        recipient_email: email,
        status: "failed",
        error_message: enqError instanceof Error ? enqError.message : JSON.stringify(enqError),
        metadata: { source: "portal_login", accessSources },
      });
      return { ok: true, status: "enqueue_failed" };
    }
    log("enqueued to transactional_emails", { messageId });

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
        _metadata: { messageId },
      });
    }

    return { ok: true, status: "sent" };
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

    // Pillar 8: explicit safe-column projection — never select "*" for
    // client-visible project reads. Internal fields (owner_email, Stripe
    // identifiers, intake_submission_id, approved_roadmap_id, metadata)
    // MUST NOT reach the browser. Mirrors the portal_project_v whitelist
    // plus purchased_package, which the portal UI reads as a fallback.
    const { data: project } = await context.supabase
      .from("client_portal_projects")
      .select(
        "id, primary_email, contact_name, company_name, package_name, purchased_package, portal_status, payment_status, current_phase, next_milestone, next_milestone_due_at, scheduling_url, purchase_date, last_client_activity_at, access_granted_at, access_revoked_at, created_at, updated_at",
      )
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
      // Status-level columns only — the onboarding wizard loads its full
      // saved answers through getPortalOnboarding with its own membership
      // check; the context blob only needs progress/status.
      context.supabase
        .from("client_portal_onboarding")
        .select(
          "id, project_id, status, current_step, completion_percent, submitted_at, last_saved_at, created_at, updated_at",
        )
        .eq("project_id", project.id)
        .maybeSingle(),
      context.supabase
        .from("client_portal_roadmaps")
        // Pillar 8: explicit safe-column projection — never select "*" for
        // client-visible roadmap reads. Internal fields (metadata,
        // approved_roadmap_version_id, published_by, engine linkage,
        // supporting_notes, acknowledged_by_email) MUST NOT reach the browser.
        .select(
          "id, project_id, status, title, version_label, published_at, approved_at, acknowledged_at, roadmap_data:client_safe_canvas",
        )
        .eq("project_id", project.id)
        // Phase 3 v4: portal only sees the single live 'published' snapshot.
        // Legacy 'approved'/'delivered' rows were backfilled to
        // 'published' or 'superseded'; superseded/retracted never render.
        .eq("status", "published")
        .not("published_at", "is", null)
        .order("published_at", { ascending: false })
        .limit(1),
      // No Stripe identifiers or metadata to the browser — receipt/invoice
      // URLs and display fields only.
      context.supabase
        .from("client_portal_billing")
        .select(
          "id, project_id, amount_total, currency, payment_status, purchased_package, receipt_url, invoice_url, payment_confirmed_at, next_payment_at, created_at",
        )
        .eq("project_id", project.id)
        .order("created_at", { ascending: false })
        .limit(3),
    ]);
    const roadmapRow = (roadmapRes.data?.[0] ?? null) as {
      id: string;
      project_id: string;
      status: string;
      title: string;
      version_label: string | null;
      published_at: string | null;
      approved_at: string | null;
      acknowledged_at: string | null;
      roadmap_data: unknown;
    } | null;
    const approvedRoadmap = roadmapRow
      ? {
          id: roadmapRow.id,
          project_id: roadmapRow.project_id,
          status: roadmapRow.status,
          title: roadmapRow.title,
          subtitle: null as string | null,
          roadmap_data: roadmapRow.roadmap_data ?? null,
          published_at: roadmapRow.published_at,
          delivered_at:
            roadmapRow.status === "delivered"
              ? (roadmapRow.published_at ?? roadmapRow.approved_at)
              : null,
          version_label: roadmapRow.version_label,
          client_acknowledged: Boolean(roadmapRow.acknowledged_at),
          acknowledged_at: roadmapRow.acknowledged_at,
          // Display date retained for the current portal home card.
          approved_at: roadmapRow.approved_at ?? roadmapRow.published_at,
        }
      : null;

    return {
      hasAccess: true as const,
      email,
      project,
      onboarding: onboardingRes.data,
      approvedRoadmap,
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
  // Raw structured fields consumed by the interactive journey canvas.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw: Record<string, any> | null;
  project: {
    point_a: string | null;
    point_b: string | null;
  } | null;
};

export const getPortalRoadmapDocs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const email = context.claims?.email as string | undefined;
    if (!email) return { docs: [] as PortalRoadmapDoc[], revoked: false as const };

    // Project-scoped access: any active client_portal_permissions grant is enough.
    // The legacy client_access / roadmap_documents pause flag is no longer consulted.
    const { data: perms } = await context.supabase
      .from("client_portal_permissions")
      .select("project_id")
      .ilike("email", email)
      .is("revoked_at", null);
    const projectIds = (perms ?? []).map((p) => p.project_id).filter(Boolean);
    if (projectIds.length === 0) {
      return { docs: [] as PortalRoadmapDoc[], revoked: false as const };
    }

    // IMPORTANT: This SELECT is the client-visible surface for roadmap payloads.
    // NEVER add internal-engine columns here (supporting_notes, approved_roadmap_version_id,
    // review flags, agent costs, cost_cents, ai_confidence, internal notes, etc.).
    // Every column below is intentionally client-safe.
    const { data, error } = await context.supabase
      .from("client_portal_roadmaps")
      .select(
        "id, title, executive_summary, current_diagnosis, strategic_priorities, sequence_30_60_90, risks_dependencies, recommended_next_move, current_focus, owner_name, next_milestone, next_meeting_at, share_url, approved_at, published_at, updated_at, version_label, client_safe_canvas",
      )
      .in("project_id", projectIds)
      .in("status", ["approved", "delivered"])
      .not("published_at", "is", null)
      .order("published_at", { ascending: false });
    if (error) throw error;

    const docs: PortalRoadmapDoc[] = (data ?? []).map((r: any) => {
      // Whitelisted raw projection — no internal IDs, no share URL, no ack timestamps.
      const safeRaw = {
        id: r.id,
        title: r.title,
        version_label: r.version_label ?? null,
        executive_summary: r.executive_summary ?? null,
        current_diagnosis: r.current_diagnosis ?? null,
        strategic_priorities: r.strategic_priorities ?? null,
        sequence_30_60_90: r.sequence_30_60_90 ?? null,
        risks_dependencies: r.risks_dependencies ?? null,
        recommended_next_move: r.recommended_next_move ?? null,
        current_focus: r.current_focus ?? null,
        owner_name: r.owner_name ?? null,
        next_milestone: r.next_milestone ?? null,
        next_meeting_at: r.next_meeting_at ?? null,
        approved_at: r.approved_at ?? null,
        updated_at: r.updated_at ?? null,
        client_safe_canvas: r.client_safe_canvas ?? null,
      };
      // Bridge: expose engine-authored Point A / Point B via the published
      // snapshot only. The portal never reads engine_projects directly — the
      // publish pipeline stamps these into client_safe_canvas.pointA/pointB.
      const canvas =
        r.client_safe_canvas && typeof r.client_safe_canvas === "object" ? r.client_safe_canvas : null;
      const project =
        canvas && (canvas.pointA?.detail || canvas.pointB?.detail)
          ? {
              point_a: (canvas.pointA?.detail as string | null) ?? null,
              point_b: (canvas.pointB?.detail as string | null) ?? null,
            }
          : null;
      return {
        id: r.id,
        title: r.version_label ? `${r.title} — ${r.version_label}` : r.title,
        body_md: renderRoadmapMarkdown(r),
        file_url: r.share_url ?? null,
        published_at: r.published_at ?? null,
        updated_at: r.updated_at,
        raw: safeRaw,
        project,
      };
    });
    return { docs, revoked: false as const };
  });

function renderRoadmapMarkdown(r: any): string {
  const parts: string[] = [];
  if (r.executive_summary) parts.push(String(r.executive_summary).trim());
  if (r.current_diagnosis) parts.push(`## Diagnosis\n${String(r.current_diagnosis).trim()}`);

  const priorities = Array.isArray(r.strategic_priorities) ? r.strategic_priorities : [];
  if (priorities.length) {
    const lines = priorities
      .map((p: any, i: number) => {
        if (p && typeof p === "object") {
          const title = p.title ?? p.name ?? `Priority ${i + 1}`;
          const detail = p.detail ?? p.description ?? "";
          return detail ? `${i + 1}. **${title}** — ${detail}` : `${i + 1}. **${title}**`;
        }
        return `${i + 1}. ${String(p)}`;
      })
      .join("\n");
    parts.push(`## Strategic Priorities\n${lines}`);
  }

  const seq = r.sequence_30_60_90 && typeof r.sequence_30_60_90 === "object" ? r.sequence_30_60_90 : null;
  if (seq && (seq["30"] || seq["60"] || seq["90"])) {
    const bucket = (k: string) => {
      const v = seq[k];
      if (!v) return null;
      const items = Array.isArray(v) ? v : [String(v)];
      return `- **${k} days**: ${items.join(" · ")}`;
    };
    const lines = ["30", "60", "90"].map(bucket).filter(Boolean).join("\n");
    if (lines) parts.push(`## 30 / 60 / 90\n${lines}`);
  }

  const risks = Array.isArray(r.risks_dependencies) ? r.risks_dependencies : [];
  if (risks.length) {
    const lines = risks
      .map((rd: any) => {
        if (rd && typeof rd === "object") {
          const risk = rd.risk ?? rd.title ?? "";
          const mit = rd.mitigation ?? rd.detail ?? "";
          return mit ? `- **${risk}** — ${mit}` : `- ${risk}`;
        }
        return `- ${String(rd)}`;
      })
      .join("\n");
    parts.push(`## Risks & Dependencies\n${lines}`);
  }

  if (r.recommended_next_move) {
    parts.push(`## Recommended next move\n${String(r.recommended_next_move).trim()}`);
  }

  return parts.join("\n\n");
}


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
      .select("id, project_id, acknowledged_at, approved_roadmap_version_id")
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
      // RLS on client_portal_roadmaps only grants SELECT to clients; the ack
      // update must run through the admin client. The caller was verified as
      // an authorized viewer by the SELECT above (RLS-checked).
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: updRows, error: updErr } = await supabaseAdmin
        .from("client_portal_roadmaps")
        .update(patch as never)
        .eq("id", cpr.id)
        .select("id");
      if (updErr) return { error: updErr.message } as const;
      if (!updRows || updRows.length === 0) {
        return { error: "Acknowledgment did not persist (0 rows updated)" } as const;
      }
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

/**
 * Client marks an individual milestone as reviewed. Records a client-visible
 * activity referencing the roadmap and milestone so Tai can see progress in
 * the internal timeline. Does not mutate the roadmap row itself.
 */
export const recordPortalMilestoneReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        roadmapId: z.string().uuid(),
        milestoneSlug: z.string().min(1).max(120),
        milestoneTitle: z.string().min(1).max(240),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const email = (context.claims?.email as string | undefined) ?? undefined;
    if (!email) return { error: "No email on account" } as const;

    // Access check: caller must be able to SELECT the roadmap (RLS-checked).
    const { data: cpr, error: cprErr } = await context.supabase
      .from("client_portal_roadmaps")
      .select("id, project_id")
      .eq("id", data.roadmapId)
      .maybeSingle();
    if (cprErr || !cpr) {
      return { error: "Roadmap not found or not visible" } as const;
    }

    await context.supabase.rpc("log_client_portal_activity", {
      _project_id: cpr.project_id,
      _actor_type: "client",
      _actor_email: email,
      _event_type: "milestone_reviewed",
      _summary: `You marked "${data.milestoneTitle}" as reviewed.`,
      _client_visible: true,
      _metadata: {
        portal_roadmap_id: cpr.id,
        milestone_slug: data.milestoneSlug,
        milestone_title: data.milestoneTitle,
      } as unknown as never,
    });

    // Mirror into engine_activity so mission control sees the client signal.
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: engineProj } = await supabaseAdmin
        .from("engine_projects")
        .select("id")
        .eq("client_portal_project_id", cpr.project_id)
        .maybeSingle();
      if (engineProj) {
        await supabaseAdmin.from("engine_activity").insert({
          project_id: engineProj.id,
          kind: "client_milestone_reviewed",
          title: `Client reviewed: ${data.milestoneTitle}`,
          body: null,
          severity: "info",
        });
      }
    } catch (e) {
      console.warn("[recordPortalMilestoneReview] engine mirror failed", e);
    }

    return { ok: true as const };
  });

// -------------------- File view/download telemetry (client-facing) --------------------
export const logPortalFileEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        fileId: z.string().uuid(),
        event: z.enum(["viewed", "downloaded"]),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as {
      rpc: (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message?: string } | null }>;
    };
    const { error } = await sb.rpc("log_portal_file_event", {
      _file_id: data.fileId,
      _event: data.event,
    });
    if (error) return { ok: false as const, error: error.message ?? "log failed" };

    // Mirror to engine_activity for important docs only (roadmaps, contracts,
    // deliverables). Skip for everyday attachments so we don't create noise.
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: fileRow } = await supabaseAdmin
        .from("client_portal_files")
        .select("project_id, file_name, category")
        .eq("id", data.fileId)
        .maybeSingle();
      const importantCategories = new Set([
        "roadmap",
        "contract",
        "deliverable",
        "invoice",
        "proposal",
      ]);
      if (
        fileRow &&
        fileRow.category &&
        importantCategories.has(String(fileRow.category).toLowerCase())
      ) {
        const { data: engineProj } = await supabaseAdmin
          .from("engine_projects")
          .select("id")
          .eq("client_portal_project_id", fileRow.project_id)
          .maybeSingle();
        if (engineProj) {
          await supabaseAdmin.from("engine_activity").insert({
            project_id: engineProj.id,
            kind: `client_file_${data.event}`,
            title: `Client ${data.event}: ${fileRow.file_name}`,
            body: null,
            severity: "info",
          });
        }
      }
    } catch (e) {
      console.warn("[logPortalFileEvent] engine mirror failed", e);
    }

    return { ok: true as const };
  });

// -------------------- Follow-up needed (operator + client) --------------------
export const markPortalFollowUpNeeded = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        reason: z.string().trim().min(1).max(1000),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    await assertOperator(context);
    const sb = context.supabase as unknown as {
      rpc: (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message?: string } | null }>;
    };
    const { data: id, error } = await sb.rpc("mark_portal_follow_up_needed", {
      _project_id: data.projectId,
      _reason: data.reason,
    });
    if (error) throw new Error(error.message ?? "mark follow-up failed");
    return { ok: true as const, activityId: id as string | null };
  });

export const resolvePortalFollowUp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ messageId: z.string().uuid() }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    // Defense-in-depth: verify the caller is either an operator/admin or a
    // permitted member of the message's project before delegating to the
    // SECURITY DEFINER RPC (which also enforces the same rule).
    const email = ((context.claims?.email as string | undefined) ?? "").toLowerCase();
    if (!email) throw new Error("Not signed in");

    const sb = context.supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (c: string, v: string) => {
            maybeSingle: () => Promise<{
              data: { project_id: string } | null;
              error: { message?: string } | null;
            }>;
          };
        };
      };
      rpc: (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message?: string } | null }>;
    };

    const { data: msg, error: lookupErr } = await sb
      .from("client_portal_messages")
      .select("project_id")
      .eq("id", data.messageId)
      .maybeSingle();
    if (lookupErr) {
      console.error("[resolvePortalFollowUp] lookup failed", lookupErr);
      throw new Error("Message lookup failed");
    }
    if (!msg) throw new Error("Message not found");

    if (!isOperator(email)) {
      const isAdmin = await hasRoleForEmail(sb as unknown as never, email, "admin");
      if (!isAdmin) {
        await _resolvePortalMembership(context, msg.project_id);
      }
    }

    const { error } = await sb.rpc("resolve_portal_follow_up", {
      _message_id: data.messageId,
    });
    if (error) {
      console.error("[resolvePortalFollowUp] rpc failed", error);
      throw new Error("Resolve failed");
    }
    return { ok: true as const };
  });


// ─── Client portal → engine feedback loop ──────────────────────────
// Client responses to milestone decisions and clarification requests
// created here also enqueue an engine_review_item so the operator queue
// picks them up on next refetch.
async function _resolvePortalMembership(
  context: {
    claims?: Record<string, unknown>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: any;
  },
  portalProjectId: string,
) {
  const email = ((context.claims?.email as string | undefined) ?? "").toLowerCase();
  if (!email) throw new Error("Not signed in");
  // Explicit email match in application code — belt-and-braces over RLS so a
  // client cannot request another workspace's project id even if RLS regresses.
  const { data, error } = await context.supabase
    .from("client_portal_permissions")
    .select("id")
    .eq("project_id", portalProjectId)
    .ilike("email", email)
    .is("revoked_at", null)
    .maybeSingle();
  if (error || !data) throw new Error("Forbidden: no portal access to this project");
  return email;
}

export const respondToPortalDecision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({
      portalProjectId: z.string().uuid(),
      milestoneId: z.string().min(1).max(200),
      milestoneTitle: z.string().min(1).max(300),
      decision: z.enum(["approve", "changes_requested", "declined"]),
      note: z.string().max(2000).optional(),
    }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const email = await _resolvePortalMembership(context as never, data.portalProjectId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const nowIso = new Date().toISOString();

    // 1. Portal-side: activity + message so the client sees their action.
    await context.supabase.rpc("log_client_portal_activity", {
      _project_id: data.portalProjectId,
      _actor_type: "client",
      _actor_email: email,
      _event_type: `milestone_${data.decision}`,
      _summary: `Client responded to milestone "${data.milestoneTitle}": ${data.decision.replace("_", " ")}.`,
      _client_visible: true,
      _metadata: { milestone_id: data.milestoneId, decision: data.decision, note: data.note ?? null } as unknown as never,
    });
    await supabaseAdmin.from("client_portal_messages").insert({
      project_id: data.portalProjectId,
      sender_type: "client",
      author_email: email,
      subject: `Decision: ${data.milestoneTitle}`,
      body: data.note ?? `Client decision: ${data.decision.replace("_", " ")}`,
      message_type: "decision",
      action_required: data.decision !== "approve",
      visible_to_client: true,
      metadata: { milestone_id: data.milestoneId, decision: data.decision },
    });

    // 2. Engine side: create a review item on the linked engine_project (if any).
    const { data: engineProj } = await supabaseAdmin
      .from("engine_projects")
      .select("id,name,approved_version")
      .eq("client_portal_project_id", data.portalProjectId)
      .maybeSingle();
    if (engineProj) {
      // Link to the latest approved engine_roadmap_version so the audit trail
      // ties the client's response back to the exact plan they saw.
      const { data: latestVersion } = await supabaseAdmin
        .from("engine_roadmap_versions")
        .select("id,version")
        .eq("project_id", engineProj.id)
        .eq("status", "approved")
        .order("approved_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const versionId = latestVersion?.id ?? null;
      const versionLabel = latestVersion?.version ?? engineProj.approved_version ?? null;
      const decisionLabel = data.decision.replace("_", " ");

      await supabaseAdmin.from("engine_review_items").insert({
        project_id: engineProj.id,
        client_portal_project_id: data.portalProjectId,
        project: engineProj.name,
        item_type: "Client Decision",
        title: `${data.milestoneTitle} — client ${decisionLabel}`,
        impact: data.decision === "approve" ? "low" : "high",
        source: `portal:${data.portalProjectId}`,
        requested_by: email,
        status: "pending",
      });

      await supabaseAdmin.from("engine_audit_log").insert({
        project_id: engineProj.id,
        actor_email: email,
        action: `client_${data.decision}`,
        summary: `Client ${decisionLabel} "${data.milestoneTitle}".`,
        version_id: versionId,
        metadata: {
          milestone_id: data.milestoneId,
          milestone_title: data.milestoneTitle,
          note: data.note ?? null,
          decision: data.decision,
          version_label: versionLabel,
          portal_project_id: data.portalProjectId,
          at: nowIso,
        },
      });
      await supabaseAdmin.from("engine_activity").insert({
        project_id: engineProj.id,
        kind: `client_${data.decision}`,
        title: `Client ${decisionLabel}: ${data.milestoneTitle}`,
        body: data.note ?? null,
        severity: data.decision === "approve" ? "info" : "warning",
      });
    }
    return { ok: true as const };
  });


export const requestPortalClarification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({
      portalProjectId: z.string().uuid(),
      milestoneId: z.string().min(1).max(200).optional(),
      milestoneTitle: z.string().min(1).max(300).optional(),
      question: z.string().min(3).max(2000),
    }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const email = await _resolvePortalMembership(context as never, data.portalProjectId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const subject = data.milestoneTitle ? `Clarification: ${data.milestoneTitle}` : "Clarification request";

    await supabaseAdmin.from("client_portal_messages").insert({
      project_id: data.portalProjectId,
      sender_type: "client",
      author_email: email,
      subject,
      body: data.question,
      message_type: "clarification",
      action_required: true,
      visible_to_client: true,
      metadata: { milestone_id: data.milestoneId ?? null },
    });
    await context.supabase.rpc("log_client_portal_activity", {
      _project_id: data.portalProjectId,
      _actor_type: "client",
      _actor_email: email,
      _event_type: "clarification_requested",
      _summary: subject,
      _client_visible: true,
      _metadata: { milestone_id: data.milestoneId ?? null, question: data.question } as unknown as never,
    });

    const { data: engineProj } = await supabaseAdmin
      .from("engine_projects")
      .select("id,name")
      .eq("client_portal_project_id", data.portalProjectId)
      .maybeSingle();
    if (engineProj) {
      await supabaseAdmin.from("engine_review_items").insert({
        project_id: engineProj.id,
        client_portal_project_id: data.portalProjectId,
        project: engineProj.name,
        item_type: "Client Clarification",
        title: subject,
        impact: "medium",
        source: `portal:${data.portalProjectId}`,
        requested_by: email,
        status: "pending",
      });

      await supabaseAdmin.from("engine_audit_log").insert({
        project_id: engineProj.id,
        actor_email: email,
        action: "client_clarification_requested",
        summary: subject,
        metadata: { milestone_id: data.milestoneId ?? null, question: data.question },
      });
    }
    return { ok: true as const };
  });

// ─── Server-side client message send ──────────────────────────────
// Portal messages MUST go through this fn — never a direct browser insert —
// because sender_type / visible_to_client are trust boundaries. The old
// client-side insert let a user forge sender_type: 'tai' or hide messages
// from themselves via devtools.
export const sendPortalMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({
      portalProjectId: z.string().uuid(),
      body: z.string().min(1).max(10_000),
      relatedFileIds: z.array(z.string().uuid()).max(20).optional(),
      messageType: z.enum(["reply", "clarification", "decision"]).optional(),
      relatedProjectId: z.string().uuid().optional(),
      relatedMilestoneId: z.string().uuid().optional(),
      relatedDecisionId: z.string().uuid().optional(),
      relatedDeliverableId: z.string().uuid().optional(),
      relatedPhaseId: z.string().uuid().optional(),
      // Slug-based context from the client portal canvas. The client only
      // knows canvas slugs (not engine UUIDs); we resolve to uuid columns
      // server-side where possible and persist the slugs into metadata for
      // filtering + audit.
      roadmapContext: z
        .object({
          phaseKey: z.string().max(60).optional(),
          milestoneSlug: z.string().max(200).optional(),
          milestoneTitle: z.string().max(400).optional(),
          decisionSlug: z.string().max(200).optional(),
          deliverableSlug: z.string().max(200).optional(),
        })
        .optional(),
    }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const email = await _resolvePortalMembership(context as never, data.portalProjectId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;

    // Resolve slug → uuid where possible using admin (portal RLS can't reach
    // engine tables directly). Best-effort; never fails the send.
    let resolvedMilestoneId: string | null = data.relatedMilestoneId ?? null;
    let resolvedProjectId: string | null = data.relatedProjectId ?? null;
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: engineProj } = await supabaseAdmin
        .from("engine_projects")
        .select("id")
        .eq("client_portal_project_id", data.portalProjectId)
        .maybeSingle();
      if (engineProj) {
        resolvedProjectId = resolvedProjectId ?? engineProj.id;
        const wantTitle = data.roadmapContext?.milestoneTitle?.trim();
        if (!resolvedMilestoneId && wantTitle) {
          const { data: ms } = await supabaseAdmin
            .from("engine_milestones")
            .select("id, name")
            .eq("project_id", engineProj.id)
            .ilike("name", wantTitle);
          if (ms && ms.length > 0) resolvedMilestoneId = ms[0].id;
        }
      }
    } catch (e) {
      console.warn("[sendPortalMessage] slug resolution failed", e);
    }

    const { data: row, error } = await sb
      .from("client_portal_messages")
      .insert({
        project_id: data.portalProjectId,
        // Hardcoded server-side — client cannot forge these.
        sender_type: "client",
        visible_to_client: true,
        author_email: email,
        body: data.body,
        message_type: data.messageType ?? "reply",
        related_file_ids: data.relatedFileIds ?? [],
        related_project_id: resolvedProjectId,
        related_milestone_id: resolvedMilestoneId,
        related_decision_id: data.relatedDecisionId ?? null,
        related_deliverable_id: data.relatedDeliverableId ?? null,
        related_phase_id: data.relatedPhaseId ?? null,
        metadata: data.roadmapContext
          ? { roadmap_context: data.roadmapContext }
          : {},
      })
      .select("id, created_at")
      .single();
    if (error) throw new Error(error.message ?? "message send failed");

    // Mirror to engine_activity so operators see inbound client messages in
    // mission control, not just email/inbox.
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: engineProj } = await supabaseAdmin
        .from("engine_projects")
        .select("id")
        .eq("client_portal_project_id", data.portalProjectId)
        .maybeSingle();
      if (engineProj) {
        const preview = data.body.length > 240 ? `${data.body.slice(0, 240)}…` : data.body;
        await supabaseAdmin.from("engine_activity").insert({
          project_id: engineProj.id,
          kind: "client_message",
          title: `Client message from ${email}`,
          body: preview,
          severity: "info",
        });
      }
    } catch (e) {
      console.warn("[sendPortalMessage] engine mirror failed", e);
    }

    return { id: row.id as string, created_at: row.created_at as string };
  });

/**
 * Portal-safe listing of roadmap context options for the message composer /
 * filters. Sourced from the currently approved client_safe_canvas, so nothing
 * client-internal leaks.
 */
export const getPortalRoadmapContextOptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ portalProjectId: z.string().uuid() }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    await _resolvePortalMembership(context as never, data.portalProjectId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: rm } = await sb
      .from("client_portal_roadmaps")
      .select("client_safe_canvas")
      .eq("project_id", data.portalProjectId)
      .in("status", ["approved", "delivered"])
      .not("published_at", "is", null)
      .order("published_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const canvas =
      rm?.client_safe_canvas && typeof rm.client_safe_canvas === "object"
        ? (rm.client_safe_canvas as Record<string, unknown>)
        : null;
    if (!canvas) {
      return { phases: [], milestones: [], decisions: [], deliverables: [] };
    }
    type Item = { slug?: string; title?: string; phase?: string; type?: string };
    const items = Array.isArray(canvas.milestones) ? (canvas.milestones as Item[]) : [];
    const phasesRaw = Array.isArray(canvas.phases) ? (canvas.phases as Item[]) : [];
    return {
      phases: phasesRaw
        .filter((p) => p && (p.slug || p.title))
        .map((p) => ({ key: (p.slug ?? p.title ?? "").toString(), label: (p.title ?? p.slug ?? "").toString() })),
      milestones: items
        .filter((m) => m && (m.slug || m.title) && (m.type ?? "milestone") === "milestone")
        .map((m) => ({ slug: (m.slug ?? m.title ?? "").toString(), title: (m.title ?? m.slug ?? "").toString(), phase: (m.phase ?? "").toString() || null })),
      decisions: items
        .filter((m) => m && (m.type === "decision"))
        .map((m) => ({ slug: (m.slug ?? m.title ?? "").toString(), title: (m.title ?? m.slug ?? "").toString() })),
      deliverables: items
        .filter((m) => m && (m.type === "deliverable"))
        .map((m) => ({ slug: (m.slug ?? m.title ?? "").toString(), title: (m.title ?? m.slug ?? "").toString() })),
    };
  });



// ─── Portal onboarding (client wizard) ────────────────────────────────
// Five-step wizard: business_basics, current_state, goals_priorities,
// assets_docs, review_submit. Progress is stored as `completion_percent`
// and `current_step` on client_portal_onboarding. Submission cross-writes
// an engine_source and activity entry so the ops pipeline can pick it up.

type OnboardingSectionKey =
  | "business_basics"
  | "current_state"
  | "goals_priorities"
  | "assets_docs"
  | "review_submit";

const ONBOARDING_SECTIONS: OnboardingSectionKey[] = [
  "business_basics",
  "current_state",
  "goals_priorities",
  "assets_docs",
  "review_submit",
];

export const getPortalOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ portalProjectId: z.string().uuid() }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    await _resolvePortalMembership(context as never, data.portalProjectId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: row, error } = await sb
      .from("client_portal_onboarding")
      .select("*")
      .eq("project_id", data.portalProjectId)
      .maybeSingle();
    if (error) throw new Error(error.message ?? "load onboarding failed");

    if (!row) {
      const { data: created, error: insErr } = await sb
        .from("client_portal_onboarding")
        .insert({ project_id: data.portalProjectId })
        .select("*")
        .single();
      if (insErr) throw new Error(insErr.message ?? "create onboarding failed");
      return { onboarding: created };
    }
    return { onboarding: row };
  });

const SectionEnum = z.enum([
  "business_basics",
  "current_state",
  "goals_priorities",
  "assets_docs",
  "review_submit",
]);

export const savePortalOnboardingSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        portalProjectId: z.string().uuid(),
        section: SectionEnum,
        data: z.record(z.string(), z.unknown()).default({}),
        currentStep: z.number().int().min(1).max(5).optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    await _resolvePortalMembership(context as never, data.portalProjectId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    // Load current row to recompute completion.
    const { data: existing } = await sb
      .from("client_portal_onboarding")
      .select("*")
      .eq("project_id", data.portalProjectId)
      .maybeSingle();
    const merged: Record<OnboardingSectionKey, Record<string, unknown>> = {
      business_basics: (existing?.business_basics ?? {}) as Record<string, unknown>,
      current_state: (existing?.current_state ?? {}) as Record<string, unknown>,
      goals_priorities: (existing?.goals_priorities ?? {}) as Record<string, unknown>,
      assets_docs: (existing?.assets_docs ?? {}) as Record<string, unknown>,
      review_submit: (existing?.review_submit ?? {}) as Record<string, unknown>,
    };
    merged[data.section] = data.data;
    // Completion = number of non-empty non-review sections.
    const filled = (["business_basics", "current_state", "goals_priorities", "assets_docs"] as const)
      .filter((k) => Object.keys(merged[k] ?? {}).length > 0).length;
    const completion = Math.min(100, Math.round((filled / 4) * 100));

    const patch: Record<string, unknown> = {
      [data.section]: data.data,
      completion_percent: completion,
      last_saved_at: new Date().toISOString(),
    };
    if (typeof data.currentStep === "number") patch.current_step = data.currentStep;

    if (existing) {
      const { error } = await sb
        .from("client_portal_onboarding")
        .update(patch)
        .eq("project_id", data.portalProjectId);
      if (error) throw new Error(error.message ?? "save onboarding failed");
    } else {
      const { error } = await sb
        .from("client_portal_onboarding")
        .insert({ project_id: data.portalProjectId, ...patch });
      if (error) throw new Error(error.message ?? "save onboarding failed");
    }
    return { ok: true as const, completion_percent: completion };
  });

function _compileOnboardingBrief(
  onboarding: Record<string, unknown>,
  files: Array<{ file_name: string; category: string | null; size_bytes: number | null }>,
): string {
  const sec = (label: string, key: OnboardingSectionKey) => {
    const obj = (onboarding[key] ?? {}) as Record<string, unknown>;
    const entries = Object.entries(obj).filter(
      ([, v]) => v !== undefined && v !== null && String(v).trim().length > 0,
    );
    if (entries.length === 0) return `## ${label}\n(not provided)\n`;
    return `## ${label}\n${entries
      .map(([k, v]) => `- ${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
      .join("\n")}\n`;
  };
  const fileBlock =
    files.length > 0
      ? `## Uploaded assets\n${files
          .map((f) => `- ${f.file_name}${f.category ? ` (${f.category})` : ""}`)
          .join("\n")}\n`
      : "## Uploaded assets\n(none)\n";
  return [
    "# Client onboarding intake",
    sec("Business basics", "business_basics"),
    sec("Current state", "current_state"),
    sec("Goals & priorities", "goals_priorities"),
    sec("Assets & docs (notes)", "assets_docs"),
    fileBlock,
  ].join("\n");
}

export const submitPortalOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ portalProjectId: z.string().uuid() }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const email = await _resolvePortalMembership(context as never, data.portalProjectId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const nowIso = new Date().toISOString();

    const { data: existing, error: readErr } = await supabaseAdmin
      .from("client_portal_onboarding")
      .select("*")
      .eq("project_id", data.portalProjectId)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message ?? "load onboarding failed");
    if (!existing) throw new Error("No onboarding to submit — fill in a section first");

    const { error: updErr } = await supabaseAdmin
      .from("client_portal_onboarding")
      .update({
        status: "submitted",
        submitted_at: nowIso,
        current_step: 5,
        completion_percent: 100,
      })
      .eq("project_id", data.portalProjectId);
    if (updErr) throw new Error(updErr.message ?? "submit onboarding failed");

    // Client-facing activity
    await supabaseAdmin.rpc("log_client_portal_activity", {
      _project_id: data.portalProjectId,
      _actor_type: "client",
      _actor_email: email,
      _event_type: "onboarding_submitted",
      _summary: "Client submitted intake onboarding",
      _client_visible: true,
      _metadata: { at: nowIso } as unknown as never,
    });

    // Cross-write to engine (P1-2). Only when a linked engine_project exists.
    const { data: engineProj } = await supabaseAdmin
      .from("engine_projects")
      .select("id, name")
      .eq("client_portal_project_id", data.portalProjectId)
      .maybeSingle();

    let engineSourceId: string | null = null;
    if (engineProj) {
      const { data: files } = await supabaseAdmin
        .from("client_portal_files")
        .select("id, file_name, category, size_bytes, storage_path")
        .eq("project_id", data.portalProjectId)
        .eq("category", "onboarding_assets");

      const brief = _compileOnboardingBrief(
        existing as Record<string, unknown>,
        (files ?? []) as Array<{
          file_name: string;
          category: string | null;
          size_bytes: number | null;
        }>,
      );

      const { data: src, error: srcErr } = await supabaseAdmin
        .from("engine_sources")
        .insert({
          project_id: engineProj.id,
          name: "Client onboarding intake",
          type: "brief",
          raw_text: brief,
          status: "queued",
          created_by_email: email,
          visibility: "internal_only",
        })
        .select("id")
        .single();
      if (srcErr) {
        console.warn("[submitPortalOnboarding] engine_source insert failed", srcErr);
      } else {
        engineSourceId = src.id as string;
        // G-1: auto-run the intelligence extraction pipeline so onboarding
        // intake feeds signals/milestone drafts without operator intervention.
        // Fire-and-forget: the client response returns immediately; the
        // pipeline logs its own errors into engine_activity / engine_extraction_runs.
        void (async () => {
          try {
            const { runIntelligencePipelineInternal } = await import(
              "@/lib/engine-intelligence.functions"
            );
            await runIntelligencePipelineInternal(supabaseAdmin, {
              projectId: engineProj.id,
              sourceIds: [engineSourceId as string],
              actorEmail: email,
            });
          } catch (e) {
            const msg = (e as Error)?.message ?? String(e);
            if (msg.startsWith("pipeline_blocked:")) {
              // Operator has explicitly blocked auto-extraction on this
              // project — surface a distinct activity entry so ops see the
              // client submitted intake without silently ignoring the guard.
              try {
                await supabaseAdmin.from("engine_activity").insert({
                  project_id: engineProj.id,
                  kind: "client_submitted_intake_but_pipeline_blocked",
                  title: "Client submitted intake — auto-extraction blocked",
                  body: "Agent permissions block run_intelligence_pipeline on this project. Review the intake source manually.",
                  severity: "warn",
                });
              } catch (logErr) {
                console.warn("[submitPortalOnboarding] activity insert failed", logErr);
              }
            } else {
              console.warn(
                "[submitPortalOnboarding] intelligence pipeline failed",
                msg,
              );
            }
          }

        })();
      }


      await supabaseAdmin.from("engine_activity").insert({
        project_id: engineProj.id,
        kind: "client_onboarding_submitted",
        title: "Client submitted onboarding intake",
        body: `Cross-written as engine source${engineSourceId ? ` ${engineSourceId}` : ""}. ${
          files?.length ?? 0
        } file(s) attached.`,
        severity: "info",
      });
      await supabaseAdmin.from("engine_review_items").insert({
        project_id: engineProj.id,
        client_portal_project_id: data.portalProjectId,
        project: engineProj.name,
        item_type: "Intake Ready",
        title: "Onboarding intake ready for review",
        impact: "medium",
        source: `portal:${data.portalProjectId}`,
        requested_by: email,
        status: "pending",
      });

      await supabaseAdmin.from("engine_audit_log").insert({
        project_id: engineProj.id,
        actor_email: email,
        action: "client_onboarding_submitted",
        summary: "Client submitted onboarding intake",
        metadata: {
          portal_project_id: data.portalProjectId,
          engine_source_id: engineSourceId,
          file_count: files?.length ?? 0,
          at: nowIso,
        },
      });
    }

    // Portal-facing return: never expose internal engine IDs to client context.
    // engineSourceId, engineProj.id, and other engine-internal identifiers are
    // intentionally omitted — they must never cross the portal boundary to the
    // client caller.
    return { ok: true as const };
  });
