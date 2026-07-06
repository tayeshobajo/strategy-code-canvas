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
