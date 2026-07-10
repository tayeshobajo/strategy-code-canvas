import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { requestPortalMagicLink } from "@/lib/portal.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { isAdminEmail, isOperatorEmail } from "@/lib/ops/access";

async function resolveStaffLanding(email: string | null | undefined): Promise<string | null> {
  const em = (email ?? "").toLowerCase();
  if (!em) return null;
  if (isAdminEmail(em) || isOperatorEmail(em)) return "/engine";
  try {
    const [{ data: admin }, { data: op }, { data: team }] = await Promise.all([
      supabase.rpc("has_role_email", { _email: em, _role: "admin" }),
      supabase.rpc("has_role_email", { _email: em, _role: "operator" }),
      supabase.rpc("has_role_email", { _email: em, _role: "team_member" }),
    ]);
    if (admin === true || op === true || team === true) return "/engine";
  } catch {
    // fall through to portal
  }
  return null;
}

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
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const sub = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_IN") {
        const staffLanding = await resolveStaffLanding(session?.user?.email);
        const explicit =
          search.redirect && search.redirect !== "/portal" ? search.redirect : null;
        navigate({ to: staffLanding ?? explicit ?? "/portal" });
      }
    });
    return () => {
      sub.data.subscription.unsubscribe();
    };
  }, [navigate, search.redirect]);

  async function onPasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error) {
        setErr(
          error.message === "Invalid login credentials"
            ? "Incorrect email or password. If you haven't set a password yet, use the sign-in link instead."
            : error.message,
        );
      }
      // On success, onAuthStateChange navigates.
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function onMagicSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const res = await sendPortalLink({ data: { email: email.trim().toLowerCase() } });
      if (res?.status === "no_access") {
        setErr("No active portal access was found for this email, so no sign-in link was sent.");
        return;
      }
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
      <main className="flex-1 flex items-center justify-center px-6 pt-28 pb-16 sm:pt-32 sm:pb-20">
        <div className="w-full max-w-md space-y-6">
          <header className="space-y-2">
            <h1 className="font-display text-2xl text-ink">
              Sign in to your portal
            </h1>
            <p className="text-[15px] leading-[1.75] text-ink/70">
              {mode === "password"
                ? "Enter your email and password."
                : "Enter your email and we'll send you a one-time sign-in link."}
            </p>
          </header>

          {sent ? (
            <div className="rounded-lg border border-border bg-card p-4 text-[15px] text-ink">
              Check {email}. The link signs you in.
            </div>
          ) : mode === "password" ? (
            <form onSubmit={onPasswordSubmit} className="space-y-4">
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
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-ink">Password</Label>
                  <Link
                    to="/forgot-password"
                    className="text-xs text-ink/60 underline underline-offset-2"
                  >
                    Forgot password?
                  </Link>
                </div>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-background"
                />
              </div>
              {err && <p className="text-sm text-destructive">{err}</p>}
              <Button
                type="submit"
                disabled={busy}
                className="w-full bg-ink hover:bg-ink/90 text-white"
              >
                {busy ? "Signing in…" : "Sign in"}
              </Button>
              <button
                type="button"
                onClick={() => { setMode("magic"); setErr(null); }}
                className="w-full text-sm text-ink/60 underline underline-offset-2"
              >
                Email me a sign-in link instead
              </button>
            </form>
          ) : (
            <form onSubmit={onMagicSubmit} className="space-y-4">
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
                {busy ? "Sending…" : "Send link"}
              </Button>
              <button
                type="button"
                onClick={() => { setMode("password"); setErr(null); }}
                className="w-full text-sm text-ink/60 underline underline-offset-2"
              >
                Sign in with password instead
              </button>
            </form>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
