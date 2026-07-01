import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CreditCard,
  CheckCircle2,
  DollarSign,
  Calendar,
  Receipt,
  ExternalLink,
  Lock,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { usePortalContext } from "@/hooks/use-portal-context";
import {
  createBillingPortalSession,
  cancelSubscription,
  reactivateSubscription,
} from "@/utils/portal.functions";
import { getStripeEnvironment } from "@/lib/stripe";
import { toast } from "sonner";

export const Route = createFileRoute("/portal/billing")({
  head: () => ({
    meta: [
      { title: "Billing — Trust Tai portal" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: BillingPage,
});

type BillingRow = {
  id: string;
  project_id: string;
  stripe_invoice_id: string | null;
  amount_total: number;
  currency: string;
  payment_status: string;
  purchased_package: string | null;
  receipt_url: string | null;
  invoice_url: string | null;
  payment_confirmed_at: string | null;
  next_payment_at: string | null;
  created_at: string;
};

type SubscriptionRow = {
  id: string;
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
};

function useBilling(projectId?: string) {
  return useQuery({
    queryKey: ["portal", "billing", projectId],
    enabled: !!projectId,
    queryFn: async (): Promise<{
      invoices: BillingRow[];
      subscription: SubscriptionRow | null;
    }> => {
      const [invRes, userRes] = await Promise.all([
        supabase
          .from("client_portal_billing")
          .select(
            "id, project_id, stripe_invoice_id, amount_total, currency, payment_status, purchased_package, receipt_url, invoice_url, payment_confirmed_at, next_payment_at, created_at",
          )
          .eq("project_id", projectId!)
          .order("created_at", { ascending: false }),
        supabase.auth.getUser(),
      ]);
      if (invRes.error) throw new Error(invRes.error.message);

      let subscription: SubscriptionRow | null = null;
      const email = userRes.data.user?.email;
      if (email) {
        const { data: subs } = await supabase
          .from("subscriptions")
          .select("id, status, current_period_end, cancel_at_period_end")
          .eq("customer_email", email)
          .order("created_at", { ascending: false })
          .limit(1);
        subscription = (subs?.[0] as SubscriptionRow | undefined) ?? null;
      }
      return { invoices: (invRes.data ?? []) as BillingRow[], subscription };
    },
  });
}

function BillingPage() {
  const ctx = usePortalContext();
  const project = ctx.data?.hasAccess ? ctx.data.project : undefined;
  const projectId = project?.id;
  const { data, isLoading, isError, refetch } = useBilling(projectId);
  const qc = useQueryClient();
  const portalFn = useServerFn(createBillingPortalSession);
  const cancelFn = useServerFn(cancelSubscription);
  const reactivateFn = useServerFn(reactivateSubscription);

  const openBillingPortal = useMutation({
    mutationFn: async () => {
      const res = await portalFn({
        data: {
          returnUrl: window.location.href,
          environment: getStripeEnvironment(),
        },
      });
      if ("error" in res) throw new Error(res.error);
      return res;
    },
    onSuccess: (res) => {
      if ("url" in res) window.location.href = res.url;
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancel = useMutation({
    mutationFn: async () => {
      const res = await cancelFn({
        data: { environment: getStripeEnvironment(), atPeriodEnd: true },
      });
      if ("error" in res) throw new Error(res.error);
      return res;
    },
    onSuccess: () => {
      toast.success("Your subscription will end at the current period.");
      qc.invalidateQueries({ queryKey: ["portal", "billing", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reactivate = useMutation({
    mutationFn: async () => {
      const res = await reactivateFn({
        data: { environment: getStripeEnvironment() },
      });
      if ("error" in res) throw new Error(res.error);
      return res;
    },
    onSuccess: () => {
      toast.success("Subscription reactivated.");
      qc.invalidateQueries({ queryKey: ["portal", "billing", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const latest = data?.invoices?.[0];
  const isRecurringActive = data?.subscription?.status === "active";

  return (
    <div className="max-w-6xl mx-auto grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-6">
        <header>
          <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal flex items-center gap-2">
            <CreditCard className="w-3.5 h-3.5" /> Billing
          </div>
          <h1 className="font-display text-3xl text-ink mt-2">Billing</h1>
          <p className="text-[15px] leading-[1.75] text-ink/70 mt-2">
            Payment details, invoices, and engagement package.
          </p>
        </header>

        {/* Package summary */}
        <section className="rounded-2xl bg-card border border-border shadow-sm p-6 lg:p-8">
          <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal">
            Package summary
          </div>
          <div className="mt-4 grid gap-6 md:grid-cols-[minmax(0,1fr)_auto] items-start">
            <div>
              <h2 className="font-display text-2xl text-ink">
                {project?.package_name ?? project?.purchased_package ?? "Your engagement"}
              </h2>
              <p className="text-[14px] leading-[1.7] text-ink/70 mt-2 max-w-lg">
                A focused engagement to map your next 24 months and build the right foundation.
              </p>
              <ul className="mt-4 space-y-2 text-[13.5px] text-ink/80">
                {[
                  "Custom 24-month roadmap",
                  "Strategic priorities and milestones",
                  "Founder guidance and strategy calls",
                  "Delivered in phases",
                ].map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-royal shrink-0" /> {f}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-rule-soft bg-paper-soft p-5 min-w-[220px]">
              <div className="text-[11px] uppercase tracking-wider text-ink/50">
                Engagement status
              </div>
              <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-[12px] font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                {project?.portal_status?.replace(/_/g, " ") ?? "Active"}
              </div>
              <div className="mt-4 text-[11px] uppercase tracking-wider text-ink/50">
                Current phase
              </div>
              <div className="text-[14px] text-ink font-medium mt-1">
                {project?.current_phase ?? "—"}
              </div>
              {project?.next_milestone && (
                <>
                  <div className="mt-4 text-[11px] uppercase tracking-wider text-ink/50">
                    Next milestone
                  </div>
                  <div className="text-[14px] text-ink font-medium mt-1">
                    {project.next_milestone}
                  </div>
                </>
              )}
            </div>
          </div>
        </section>

        {/* Payment overview */}
        {isLoading && <SkeletonCard />}
        {isError && (
          <ErrorCard onRetry={() => refetch()} />
        )}
        {data && latest && (
          <section className="rounded-2xl bg-card border border-border shadow-sm p-6 lg:p-8">
            <h2 className="font-display text-xl text-ink">Payment overview</h2>
            <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-4">
              <Tile
                icon={<CheckCircle2 className="w-4 h-4" />}
                tint="emerald"
                label="Payment status"
                value={capitalize(latest.payment_status)}
                sub={
                  latest.payment_confirmed_at
                    ? `Completed ${new Date(latest.payment_confirmed_at).toLocaleDateString()}`
                    : undefined
                }
              />
              <Tile
                icon={<DollarSign className="w-4 h-4" />}
                tint="violet"
                label="Amount paid"
                value={formatMoney(latest.amount_total, latest.currency)}
                sub={isRecurringActive ? "Recurring" : "One-time payment"}
              />
              <Tile
                icon={<Calendar className="w-4 h-4" />}
                tint="amber"
                label="Payment date"
                value={
                  latest.payment_confirmed_at
                    ? new Date(latest.payment_confirmed_at).toLocaleDateString()
                    : "—"
                }
                sub={latest.stripe_invoice_id ? `Invoice ${latest.stripe_invoice_id.slice(-8)}` : undefined}
              />
              <Tile
                icon={<Receipt className="w-4 h-4" />}
                tint="royal"
                label="Receipt"
                value={
                  latest.receipt_url ? (
                    <a
                      href={latest.receipt_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-royal underline inline-flex items-center gap-1"
                    >
                      View receipt <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : (
                    "—"
                  )
                }
              />
            </div>
          </section>
        )}
        {data && !latest && !isLoading && !isError && (
          <section className="rounded-2xl bg-card border border-border shadow-sm p-8 text-center">
            <Receipt className="w-6 h-6 mx-auto text-ink/40 mb-3" />
            <p className="text-[14px] text-ink/70">No billing on file yet.</p>
          </section>
        )}

        {/* Invoice history */}
        {data && data.invoices.length > 0 && (
          <section className="rounded-2xl bg-card border border-border shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-rule-soft">
              <h2 className="font-display text-xl text-ink">Invoice history</h2>
            </div>
            <table className="w-full text-[14px]">
              <thead>
                <tr className="text-left text-[12px] uppercase tracking-wider text-ink/50 border-b border-rule-soft">
                  <th className="px-6 py-3 font-medium">Invoice</th>
                  <th className="px-6 py-3 font-medium">Date</th>
                  <th className="px-6 py-3 font-medium">Description</th>
                  <th className="px-6 py-3 font-medium">Amount</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.invoices.map((inv) => (
                  <tr key={inv.id} className="border-b border-rule-soft/60">
                    <td className="px-6 py-3">
                      {inv.invoice_url ? (
                        <a
                          href={inv.invoice_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-royal underline"
                        >
                          {inv.stripe_invoice_id?.slice(-8) ?? "Invoice"}
                        </a>
                      ) : (
                        <span className="text-ink">
                          {inv.stripe_invoice_id?.slice(-8) ?? "Invoice"}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-ink/70">
                      {new Date(inv.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-3 text-ink/70">
                      {inv.purchased_package ?? project?.package_name ?? "—"}
                    </td>
                    <td className="px-6 py-3 text-ink">
                      {formatMoney(inv.amount_total, inv.currency)}
                    </td>
                    <td className="px-6 py-3">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[12px]">
                        <CheckCircle2 className="w-3 h-3" /> {capitalize(inv.payment_status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* Security band */}
        <div className="rounded-xl border border-rule-soft bg-paper-soft px-5 py-4 flex items-center gap-3 text-[13px] text-ink/70">
          <Lock className="w-4 h-4" />
          Your payment information is secure. All transactions are processed by Stripe.
        </div>
      </div>

      {/* Right rail */}
      <aside className="space-y-4">
        <div className="rounded-2xl bg-card border border-border p-5">
          <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal mb-3">
            Next payment
          </div>
          <div className="text-center py-6">
            <Calendar className="w-6 h-6 mx-auto text-ink/40 mb-3" />
            {isRecurringActive && data?.subscription?.current_period_end ? (
              <>
                <div className="font-display text-xl text-ink">
                  {new Date(data.subscription.current_period_end).toLocaleDateString()}
                </div>
                <div className="text-[12px] text-ink/60 mt-1">
                  {data.subscription.cancel_at_period_end
                    ? "Cancels at period end"
                    : "Next billing cycle"}
                </div>
              </>
            ) : (
              <>
                <div className="font-display text-lg text-ink">No upcoming payments</div>
                <div className="text-[12px] text-ink/60 mt-1">
                  This is a one-time engagement.
                </div>
              </>
            )}
          </div>
        </div>

        <div className="rounded-2xl bg-card border border-border p-5">
          <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal mb-3">
            Manage your billing
          </div>
          <p className="text-[13px] text-ink/70">
            For billing history, payment methods, and invoice management.
          </p>
          <Button
            type="button"
            onClick={() => openBillingPortal.mutate()}
            disabled={openBillingPortal.isPending}
            variant="outline"
            className="mt-4 w-full border-ink/20 text-ink"
          >
            {openBillingPortal.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Opening…
              </>
            ) : (
              <>
                Open Stripe Customer Portal <ExternalLink className="w-3.5 h-3.5 ml-2" />
              </>
            )}
          </Button>
        </div>

        <div className="rounded-2xl border border-rule-soft bg-paper-soft p-5 text-center">
          <div className="text-[14px] font-medium text-ink">Questions about billing?</div>
          <p className="text-[12px] text-ink/60 mt-1">
            We're here to help with any billing or engagement questions.
          </p>
          <Button
            asChild
            className="mt-4 w-full bg-ink hover:bg-ink/90 text-white"
          >
            <a href="mailto:tai@trusttai.com">Message Trust Tai</a>
          </Button>
        </div>
      </aside>
    </div>
  );
}

function Tile({
  icon,
  label,
  value,
  sub,
  tint,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  sub?: string;
  tint: "emerald" | "violet" | "amber" | "royal";
}) {
  const tints: Record<string, string> = {
    emerald: "bg-emerald-100 text-emerald-700",
    violet: "bg-violet-100 text-violet-700",
    amber: "bg-amber-100 text-amber-700",
    royal: "bg-royal/10 text-royal",
  };
  return (
    <div className="rounded-xl border border-rule-soft bg-paper-soft p-4">
      <div
        className={`h-9 w-9 rounded-full flex items-center justify-center ${tints[tint]}`}
      >
        {icon}
      </div>
      <div className="text-[11px] uppercase tracking-wider text-ink/50 mt-3">
        {label}
      </div>
      <div className="text-[16px] font-display text-ink mt-1">{value}</div>
      {sub && <div className="text-[11px] text-ink/60 mt-1">{sub}</div>}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl bg-card border border-border p-8 animate-pulse">
      <div className="h-4 w-40 bg-paper-soft rounded" />
      <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-xl bg-paper-soft" />
        ))}
      </div>
    </div>
  );
}

function ErrorCard({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-2xl bg-card border border-border p-8 text-center">
      <AlertCircle className="w-6 h-6 mx-auto mb-3 text-destructive" />
      <p className="text-[14px] text-ink/70">Couldn't load billing.</p>
      <Button onClick={onRetry} variant="outline" className="mt-4 border-ink/20 text-ink">
        Try again
      </Button>
    </div>
  );
}

function formatMoney(amountCents: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: (currency || "usd").toUpperCase(),
      maximumFractionDigits: 0,
    }).format(amountCents / 100);
  } catch {
    return `$${(amountCents / 100).toLocaleString()}`;
  }
}

function capitalize(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
