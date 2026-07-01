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
    <div className="max-w-3xl space-y-6">
      <section className="rounded-2xl bg-white border border-black/5 shadow-sm p-10">
        <div className="text-[11px] uppercase tracking-widest text-[#B08A3E]">
          Onboarding
        </div>
        <h1
          className="text-3xl text-[#0B1E3B] mt-2"
          style={{ fontFamily: "Georgia, serif" }}
        >
          Let's begin.
        </h1>
        <p className="text-slate-600 mt-4 leading-relaxed">
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
