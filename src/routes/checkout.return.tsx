import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { getCheckoutSessionStatus } from "@/utils/payments.functions";
import { startPortalSignIn } from "@/lib/portal-activation.functions";
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
      <main className="mx-auto max-w-6xl px-6 py-12 sm:py-16">
        {!session_id ? (
          <NoSession />
        ) : isLoading ? (
          <ProcessingLayout />
        ) : isError || !data ? (
          <Recovery sessionId={session_id} />
        ) : "error" in data ? (
          <Recovery sessionId={session_id} />
        ) : data.status === "complete" && data.paymentStatus === "paid" ? (
          <SuccessLayout email={data.customerEmail} sessionId={session_id} />
        ) : data.status === "open" ? (
          <Cancelled />
        ) : (
          <Pending status={data.paymentStatus ?? data.status ?? "processing"} />
        )}
      </main>
    </div>
  );
}

/* -------------------- Success (mockup 2) -------------------- */

function SuccessLayout({ email, sessionId }: { email: string | null; sessionId: string }) {
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* Left — narrative */}
      <section className="space-y-6">
        <div className="inline-flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full border border-royal/40 text-royal">
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-royal">
            Payment Received
          </span>
        </div>
        <h1 className="font-display text-4xl font-light leading-[1.1] text-ink sm:text-[46px]">
          You are in.
          <br />
          <span className="italic">The Roadmap starts now.</span>
        </h1>
        <p className="max-w-lg text-[15px] leading-[1.7] text-ink/65">
          Thank you for your investment in The Walk. Your subscription has been
          confirmed. Next, we'll create your Trust Tai workspace and sign you
          into your portal.
        </p>

        <ActivationCTA sessionId={sessionId} email={email} />

        <p className="flex items-center gap-2 text-[12px] text-ink/50">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          Your payment is secure and your information is protected.
        </p>
      </section>

      {/* Right — confirmation card */}
      <aside>
        <div className="rounded-2xl border border-rule-soft bg-card p-6 shadow-[0_8px_40px_-16px_rgba(23,28,56,0.10)] sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-royal/10">
                <Footprints className="h-5 w-5 text-royal" aria-hidden="true" />
              </div>
              <div>
                <div className="font-display text-xl font-light text-ink">
                  Your Walk
                </div>
                <div className="mt-1 text-[13.5px] text-ink/60">
                  12 months to Point B
                </div>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-medium text-emerald-700">
              <Check className="h-3 w-3" aria-hidden="true" />
              Confirmed
            </span>
          </div>

          <div className="mt-6 space-y-3 border-t border-rule-soft pt-6 text-[13.5px]">
            <Row
              icon={<Mail className="h-4 w-4 text-ink/50" aria-hidden="true" />}
              label="Billing email"
              value={email ?? "—"}
            />
            <Row
              icon={<Calendar className="h-4 w-4 text-ink/50" aria-hidden="true" />}
              label="Status"
              value="Payment confirmed"
            />
            <Row
              icon={<ShieldCheck className="h-4 w-4 text-ink/50" aria-hidden="true" />}
              label="Reference"
              value={<span className="font-mono text-[11.5px] text-ink/60">{shortenSession(sessionId)}</span>}
            />
          </div>

          <div className="mt-6 rounded-xl border border-rule-soft bg-paper-soft p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-royal" aria-hidden="true" />
              <div>
                <div className="text-[13.5px] font-medium text-ink">Payment confirmed</div>
                <div className="mt-1 text-[12.5px] text-ink/60">
                  A receipt {email ? <>is on its way to <span className="font-medium text-ink/80">{email}</span></> : "will arrive shortly"}.
                </div>
              </div>
            </div>
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

function shortenSession(id: string) {
  if (id.length <= 16) return id;
  return `${id.slice(0, 8)}…${id.slice(-6)}`;
}

/* -------------------- Activation CTA -------------------- */

