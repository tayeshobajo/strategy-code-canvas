import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

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
    <main
      className="min-h-screen flex items-center justify-center px-6"
      style={{ background: "#F7F3EC" }}
    >
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl p-10 border border-black/5 text-center">
        <div className="text-xs uppercase tracking-widest text-[#B08A3E] mb-3">
          Trust Tai · Client Portal
        </div>
        <h1
          className="text-3xl font-normal text-[#0B1E3B]"
          style={{ fontFamily: "Georgia, serif" }}
        >
          Portal access is paused
        </h1>
        <p className="text-sm text-slate-600 mt-4 leading-relaxed">
          Your access to the client portal has been paused. If you believe this
          is a mistake, please reach out to Tai directly and we'll sort it out
          together.
        </p>
        <div className="mt-8 flex flex-col gap-3">
          <Button asChild className="bg-[#0B1E3B] hover:bg-[#0B1E3B]/90 text-white">
            <a href="mailto:tai@trusttai.com">Email Tai</a>
          </Button>
          <Button asChild variant="outline">
            <Link to="/">Back to the site</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
