import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { requestPortalMagicLink } from "@/lib/portal.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    email: typeof s.email === "string" ? s.email : undefined,
    redirect: typeof s.redirect === "string" ? s.redirect : "/portal",
  }),
  component: AuthPage,
  head: () => ({
    meta: [
      { title: "Sign in — Trust Tai" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function AuthPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const sendPortalLink = useServerFn(requestPortalMagicLink);
  const [email, setEmail] = useState(search.email ?? "");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const sub = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") {
        navigate({ to: search.redirect || "/portal" });
      }
    });
    return () => {
      sub.data.subscription.unsubscribe();
    };
  }, [navigate, search.redirect]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const res = await sendPortalLink({ data: { email: email.trim().toLowerCase() } });
      if (res?.status === "link_failed") {
        setErr("We couldn't create your sign-in link. Please try again in a minute.");
        return;
      }
      if (res?.status === "suppressed") {
        setErr("This address is currently blocked from email delivery. Please contact hello@trusttai.com.");
        return;
      }
      if (res?.status === "enqueue_failed") {
        setErr("We couldn't queue your sign-in email. Please try again in a minute.");
        return;
      }
      setSent(true);
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-paper min-h-screen flex flex-col">
      <SiteHeader />
      <main className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-md space-y-6">
          <header className="space-y-2">
            <h1 className="font-display text-2xl text-ink">
              Sign in to your portal
            </h1>
            <p className="text-[15px] leading-[1.75] text-ink/70">
              Enter the email you used when you purchased. We will send you a
              one-time link.
            </p>
          </header>

          {sent ? (
            <div className="rounded-lg border border-border bg-card p-4 text-[15px] text-ink">
              Check {email}. The link signs you in.
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-ink">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="bg-background"
                />
              </div>
              {err && <p className="text-sm text-destructive">{err}</p>}
              <Button
                type="submit"
                disabled={busy}
                className="w-full bg-ink hover:bg-ink/90 text-white"
              >
                {busy ? "Sending…" : "Send link"}
              </Button>
            </form>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
