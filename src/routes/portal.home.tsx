import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useSuspenseQuery, useMutation } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { checkPortalAccess, getPortalContext, resendPortalWelcome } from "@/lib/portal.functions";
import { Button } from "@/components/ui/button";
import { Suspense, useState } from "react";
import { Mail, Check, Loader2, LifeBuoy, ShieldCheck } from "lucide-react";
import { isAdminEmail, isOperatorEmail } from "@/lib/ops/access";



const portalCtxOptions = (fn: ReturnType<typeof useServerFn<typeof getPortalContext>>) =>
  queryOptions({
    queryKey: ["portal", "context"],
    queryFn: () => fn({}),
  });

export const Route = createFileRoute("/portal/home")({
  ssr: false,
  beforeLoad: async () => {
    const res = await checkPortalAccess();
    // Staff/admins are not clients — send them to the admin dashboard on
    // their default portal landing. They can still visit any /portal/*
    // route directly if they need to review a client-facing surface.
    if (res.isAdmin) {
      throw redirect({ to: "/admin" });
    }
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

function PendingWorkspacePanel({ email }: { email?: string }) {
  const resendFn = useServerFn(resendPortalWelcome);
  const [sent, setSent] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const resend = useMutation({
    mutationFn: () => resendFn({}),
    onSuccess: (res) => {
      if (res.ok) {
        setSent(true);
        setErrorMsg(null);
      } else {
        setErrorMsg(
          res.reason === "no_confirmed_access"
            ? "We couldn't match this email to a confirmed engagement. Email tai@trusttai.com and we'll sort it out."
            : "That did not send. Try again in a moment, or email tai@trusttai.com.",
        );
      }
    },
    onError: () =>
      setErrorMsg("That did not send. Try again in a moment, or email tai@trusttai.com."),
  });

  const firstName = email ? email.split("@")[0].split(".")[0] : undefined;
  const greeting = firstName
    ? firstName.charAt(0).toUpperCase() + firstName.slice(1)
    : null;

  const steps = [
    { label: "Access confirmed", state: "complete" as const },
    {
      label: "Workspace being created",
      state: "current" as const,
      sub: "Estimated turnaround: one business day.",
    },
    { label: "Roadmap published", state: "upcoming" as const },
    { label: "Engagement begins", state: "upcoming" as const },
  ];

  return (
    <div className="mx-auto flex min-h-full max-w-3xl items-center justify-center py-6">
      {/* Live announcement region so screen readers broadcast the pending state */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        Workspace is being set up. You are signed in{email ? ` as ${email}` : ""}.
        Step 2 of 4: workspace being created. Most workspaces are ready within one business day.
      </div>

      <section
        className="w-full overflow-hidden rounded-2xl border border-rule-soft bg-card shadow-[0_8px_40px_-16px_rgba(23,28,56,0.08)]"
        aria-busy="true"
        aria-labelledby="pending-workspace-title"
      >
        {/* Header block */}
        <div className="px-8 pb-6 pt-10 sm:px-10">
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block h-2 w-2 animate-pulse rounded-full bg-royal"
            />
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-royal">
              Workspace setup in progress
            </span>
          </div>
          <h1
            id="pending-workspace-title"
            className="mt-6 font-display text-4xl font-light leading-[1.15] text-ink sm:text-[42px]"
          >
            {greeting ? `Welcome back, ${greeting}.` : "Welcome back."}
            <br />
            <span className="italic text-ink/85">We're preparing your environment.</span>
          </h1>
          <p className="mt-5 max-w-xl text-[15px] leading-[1.7] text-ink/60">
            Your engagement workspace is being provisioned. Once live, your
            Roadmap, deliverables, and secure communications appear here — no
            need to sign in again.
          </p>
        </div>

        {/* Stepper */}
        <div className="px-8 pb-4 pt-6 sm:px-10">
          <ol
            className="relative space-y-7"
            aria-label="Workspace setup timeline"
          >
            {/* Vertical hairline behind the circles */}
            <span
              aria-hidden="true"
              className="absolute left-4 top-4 bottom-4 w-px bg-rule-soft"
            />
            {steps.map((step, idx) => {
              const isComplete = step.state === "complete";
              const isCurrent = step.state === "current";
              return (
                <li
                  key={step.label}
                  className="relative flex items-start gap-5"
                  aria-current={isCurrent ? "step" : undefined}
                >
                  <span
                    aria-hidden="true"
                    className={`z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold shadow-[0_0_0_4px_var(--card)] ${
                      isComplete
                        ? "bg-royal text-white"
                        : isCurrent
                          ? "border-2 border-royal bg-card text-royal"
                          : "border border-rule-soft bg-paper-soft text-ink/30"
                    }`}
                  >
                    {isComplete ? <Check className="h-4 w-4" /> : idx + 1}
                  </span>
                  <div className="pt-1">
                    <div
                      className={`text-[14px] ${
                        isCurrent
                          ? "font-medium text-ink"
                          : isComplete
                            ? "text-ink/80"
                            : "text-ink/40"
                      }`}
                    >
                      {step.label}
                      {isCurrent && <span className="sr-only"> (current step)</span>}
                    </div>
                    {step.sub && (
                      <div className="mt-1 text-[12.5px] text-ink/45">
                        {step.sub}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        {/* Action bar */}
        <div className="flex flex-col gap-3 border-t border-rule-soft bg-paper-soft px-8 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-10">
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              type="button"
              disabled={resend.isPending || sent}
              onClick={() => resend.mutate()}
              className="rounded-md bg-ink text-white hover:bg-ink/90"
            >
              {sent ? (
                <>
                  <Check className="mr-2 h-4 w-4" aria-hidden="true" /> Sign-in link sent
                </>
              ) : resend.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> Sending…
                </>
              ) : (
                <>
                  <Mail className="mr-2 h-4 w-4" aria-hidden="true" /> Resend sign-in link
                </>
              )}
            </Button>
            <Button
              asChild
              variant="outline"
              className="rounded-md border-rule-soft bg-card text-ink hover:border-ink/30"
            >
              <a href="mailto:tai@trusttai.com?subject=Portal%20access">
                <LifeBuoy className="mr-2 h-4 w-4" aria-hidden="true" /> Contact Tai
              </a>
            </Button>
          </div>
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-ink/40 sm:text-right">
            Step 2 of 4
          </div>
        </div>

        {errorMsg && (
          <div
            role="alert"
            aria-live="assertive"
            className="border-t border-rule-soft bg-destructive/5 px-8 py-4 text-[13px] text-destructive sm:px-10"
          >
            {errorMsg}
          </div>
        )}
        {sent && !errorMsg && (
          <div
            role="status"
            aria-live="polite"
            className="border-t border-rule-soft bg-card px-8 py-4 text-[13px] text-ink/70 sm:px-10"
          >
            A fresh sign-in link is on its way. It expires in 60 minutes.
          </div>
        )}
      </section>
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

  // Authenticated but no project record yet. Two cases land here:
  //   - Access exists (client_access row) but the project workspace isn't
  //     provisioned in client_portal_projects yet.
  //   - The signed-in email isn't recognized on any engagement.
  // Either way, we keep the user on /portal/home with a clear explanation and
  // prominent recovery actions instead of bouncing to /portal/login.
  if (!data.hasAccess) {
    if (isAdminEmail(data.email) || isOperatorEmail(data.email)) {
      return <StaffAccountPanel email={data.email} />;
    }
    return <PendingWorkspacePanel email={data.email} />;
  }



  const { project } = data;
  const acknowledged = !!data.approvedRoadmap?.acknowledged_at;
  const copy =
    project.portal_status === "roadmap_delivered" && acknowledged
      ? {
          title: "Acknowledged. Awaiting Tai to kick off execution.",
          body: "Your roadmap is signed off. Tai will start the engagement shortly — you'll see files and updates land here as work begins.",
          cta: "Open Roadmap",
          to: "/portal/roadmap",
        }
      : (STATUS_COPY[project.portal_status] ?? STATUS_COPY.payment_confirmed);


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
