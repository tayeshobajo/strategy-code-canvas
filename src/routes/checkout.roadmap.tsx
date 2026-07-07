import { createFileRoute, Link } from "@tanstack/react-router";
import { StripeEmbeddedCheckout } from "@/components/StripeEmbeddedCheckout";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";
import { SiteHeader } from "@/components/SiteHeader";

export const Route = createFileRoute("/checkout/roadmap")({
  head: () => ({
    meta: [
      { title: "Checkout — The Roadmap | Trust Tai" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CheckoutRoadmap,
});

function CheckoutRoadmap() {
  const returnUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`
      : "/checkout/return?session_id={CHECKOUT_SESSION_ID}";

  return (
    <div className="min-h-screen bg-background">
      <PaymentTestModeBanner />
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-6 pt-28 pb-12 sm:pt-32 sm:pb-16">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight">The Roadmap</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            One-time engagement. $10,000. After payment, we send your private intake within one business day.
          </p>
          <p className="mt-2 text-sm">
            <Link to="/build-my-roadmap" className="underline">
              Prefer to talk first?
            </Link>
          </p>
        </div>
        <StripeEmbeddedCheckout priceId="the_roadmap_onetime" returnUrl={returnUrl} />
      </main>
    </div>
  );
}
