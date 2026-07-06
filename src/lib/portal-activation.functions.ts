import { createServerFn } from "@tanstack/react-start";
import {
  type StripeEnv,
  createStripeClient,
  getStripeErrorMessage,
} from "@/lib/stripe.server";

type StartResult =
  | { status: "ready"; actionLink: string; email: string }
  | { status: "provisioning"; email: string | null }
  | { status: "unpaid"; paymentStatus: string | null }
  | { status: "no_email" }
  | { error: string };

export const startPortalSignIn = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      sessionId: string;
      environment: StripeEnv;
      redirectTo: string;
    }) => {
      if (!/^cs_(test|live)_[a-zA-Z0-9]+$/.test(data.sessionId)) {
        throw new Error("Invalid sessionId");
      }
      try {
        const u = new URL(data.redirectTo);
        if (u.protocol !== "https:" && u.protocol !== "http:") {
          throw new Error("Invalid redirectTo");
        }
      } catch {
        throw new Error("Invalid redirectTo");
      }
      return data;
    },
  )
  .handler(async ({ data }): Promise<StartResult> => {
    let email: string | null = null;
    let paymentStatus: string | null = null;
    try {
      const stripe = createStripeClient(data.environment);
      const session = await stripe.checkout.sessions.retrieve(data.sessionId);
      email = (session.customer_details?.email ?? session.customer_email ?? null)?.toLowerCase() ?? null;
      paymentStatus = session.payment_status ?? null;
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }

    if (!email) return { status: "no_email" };
    if (paymentStatus !== "paid" && paymentStatus !== "no_payment_required") {
      return { status: "unpaid", paymentStatus };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Verify webhook has provisioned portal access for this email.
    const { data: perm } = await (supabaseAdmin as any)
      .from("client_portal_permissions")
      .select("id")
      .ilike("email", email)
      .is("revoked_at", null)
      .maybeSingle();

    if (!perm) return { status: "provisioning", email };

    // Ensure a Supabase auth user exists for this email.
    try {
      // listUsers filtered by email is not a direct API; use signUp-then-generateLink pattern
      // via admin.createUser (idempotent-ish: catches "already registered").
      const create = await (supabaseAdmin as any).auth.admin.createUser({
        email,
        email_confirm: true,
      });
      if (create?.error && !/already been registered|already registered|exists/i.test(create.error.message ?? "")) {
        // Non-fatal for existing users; log and continue.
        console.warn("[startPortalSignIn] createUser warning", create.error.message);
      }
    } catch (e) {
      console.warn("[startPortalSignIn] createUser threw", e);
    }

    const { data: link, error: linkErr } = await (supabaseAdmin as any).auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: data.redirectTo },
    });

    if (linkErr || !link?.properties?.action_link) {
      return { error: linkErr?.message ?? "Could not generate sign-in link" };
    }

    return {
      status: "ready",
      actionLink: link.properties.action_link as string,
      email,
    };
  });

// -------------------- Resend portal sign-in link --------------------

type ResendResult =
  | { status: "sent"; email: string }
  | { status: "unpaid"; paymentStatus: string | null }
  | { status: "no_email" }
  | { status: "provisioning"; email: string | null }
  | { error: string };

/**
 * Emails a fresh portal magic-link to the paid checkout's customer email.
 * Verifies the Stripe session first so this endpoint cannot be used to
 * fish for or spam arbitrary addresses. Reuses the branded portal-welcome
 * template so the resent message matches Trust Tai's original handoff.
 */
