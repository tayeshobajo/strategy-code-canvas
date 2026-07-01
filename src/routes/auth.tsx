import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}${search.redirect || "/portal"}`,
        shouldCreateUser: true,
      },
    });
    setBusy(false);
    if (error) setErr(error.message);
    else setSent(true);
  }

  return (
    <div style={{ background: "#F7F3EC" }} className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-md space-y-6">
          <header className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight text-[#0B1E3B]">
              Sign in to your portal
            </h1>
            <p className="text-sm text-slate-600">
              Enter the email you used when you purchased. We will send you a
              one-time link.
            </p>
          </header>

          {sent ? (
            <div className="rounded-lg border border-black/5 bg-white p-4 text-sm text-[#0B1E3B]">
              Check {email}. The link signs you in.
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-[#0B1E3B]">
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
                  className="bg-white"
                />
              </div>
              {err && <p className="text-sm text-red-600">{err}</p>}
              <Button
                type="submit"
                disabled={busy}
                className="w-full bg-[#0B1E3B] hover:bg-[#0B1E3B]/90 text-white"
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
