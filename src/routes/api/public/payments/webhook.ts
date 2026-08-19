/**
 * Stripe webhook for public marketing purchases (The Walks / The Roadmap).
 *
 * Scope after the website subtraction: record the order and subscription
 * state, nothing else. Client portals, access grants and delivery state now
 * live in Trust Tai OS, so this endpoint no longer provisions anything.
 *
 * Security: the signature is verified before any processing, and the event id
 * is de-duplicated so retries are safe.
 */
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

async function alreadyProcessed(eventId: string, env: StripeEnv) {
  const supabase = getSupabase() as any;
  const { data, error } = await supabase
    .from("processed_stripe_events")
    .select("event_id")
    .eq("event_id", eventId)
    .eq("environment", env)
    .maybeSingle();
  if (error) {
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

async function handleCheckoutCompleted(session: any, env: StripeEnv) {
  const supabase = getSupabase() as any;
  const email =
    (session.customer_details?.email ?? session.customer_email ?? null)?.toLowerCase() ?? null;

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
}

async function upsertSubscription(sub: any, env: StripeEnv) {
  const supabase = getSupabase() as any;
  await supabase.from("subscriptions").upsert(
    {
      stripe_subscription_id: sub.id,
      stripe_customer_id: sub.customer ?? null,
      status: sub.status ?? "active",
      environment: env,
      current_period_end: sub.current_period_end
        ? new Date(sub.current_period_end * 1000).toISOString()
        : null,
      cancel_at_period_end: !!sub.cancel_at_period_end,
      metadata: sub.metadata ?? {},
      updated_at: new Date().toISOString(),
    },
    { onConflict: "stripe_subscription_id" },
  );
}

async function handleWebhook(req: Request, env: StripeEnv) {
  const event = await verifyWebhook(req, env);

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
    case "customer.subscription.deleted":
      await upsertSubscription(event.data.object, env);
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
