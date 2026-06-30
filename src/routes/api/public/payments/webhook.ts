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

async function handleCheckoutCompleted(session: any, env: StripeEnv) {
  const supabase = getSupabase();
  await supabase.from("orders").upsert(
    {
      stripe_session_id: session.id,
      stripe_payment_intent_id: session.payment_intent ?? null,
      stripe_customer_id: session.customer ?? null,
      customer_email:
        session.customer_details?.email ?? session.customer_email ?? null,
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

  // Notify the inbox via the existing email queue.
  const email = session.customer_details?.email ?? session.customer_email;
  const amount = ((session.amount_total ?? 0) / 100).toFixed(2);
  try {
    await supabase.rpc("enqueue_email", {
      queue_name: "emails",
      payload: {
        to: "tai@trusttai.com",
        subject: `New Roadmap purchase — ${email ?? "unknown"}`,
        text: `A customer purchased The Roadmap.\n\nEmail: ${email}\nAmount: $${amount} ${session.currency?.toUpperCase()}\nSession: ${session.id}\nEnvironment: ${env}\n`,
      },
    });
    if (email) {
      await supabase.rpc("enqueue_email", {
        queue_name: "emails",
        payload: {
          to: email,
          subject: "Your Roadmap is on the way",
          text: "Within one business day, you get one reply. From a person, by name. Not a sequence.\n\n— Tai",
        },
      });
    }
  } catch (e) {
    console.error("enqueue_email failed", e);
  }
}

async function handleWebhook(req: Request, env: StripeEnv) {
  const event = await verifyWebhook(req, env);
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      await handleCheckoutCompleted(event.data.object, env);
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
