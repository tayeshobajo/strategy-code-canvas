import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useSuspenseQuery, useMutation } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { checkPortalAccess, getPortalContext, resendPortalWelcome } from "@/lib/portal.functions";
import { Button } from "@/components/ui/button";
import { Suspense, useState } from "react";
import { Mail, Check, Loader2, LifeBuoy } from "lucide-react";

const portalCtxOptions = (fn: ReturnType<typeof useServerFn<typeof getPortalContext>>) =>
  queryOptions({
    queryKey: ["portal", "context"],
    queryFn: () => fn({}),
  });

export const Route = createFileRoute("/portal/home")({
  ssr: false,
  beforeLoad: async () => {
    const res = await checkPortalAccess();
    // Only redirect for explicit rejection states. If access is "none" but the
    // user is authenticated (portal layout already gated on that), fall through
    // so PortalHome can render a friendly "we don't recognize this account"
    // panel instead of bouncing the user back to /portal/login.
    if (res.status === "revoked") {
      throw redirect({ to: "/portal/access-denied" });
    }
  },
  head: () => ({
    meta: [
      { title: "Home — Trust Tai portal" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <Suspense fallback={<LoadingCard />}>
      <PortalHome />
    </Suspense>
  ),
});

function LoadingCard() {
  return (
    <div className="max-w-2xl mx-auto rounded-2xl bg-card border border-border p-10 flex items-center gap-3 text-ink/60">
      <Loader2 className="w-4 h-4 animate-spin text-royal" />
      <span>Loading your portal…</span>
    </div>
  );
}

const STATUS_COPY: Record<
  string,
  { title: string; body: string; cta: string; to: string }
> = {
  payment_confirmed: {
    title: "Welcome. Your engagement is confirmed.",
    body: "Next, complete the short onboarding so Tai can build your Roadmap.",
    cta: "Start onboarding",
    to: "/portal/onboarding",
  },
  access_sent: {
    title: "Welcome. Your access is live.",
    body: "Complete the short onboarding so we can begin your Roadmap.",
    cta: "Start onboarding",
    to: "/portal/onboarding",
  },
  onboarding_pending: {
    title: "Let's start with onboarding.",
    body: "A short, guided intake takes about 15 minutes. You can save and continue anytime.",
    cta: "Continue onboarding",
    to: "/portal/onboarding",
  },
  onboarding_complete: {
    title: "Onboarding received. Tai is reviewing.",
    body: "You'll be notified as soon as your Roadmap begins.",
    cta: "View messages",
    to: "/portal/messages",
  },
  roadmap_in_progress: {
    title: "Your Roadmap is in progress.",
    body: "Tai is drafting a strategic plan tailored to your business.",
    cta: "See recent activity",
    to: "/portal/messages",
  },
  roadmap_ready: {
    title: "Your Roadmap is ready.",
    body: "Review and acknowledge your approved Roadmap.",
    cta: "Open Roadmap",
    to: "/portal/roadmap",
  },
  roadmap_delivered: {
    title: "Your Roadmap is delivered.",
    body: "Revisit your plan and next-move recommendation anytime.",
    cta: "Open Roadmap",
    to: "/portal/roadmap",
  },
  engagement_active: {
    title: "Engagement in progress.",
    body: "Track deliverables, messages, and files as work unfolds.",
    cta: "View files",
    to: "/portal/files",
  },
  engagement_complete: {
    title: "Engagement complete.",
    body: "Your files, Roadmap, and billing history remain available here.",
    cta: "Open Roadmap",
    to: "/portal/roadmap",
  },
  access_revoked: {
    title: "Portal access is paused.",
    body: "Reach out to Tai to reinstate access.",
    cta: "Contact Tai",
    to: "/portal/messages",
  },
};

function PortalHome() {
  const fetchCtx = useServerFn(getPortalContext);
  const { data } = useSuspenseQuery(portalCtxOptions(fetchCtx));

  // Authenticated but no project record yet — show a friendly pending state
  // instead of bouncing to /portal/login (which would look like a rejection).
  if (!data.hasAccess) {
    return (
      <div className="max-w-2xl mx-auto">
        <section className="rounded-2xl bg-card border border-border shadow-sm p-8 lg:p-10">
          <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal">
            Client portal
          </div>
          <h1 className="font-display text-3xl text-ink mt-2">
            You're signed in.
          </h1>
          <p className="text-[15px] leading-[1.75] text-ink/70 mt-4">
            Your engagement workspace is being set up. You'll see your Roadmap
            and next steps here as soon as Tai provisions the project.
          </p>
          <p className="text-[13px] text-ink/60 mt-6">
            Questions? Email{" "}
            <a className="underline" href="mailto:tai@trusttai.com">
              tai@trusttai.com
            </a>
            .
          </p>
        </section>
        <div className="mt-6">
          <ResendWelcomeCard />
        </div>
      </div>
    );
  }

  const { project } = data;
  const copy = STATUS_COPY[project.portal_status] ?? STATUS_COPY.payment_confirmed;

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Identity + status */}
      <section className="rounded-2xl bg-card border border-border shadow-sm p-8 lg:p-10">
        <div className="flex items-center justify-between gap-6 mb-6">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal">
              {project.package_name ?? project.purchased_package ?? "Client engagement"}
            </div>
            <h1 className="font-display text-3xl text-ink mt-2">
              {project.contact_name
                ? `Hello, ${project.contact_name.split(" ")[0]}.`
                : "Hello."}
            </h1>
          </div>
          <StatusPill status={project.portal_status} />
        </div>

        <p className="font-display text-xl text-ink mt-4">
          {copy.title}
        </p>
        <p className="text-[15px] leading-[1.75] text-ink/70 max-w-2xl mt-2">
          {copy.body}
        </p>

        <div className="mt-8">
          <Button
            asChild
            size="lg"
            className="bg-ink hover:bg-ink/90 text-white"
          >
            <Link to={copy.to}>{copy.cta}</Link>
          </Button>
        </div>
      </section>

      {/* Milestone strip */}
      <section className="grid md:grid-cols-3 gap-4">
        <InfoCard label="Current phase" value={project.current_phase ?? "—"} />
        <InfoCard
          label="Next milestone"
          value={project.next_milestone ?? "To be scheduled"}
          sub={
            project.next_milestone_due_at
              ? new Date(project.next_milestone_due_at).toLocaleDateString()
              : undefined
          }
        />
        <InfoCard
          label="Approved Roadmap"
          value={data.approvedRoadmap ? data.approvedRoadmap.title : "Not yet published"}
          sub={
            data.approvedRoadmap?.approved_at
              ? `Approved ${new Date(data.approvedRoadmap.approved_at).toLocaleDateString()}`
              : undefined
          }
        />
      </section>

      <ResendWelcomeCard />
    </div>
  );
}

function ResendWelcomeCard() {
  const resendFn = useServerFn(resendPortalWelcome);
  const [sent, setSent] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () => resendFn({}),
    onSuccess: (res) => {
      if (res.ok) {
        setSent(true);
        setErrorMsg(null);
      } else {
        setErrorMsg(
          res.reason === "no_confirmed_access"
            ? "We couldn't find a Stripe-confirmed engagement on this account."
            : "That did not send. Please try again in a moment.",
        );
      }
    },
    onError: () => setErrorMsg("That did not send. Please try again in a moment."),
  });

  return (
    <section className="rounded-xl bg-card border border-border p-6 flex items-center justify-between gap-6">
      <div>
        <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal">
          Sign-in link
        </div>
        <div className="text-ink mt-1 font-medium">
          Need a fresh sign-in link?
        </div>
        <div className="text-[13px] leading-relaxed text-ink/60 mt-1">
          We'll email a new secure link to the address on your engagement. It
          expires in 60 minutes.
        </div>
        {errorMsg && (
          <div className="text-xs text-destructive mt-2">{errorMsg}</div>
        )}
      </div>
      <Button
        type="button"
        variant="outline"
        disabled={mutation.isPending || sent}
        onClick={() => mutation.mutate()}
        className="border-ink/20 text-ink"
      >
        {sent ? (
          <>
            <Check className="w-4 h-4 mr-2" /> Sent
          </>
        ) : (
          <>
            <Mail className="w-4 h-4 mr-2" />
            {mutation.isPending ? "Sending…" : "Resend welcome email"}
          </>
        )}
      </Button>
    </section>
  );
}

function InfoCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl bg-card border border-border p-5">
      <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal">
        {label}
      </div>
      <div className="text-ink mt-2 font-medium">{value}</div>
      {sub && <div className="text-[13px] text-ink/60 mt-1">{sub}</div>}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const label = status.replace(/_/g, " ");
  return (
    <span className="text-[11px] uppercase tracking-widest px-3 py-1.5 rounded-full bg-paper text-ink border border-royal/30">
      {label}
    </span>
  );
}
