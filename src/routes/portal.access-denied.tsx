import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

export const Route = createFileRoute("/portal/access-denied")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Access paused — Trust Tai portal" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AccessDeniedPage,
});

function AccessDeniedPage() {
  useEffect(() => {
    // Ensure no lingering client session persists on this device.
    supabase.auth.signOut().catch(() => {});
  }, []);

  return (
    <div className="bg-paper min-h-screen flex flex-col">
      <SiteHeader />
      <main className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-md rounded-2xl bg-card shadow-xl p-10 border border-border text-center">
          <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal mb-3">
            Trust Tai · Client Portal
          </div>
          <h1 className="font-display text-3xl text-ink">
            Portal access is paused
          </h1>
          <p className="text-[15px] leading-[1.75] text-ink/70 mt-4">
            Your access to the client portal has been paused. If you believe this
            is a mistake, please reach out to Tai directly and we'll sort it out
            together.
          </p>
          <div className="mt-8 flex flex-col gap-3">
            <Button asChild className="bg-ink hover:bg-ink/90 text-white">
              <a href="mailto:tai@trusttai.com">Email Tai</a>
            </Button>
            <Button asChild variant="outline">
              <Link to="/">Back to the site</Link>
            </Button>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
