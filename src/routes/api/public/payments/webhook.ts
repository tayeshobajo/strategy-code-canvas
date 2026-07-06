import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { type StripeEnv, verifyWebhook } from "@/lib/stripe.server";

let _supabase: ReturnType<typeof createClient> | null = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
  }
  return _supabase;
}

// -------------------- Idempotency --------------------
// Uses processed_stripe_events table (created via migration below in comment).
// Returns true if this event was already processed.
async function alreadyProcessed(eventId: string, env: StripeEnv) {
  const supabase = getSupabase() as any;
  const { data, error } = await supabase
    .from("processed_stripe_events")
    .select("event_id")
    .eq("event_id", eventId)
    .eq("environment", env)
    .maybeSingle();
  if (error) {
    // If table missing, log and continue (fail-open to avoid dropping events)
    console.warn("[webhook] idempotency check failed", error.message);
    return false;
  }
  return !!data;
}

async function markProcessed(eventId: string, env: StripeEnv, type: string) {
  const supabase = getSupabase() as any;
  await supabase
    .from("processed_stripe_events")
    .insert({ event_id: eventId, environment: env, event_type: type })
    .then(
      () => {},
      (e: unknown) => console.warn("[webhook] markProcessed failed", e),
    );
}

// -------------------- Access + Portal --------------------
async function grantClientAccess(opts: {
  email: string | null | undefined;
  source: string;
  stripe_session_id?: string | null;
  stripe_subscription_id?: string | null;
}) {
  if (!opts.email) return;
  const supabase = getSupabase() as any;
  await supabase.from("client_access").upsert(
    {
      email: opts.email.toLowerCase(),
      source: opts.source,
      stripe_session_id: opts.stripe_session_id ?? null,
      stripe_subscription_id: opts.stripe_subscription_id ?? null,
      granted_at: new Date().toISOString(),
      revoked_at: null,
    },
    { onConflict: "email,source,stripe_session_id" },
  );
}

async function upsertPortalProject(opts: {
  email: string;
  contact_name?: string | null;
  company_name?: string | null;
  package_name?: string | null;
  stripe_customer_id?: string | null;
  stripe_session_id?: string | null;
  stripe_subscription_id?: string | null;
  amount_total?: number | null;
  currency?: string | null;
  purchased_package?: string | null;
}) {
  const supabase = getSupabase() as any;
  const email = opts.email.toLowerCase();

  // Look up existing project by primary_email (unique)
  const { data: existing } = await supabase
    .from("client_portal_projects")
    .select("id, portal_status")
    .ilike("primary_email", email)
    .maybeSingle();

  let projectId: string;
  const nowIso = new Date().toISOString();

  if (existing?.id) {
    projectId = existing.id;
    const patch: Record<string, unknown> = {
      updated_at: nowIso,
      last_client_activity_at: nowIso,
    };
    if (opts.contact_name) patch.contact_name = opts.contact_name;
    if (opts.company_name) patch.company_name = opts.company_name;
    if (opts.package_name) patch.package_name = opts.package_name;
    if (opts.stripe_customer_id)
      patch.stripe_customer_id = opts.stripe_customer_id;
    if (opts.stripe_session_id)
      patch.stripe_checkout_session_id = opts.stripe_session_id;
    if (opts.stripe_subscription_id)
      patch.stripe_subscription_id = opts.stripe_subscription_id;
    // Only advance status if currently pre-payment
    if (
      !existing.portal_status ||
      existing.portal_status === "payment_pending"
    ) {
      patch.portal_status = "payment_confirmed";
      patch.access_granted_at = nowIso;
      patch.purchase_date = nowIso;
    }
    await supabase.from("client_portal_projects").update(patch).eq("id", projectId);
  } else {
    const insert: Record<string, unknown> = {
      primary_email: email,
      contact_name: opts.contact_name ?? null,
      company_name: opts.company_name ?? null,
      package_name: opts.package_name ?? null,
      purchased_package: opts.purchased_package ?? null,
      stripe_customer_id: opts.stripe_customer_id ?? null,
      stripe_checkout_session_id: opts.stripe_session_id ?? null,
      stripe_subscription_id: opts.stripe_subscription_id ?? null,
      portal_status: "payment_confirmed",
      current_phase: "Awaiting onboarding",
      next_milestone: "Complete onboarding",
      access_granted_at: nowIso,
      purchase_date: nowIso,
      last_client_activity_at: nowIso,
    };
    const { data: created, error } = await supabase
      .from("client_portal_projects")
      .insert(insert)
      .select("id")
      .single();
    if (error || !created) {
      console.error("[webhook] portal insert failed", error);
      return null;
    }
    projectId = created.id;
  }

  // Permissions
  await supabase.from("client_portal_permissions").upsert(
    {
      project_id: projectId,
      email,
      role: "owner",
      revoked_at: null,
    },
    { onConflict: "project_id,email" },
  );

  // Onboarding row
  await supabase
    .from("client_portal_onboarding")
    .upsert({ project_id: projectId }, { onConflict: "project_id" });

  // Billing record
  await supabase.from("client_portal_billing").upsert(
    {
      project_id: projectId,
      stripe_checkout_session_id: opts.stripe_session_id ?? null,
      stripe_customer_id: opts.stripe_customer_id ?? null,
      stripe_subscription_id: opts.stripe_subscription_id ?? null,
      amount_total: opts.amount_total ?? 0,
      currency: opts.currency ?? "usd",
      payment_status: "paid",
      purchased_package: opts.purchased_package ?? opts.package_name ?? null,
      payment_confirmed_at: nowIso,
      updated_at: nowIso,
    },
    { onConflict: "stripe_checkout_session_id" },
  );

  // Activity log
  await supabase.rpc("log_client_portal_activity", {
    _project_id: projectId,
    _actor_type: "system",
    _actor_email: email,
    _event_type: "payment_confirmed",
    _summary: `Payment confirmed via Stripe (${opts.package_name ?? opts.purchased_package ?? "engagement"})`,
    _client_visible: false,
    _metadata: {
      stripe_session_id: opts.stripe_session_id ?? null,
      amount_total: opts.amount_total ?? null,
      currency: opts.currency ?? null,
    },
  });

  return projectId;
}

