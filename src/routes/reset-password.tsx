import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import {
  PASSWORD_STRENGTH_LABELS,
  scorePasswordStrength,
  validatePassword,
  type PasswordFieldErrors,
} from "@/lib/password-validation";

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
  const [errors, setErrors] = useState<PasswordFieldErrors>({});
  const [formErr, setFormErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const strength = scorePasswordStrength(pw);

  useEffect(() => {
    let recovered = false;
    const sub = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        recovered = true;
        setReady("ok");
      }
    });
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
    setFormErr(null);
    const result = validatePassword({ newPassword: pw, confirm });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setBusy(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const email = sessionData.session?.user?.email ?? "";
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) {
      setBusy(false);
      setFormErr(error.message || "Couldn't update password.");
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
            <form onSubmit={onSubmit} className="space-y-4" noValidate>
              <div className="space-y-2">
                <Label htmlFor="pw" className="text-ink">New password</Label>
                <Input
                  id="pw"
                  type="password"
                  autoComplete="new-password"
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                  className="bg-background"
                  aria-invalid={Boolean(errors.newPassword)}
                  aria-describedby={errors.newPassword ? "pw-error" : undefined}
                />
                {errors.newPassword && (
                  <p id="pw-error" className="text-[12px] text-destructive">
                    {errors.newPassword}
                  </p>
                )}
                {pw && !errors.newPassword && (
                  <div className="flex items-center gap-2">
                    <div className="h-1 flex-1 rounded-full bg-paper-soft overflow-hidden">
                      <div
                        className={`h-full transition-all ${
                          strength >= 3
                            ? "bg-emerald-600"
                            : strength === 2
                              ? "bg-amber-500"
                              : "bg-destructive"
                        }`}
                        style={{ width: `${(strength / 4) * 100}%` }}
                      />
                    </div>
                    <span className="text-[11px] text-ink/60">
                      {PASSWORD_STRENGTH_LABELS[strength]}
                    </span>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm" className="text-ink">Confirm password</Label>
                <Input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="bg-background"
                  aria-invalid={Boolean(errors.confirm)}
                  aria-describedby={errors.confirm ? "confirm-error" : undefined}
                />
                {errors.confirm && (
                  <p id="confirm-error" className="text-[12px] text-destructive">
                    {errors.confirm}
                  </p>
                )}
              </div>
              {formErr && <p className="text-sm text-destructive">{formErr}</p>}
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
