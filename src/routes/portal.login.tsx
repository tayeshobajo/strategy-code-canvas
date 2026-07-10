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
    // fall through
  }
  return null;
}

export const Route = createFileRoute("/portal/login")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in — Trust Tai client portal" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PortalLoginPage,
});

function PortalLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pwErr, setPwErr] = useState<string | null>(null);
  const [status, setStatus] = useState<
    "sent" | "no_access" | "link_failed" | "suppressed" | "enqueue_failed" | "network_error" | null
  >(null);
  const requestLink = useServerFn(requestPortalMagicLink);

  useEffect(() => {
    const sub = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_IN") {
        const staffLanding = await resolveStaffLanding(session?.user?.email);
        navigate({ to: staffLanding ?? "/portal" });
      }
    });
    return () => sub.data.subscription.unsubscribe();
  }, [navigate]);

  async function onPasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPwErr(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    setLoading(false);
    if (error) {
      setPwErr(
        error.message === "Invalid login credentials"
          ? "Incorrect email or password. If you haven't set a password yet, use the sign-in link instead."
          : error.message,
      );
    }
    // On success, onAuthStateChange navigates.
  }

  async function onMagicSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setStatus(null);
    try {
      const res = await requestLink({ data: { email: email.trim() } });
      setStatus(res?.status ?? "sent");
      setSubmitted(true);
    } catch (err) {
      console.error("[portal.login] requestLink threw", err);
      setStatus("network_error");
      setSubmitted(true);
    } finally {
      setLoading(false);
    }
  }

  const hasInternalError =
    status === "no_access" ||
    status === "link_failed" ||
    status === "suppressed" ||
    status === "enqueue_failed" ||
    status === "network_error";

  const submittedEmail = email.trim().toLowerCase();
  const isStaffEmail = isAdminEmail(submittedEmail) || isOperatorEmail(submittedEmail);
  const staffLabel = isAdminEmail(submittedEmail) ? "admin" : "operator";

  return (
    <div className="bg-paper min-h-screen flex flex-col">
      <SiteHeader />
      <main className="flex-1 flex items-center justify-center px-6 pt-28 pb-16 sm:pt-32 sm:pb-20">
        <div className="w-full max-w-md rounded-2xl bg-card border border-border p-10">
          <div className="mb-8">
            <h1 className="font-display text-3xl text-ink">Welcome back</h1>
            <p className="text-[15px] leading-[1.75] text-ink/70 mt-3">
              {mode === "password"
                ? "Sign in with your email and password."
                : "Enter the email tied to your engagement. If you have active portal access, we'll send you a secure sign-in link."}
            </p>
          </div>

          {mode === "magic" && submitted ? (
            <div
              className={
                hasInternalError
                  ? "rounded-lg border border-[#a4283c]/30 bg-[#a4283c]/5 p-5"
                  : "rounded-lg border border-ink/10 bg-paper p-5"
              }
              role={hasInternalError ? "alert" : undefined}
            >
              {hasInternalError ? (
                <>
                  <p className="text-[15px] text-ink font-medium">
                    {status === "no_access"
                      ? isStaffEmail
                        ? `This ${staffLabel} account isn't set up yet.`
                        : "No active portal access found for this email."
                      : "Something went wrong on our side."}
                  </p>
                  <p className="text-[13px] text-ink/70 mt-2">
                    {status === "no_access"
                      ? isStaffEmail
                        ? `We recognize this as a Trust Tai ${staffLabel} address, but the role hasn't been provisioned on the backend yet. Contact Tai to finish setup — clients do not need this step.`
                        : "We did not send a sign-in link because this email is not currently authorized for the portal. If you're a client, use the exact address tied to your engagement."
                      : "We couldn't finish sending your sign-in link"}
                    {status === "link_failed" && " (auth link generation failed)"}
                    {status === "suppressed" && " (this address is currently blocked from email delivery)"}
                    {status === "enqueue_failed" && " (email queue rejected the request)"}
                    {status === "network_error" && " (network error contacting the server)"}
                    {status !== "no_access" && (
                      <>
                        . Please try again in a minute, or contact
                        <a href="mailto:hello@trusttai.com" className="underline underline-offset-2 ml-1">
                          hello@trusttai.com
                        </a>
                        .
                      </>
                    )}
                  </p>
                </>
              ) : isStaffEmail ? (
                <>
                  <p className="text-[15px] text-ink">
                    Staff sign-in link on its way to <span className="font-medium">{email}</span>.
                  </p>
                  <p className="text-[13px] text-ink/70 mt-2">
                    This is a Trust Tai {staffLabel} account. Opening the link will take you into the admin dashboard, not a client workspace.
                  </p>
                </>
              ) : (
                <p className="text-[15px] text-ink">
                  If <span className="font-medium">{email}</span> has portal access, a sign-in link is on its way. Check your inbox.
                </p>
              )}
              <button
                onClick={() => {
                  setSubmitted(false);
                  setStatus(null);
                  setEmail("");
                }}
                className="mt-4 text-xs underline text-ink/60"
              >
                Use a different email
              </button>
            </div>
          ) : mode === "password" ? (
            <form onSubmit={onPasswordSubmit} className="space-y-5">
              <div>
                <Label htmlFor="email" className="text-ink">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-2 bg-background"
                />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-ink">Password</Label>
                  <Link to="/forgot-password" className="text-xs text-ink/60 underline underline-offset-2">
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
                  className="mt-2 bg-background"
                />
              </div>
              {pwErr && <p className="text-sm text-destructive">{pwErr}</p>}
              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-ink hover:bg-ink/90 text-white"
              >
                {loading ? "Signing in…" : "Sign in"}
              </Button>
              <button
                type="button"
                onClick={() => { setMode("magic"); setPwErr(null); }}
                className="w-full text-sm text-ink/60 underline underline-offset-2"
              >
                Email me a sign-in link instead
              </button>
            </form>
          ) : (
            <form onSubmit={onMagicSubmit} className="space-y-5">
              <div>
                <Label htmlFor="email" className="text-ink">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-2 bg-background"
                />
              </div>
              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-ink hover:bg-ink/90 text-white"
              >
                {loading ? "Sending…" : "Send me a sign-in link"}
              </Button>
              <button
                type="button"
                onClick={() => { setMode("password"); setStatus(null); }}
                className="w-full text-sm text-ink/60 underline underline-offset-2"
              >
                Sign in with password instead
              </button>
            </form>
          )}

          <p className="text-xs text-ink/50 mt-8 text-center">
            Access is granted only after your payment is confirmed. No signup form.
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