async function sendWelcomeEmail(
  email: string,
  contactName?: string | null,
  receipt?: {
    amount_total?: number | null;
    currency?: string | null;
    packageName?: string | null;
    sessionId?: string | null;
    mode?: string | null;
    paceTitle?: string | null;
    paceCadence?: string | null;
    paceMonthly?: string | null;
    paceTimeline?: string | null;
  },
) {
  const supabase = getSupabase() as any;
  const first = contactName?.split(" ")[0] ?? "there";
  const { getPublicSiteUrl } = await import("@/lib/site-url");
  const siteUrl = getPublicSiteUrl();

  // Ensure an auth user exists, then mint a magic sign-in link so the client
  // can enter the portal directly from this email even if they closed the tab
  // after paying.
  let actionLink = `${siteUrl}/portal/login`;
  try {
    const create = await supabase.auth.admin.createUser({ email, email_confirm: true });
    if (create?.error && !/already been registered|already registered|exists/i.test(create.error.message ?? "")) {
      console.warn("[webhook] createUser warning", create.error.message);
    }
  } catch (e) {
    console.warn("[webhook] createUser threw", e);
  }
  try {
    const { data: link, error: linkErr } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: `${siteUrl}/portal/home` },
    });
    if (linkErr) {
      console.warn("[webhook] generateLink failed", linkErr.message);
    } else if (link?.properties?.action_link) {
      actionLink = link.properties.action_link as string;
    }
  } catch (e) {
    console.warn("[webhook] generateLink threw", e);
  }

  // Build a personalized order summary card so the receipt feels like a
  // Trust Tai handoff rather than a generic confirmation.
  const currencyUp = (receipt?.currency ?? "usd").toUpperCase();
  const amountStr =
    receipt?.amount_total != null
      ? `$${(receipt.amount_total / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : null;
  const isSubscription = receipt?.mode === "subscription" || !!receipt?.paceMonthly;
  const packageLabel = receipt?.paceTitle
    ? `The Walk — ${receipt.paceTitle}`
    : receipt?.packageName ?? "Your Trust Tai engagement";
  const packageTagline = receipt?.paceTitle
    ? "Monthly build cadence · Trust Tai"
    : receipt?.mode === "payment"
      ? "One-time engagement · Trust Tai"
      : "Trust Tai engagement";

  const summaryAmount = receipt?.paceMonthly
    ? `${receipt.paceMonthly}/mo`
    : amountStr
      ? isSubscription ? `${amountStr} ${currencyUp}/mo` : `${amountStr} ${currencyUp}`
      : undefined;
  const summaryAmountNote = isSubscription
    ? "Billed monthly · cancel anytime"
    : "One-time payment";

  const rows: Array<{ label: string; value: string }> = [];
  if (receipt?.paceTimeline) rows.push({ label: "Timeline", value: receipt.paceTimeline });
  rows.push({ label: "Billing email", value: email });
  if (receipt?.sessionId) {
    const s = receipt.sessionId;
    const short = s.length > 16 ? `${s.slice(0, 8)}…${s.slice(-6)}` : s;
    rows.push({ label: "Reference", value: short });
  }

  const orderSummary = {
    packageName: packageLabel,
    packageTagline,
    amount: summaryAmount,
    amountNote: summaryAmountNote,
    rows,
  };

  const intro = receipt?.paceTitle
    ? `${first}, your ${receipt.paceTitle} is confirmed and your Trust Tai portal is opening. Use the button below to sign in — no passwords, this link expires in 60 minutes. A Stripe receipt is on its way separately.`
    : `${first}, your payment is confirmed and your Trust Tai portal is opening. Use the button below to sign in — no passwords, this link expires in 60 minutes. A Stripe receipt is on its way separately.`;

  const { renderPortalMagicLinkHtml } = await import(
    "@/lib/email-templates/portal-magic-link-html"
  );
  const html = renderPortalMagicLinkHtml({
    actionLink,
    eyebrow: "Your Walk begins",
    heading: `${first}, you're in.`,
    intro,
    preview: `${packageLabel} confirmed — sign in to your Trust Tai portal.`,
    ctaLabel: "Enter my portal",
    siteUrl,
    orderSummary,
  });

  const textLines = [
    `${first}, you're in.`,
    "",
    `Order: ${packageLabel}`,
    summaryAmount ? `Amount: ${summaryAmount}${summaryAmountNote ? ` (${summaryAmountNote})` : ""}` : null,
    receipt?.paceTimeline ? `Timeline: ${receipt.paceTimeline}` : null,
    "",
    "Sign in to your portal:",
    actionLink,
    "",
    "The link expires in 60 minutes. A Stripe receipt is on its way separately.",
    "",
    "— Tai",
    "Trust Tai · hello@trusttai.com",
  ].filter(Boolean);
  const text = textLines.join("\n");

  try {
    const { ensureUnsubscribeToken } = await import("@/lib/email/unsubscribe-token.server");
    const unsubscribeToken = await ensureUnsubscribeToken(email);
    await supabase.rpc("enqueue_email", {
      queue_name: "transactional_emails",
      payload: {
        message_id: (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`),
        queued_at: new Date().toISOString(),
        to: email,
        from: "Trust Tai <hello@trusttai.com>",
        sender_domain: "notify.trusttai.com",
        subject: receipt?.paceTitle
          ? `You're in — ${receipt.paceTitle} confirmed`
          : "You're in — sign in to your Trust Tai portal",
        html,
        text,
        label: "portal-welcome",
        purpose: "transactional",
        idempotency_key: `portal-welcome-${receipt?.sessionId ?? email}`,
        unsubscribe_token: unsubscribeToken,
      },
    });
  } catch (e) {
    console.error("[webhook] welcome enqueue failed", e);
  }
}

