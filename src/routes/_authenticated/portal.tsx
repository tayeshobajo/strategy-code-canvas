import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getStripeEnvironment } from "@/lib/stripe";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  createBillingPortalSession,
  changeSubscriptionPlan,
  pauseSubscription,
  resumeSubscription,
  sendPortalMessage,
} from "@/utils/portal.functions";

export const Route = createFileRoute("/_authenticated/portal")({
  component: PortalPage,
  head: () => ({
    meta: [
      { title: "Your portal — Trust Tai" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

type Order = {
  id: string;
  stripe_session_id: string;
  amount_total: number;
  currency: string;
  status: string;
  created_at: string;
};
type Subscription = {
  id: string;
  stripe_subscription_id: string;
  price_id: string;
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  pause_collection: string | null;
};
type RoadmapDoc = {
  id: string;
  title: string;
  body_md: string | null;
  file_url: string | null;
  published_at: string;
};
type Message = {
  id: string;
  sender: "client" | "tai";
  body: string;
  created_at: string;
};

const PLANS = [
  { key: "build_starter_monthly", label: "Starter — $2,500/mo" },
  { key: "build_growth_monthly", label: "Growth — $5,000/mo" },
  { key: "build_scale_monthly", label: "Scale — $7,500/mo" },
];

function formatMoney(cents: number, currency = "usd") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function PortalPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState<string>("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [docs, setDocs] = useState<RoadmapDoc[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);

  const billingFn = useServerFn(createBillingPortalSession);
  const pauseFn = useServerFn(pauseSubscription);
  const resumeFn = useServerFn(resumeSubscription);
  const changeFn = useServerFn(changeSubscriptionPlan);
  const messageFn = useServerFn(sendPortalMessage);

  async function refresh(currentEmail: string) {
    const [ord, sb, dc, msg] = await Promise.all([
      supabase
        .from("orders")
        .select("*")
        .eq("customer_email", currentEmail)
        .order("created_at", { ascending: false }),
      supabase
        .from("subscriptions")
        .select("*")
        .eq("customer_email", currentEmail)
        .order("created_at", { ascending: false }),
      supabase
        .from("roadmap_documents")
        .select("*")
        .ilike("client_email", currentEmail)
        .order("published_at", { ascending: false }),
      supabase
        .from("portal_messages")
        .select("*")
        .ilike("client_email", currentEmail)
        .order("created_at", { ascending: true }),
    ]);
    setOrders((ord.data ?? []) as Order[]);
    setSubs((sb.data ?? []) as Subscription[]);
    setDocs((dc.data ?? []) as RoadmapDoc[]);
    setMessages((msg.data ?? []) as Message[]);
  }

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const userEmail = data.user?.email ?? "";
      setEmail(userEmail);
      if (userEmail) await refresh(userEmail);
      setLoading(false);
    })();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  async function openBilling() {
    const env = getStripeEnvironment();
    const res = await billingFn({
      data: { returnUrl: `${window.location.origin}/portal`, environment: env },
    });
    if ("error" in res) {
      toast.error(res.error);
      return;
    }
    window.open(res.url, "_blank");
  }

  async function pauseNow() {
    const env = getStripeEnvironment();
    const res = await pauseFn({ data: { environment: env } });
    if ("error" in res) return toast.error(res.error);
    toast.success("Billing paused. Your access continues.");
    if (email) await refresh(email);
  }

  async function resumeNow() {
    const env = getStripeEnvironment();
    const res = await resumeFn({ data: { environment: env } });
    if ("error" in res) return toast.error(res.error);
    toast.success("Billing resumed.");
    if (email) await refresh(email);
  }

  async function switchPlan(key: string) {
    const env = getStripeEnvironment();
    const res = await changeFn({
      data: { newPriceLookupKey: key, environment: env },
    });
    if ("error" in res) return toast.error(res.error);
    toast.success("Plan updated. Prorated on next invoice.");
    if (email) await refresh(email);
  }

  async function sendMessage() {
    const body = draft.trim();
    if (!body) return;
    const res = await messageFn({ data: { body } });
    if ("error" in res) return toast.error(res.error);
    setDraft("");
    if (email) await refresh(email);
  }

  const activeSub = subs.find(
    (s) => s.status === "active" || s.status === "trialing" || s.status === "past_due",
  );

  if (loading) {
    return (
      <main className="min-h-screen p-10 text-muted-foreground">Loading…</main>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">Your portal</h1>
            <p className="text-xs text-muted-foreground">{email}</p>
          </div>
          <Button variant="ghost" onClick={signOut}>
            Sign out
          </Button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-10 space-y-12">
        {/* Roadmap docs */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Your roadmap</h2>
          {docs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Your roadmap will appear here once Tai publishes it.
            </p>
          ) : (
            <ul className="space-y-4">
              {docs.map((d) => (
                <li key={d.id} className="rounded-lg border bg-card p-5">
                  <div className="flex items-center justify-between gap-4">
                    <h3 className="font-medium">{d.title}</h3>
                    <span className="text-xs text-muted-foreground">
                      {new Date(d.published_at).toLocaleDateString()}
                    </span>
                  </div>
                  {d.body_md && (
                    <pre className="mt-3 whitespace-pre-wrap text-sm text-foreground/90">
                      {d.body_md}
                    </pre>
                  )}
                  {d.file_url && (
                    <a
                      className="mt-3 inline-block text-sm underline"
                      href={d.file_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open document
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Orders */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Orders</h2>
          {orders.length === 0 ? (
            <p className="text-sm text-muted-foreground">No orders yet.</p>
          ) : (
            <ul className="divide-y border rounded-lg bg-card">
              {orders.map((o) => (
                <li
                  key={o.id}
                  className="px-4 py-3 flex items-center justify-between text-sm"
                >
                  <div>
                    <div className="font-medium">
                      {formatMoney(o.amount_total, o.currency)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(o.created_at).toLocaleString()} · {o.status}
                    </div>
                  </div>
                  <code className="text-xs text-muted-foreground">
                    {o.stripe_session_id.slice(-8)}
                  </code>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Subscription */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Engagement</h2>
          {!activeSub ? (
            <p className="text-sm text-muted-foreground">
              No active engagement. Reach out to Tai to start one.
            </p>
          ) : (
            <div className="rounded-lg border bg-card p-5 space-y-4">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className="font-medium">{activeSub.price_id}</span>
                <span className="text-muted-foreground">
                  Status: {activeSub.status}
                  {activeSub.pause_collection
                    ? ` · paused (${activeSub.pause_collection})`
                    : ""}
                </span>
                {activeSub.current_period_end && (
                  <span className="text-muted-foreground">
                    Renews{" "}
                    {new Date(activeSub.current_period_end).toLocaleDateString()}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {activeSub.pause_collection ? (
                  <Button size="sm" onClick={resumeNow}>
                    Resume billing
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={pauseNow}>
                    Pause billing
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={openBilling}>
                  Billing &amp; receipts
                </Button>
              </div>

              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Change plan
                </p>
                <div className="flex flex-wrap gap-2">
                  {PLANS.map((p) => (
                    <Button
                      key={p.key}
                      size="sm"
                      variant={
                        p.key === activeSub.price_id ? "default" : "outline"
                      }
                      disabled={p.key === activeSub.price_id}
                      onClick={() => switchPlan(p.key)}
                    >
                      {p.label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Messages */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Messages with Tai</h2>
          <div className="rounded-lg border bg-card p-4 space-y-3 max-h-96 overflow-auto">
            {messages.length === 0 ? (
              <p className="text-sm text-muted-foreground">No messages yet.</p>
            ) : (
              messages.map((m) => (
                <div
                  key={m.id}
                  className={
                    m.sender === "client"
                      ? "ml-auto max-w-[80%] rounded-lg bg-primary/10 p-3 text-sm"
                      : "mr-auto max-w-[80%] rounded-lg bg-muted p-3 text-sm"
                  }
                >
                  <div className="text-xs text-muted-foreground mb-1">
                    {m.sender === "client" ? "You" : "Tai"} ·{" "}
                    {new Date(m.created_at).toLocaleString()}
                  </div>
                  <div className="whitespace-pre-wrap">{m.body}</div>
                </div>
              ))
            )}
          </div>
          <div className="flex gap-2">
            <Textarea
              rows={3}
              placeholder="Write a note to Tai…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <Button onClick={sendMessage} disabled={!draft.trim()}>
              Send
            </Button>
          </div>
        </section>
      </div>
    </main>
  );
}
