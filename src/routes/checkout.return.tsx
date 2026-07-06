import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { SiteHeader } from "@/components/SiteHeader";
import { getCheckoutSessionStatus } from "@/utils/payments.functions";
import { getStripeEnvironment } from "@/lib/stripe";

export const Route = createFileRoute("/checkout/return")({
  validateSearch: (search: Record<string, unknown>): { session_id?: string } => ({
    session_id: typeof search.session_id === "string" ? search.session_id : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Checkout status | Trust Tai" },
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
      <main className="mx-auto max-w-2xl px-6 py-20 text-center">
        {!session_id ? (
          <NoSession />
        ) : isLoading ? (
          <h1 className="text-2xl font-semibold tracking-tight">Confirming your payment…</h1>
        ) : isError || !data ? (
          <Recovery sessionId={session_id} />
        ) : data.status === "complete" && data.paymentStatus === "paid" ? (
          <Success email={data.customerEmail} sessionId={session_id} />
        ) : data.status === "open" ? (
          <Cancelled />
        ) : (
          <Pending status={data.paymentStatus ?? data.status ?? "processing"} />
        )}
      </main>
    </div>
  );
}

function Success({ email, sessionId }: { email: string | null; sessionId: string }) {
  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">Payment received.</h1>
      <p className="mt-4 text-base text-muted-foreground">
        {email
          ? `A receipt is on its way to ${email}. Within one business day, you get one reply — from a person, by name. Not a sequence.`
          : "Within one business day, you get one reply — from a person, by name. Not a sequence."}
      </p>
      <p className="mt-2 text-xs text-muted-foreground/70">Reference: {sessionId}</p>
      <div className="mt-8">
        <Link to="/" className="underline text-sm">Return home</Link>
      </div>
    </>
  );
}

function Cancelled() {
  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">Checkout was cancelled.</h1>
      <p className="mt-4 text-base text-muted-foreground">
        Your card was not charged. You can pick up where you left off whenever you're ready.
      </p>
      <div className="mt-8 flex flex-col items-center gap-3">
        <Link to="/investment" className="underline text-sm">Back to investment options</Link>
        <Link to="/" className="text-sm text-muted-foreground">Return home</Link>
      </div>
    </>
  );
}

function Pending({ status }: { status: string }) {
  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">Payment is processing.</h1>
      <p className="mt-4 text-base text-muted-foreground">
        Your payment is currently <span className="font-medium">{status}</span>. We'll email you once it settles — no action needed on your side.
      </p>
      <div className="mt-8">
        <Link to="/" className="underline text-sm">Return home</Link>
      </div>
    </>
  );
}

function Recovery({ sessionId }: { sessionId: string }) {
  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">We couldn't confirm your payment.</h1>
      <p className="mt-4 text-base text-muted-foreground">
        This is usually a temporary hiccup. If your card was charged, you'll still receive a receipt from Stripe. Reply to that receipt or email{" "}
        <a href="mailto:hello@trusttai.com" className="underline">hello@trusttai.com</a> with the reference below and we'll take it from there.
      </p>
      <p className="mt-2 text-xs text-muted-foreground/70">Reference: {sessionId}</p>
      <div className="mt-8 flex flex-col items-center gap-3">
        <Link to="/investment" className="underline text-sm">Back to investment options</Link>
        <Link to="/" className="text-sm text-muted-foreground">Return home</Link>
      </div>
    </>
  );
}

function NoSession() {
  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">No session found.</h1>
      <p className="mt-4 text-sm text-muted-foreground">
        We didn't receive a checkout reference. Head back to pick a walk.
      </p>
      <div className="mt-8">
        <Link to="/investment" className="underline text-sm">Back to investment options</Link>
      </div>
    </>
  );
}