async function notifyInternal(subject: string, text: string) {
  const supabase = getSupabase() as any;
  try {
    const recipient = "tai@trusttai.com";
    const { ensureUnsubscribeToken } = await import("@/lib/email/unsubscribe-token.server");
    const unsubscribeToken = await ensureUnsubscribeToken(recipient);
    await supabase.rpc("enqueue_email", {
      queue_name: "transactional_emails",
      payload: {
        message_id: (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`),
        queued_at: new Date().toISOString(),
        to: recipient,
        from: "Trust Tai <hello@trusttai.com>",
        sender_domain: "notify.trusttai.com",
        subject,
        text,
        label: "internal-notify",
        purpose: "transactional",
        unsubscribe_token: unsubscribeToken,
      },
    });
  } catch (e) {
    console.error("[webhook] internal enqueue failed", e);
  }
}

// -------------------- Event handlers --------------------
async function handleCheckoutCompleted(session: any, env: StripeEnv) {
  const supabase = getSupabase() as any;
  const email =
    (session.customer_details?.email ?? session.customer_email ?? null)?.toLowerCase() ??
    null;

  await supabase.from("orders").upsert(
    {
      stripe_session_id: session.id,
      stripe_payment_intent_id: session.payment_intent ?? null,
      stripe_customer_id: session.customer ?? null,
      customer_email: email,
      customer_name: session.customer_details?.name ?? null,
      amount_total: session.amount_total ?? 0,
      currency: session.currency ?? "usd",
      status: session.payment_status ?? "paid",
      environment: env,
      metadata: session.metadata ?? {},
      updated_at: new Date().toISOString(),
    },
    { onConflict: "stripe_session_id" },
  );

  if (!email) {
    console.warn("[webhook] checkout completed without email; skipping portal");
    return;
  }

  const packageName =
    session.metadata?.package_name ??
    (session.mode === "payment" ? "The Roadmap" : "Engagement");

  await grantClientAccess({
    email,
    source: session.mode === "payment" ? "roadmap" : "engagement",
    stripe_session_id: session.id,
    stripe_subscription_id: session.subscription ?? null,
  });

  await upsertPortalProject({
    email,
    contact_name: session.customer_details?.name ?? null,
    company_name: session.metadata?.company_name ?? null,
    package_name: packageName,
    purchased_package: packageName,
    stripe_customer_id: session.customer ?? null,
    stripe_session_id: session.id,
    stripe_subscription_id: session.subscription ?? null,
    amount_total: session.amount_total ?? 0,
    currency: session.currency ?? "usd",
  });

  await sendWelcomeEmail(email, session.customer_details?.name ?? null, {
    amount_total: session.amount_total ?? null,
    currency: session.currency ?? null,
    packageName,
    sessionId: session.id,
  });

  const amount = ((session.amount_total ?? 0) / 100).toFixed(2);
  await notifyInternal(
    `New purchase — ${email}`,
    `Email: ${email}\nAmount: $${amount} ${(session.currency ?? "usd").toUpperCase()}\nPackage: ${packageName}\nSession: ${session.id}\nMode: ${session.mode}\nEnvironment: ${env}\n`,
  );
}

function pickPriceId(item: any): string | null {
  return (
    item?.price?.lookup_key ??
    item?.price?.metadata?.lovable_external_id ??
    item?.price?.id ??
    null
  );
}

async function upsertSubscription(sub: any, env: StripeEnv) {
  const supabase = getSupabase() as any;
  const item = sub.items?.data?.[0];
  const priceId = pickPriceId(item);
  const productId =
    typeof item?.price?.product === "string"
      ? item.price.product
      : (item?.price?.product?.id ?? null);
  const periodStart = item?.current_period_start ?? sub.current_period_start;
  const periodEnd = item?.current_period_end ?? sub.current_period_end;
  const email = (sub.metadata?.customer_email ?? sub.customer_email ?? null)?.toLowerCase() ?? null;

  await supabase.from("subscriptions").upsert(
    {
      stripe_subscription_id: sub.id,
      stripe_customer_id: sub.customer,
      customer_email: email,
      product_id: productId,
      price_id: priceId,
      status: sub.status,
      current_period_start: periodStart
        ? new Date(periodStart * 1000).toISOString()
        : null,
      current_period_end: periodEnd
        ? new Date(periodEnd * 1000).toISOString()
        : null,
      cancel_at_period_end: sub.cancel_at_period_end ?? false,
      pause_collection: sub.pause_collection?.behavior ?? null,
      environment: env,
      metadata: sub.metadata ?? {},
      updated_at: new Date().toISOString(),
    },
    { onConflict: "stripe_subscription_id" },
  );

  if (email && (sub.status === "active" || sub.status === "trialing")) {
    await grantClientAccess({
      email,
      source: "engagement",
      stripe_subscription_id: sub.id,
    });
    await upsertPortalProject({
      email,
      contact_name: sub.metadata?.contact_name ?? null,
      company_name: sub.metadata?.company_name ?? null,
      package_name: sub.metadata?.package_name ?? "Engagement",
      purchased_package: sub.metadata?.package_name ?? "Engagement",
      stripe_customer_id: sub.customer ?? null,
      stripe_subscription_id: sub.id,
    });
  }
}

async function handleSubscriptionDeleted(sub: any, env: StripeEnv) {
  const supabase = getSupabase() as any;
  await supabase
    .from("subscriptions")
    .update({
      status: "canceled",
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_subscription_id", sub.id)
    .eq("environment", env);
}

async function resolveProjectIdForInvoice(invoice: any): Promise<string | null> {
  const supabase = getSupabase() as any;
  const subId = typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id ?? null;
  const custId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id ?? null;
  const email = (invoice.customer_email ?? invoice.customer_address?.email ?? null)?.toLowerCase() ?? null;

  if (subId) {
    const { data } = await supabase
      .from("client_portal_projects")
      .select("id")
      .eq("stripe_subscription_id", subId)
      .maybeSingle();
    if (data?.id) return data.id as string;
  }
  if (custId) {
    const { data } = await supabase
      .from("client_portal_projects")
      .select("id")
      .eq("stripe_customer_id", custId)
      .maybeSingle();
    if (data?.id) return data.id as string;
  }
  if (email) {
    const { data } = await supabase
      .from("client_portal_projects")
      .select("id")
      .ilike("primary_email", email)
      .maybeSingle();
    if (data?.id) return data.id as string;
  }
  return null;
}

function mapInvoiceStatus(invoice: any, eventType: string): string {
  if (eventType === "invoice.payment_failed") return "failed";
  if (invoice.status === "paid" || invoice.paid === true) return "paid";
  if (invoice.status === "open") return "open";
  if (invoice.status === "draft") return "pending";
  if (invoice.status === "void") return "void";
  if (invoice.status === "uncollectible") return "failed";
  return invoice.status ?? "pending";
}

async function handleInvoiceEvent(invoice: any, env: StripeEnv, eventType: string) {
  const supabase = getSupabase() as any;
  const projectId = await resolveProjectIdForInvoice(invoice);
  if (!projectId) {
    console.warn("[webhook] invoice event without matching project", invoice.id, eventType);
    return;
  }

  const status = mapInvoiceStatus(invoice, eventType);
  const paidAtSecs =
    invoice.status_transitions?.paid_at ??
    (invoice.paid ? invoice.created : null);
  const nextAttempt = invoice.next_payment_attempt;
  const subId = typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id ?? null;

  await supabase.from("client_portal_billing").upsert(
    {
      project_id: projectId,
      stripe_invoice_id: invoice.id,
      stripe_customer_id: typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id ?? null,
      stripe_subscription_id: subId,
      amount_total: invoice.amount_paid ?? invoice.amount_due ?? invoice.total ?? 0,
      currency: invoice.currency ?? "usd",
      payment_status: status,
      purchased_package:
        invoice.lines?.data?.[0]?.description ??
        invoice.metadata?.package_name ??
        null,
      receipt_url: invoice.hosted_invoice_url ?? null,
      invoice_url: invoice.invoice_pdf ?? invoice.hosted_invoice_url ?? null,
      payment_confirmed_at: paidAtSecs ? new Date(paidAtSecs * 1000).toISOString() : null,
      next_payment_at: nextAttempt ? new Date(nextAttempt * 1000).toISOString() : null,
      updated_at: new Date().toISOString(),
      metadata: {
        invoice_number: invoice.number ?? null,
        hosted_invoice_url: invoice.hosted_invoice_url ?? null,
        invoice_pdf: invoice.invoice_pdf ?? null,
        event_type: eventType,
        environment: env,
      },
    },
    { onConflict: "stripe_invoice_id" },
  );

  // Log a portal-visible activity so clients see the update.
  const summary =
    eventType === "invoice.payment_failed"
      ? "Payment failed on latest invoice"
      : status === "paid"
        ? `Invoice ${invoice.number ?? invoice.id.slice(-8)} paid`
        : `Invoice ${invoice.number ?? invoice.id.slice(-8)} ${status}`;
  await supabase.rpc("log_client_portal_activity", {
    _project_id: projectId,
    _actor_type: "system",
    _actor_email: null,
    _event_type: eventType,
    _summary: summary,
    _client_visible: status === "paid" || eventType === "invoice.payment_failed",
    _metadata: {
      stripe_invoice_id: invoice.id,
      environment: env,
    },
  });
}

async function handleWebhook(req: Request, env: StripeEnv) {
  const event = await verifyWebhook(req, env);

  // Idempotency guard
  if (await alreadyProcessed(event.id, env)) {
    console.log("[webhook] duplicate event ignored", event.id, event.type);
    return;
  }

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      await handleCheckoutCompleted(event.data.object, env);
      break;
    case "customer.subscription.created":
    case "customer.subscription.updated":
      await upsertSubscription(event.data.object, env);
      break;
    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(event.data.object, env);
      break;
    case "invoice.paid":
    case "invoice.payment_succeeded":
    case "invoice.finalized":
    case "invoice.updated":
    case "invoice.payment_failed":
      await handleInvoiceEvent(event.data.object, env, event.type);
      break;
    default:
      console.log("Unhandled event:", event.type);
  }

  await markProcessed(event.id, env, event.type);
}

export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawEnv = new URL(request.url).searchParams.get("env");
        if (rawEnv !== "sandbox" && rawEnv !== "live") {
          console.error("Webhook: invalid env", rawEnv);
          return Response.json({ received: true, ignored: "invalid env" });
        }
        try {
          await handleWebhook(request, rawEnv as StripeEnv);
          return Response.json({ received: true });
        } catch (e) {
          console.error("Webhook error:", e);
          return new Response("Webhook error", { status: 400 });
        }
      },
    },
  },
});
