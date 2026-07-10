import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
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
  Save,
  Pencil,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resendPortalWelcome, updatePortalProfile } from "@/lib/portal.functions";
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

const ProfileSchema = z.object({
  contact_name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(120, "Name is too long"),
  company_name: z
    .string()
    .trim()
    .max(160, "Company name is too long")
    .optional(),
});

type FormValues = z.infer<typeof ProfileSchema>;
type FormErrors = Partial<Record<keyof FormValues, string>>;

function AccountPage() {
  const navigate = useNavigate();
  const ctx = usePortalContext();
  const qc = useQueryClient();
  const [email, setEmail] = useState<string | null>(null);
  const [lastSignInAt, setLastSignInAt] = useState<string | null>(null);
  const resendFn = useServerFn(resendPortalWelcome);
  const updateFn = useServerFn(updatePortalProfile);

  const project = ctx.data?.hasAccess ? ctx.data.project : null;
  const isRevoked = ctx.data && !ctx.data.hasAccess;

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<FormValues>({
    contact_name: "",
    company_name: "",
  });
  const [errors, setErrors] = useState<FormErrors>({});

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
      setLastSignInAt(data.user?.last_sign_in_at ?? null);
    });
  }, []);

  useEffect(() => {
    if (project) {
      setForm({
        contact_name: project.contact_name ?? "",
        company_name: project.company_name ?? "",
      });
    }
  }, [project?.contact_name, project?.company_name]);

  const resend = useMutation({
    mutationFn: () => resendFn({}),
    onSuccess: (res) => {
      if (res.ok) toast.success("Sign-in link sent. Check your inbox.");
      else toast.error("Couldn't send. Email tai@trusttai.com if this keeps happening.");
    },
    onError: () => toast.error("Couldn't send. Try again in a moment."),
  });

  const save = useMutation({
    mutationFn: async (values: FormValues) => {
      const parsed = ProfileSchema.safeParse(values);
      if (!parsed.success) {
        const fe: FormErrors = {};
        for (const issue of parsed.error.issues) {
          const key = issue.path[0] as keyof FormValues;
          if (key && !fe[key]) fe[key] = issue.message;
        }
        setErrors(fe);
        throw new Error("Please fix the highlighted fields.");
      }
      return updateFn({
        data: {
          contact_name: parsed.data.contact_name,
          company_name: parsed.data.company_name ?? null,
        },
      });
    },
    onSuccess: () => {
      toast.success("Profile updated.");
      setEditing(false);
      setErrors({});
      qc.invalidateQueries({ queryKey: ["portal", "context"] });
    },
    onError: (e: Error) => toast.error(e.message || "Couldn't save."),
  });

  function validateField(key: keyof FormValues, value: string) {
    const test = { ...form, [key]: value };
    const parsed = ProfileSchema.safeParse(test);
    if (parsed.success) {
      setErrors((prev) => ({ ...prev, [key]: undefined }));
    } else {
      const issue = parsed.error.issues.find((i) => i.path[0] === key);
      setErrors((prev) => ({ ...prev, [key]: issue?.message }));
    }
  }

  async function signOutEverywhere() {
    await supabase.auth.signOut({ scope: "global" });
    navigate({ to: "/portal/login", replace: true });
  }

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
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-display text-xl text-ink">Profile information</h2>
              <p className="text-[13px] text-ink/60 mt-1">
                Update the name and company we use across your workspace.
              </p>
            </div>
            {!editing && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditing(true)}
                className="border-ink/20 text-ink shrink-0"
              >
                <Pencil className="w-3.5 h-3.5 mr-2" /> Edit
              </Button>
            )}
          </div>

          {!editing ? (
            <dl className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-y-5 gap-x-8">
              <Field label="Full name" value={project?.contact_name ?? "—"} />
              <Field label="Email address" value={email ?? "—"} />
              <Field label="Company" value={project?.company_name ?? "—"} />
              <Field
                label="Package"
                value={project?.package_name ?? project?.purchased_package ?? "—"}
              />
            </dl>
          ) : (
            <form
              className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5"
              onSubmit={(e) => {
                e.preventDefault();
                save.mutate(form);
              }}
            >
              <div>
                <Label htmlFor="contact_name" className="text-[12px] uppercase tracking-wider text-ink/50">
                  Full name
                </Label>
                <Input
                  id="contact_name"
                  value={form.contact_name}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, contact_name: e.target.value }));
                    validateField("contact_name", e.target.value);
                  }}
                  disabled={save.isPending}
                  aria-invalid={!!errors.contact_name}
                  className="mt-1.5 bg-paper-soft border-rule-soft"
                />
                {errors.contact_name && (
                  <p className="text-[12px] text-destructive mt-1">{errors.contact_name}</p>
                )}
              </div>
              <div>
                <Label className="text-[12px] uppercase tracking-wider text-ink/50">
                  Email address
                </Label>
                <Input
                  value={email ?? ""}
                  disabled
                  className="mt-1.5 bg-paper-soft border-rule-soft opacity-70"
                />
                <p className="text-[11px] text-ink/50 mt-1">
                  Email tai@trusttai.com to change your login email.
                </p>
              </div>
              <div>
                <Label htmlFor="company_name" className="text-[12px] uppercase tracking-wider text-ink/50">
                  Company
                </Label>
                <Input
                  id="company_name"
                  value={form.company_name ?? ""}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, company_name: e.target.value }));
                    validateField("company_name", e.target.value);
                  }}
                  disabled={save.isPending}
                  aria-invalid={!!errors.company_name}
                  className="mt-1.5 bg-paper-soft border-rule-soft"
                />
                {errors.company_name && (
                  <p className="text-[12px] text-destructive mt-1">{errors.company_name}</p>
                )}
              </div>
              <div>
                <Label className="text-[12px] uppercase tracking-wider text-ink/50">
                  Package
                </Label>
                <Input
                  value={project?.package_name ?? project?.purchased_package ?? ""}
                  disabled
                  className="mt-1.5 bg-paper-soft border-rule-soft opacity-70"
                />
              </div>
              <div className="sm:col-span-2 flex items-center gap-3 pt-2">
                <Button
                  type="submit"
                  disabled={save.isPending || Object.values(errors).some(Boolean)}
                  className="bg-ink hover:bg-ink/90 text-white"
                >
                  {save.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" /> Save changes
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setForm({
                      contact_name: project?.contact_name ?? "",
                      company_name: project?.company_name ?? "",
                    });
                    setErrors({});
                    setEditing(false);
                  }}
                  disabled={save.isPending}
                  className="text-ink/70"
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}
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

        <PasswordSection />
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

