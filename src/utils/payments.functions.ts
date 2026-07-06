import { createServerFn } from "@tanstack/react-start";
import {
  type StripeEnv,
  createStripeClient,
  getStripeErrorMessage,
} from "@/lib/stripe.server";

type CheckoutSessionResult = { clientSecret: string } | { error: string };

export const createCheckoutSession = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      priceId: string;
      quantity?: number;
      customerEmail?: string;
      returnUrl: string;
      environment: StripeEnv;
      metadata?: Record<string, string>;
    }) => {
      if (!/^[a-zA-Z0-9_-]+$/.test(data.priceId)) throw new Error("Invalid priceId");
      if (data.metadata) {
        for (const [k, v] of Object.entries(data.metadata)) {
          if (!/^[a-zA-Z0-9_-]{1,40}$/.test(k)) throw new Error("Invalid metadata key");
          if (typeof v !== "string" || v.length > 500) throw new Error("Invalid metadata value");
        }
      }
      return data;
    },
  )
  .handler(async ({ data }): Promise<CheckoutSessionResult> => {
    try {
      const stripe = createStripeClient(data.environment);

      const prices = await stripe.prices.list({ lookup_keys: [data.priceId] });
      if (!prices.data.length) throw new Error("Price not found");
      const stripePrice = prices.data[0];
      const isRecurring = stripePrice.type === "recurring";

      const productId =
        typeof stripePrice.product === "string"
          ? stripePrice.product
          : stripePrice.product.id;
      const product = await stripe.products.retrieve(productId);
      const productDescription = product.name;

      const metadata = data.metadata ?? {};

      const session = await stripe.checkout.sessions.create({
        line_items: [{ price: stripePrice.id, quantity: data.quantity || 1 }],
        mode: isRecurring ? "subscription" : "payment",
        ui_mode: "embedded_page",
        return_url: data.returnUrl,
        metadata,
        ...(data.customerEmail && { customer_email: data.customerEmail }),
        ...(isRecurring && {
          subscription_data: {
            metadata: {
              ...metadata,
              ...(data.customerEmail ? { customer_email: data.customerEmail } : {}),
            },
          },
        }),
        ...(!isRecurring && {
          payment_intent_data: { description: productDescription },
        }),
      });

      return { clientSecret: session.client_secret ?? "" };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });

type SessionStatusResult =
  | {
      status: string | null;
      paymentStatus: string | null;
      customerEmail: string | null;
    }
  | { error: string };

export const getCheckoutSessionStatus = createServerFn({ method: "POST" })
  .inputValidator((data: { sessionId: string; environment: StripeEnv }) => {
    if (!/^cs_(test|live)_[a-zA-Z0-9]+$/.test(data.sessionId)) {
      throw new Error("Invalid sessionId");
    }
    return data;
  })
  .handler(async ({ data }): Promise<SessionStatusResult> => {
    try {
      const stripe = createStripeClient(data.environment);
      const session = await stripe.checkout.sessions.retrieve(data.sessionId);
      return {
        status: session.status ?? null,
        paymentStatus: session.payment_status ?? null,
        customerEmail: session.customer_details?.email ?? null,
      };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });

