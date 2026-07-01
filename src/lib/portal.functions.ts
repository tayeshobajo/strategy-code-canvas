import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const OPERATOR_EMAILS = new Set([
  "hello@trust-tai.com",
  "tai@trust-tai.com",
  "henry@trust-tai.com",
]);

function isOperator(email: string | null | undefined) {
  return !!email && OPERATOR_EMAILS.has(email.toLowerCase());
}

// -------------------- Magic link (public) --------------------
export const requestPortalMagicLink = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) =>
    z.object({ email: z.string().email() }).parse(raw),
  )
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
    const redirectTo =
      (process.env.PUBLIC_SITE_URL ?? "https://new.trusttai.com") + "/portal";
    const { data: linkData, error: linkError } =
      await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email,
        options: { redirectTo },
      });

    if (linkError || !linkData?.properties?.action_link) {
      console.error("[portal.magic-link] generateLink failed", linkError);
      return { ok: true as const };
    }

    const actionLink = linkData.properties.action_link;
    const messageId =
      (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`) as string;

    const html = `<div style="font-family:Georgia,serif;color:#111827;line-height:1.6;">
      <p>Welcome back.</p>
      <p>Use the secure link below to sign in to your Trust Tai client portal. It expires in 60 minutes.</p>
      <p><a href="${actionLink}" style="display:inline-block;background:#0B1E3B;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;">Enter your portal</a></p>
      <p style="color:#6B7280;font-size:13px;">If you didn't request this, you can ignore this email.</p>
      <p>— Tai</p>
    </div>`;

    const { error: enqError } = await (supabaseAdmin.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ error: unknown }>)("enqueue_email", {
      queue_name: "transactional_emails",
      payload: {
        message_id: messageId,
        queued_at: new Date().toISOString(),
        to: email,
        from: "Trust Tai <hello@trusttai.com>",
        sender_domain: "notify.trusttai.com",
        subject: "Your Trust Tai portal sign-in link",
        html,
        text: `Sign in to your Trust Tai portal:\n\n${actionLink}\n\nThis link expires in 60 minutes.`,
        label: "portal-magic-link",
        purpose: "transactional",
        idempotency_key: `portal-magic-${email}-${Date.now()}`,
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
      await (supabaseAdmin.rpc as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ error: unknown }>)("log_client_portal_activity", {
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

// -------------------- Client-facing context --------------------
export const getPortalContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const email = context.claims?.email as string | undefined;
    if (!email) return { hasAccess: false as const };

    const { data: project } = await context.supabase
      .from("client_portal_projects")
      .select("*")
      .ilike("primary_email", email)
      .maybeSingle();

    if (!project) return { hasAccess: false as const, email };

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
    };
  });

// -------------------- Admin (operator) --------------------
async function assertOperator(context: {
  claims?: { email?: string };
  supabase: unknown;
}) {
  const email = context.claims?.email;
  if (!isOperator(email)) throw new Error("Forbidden");
  return email as string;
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
  .inputValidator((raw: unknown) =>
    z.object({ id: z.string().uuid() }).parse(raw),
  )
  .handler(async ({ context, data }) => {
    await assertOperator(context);
    const [proj, onboarding, roadmaps, activity, perms, billing] =
      await Promise.all([
        context.supabase
          .from("client_portal_projects")
          .select("*")
          .eq("id", data.id)
          .maybeSingle(),
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
        context.supabase
          .from("client_portal_permissions")
          .select("*")
          .eq("project_id", data.id),
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
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) {
      if (k === "id") continue;
      if (v !== undefined) patch[k] = v;
    }
    if (Object.keys(patch).length === 0) return { ok: true as const };
    patch.updated_at = new Date().toISOString();

    const { error } = await (context.supabase.from("client_portal_projects") as unknown as {
      update: (v: Record<string, unknown>) => { eq: (k: string, v: string) => Promise<{ error: unknown }> };
    })
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
