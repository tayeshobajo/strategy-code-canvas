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
      email: opts.email,
      source: opts.source,
      stripe_session_id: opts.stripe_session_id ?? null,
      stripe_subscription_id: opts.stripe_subscription_id ?? null,
      granted_at: new Date().toISOString(),
      revoked_at: null,
    },
    { onConflict: "email,source,stripe_session_id" },
  );
}

async function enqueueEmail(to: string, subject: string, text: string) {
  const supabase = getSupabase() as any;
  try {
    await supabase.rpc("enqueue_email", {
      queue_name: "emails",
      payload: { to, subject, text },
    });
  } catch (e) {
    console.error("enqueue_email failed", e);
  }
}

async function handleCheckoutCompleted(session: any, env: StripeEnv) {
  const supabase = getSupabase() as any;
  const email =
    session.customer_details?.email ?? session.customer_email ?? null;

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

  // Grant client_access for one-time roadmap purchase
  if (session.mode === "payment") {
    await grantClientAccess({
      email,
      source: "roadmap",
      stripe_session_id: session.id,
    });
  }

  const amount = ((session.amount_total ?? 0) / 100).toFixed(2);
  await enqueueEmail(
    "tai@trusttai.com",
    `New purchase — ${email ?? "unknown"}`,
    `Email: ${email}\nAmount: $${amount} ${session.currency?.toUpperCase()}\nSession: ${session.id}\nMode: ${session.mode}\nEnvironment: ${env}\n`,
  );
  if (email) {
    await enqueueEmail(
      email,
      "Your Roadmap is on the way",
      `Within one business day, you get one reply. From a person, by name. Not a sequence.\n\nSign in to your portal here: https://trusttai.com/auth?email=${encodeURIComponent(email)}\n\n— Tai`,
    );
  }
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
  const email =
    sub.metadata?.customer_email ??
    sub.customer_email ??
    null;

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

  if (email) {
    await grantClientAccess({
      email,
      source: "engagement",
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

async function handleWebhook(req: Request, env: StripeEnv) {
  const event = await verifyWebhook(req, env);
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
    default:
      console.log("Unhandled event:", event.type);
  }
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
