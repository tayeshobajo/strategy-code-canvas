import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { StripeEmbeddedCheckout } from "@/components/StripeEmbeddedCheckout";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";
import { SiteHeader } from "@/components/SiteHeader";
import {
  ArrowLeft,
  Check,
  Footprints,
  Lock,
  ShieldCheck,
} from "lucide-react";

type PaceConfig = {
  priceId: string;
  title: string;
  monthly: string;
  cadence: string;
  tagline: string;
  timeline: string;
  included: string[];
};

const PACES: Record<string, PaceConfig> = {
  accelerated: {
    priceId: "walk_accelerated_monthly",
    title: "Accelerated Pace",
    monthly: "$7,500",
    cadence: "per month",
    tagline:
      "Point B in one year. The heaviest team on the build, the earliest arrival.",
    timeline: "12 months to Point B",
    included: [
      "Full build team allocated each month",
      "Roadmap-led build sequence",
      "Client Portal access & updates",
      "Milestone tracking & reporting",
      "Monthly strategy + execution reviews",
      "Priority support from Trust Tai team",
    ],
  },
  balanced: {
    priceId: "walk_balanced_monthly",
    title: "Balanced Pace",
    monthly: "$4,500",
    cadence: "per month",
    tagline:
      "Point B in 18 months. Steady team allocation with room to breathe.",
    timeline: "18 months to Point B",
    included: [
      "Balanced build team allocated each month",
      "Roadmap-led build sequence",
      "Client Portal access & updates",
      "Milestone tracking & reporting",
      "Monthly strategy + execution reviews",
      "Standard support from Trust Tai team",
    ],
  },
  steady: {
    priceId: "walk_steady_monthly",
    title: "Steady Pace",
    monthly: "$2,500",
    cadence: "per month",
    tagline:
      "Point B in two years. A measured, sustainable rhythm to arrival.",
    timeline: "24 months to Point B",
    included: [
      "Core build team allocated each month",
      "Roadmap-led build sequence",
      "Client Portal access & updates",
      "Milestone tracking & reporting",
      "Quarterly strategy + execution reviews",
      "Standard support from Trust Tai team",
    ],
  },
};

export const Route = createFileRoute("/checkout/walk/$pace")({
  head: ({ params }) => {
    const cfg = PACES[params.pace];
    const title = cfg ? `Begin The Walk — ${cfg.title} | Trust Tai` : "Checkout | Trust Tai";
    return {
      meta: [
        { title },
        { name: "robots", content: "noindex" },
        { name: "description", content: "Secure your monthly build pace and begin your Trust Tai workspace." },
      ],
    };
  },
  beforeLoad: ({ params }) => {
    if (!(params.pace in PACES)) throw notFound();
  },
  component: CheckoutWalk,
});

