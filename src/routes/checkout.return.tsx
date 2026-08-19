import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { SiteHeader } from "@/components/SiteHeader";
import { getCheckoutSessionStatus } from "@/utils/payments.functions";
import { getStripeEnvironment } from "@/lib/stripe";
import {
  ArrowRight,
  Calendar,
  Check,
  Footprints,
  Loader2,
  Mail,
  ShieldCheck,
} from "lucide-react";

export const Route = createFileRoute("/checkout/return")({
  validateSearch: (search: Record<string, unknown>): { session_id?: string } => ({
    session_id: typeof search.session_id === "string" ? search.session_id : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Checkout status | Trust Tai" },
      { name: "description", content: "Confirmation for your Trust Tai Walk purchase." },
      { property: "og:title", content: "Checkout status | Trust Tai" },
      { property: "og:description", content: "Confirmation for your Trust Tai Walk purchase." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CheckoutReturn,
});

function CheckoutReturn() {
  const { session_id } = Route.useSearch();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["checkout-session-status", session_id],
    enabled: !!session_id,
    queryFn: async () => {
      const result = await getCheckoutSessionStatus({
        data: { sessionId: session_id!, environment: getStripeEnvironment() },
      });
      if ("error" in result) throw new Error(result.error);
      return result;
    },
    retry: 1,
  });

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-6 pt-28 pb-16 sm:pt-32">
        {!session_id ? (
          <Message
            title="No checkout to show"
            body="This page needs a checkout reference. Start from the investment page and we'll bring you back here."
          />
        ) : isLoading ? (
          <div className="flex items-center gap-3 text-[14px] text-ink/60">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Checking your payment…
          </div>
        ) : isError || !data || "error" in data ? (
          <Message
            title="We couldn't read this checkout"
            body="Your card may still have been charged. Email hello@trusttai.com with your reference and we'll confirm by hand."
          />
        ) : data.status === "complete" && data.paymentStatus === "paid" ? (
          <Success email={data.customerEmail} sessionId={session_id} />
        ) : data.status === "open" ? (
          <Message
            title="Checkout was not completed"
            body="Nothing was charged. You can pick up where you left off whenever you're ready."
          />
        ) : (
          <Message
            title="Payment is still settling"
            body="Give it a moment and refresh. A receipt will arrive by email once it clears."
          />
        )}
      </main>
    </div>
  );
}

function Success({ email, sessionId }: { email: string | null; sessionId: string }) {
  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <section className="space-y-6">
        <div className="inline-flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full border border-royal/40 text-royal">
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-royal">
            Payment received
          </span>
        </div>
        <h1 className="font-display text-4xl font-light leading-[1.1] text-ink sm:text-[46px]">
          You are in.
          <br />
          <span className="italic">The Walk starts now.</span>
        </h1>
        <p className="max-w-lg text-[15px] leading-[1.7] text-ink/65">
          Thank you for your investment. Tai will be in touch by email
          {email ? <> at <span className="font-medium text-ink/85">{email}</span></> : null} with
          your first steps.
        </p>
        <Link
          to="/build-my-roadmap"
          className="inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3 text-[13px] text-paper transition-transform hover:scale-[1.02]"
        >
          Tell Tai about your business
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
        <p className="flex items-center gap-2 text-[12px] text-ink/50">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          Your payment is secure and your information is protected.
        </p>
      </section>

      <aside>
        <div className="rounded-2xl border border-rule-soft bg-card p-6 shadow-[0_8px_40px_-16px_rgba(23,28,56,0.10)] sm:p-8">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-royal/10">
              <Footprints className="h-5 w-5 text-royal" aria-hidden="true" />
            </div>
            <div>
              <div className="font-display text-xl font-light text-ink">Your Walk</div>
              <div className="mt-1 text-[13.5px] text-ink/60">12 months to Point B</div>
            </div>
          </div>
          <div className="mt-6 space-y-3 border-t border-rule-soft pt-6 text-[13.5px]">
            <Row icon={<Mail className="h-4 w-4 text-ink/50" />} label="Billing email" value={email ?? "—"} />
            <Row icon={<Calendar className="h-4 w-4 text-ink/50" />} label="Status" value="Payment confirmed" />
            <Row
              icon={<ShieldCheck className="h-4 w-4 text-ink/50" />}
              label="Reference"
              value={<span className="font-mono text-[11.5px] text-ink/60">{shortenSession(sessionId)}</span>}
            />
          </div>
        </div>
      </aside>
    </div>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="flex items-center gap-2 text-ink/60">
        {icon}
        {label}
      </span>
      <span className="text-right text-ink">{value}</span>
    </div>
  );
}

function Message({ title, body }: { title: string; body: string }) {
  return (
    <div className="max-w-xl space-y-3">
      <h1 className="font-display text-3xl font-light text-ink">{title}</h1>
      <p className="text-[15px] leading-[1.7] text-ink/65">{body}</p>
      <Link to="/" className="inline-block text-[13.5px] text-royal underline underline-offset-2">
        Back to trusttai.com
      </Link>
    </div>
  );
}

function shortenSession(id: string) {
  if (id.length <= 16) return id;
  return `${id.slice(0, 8)}…${id.slice(-6)}`;
}
