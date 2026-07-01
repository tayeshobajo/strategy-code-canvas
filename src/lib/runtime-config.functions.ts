import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isOperatorEmail } from "@/lib/ops/access";
import { getPublicSiteUrl, CANONICAL_ORIGIN, LEGACY_HOSTS } from "@/lib/site-url";

export interface RuntimeConfig {
  publicSiteUrl: string;
  canonicalOrigin: string;
  publicSiteUrlEnvSet: boolean;
  requestOrigin: string | null;
  legacyHosts: ReadonlyArray<string>;
  senderDomain: string;
  fromAddress: string;
  contactEmail: string;
  opsNotifyEmail: string;
  nodeEnv: string;
}

export const getRuntimeConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RuntimeConfig> => {
    const email = (context.claims?.email as string | undefined)?.toLowerCase() ?? "";
    if (!isOperatorEmail(email) && email !== "hello@trusttai.com") {
      throw new Error("Forbidden");
    }

    let requestOrigin: string | null = null;
    try {
      const { getRequestHeader } = await import("@tanstack/react-start/server");
      const proto = getRequestHeader("x-forwarded-proto") ?? "https";
      const host = getRequestHeader("host");
      if (host) requestOrigin = `${proto}://${host}`;
    } catch {
      /* not in request context */
    }

    return {
      publicSiteUrl: getPublicSiteUrl(),
      canonicalOrigin: CANONICAL_ORIGIN,
      publicSiteUrlEnvSet: !!process.env.PUBLIC_SITE_URL,
      requestOrigin,
      legacyHosts: LEGACY_HOSTS,
      senderDomain: "notify.trusttai.com",
      fromAddress: "Trust Tai <hello@trusttai.com>",
      contactEmail: "hello@trusttai.com",
      opsNotifyEmail: (process.env.OPS_NOTIFY_EMAIL ?? "tai@trusttai.com").toLowerCase(),
      nodeEnv: process.env.NODE_ENV ?? "unknown",
    };
  });
