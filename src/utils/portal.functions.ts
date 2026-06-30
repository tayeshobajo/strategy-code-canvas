import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  type StripeEnv,
  createStripeClient,
  getStripeErrorMessage,
} from "@/lib/stripe.server";

type Result<T> = T | { error: string };

async function loadActiveSub(
  supabase: any,
  email: string | undefined,
  environment: StripeEnv,
) {
  if (!email) throw new Error("No email on account");
  const { data, error } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("customer_email", email)
    .eq("environment", environment)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("No subscription found");
  return data;
}

export const pauseSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { environment: StripeEnv }) => d)
  .handler(async ({ data, context }): Promise<Result<{ ok: true }>> => {
    try {
      const sub = await loadActiveSub(
        context.supabase,
        context.claims?.email,
        data.environment,
      );
      const stripe = createStripeClient(data.environment);
      await stripe.subscriptions.update(sub.stripe_subscription_id, {
        pause_collection: { behavior: "void" },
      });
      return { ok: true };
    } catch (e) {
      return { error: getStripeErrorMessage(e) };
    }
  });

export const resumeSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { environment: StripeEnv }) => d)
  .handler(async ({ data, context }): Promise<Result<{ ok: true }>> => {
    try {
      const sub = await loadActiveSub(
        context.supabase,
        context.claims?.email,
        data.environment,
      );
      const stripe = createStripeClient(data.environment);
      await stripe.subscriptions.update(sub.stripe_subscription_id, {
        pause_collection: "",
      } as any);
      return { ok: true };
    } catch (e) {
      return { error: getStripeErrorMessage(e) };
    }
  });

export const changeSubscriptionPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { newPriceLookupKey: string; environment: StripeEnv }) => {
    if (!/^[a-zA-Z0-9_-]+$/.test(d.newPriceLookupKey))
      throw new Error("Invalid price");
    return d;
  })
  .handler(async ({ data, context }): Promise<Result<{ ok: true }>> => {
    try {
      const sub = await loadActiveSub(
        context.supabase,
        context.claims?.email,
        data.environment,
      );
      const stripe = createStripeClient(data.environment);
      const prices = await stripe.prices.list({
        lookup_keys: [data.newPriceLookupKey],
      });
      if (!prices.data.length) throw new Error("Price not found");
      const newPriceId = prices.data[0].id;
      const stripeSub = await stripe.subscriptions.retrieve(
        sub.stripe_subscription_id,
      );
      const itemId = stripeSub.items.data[0].id;
      await stripe.subscriptions.update(sub.stripe_subscription_id, {
        items: [{ id: itemId, price: newPriceId }],
        proration_behavior: "create_prorations",
      });
      return { ok: true };
    } catch (e) {
      return { error: getStripeErrorMessage(e) };
    }
  });

export const createBillingPortalSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { returnUrl: string; environment: StripeEnv }) => d)
  .handler(async ({ data, context }): Promise<Result<{ url: string }>> => {
    try {
      const sub = await loadActiveSub(
        context.supabase,
        context.claims?.email,
        data.environment,
      );
      const stripe = createStripeClient(data.environment);
      const portal = await stripe.billingPortal.sessions.create({
        customer: sub.stripe_customer_id,
        return_url: data.returnUrl,
      });
      return { url: portal.url };
    } catch (e) {
      return { error: getStripeErrorMessage(e) };
    }
  });

export const sendPortalMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { body: string }) => {
    const body = d.body?.trim();
    if (!body) throw new Error("Message is empty");
    if (body.length > 4000) throw new Error("Message too long");
    return { body };
  })
  .handler(async ({ data, context }): Promise<Result<{ ok: true }>> => {
    const email = context.claims?.email;
    if (!email) return { error: "No email on account" };
    const { error } = await context.supabase
      .from("portal_messages")
      .insert({ client_email: email, sender: "client", body: data.body });
    if (error) return { error: error.message };
    try {
      await context.supabase.rpc("enqueue_email", {
        queue_name: "emails",
        payload: {
          to: "tai@trusttai.com",
          subject: `Portal message from ${email}`,
          text: data.body,
        },
      });
    } catch (e) {
      console.error(e);
    }
    return { ok: true };
  });
