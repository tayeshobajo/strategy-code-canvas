import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { StripeEmbeddedCheckout } from "@/components/StripeEmbeddedCheckout";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";
import { SiteHeader } from "@/components/SiteHeader";

const PACES = {
  accelerated: {
    priceId: "walk_accelerated_monthly",
    title: "Accelerated Pace",
    blurb: "$7,500 per month · 12 months to Point B.",
  },
  balanced: {
    priceId: "walk_balanced_monthly",
    title: "Balanced Pace",
    blurb: "$4,500 per month · 18 months to Point B.",
  },
  steady: {
    priceId: "walk_steady_monthly",
    title: "Steady Pace",
    blurb: "$2,500 per month · 24 months to Point B.",
  },
} as const;

type PaceKey = keyof typeof PACES;

export const Route = createFileRoute("/checkout/walk/$pace")({
  head: () => ({
    meta: [
      { title: "Checkout — The Walk | Trust Tai" },
      { name: "robots", content: "noindex" },
    ],
  }),
  beforeLoad: ({ params }) => {
    if (!(params.pace in PACES)) throw notFound();
  },
  component: CheckoutWalk,
});

function CheckoutWalk() {
  const { pace } = Route.useParams();
  const config = PACES[pace as PaceKey];
  const returnUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`
      : "/checkout/return?session_id={CHECKOUT_SESSION_ID}";

  return (
    <div className="min-h-screen bg-background">
      <PaymentTestModeBanner />
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-6 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight">The Walk — {config.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{config.blurb}</p>
          <p className="mt-2 text-sm">
            <Link to="/investment" className="underline">
              Back to investment options
            </Link>
          </p>
        </div>
        <StripeEmbeddedCheckout priceId={config.priceId} returnUrl={returnUrl} />
      </main>
    </div>
  );
}
