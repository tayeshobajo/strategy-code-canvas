import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

export const Route = createFileRoute("/forgot-password")({
  ssr: false,
  component: ForgotPasswordPage,
  head: () => ({
    meta: [
      { title: "Reset your password — Trust Tai" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        { redirectTo: `${window.location.origin}/reset-password` },
      );
      if (error) throw error;
      setSent(true);
    } catch (e) {
      // Show neutral success anyway to avoid user enumeration, but log.
      console.error("[forgot-password] reset failed", e);
      setSent(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-paper min-h-screen flex flex-col">
      <SiteHeader />
      <main className="flex-1 flex items-center justify-center px-6 pt-28 pb-16 sm:pt-32 sm:pb-20">
        <div className="w-full max-w-md space-y-6">
          <header className="space-y-2">
            <h1 className="font-display text-2xl text-ink">Reset your password</h1>
            <p className="text-[15px] leading-[1.75] text-ink/70">
              Enter your email and we'll send you a link to set a new password.
            </p>
          </header>

          {sent ? (
            <div className="rounded-lg border border-border bg-card p-4 text-[15px] text-ink">
              If an account exists for <span className="font-medium">{email}</span>,
              a password reset link is on its way. Check your inbox.
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-ink">Email</Label>
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
                {busy ? "Sending…" : "Send reset link"}
              </Button>
            </form>
          )}

          <div className="text-sm text-ink/60">
            <Link to="/auth" search={{ email: undefined, redirect: "/portal" }} className="underline underline-offset-2">Back to sign in</Link>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