export const resendPortalMagicLink = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { sessionId: string; environment: StripeEnv }) => {
      if (!/^cs_(test|live)_[a-zA-Z0-9]+$/.test(data.sessionId)) {
        throw new Error("Invalid sessionId");
      }
      return data;
    },
  )
  .handler(async ({ data }): Promise<ResendResult> => {
    let session: Awaited<ReturnType<ReturnType<typeof createStripeClient>["checkout"]["sessions"]["retrieve"]>>;
    try {
      const stripe = createStripeClient(data.environment);
      session = await stripe.checkout.sessions.retrieve(data.sessionId);
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }

    const email = (session.customer_details?.email ?? session.customer_email ?? null)?.toLowerCase() ?? null;
    const paymentStatus = session.payment_status ?? null;

    if (!email) return { status: "no_email" };
    if (paymentStatus !== "paid" && paymentStatus !== "no_payment_required") {
      return { status: "unpaid", paymentStatus };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const supabase = supabaseAdmin as any;

    // Confirm the webhook has provisioned portal access before we bother
    // sending an email that would land the user on a locked portal.
    const { data: perm } = await supabase
      .from("client_portal_permissions")
      .select("id")
      .ilike("email", email)
      .is("revoked_at", null)
      .maybeSingle();
    if (!perm) return { status: "provisioning", email };

    const { getPublicSiteUrl } = await import("@/lib/site-url");
    const siteUrl = getPublicSiteUrl();

    // Ensure user exists (idempotent-ish).
    try {
      const create = await supabase.auth.admin.createUser({ email, email_confirm: true });
      if (create?.error && !/already been registered|already registered|exists/i.test(create.error.message ?? "")) {
        console.warn("[resendPortalMagicLink] createUser warning", create.error.message);
      }
    } catch (e) {
      console.warn("[resendPortalMagicLink] createUser threw", e);
    }

    let actionLink = `${siteUrl}/portal/login`;
    try {
      const { data: link, error: linkErr } = await supabase.auth.admin.generateLink({
        type: "magiclink",
        email,
        options: { redirectTo: `${siteUrl}/portal/home` },
      });
      if (linkErr) return { error: linkErr.message };
      if (link?.properties?.action_link) actionLink = link.properties.action_link as string;
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Could not generate sign-in link" };
    }

    // Build the same personalized summary the original welcome uses.
    const contactName = session.customer_details?.name ?? null;
    const first = contactName?.split(" ")[0] ?? "there";
    const paceTitle = (session.metadata as any)?.pace_title ?? null;
    const paceMonthly = (session.metadata as any)?.pace_monthly ?? null;
    const paceTimeline = (session.metadata as any)?.pace_timeline ?? null;
    const packageName =
      (session.metadata as any)?.package_name ??
      (session.mode === "payment" ? "The Roadmap" : "Engagement");

    const currencyUp = (session.currency ?? "usd").toUpperCase();
    const amountStr =
      session.amount_total != null
        ? `$${(session.amount_total / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : null;
    const isSubscription = session.mode === "subscription" || !!paceMonthly;
    const packageLabel = paceTitle ? `The Walk — ${paceTitle}` : packageName;
    const packageTagline = paceTitle
      ? "Monthly build cadence · Trust Tai"
      : session.mode === "payment"
        ? "One-time engagement · Trust Tai"
        : "Trust Tai engagement";
    const summaryAmount = paceMonthly
      ? `${paceMonthly}/mo`
      : amountStr
        ? isSubscription ? `${amountStr} ${currencyUp}/mo` : `${amountStr} ${currencyUp}`
        : undefined;
    const summaryAmountNote = isSubscription ? "Billed monthly · cancel anytime" : "One-time payment";
    const rows: Array<{ label: string; value: string }> = [];
    if (paceTimeline) rows.push({ label: "Timeline", value: paceTimeline });
    rows.push({ label: "Billing email", value: email });
    const s = session.id;
    rows.push({ label: "Reference", value: s.length > 16 ? `${s.slice(0, 8)}…${s.slice(-6)}` : s });

    const intro = `${first}, here's a fresh sign-in link for your Trust Tai portal. It expires in 60 minutes — use it from this inbox.`;

    const { renderPortalMagicLinkHtml } = await import(
      "@/lib/email-templates/portal-magic-link-html"
    );
    const html = renderPortalMagicLinkHtml({
      actionLink,
      eyebrow: "New sign-in link",
      heading: `${first}, back to your portal.`,
      intro,
      preview: `A fresh sign-in link for your Trust Tai portal (${packageLabel}).`,
      ctaLabel: "Enter my portal",
      siteUrl,
      orderSummary: {
        packageName: packageLabel,
        packageTagline,
        amount: summaryAmount,
        amountNote: summaryAmountNote,
        rows,
      },
    });
    const text = [
      `${first}, here's a fresh sign-in link for your Trust Tai portal.`,
      "",
      `Order: ${packageLabel}`,
      summaryAmount ? `Amount: ${summaryAmount}` : null,
      paceTimeline ? `Timeline: ${paceTimeline}` : null,
      "",
      actionLink,
      "",
      "The link expires in 60 minutes.",
      "",
      "— Tai",
      "Trust Tai · hello@trusttai.com",
    ].filter(Boolean).join("\n");

    try {
      const { ensureUnsubscribeToken } = await import("@/lib/email/unsubscribe-token.server");
      const unsubscribeToken = await ensureUnsubscribeToken(email);
      const { error: rpcErr } = await supabase.rpc("enqueue_email", {
        queue_name: "transactional_emails",
        payload: {
          message_id: (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`),
          queued_at: new Date().toISOString(),
          to: email,
          from: "Trust Tai <hello@trusttai.com>",
          sender_domain: "notify.trusttai.com",
          subject: "A fresh sign-in link for your Trust Tai portal",
          html,
          text,
          label: "portal-welcome-resend",
          purpose: "transactional",
          idempotency_key: `portal-welcome-resend-${session.id}-${Math.floor(Date.now() / 60000)}`,
          unsubscribe_token: unsubscribeToken,
        },
      });
      if (rpcErr) return { error: rpcErr.message };
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Could not send email" };
    }

    return { status: "sent", email };
  });