function CheckoutWalk() {
  const { pace } = Route.useParams();
  const config = PACES[pace]!;
  const returnUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`
      : "/checkout/return?session_id={CHECKOUT_SESSION_ID}";

  const nextSteps = [
    "Payment is confirmed",
    "Your client workspace is created",
    "You're signed into your portal",
    "We begin preparing your Roadmap",
  ];

  return (
    <div className="min-h-screen bg-background">
      <PaymentTestModeBanner />
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-6 pt-28 pb-12 sm:pt-32 sm:pb-16">
        <div className="mb-8">
          <Link
            to="/investment"
            className="inline-flex items-center gap-2 text-sm text-ink/60 hover:text-ink transition-colors"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to investment options
          </Link>
        </div>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
          {/* Left — commitment summary */}
          <section aria-labelledby="commitment-title" className="space-y-6">
            <div>
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-royal">
                Begin The Walk
              </span>
              <h1
                id="commitment-title"
                className="mt-4 font-display text-4xl font-light leading-[1.1] text-ink sm:text-[44px]"
              >
                You are securing<br />
                <span className="italic">your build pace.</span>
              </h1>
              <p className="mt-5 max-w-lg text-[15px] leading-[1.7] text-ink/60">
                Once payment is confirmed, your client workspace will be created
                automatically and your Trust Tai portal will open.
              </p>
            </div>

            {/* Selected walk card */}
            <div className="rounded-2xl border border-rule-soft bg-card p-6 shadow-[0_8px_40px_-24px_rgba(23,28,56,0.10)] sm:p-8">
              <div className="grid gap-6 sm:grid-cols-[auto_1fr_auto] sm:items-start">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-royal/10">
                  <Footprints className="h-5 w-5 text-royal" aria-hidden="true" />
                </div>
                <div>
                  <div className="font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-ink/50">
                    Selected Walk
                  </div>
                  <div className="mt-2 font-display text-2xl font-light text-ink">
                    {config.title}
                  </div>
                  <p className="mt-2 max-w-xs text-[13.5px] leading-[1.6] text-ink/60">
                    {config.tagline}
                  </p>
                </div>
                <div className="sm:text-right">
                  <div className="font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-ink/50">
                    Monthly investment
                  </div>
                  <div className="mt-2 font-display text-2xl font-light text-ink">
                    {config.monthly}
                  </div>
                  <div className="text-[12px] text-ink/50">{config.cadence}</div>
                  <div className="mt-4 font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-ink/50">
                    Timeline
                  </div>
                  <div className="mt-1 text-[13.5px] font-medium text-ink">
                    {config.timeline}
                  </div>
                </div>
              </div>

              <div className="mt-6 border-t border-rule-soft pt-6">
                <div className="font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-ink/50">
                  What's included
                </div>
                <ul className="mt-4 grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
                  {config.included.map((item) => (
                    <li key={item} className="flex items-start gap-2.5">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-royal" aria-hidden="true" />
                      <span className="text-[13.5px] leading-[1.5] text-ink/75">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* What happens next */}
            <div className="rounded-2xl border border-rule-soft bg-paper-soft p-6 sm:p-8">
              <div className="font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-ink/50">
                What happens next
              </div>
              <ol className="mt-4 grid gap-4 sm:grid-cols-4">
                {nextSteps.map((step, idx) => (
                  <li key={step} className="flex gap-3 sm:flex-col sm:gap-2">
                    <span
                      aria-hidden="true"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-royal/30 bg-card font-mono text-[11px] font-bold text-royal"
                    >
                      {idx + 1}
                    </span>
                    <span className="text-[12.5px] leading-[1.45] text-ink/70">
                      {step}
                    </span>
                  </li>
                ))}
              </ol>
              <p className="mt-6 flex items-start gap-2 text-[12px] leading-[1.5] text-ink/50">
                <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>
                  After payment, your portal access is created automatically
                  using the email entered at checkout.
                </span>
              </p>
            </div>
          </section>

          {/* Right — branded payment panel */}
          <section aria-labelledby="payment-title" className="lg:sticky lg:top-8 lg:self-start">
            <div className="overflow-hidden rounded-2xl border border-rule-soft bg-card shadow-[0_8px_40px_-16px_rgba(23,28,56,0.10)]">
              <header className="flex items-start justify-between gap-4 border-b border-rule-soft px-6 pb-5 pt-6 sm:px-8">
                <div>
                  <h2 id="payment-title" className="font-display text-xl font-light text-ink">
                    Complete Your Investment
                  </h2>
                  <p className="mt-1 text-[13.5px] text-ink/70">
                    <span className="font-medium text-ink">{config.title}</span>
                    <span className="text-ink/50"> — {config.monthly} {config.cadence}</span>
                  </p>
                </div>
                <span className="flex items-center gap-1.5 rounded-full border border-rule-soft bg-paper-soft px-2.5 py-1 text-[11px] text-ink/60">
                  <ShieldCheck className="h-3.5 w-3.5 text-royal" aria-hidden="true" />
                  Secure checkout
                </span>
              </header>

              <div className="px-2 py-4 sm:px-4">
                <StripeEmbeddedCheckout
                  priceId={config.priceId}
                  returnUrl={returnUrl}
                  metadata={{
                    package_name: `The Walk — ${config.title}`,
                    pace,
                    pace_title: config.title,
                    pace_monthly: config.monthly,
                    pace_cadence: config.cadence,
                    pace_timeline: config.timeline,
                  }}
                />
              </div>

              <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-rule-soft bg-paper-soft px-6 py-4 text-[11.5px] text-ink/55 sm:px-8">
                <span className="inline-flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                  Secure payments powered by Stripe
                </span>
                <span className="text-ink/40">Terms · Privacy</span>
              </footer>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