function ActivationCTA({ sessionId, email }: { sessionId: string; email: string | null }) {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pollTick, setPollTick] = useState(0);

  const mutation = useMutation({
    mutationFn: async () => {
      const redirectTo = `${window.location.origin}/portal/home`;
      const res = await startPortalSignIn({
        data: {
          sessionId,
          environment: getStripeEnvironment(),
          redirectTo,
        },
      });
      return res;
    },
    onSuccess: (res) => {
      if ("error" in res) {
        setErrorMsg(res.error);
        return;
      }
      if (res.status === "ready") {
        setErrorMsg(null);
        window.location.replace(res.actionLink);
        return;
      }
      if (res.status === "provisioning") {
        setErrorMsg(null);
        // Retry in a moment while the webhook finishes provisioning the portal.
        setTimeout(() => setPollTick((t) => t + 1), 2500);
        return;
      }
      if (res.status === "unpaid") {
        setErrorMsg("Payment is still settling. Please give it a moment and try again.");
        return;
      }
      if (res.status === "no_email") {
        setErrorMsg("We couldn't find the billing email on this checkout. Email tai@trusttai.com and we'll finish setup by hand.");
      }
    },
    onError: (e: unknown) => {
      setErrorMsg(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    },
  });

  // Auto-retry loop while we're in the "provisioning" holding pattern.
  useEffect(() => {
    if (pollTick === 0) return;
    mutation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollTick]);

  const isProvisioning =
    mutation.isPending ||
    (mutation.data && "status" in mutation.data && mutation.data.status === "provisioning");

  return (
    <div className="space-y-3">
      <Button
        type="button"
        size="lg"
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending || (mutation.data && "status" in mutation.data && mutation.data.status === "ready")}
        className="rounded-full bg-ink px-6 text-white hover:bg-ink/90"
      >
        {isProvisioning ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            Preparing your portal…
          </>
        ) : mutation.data && "status" in mutation.data && mutation.data.status === "ready" ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            Signing you in…
          </>
        ) : (
          <>
            Create my portal account
            <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
          </>
        )}
      </Button>

      {errorMsg && (
        <div className="rounded-lg border border-rule-soft bg-paper-soft p-4 text-[13px] text-ink/75">
          <div>{errorMsg}</div>
          <div className="mt-2 text-[12.5px] text-ink/55">
            You can also sign in with the magic link we're sending to{" "}
            <span className="font-medium text-ink/80">{email ?? "your email"}</span>.{" "}
            <Link to="/portal/login" className="text-royal underline underline-offset-2">
              Go to portal sign-in
            </Link>
            .
          </div>
        </div>
      )}
    </div>
  );
}

/* -------------------- Other states -------------------- */

function ProcessingLayout() {
  return (
    <div className="mx-auto max-w-2xl py-8 text-center">
      <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-royal/10">
        <Loader2 className="h-6 w-6 animate-spin text-royal" aria-hidden="true" />
      </div>
      <div className="mt-6 font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-royal">
        Confirming Your Payment
      </div>
      <h1 className="mt-3 font-display text-3xl font-light text-ink sm:text-4xl">
        Confirming your payment<span className="text-royal">.</span>
      </h1>
      <p className="mx-auto mt-4 max-w-md text-[14.5px] text-ink/60">
        Please keep this page open. Once confirmed, we'll prepare your Trust Tai
        client workspace.
      </p>
    </div>
  );
}

function Cancelled() {
  return (
    <div className="mx-auto max-w-xl py-8 text-center">
      <h1 className="font-display text-3xl font-light text-ink sm:text-4xl">
        Checkout was cancelled.
      </h1>
      <p className="mt-4 text-[15px] text-ink/65">
        Your card was not charged. You can pick up where you left off whenever
        you're ready.
      </p>
      <div className="mt-8 flex flex-col items-center gap-3">
        <Link to="/investment" className="text-sm text-royal underline underline-offset-2">
          Back to investment options
        </Link>
        <Link to="/" className="text-sm text-ink/55">Return home</Link>
      </div>
    </div>
  );
}

function Pending({ status }: { status: string }) {
  return (
    <div className="mx-auto max-w-xl py-8 text-center">
      <h1 className="font-display text-3xl font-light text-ink sm:text-4xl">
        Payment is processing.
      </h1>
      <p className="mt-4 text-[15px] text-ink/65">
        Your payment is currently <span className="font-medium text-ink">{status}</span>.
        We'll email you once it settles — no action needed on your side.
      </p>
      <div className="mt-8">
        <Link to="/" className="text-sm text-royal underline underline-offset-2">Return home</Link>
      </div>
    </div>
  );
}

function Recovery({ sessionId }: { sessionId: string }) {
  return (
    <div className="mx-auto max-w-xl py-8 text-center">
      <h1 className="font-display text-3xl font-light text-ink sm:text-4xl">
        We couldn't confirm your payment.
      </h1>
      <p className="mt-4 text-[15px] text-ink/65">
        This is usually a temporary hiccup. If your card was charged, you'll
        still receive a receipt from Stripe. Reply to that receipt or email{" "}
        <a href="mailto:hello@trusttai.com" className="text-royal underline underline-offset-2">
          hello@trusttai.com
        </a>{" "}
        with the reference below and we'll take it from there.
      </p>
      <p className="mt-2 font-mono text-[11.5px] text-ink/50">Reference: {sessionId}</p>
      <div className="mt-8 flex flex-col items-center gap-3">
        <Link to="/investment" className="text-sm text-royal underline underline-offset-2">
          Back to investment options
        </Link>
        <Link to="/" className="text-sm text-ink/55">Return home</Link>
      </div>
    </div>
  );
}

function NoSession() {
  return (
    <div className="mx-auto max-w-xl py-8 text-center">
      <h1 className="font-display text-3xl font-light text-ink sm:text-4xl">
        No session found.
      </h1>
      <p className="mt-4 text-[15px] text-ink/65">
        We didn't receive a checkout reference. Head back to pick a walk.
      </p>
      <div className="mt-8">
        <Link to="/investment" className="text-sm text-royal underline underline-offset-2">
          Back to investment options
        </Link>
      </div>
    </div>
  );
}
