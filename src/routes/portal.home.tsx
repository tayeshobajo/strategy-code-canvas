import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPortalContext, resendPortalWelcome } from "@/lib/portal.functions";
import { Button } from "@/components/ui/button";
import { Suspense, useEffect, useState } from "react";
import { Mail, Check } from "lucide-react";

const portalCtxOptions = (fn: ReturnType<typeof useServerFn<typeof getPortalContext>>) =>
  queryOptions({
    queryKey: ["portal", "context"],
    queryFn: () => fn({}),
  });

export const Route = createFileRoute("/portal/home")({
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
    <div className="rounded-xl bg-white/70 border border-black/5 p-10 text-slate-500">
      Loading your portal…
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
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchCtx = useServerFn(getPortalContext);
  const { data } = useSuspenseQuery(portalCtxOptions(fetchCtx));

  // If no portal access at all, redirect to login (should be blocked by layout but guard anyway)
  useEffect(() => {
    if (!data.hasAccess) {
      qc.clear();
      navigate({ to: "/portal/login" });
    }
  }, [data.hasAccess, navigate, qc]);

  if (!data.hasAccess) return <LoadingCard />;

  const { project } = data;
  const copy = STATUS_COPY[project.portal_status] ?? STATUS_COPY.payment_confirmed;

  return (
    <div className="max-w-4xl space-y-8">
      {/* Identity + status */}
      <section className="rounded-2xl bg-white border border-black/5 shadow-sm p-10">
        <div className="flex items-center justify-between gap-6 mb-6">
          <div>
            <div className="text-[11px] uppercase tracking-widest text-[#B08A3E]">
              {project.package_name ?? project.purchased_package ?? "Client engagement"}
            </div>
            <h1
              className="text-3xl text-[#0B1E3B] mt-2"
              style={{ fontFamily: "Georgia, serif" }}
            >
              {project.contact_name
                ? `Hello, ${project.contact_name.split(" ")[0]}.`
                : "Hello."}
            </h1>
          </div>
          <StatusPill status={project.portal_status} />
        </div>

        <p
          className="text-xl text-[#0B1E3B] mb-3"
          style={{ fontFamily: "Georgia, serif" }}
        >
          {copy.title}
        </p>
        <p className="text-slate-600 leading-relaxed max-w-2xl">{copy.body}</p>

        <div className="mt-8">
          <Button
            asChild
            size="lg"
            className="bg-[#0B1E3B] hover:bg-[#0B1E3B]/90 text-white"
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
    </div>
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
    <div className="rounded-xl bg-white border border-black/5 p-5">
      <div className="text-[11px] uppercase tracking-widest text-slate-500">
        {label}
      </div>
      <div className="text-[#0B1E3B] mt-2 font-medium">{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const label = status.replace(/_/g, " ");
  return (
    <span className="text-[11px] uppercase tracking-widest px-3 py-1.5 rounded-full bg-[#F7F3EC] text-[#0B1E3B] border border-[#D4A857]/30">
      {label}
    </span>
  );
}