function PasswordSection() {
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<PasswordFieldErrors>({});
  const [saving, setSaving] = useState(false);

  const strength = scorePasswordStrength(newPassword);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const result = validatePassword({ newPassword, confirm });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSaving(false);
    if (error) {
      toast.error(error.message || "Couldn't update password.");
      return;
    }
    toast.success("Password updated.");
    setNewPassword("");
    setConfirm("");
  }

  return (
    <section className="rounded-2xl bg-card border border-border shadow-sm p-6 lg:p-8">
      <div>
        <h2 className="font-display text-xl text-ink">Password</h2>
        <p className="text-[13px] text-ink/60 mt-1">
          Set a password as an alternative to magic-link sign in.
        </p>
      </div>
      <form onSubmit={onSubmit} className="mt-6 grid gap-4 sm:grid-cols-2 max-w-2xl">
        <div>
          <Label className="text-[12px] uppercase tracking-wider text-ink/50">
            New password
          </Label>
          <Input
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="mt-1.5 bg-paper-soft border-rule-soft"
          />
          {errors.newPassword && (
            <p className="text-[12px] text-destructive mt-1">{errors.newPassword}</p>
          )}
          {newPassword && !errors.newPassword && (
            <div className="mt-1.5 flex items-center gap-2">
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
                {["Weak", "Weak", "Fair", "Strong", "Very strong"][strength]}
              </span>
            </div>
          )}
        </div>
        <div>
          <Label className="text-[12px] uppercase tracking-wider text-ink/50">
            Confirm password
          </Label>
          <Input
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="mt-1.5 bg-paper-soft border-rule-soft"
          />
          {errors.confirm && (
            <p className="text-[12px] text-destructive mt-1">{errors.confirm}</p>
          )}
        </div>
        <div className="sm:col-span-2 pt-1">
          <Button
            type="submit"
            disabled={saving || !newPassword || !confirm}
            className="bg-ink hover:bg-ink/90 text-white"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Updating…
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" /> Update password
              </>
            )}
          </Button>
        </div>
      </form>
    </section>
  );
}

function scoreStrength(pw: string) {
  let s = 0;
  if (pw.length >= 10) s++;
  if (pw.length >= 14) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/[0-9]/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(4, s);
}

