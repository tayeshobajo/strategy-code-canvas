import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  component: ResetPasswordPage,
  head: () => ({
    meta: [
      { title: "Set a new password — Trust Tai" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState<"checking" | "ok" | "invalid">("checking");
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let recovered = false;
    const sub = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        recovered = true;
        setReady("ok");
      }
    });
    // Give Supabase a moment to exchange the URL hash for a session.
    const t = setTimeout(async () => {
      if (recovered) return;
      const { data } = await supabase.auth.getSession();
      setReady(data.session ? "ok" : "invalid");
    }, 800);
    return () => {
      clearTimeout(t);
      sub.data.subscription.unsubscribe();
    };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (pw.length < 10) return setErr("Password must be at least 10 characters.");
    if (pw !== confirm) return setErr("Passwords don't match.");
    setBusy(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const email = sessionData.session?.user?.email ?? "";
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) {
      setBusy(false);
      setErr(error.message || "Couldn't update password.");
      return;
    }
    await supabase.auth.signOut();
    setDone(true);
    setBusy(false);
    setTimeout(() => {
      navigate({ to: "/auth", search: { email, redirect: "/portal" } });
    }, 1200);
  }

  return (
    <div className="bg-paper min-h-screen flex flex-col">
      <SiteHeader />
      <main className="flex-1 flex items-center justify-center px-6 pt-28 pb-16 sm:pt-32 sm:pb-20">
        <div className="w-full max-w-md space-y-6">
          <header className="space-y-2">
            <h1 className="font-display text-2xl text-ink">Set a new password</h1>
          </header>

          {ready === "checking" && (
            <p className="text-sm text-ink/60">Verifying reset link…</p>
          )}

          {ready === "invalid" && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-[15px] text-ink">
              This password reset link is invalid or has expired.{" "}
              <Link to="/forgot-password" className="underline underline-offset-2">
                Request a new one
              </Link>
              .
            </div>
          )}

          {ready === "ok" && !done && (
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="pw" className="text-ink">New password</Label>
                <Input
                  id="pw"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                  className="bg-background"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm" className="text-ink">Confirm password</Label>
                <Input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="bg-background"
                />
              </div>
              {err && <p className="text-sm text-destructive">{err}</p>}
              <Button
                type="submit"
                disabled={busy}
                className="w-full bg-ink hover:bg-ink/90 text-white"
              >
                {busy ? "Updating…" : "Update password"}
              </Button>
            </form>
          )}

          {done && (
            <div className="rounded-lg border border-border bg-card p-4 text-[15px] text-ink">
              Password updated. Redirecting you to sign in…
            </div>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
