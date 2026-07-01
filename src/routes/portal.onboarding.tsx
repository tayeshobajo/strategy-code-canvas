import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { checkPortalAccess } from "@/lib/portal.functions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/portal/onboarding")({
  ssr: false,
  beforeLoad: async () => {
    const res = await checkPortalAccess();
    if (res.status === "revoked") {
      throw redirect({ to: "/portal/access-denied" });
    }
    if (res.status === "none") {
      throw redirect({ to: "/portal/login" });
    }
  },
  head: () => ({
    meta: [
      { title: "Onboarding — Trust Tai portal" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OnboardingPage,
});

function OnboardingPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <section className="rounded-2xl bg-card border border-border shadow-sm p-8 lg:p-10">
        <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal">
          Onboarding
        </div>
        <h1 className="font-display text-3xl text-ink mt-2">
          Let's begin.
        </h1>
        <p className="text-[15px] leading-[1.75] text-ink/70 mt-4">
          Your guided intake will appear here. Tai will reach out with the next
          step within one business day.
        </p>
        <div className="mt-8">
          <Button asChild variant="outline">
            <Link to="/portal/home">Back to portal home</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
