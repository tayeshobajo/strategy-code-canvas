import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { checkPortalAccess } from "@/lib/portal.functions";
import { Button } from "@/components/ui/button";
import { PortalPage, PortalCard, PortalPageHeader } from "@/components/portal/PortalPage";

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
    <PortalPage width="3xl">
      <PortalCard>
        <PortalPageHeader
          eyebrow="Onboarding"
          title="Let's begin."
          description="Your guided intake will appear here. Tai will reach out with the next step within one business day."
        />
        <div className="mt-8">
          <Button asChild variant="outline">
            <Link to="/portal/home">Back to portal home</Link>
          </Button>
        </div>
      </PortalCard>
    </PortalPage>
  );
}
