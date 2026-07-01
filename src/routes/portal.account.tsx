import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  User,
  Mail,
  Shield,
  LogOut,
  Loader2,
  Check,
  ExternalLink,
  Clock,
  Monitor,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { resendPortalWelcome } from "@/lib/portal.functions";
import { usePortalContext } from "@/hooks/use-portal-context";
import { toast } from "sonner";

export const Route = createFileRoute("/portal/account")({
  head: () => ({
    meta: [
      { title: "Account — Trust Tai portal" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AccountPage,
});

function AccountPage() {
  const navigate = useNavigate();
  const ctx = usePortalContext();
  const [email, setEmail] = useState<string | null>(null);
  const [lastSignInAt, setLastSignInAt] = useState<string | null>(null);
  const resendFn = useServerFn(resendPortalWelcome);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
      setLastSignInAt(data.user?.last_sign_in_at ?? null);
    });
  }, []);

  const resend = useMutation({
    mutationFn: () => resendFn({}),
    onSuccess: (res) => {
      if (res.ok) toast.success("Sign-in link sent. Check your inbox.");
      else toast.error("Couldn't send. Email tai@trusttai.com if this keeps happening.");
    },
    onError: () => toast.error("Couldn't send. Try again in a moment."),
  });

  async function signOutEverywhere() {
    await supabase.auth.signOut({ scope: "global" });
    navigate({ to: "/portal/login", replace: true });
  }

  const project = ctx.data?.hasAccess ? ctx.data.project : null;
  const isRevoked = ctx.data && !ctx.data.hasAccess;

  return (
    <div className="max-w-6xl mx-auto grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-6">
        <header>
          <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal flex items-center gap-2">
            <User className="w-3.5 h-3.5" /> Account & Access
          </div>
          <h1 className="font-display text-3xl text-ink mt-2">Your account</h1>
          <p className="text-[15px] leading-[1.75] text-ink/70 mt-2">
            Manage your profile, login settings, and portal access.
          </p>
        </header>

        {/* Profile */}
        <section className="rounded-2xl bg-card border border-border shadow-sm p-6 lg:p-8">
          <h2 className="font-display text-xl text-ink">Profile information</h2>
          <p className="text-[13px] text-ink/60 mt-1">
            Your basic information from your engagement.
          </p>
          <dl className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-y-5 gap-x-8">
            <Field label="Full name" value={project?.contact_name ?? "—"} />
            <Field label="Email address" value={email ?? "—"} />
            <Field label="Company" value={project?.company_name ?? "—"} />
            <Field
              label="Package"
              value={project?.package_name ?? project?.purchased_package ?? "—"}
            />
          </dl>
          <p className="text-[12px] text-ink/50 mt-6">
            Need to change something? Email{" "}
            <a href="mailto:tai@trusttai.com" className="underline hover:text-ink">
              tai@trusttai.com
            </a>{" "}
            and we'll update it.
          </p>
        </section>

        {/* Login & Security */}
        <section className="rounded-2xl bg-card border border-border shadow-sm p-6 lg:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-display text-xl text-ink">Login & Security</h2>
              <p className="text-[13px] text-ink/60 mt-1">
                Manage how you access your portal securely.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => resend.mutate()}
              disabled={resend.isPending}
              className="border-ink/20 text-ink shrink-0"
            >
              {resend.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending…
                </>
              ) : resend.isSuccess ? (
                <>
                  <Check className="w-4 h-4 mr-2" /> Sent
                </>
              ) : (
                <>
                  <Mail className="w-4 h-4 mr-2" /> Resend login link
                </>
              )}
            </Button>
          </div>

          <div className="mt-6 grid sm:grid-cols-2 gap-6">
            <InfoRow
              icon={<Mail className="w-4 h-4" />}
              label="Login method"
              value="Magic link via email"
              sub="We'll send a secure link to your email to sign in."
            />
            <InfoRow
              icon={<Shield className="w-4 h-4" />}
              label="Security"
              value="Two-factor authentication"
              sub="Coming soon"
              badge="Not required"
            />
            <InfoRow
              icon={<Clock className="w-4 h-4" />}
              label="Last login"
              value={
                lastSignInAt
                  ? new Date(lastSignInAt).toLocaleString(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })
                  : "—"
              }
            />
            <InfoRow
              icon={<Monitor className="w-4 h-4" />}
              label="Active sessions"
              value="1 active session"
              sub="This device"
            />
          </div>
        </section>
      </div>

      {/* Right rail */}
      <aside className="space-y-4">
        <div className="rounded-2xl bg-card border border-border p-5">
          <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal">
            Portal access
          </div>
          <div className="mt-3 flex items-center gap-3">
            <div
              className={`h-10 w-10 rounded-full flex items-center justify-center ${
                isRevoked ? "bg-destructive/10 text-destructive" : "bg-emerald-100 text-emerald-700"
              }`}
            >
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[14px] font-medium text-ink">
                {isRevoked ? "Access paused" : "Your access is active"}
              </div>
              <div className="text-[12px] text-ink/60">
                {isRevoked
                  ? "Contact Tai to reinstate."
                  : "You have full access to your workspace."}
              </div>
            </div>
          </div>
          {project && (
            <dl className="mt-5 text-[13px] space-y-2">
              <div className="flex justify-between">
                <dt className="text-ink/60">Access granted</dt>
                <dd className="text-ink">
                  {project.purchase_date
                    ? new Date(project.purchase_date).toLocaleDateString()
                    : "—"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink/60">Tied to</dt>
                <dd className="text-ink text-right">
                  {project.package_name ?? project.purchased_package ?? "—"}
                </dd>
              </div>
            </dl>
          )}
        </div>

        <div className="rounded-2xl bg-card border border-border p-5">
          <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal mb-3">
            Quick actions
          </div>
          <ul className="text-[13px] divide-y divide-rule-soft">
            <li>
              <button
                type="button"
                onClick={() => resend.mutate()}
                disabled={resend.isPending}
                className="w-full flex items-center justify-between py-3 text-ink hover:text-royal disabled:opacity-60"
              >
                <span className="flex items-center gap-2">
                  <Mail className="w-4 h-4" /> Resend login link
                </span>
                <span aria-hidden>→</span>
              </button>
            </li>
            <li>
              <a
                href="mailto:tai@trusttai.com?subject=Update%20portal%20email"
                className="flex items-center justify-between py-3 text-ink hover:text-royal"
              >
                <span className="flex items-center gap-2">
                  <ExternalLink className="w-4 h-4" /> Update email address
                </span>
                <span aria-hidden>→</span>
              </a>
            </li>
            <li>
              <button
                type="button"
                onClick={signOutEverywhere}
                className="w-full flex items-center justify-between py-3 text-ink hover:text-destructive"
              >
                <span className="flex items-center gap-2">
                  <LogOut className="w-4 h-4" /> Sign out of all devices
                </span>
                <span aria-hidden>→</span>
              </button>
            </li>
          </ul>
        </div>
      </aside>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[12px] uppercase tracking-wider text-ink/50">{label}</dt>
      <dd className="text-[15px] text-ink mt-1">{value}</dd>
    </div>
  );
}

function InfoRow({
  icon,
  label,
  value,
  sub,
  badge,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  badge?: string;
}) {
  return (
    <div>
      <div className="text-[12px] uppercase tracking-wider text-ink/50">{label}</div>
      <div className="mt-2 flex items-start gap-3">
        <div className="mt-0.5 h-8 w-8 rounded-full bg-paper-soft flex items-center justify-center text-ink/70">
          {icon}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[14px] text-ink font-medium">{value}</span>
            {badge && (
              <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-paper-soft text-ink/60 border border-rule-soft">
                {badge}
              </span>
            )}
          </div>
          {sub && <div className="text-[12px] text-ink/60 mt-0.5">{sub}</div>}
        </div>
      </div>
    </div>
  );
}
