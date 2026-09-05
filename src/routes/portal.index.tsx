import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { supabase } from "@/integrations/supabase/client";

const TITLE = "Client Portal | Trust Tai";
const DESCRIPTION =
  "Sign in to your Trust Tai client portal to see your roadmap, ask a question and follow what is moving.";

export const Route = createFileRoute("/portal/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PortalSignIn,
});

function PortalSignIn() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (active && data.user) navigate({ to: "/portal/roadmap", replace: true });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") navigate({ to: "/portal/roadmap", replace: true });
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [navigate]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/portal` },
    });
    if (error) {
      setState("error");
      setMessage("We could not send that link. Check the address and try again.");
      return;
    }
    setState("sent");
    setMessage("Check your inbox. The link signs you straight in.");
  }

  return (
    <div className="min-h-screen bg-paper text-ink">
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-xl px-5 pt-32 pb-24 sm:px-8">
        <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
          Client portal
        </p>
        <h1 className="mt-4 text-4xl tracking-tight">Sign in to your roadmap</h1>
        <p className="mt-4 text-muted-foreground">
          Enter the email address we work with you on. We will send a one time sign in link.
        </p>

        <form onSubmit={send} className="mt-8 space-y-4">
          <label htmlFor="portal-email" className="block text-sm font-medium">
            Email address
          </label>
          <input
            id="portal-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-12 w-full rounded-xl border border-border bg-card px-4 text-base"
            placeholder="you@company.com"
          />
          <button
            type="submit"
            disabled={state === "sending"}
            className="h-12 w-full rounded-full bg-ink px-6 text-base text-paper disabled:opacity-60"
          >
            {state === "sending" ? "Sending link" : "Send sign in link"}
          </button>
        </form>

        {message ? (
          <p
            role="status"
            className={`mt-5 text-sm ${state === "error" ? "text-destructive" : "text-muted-foreground"}`}
          >
            {message}
          </p>
        ) : null}
      </main>
      <SiteFooter />
    </div>
  );
}
