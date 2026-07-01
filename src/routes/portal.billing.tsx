import { createFileRoute } from "@tanstack/react-router";
import { CreditCard } from "lucide-react";

export const Route = createFileRoute("/portal/billing")({
  head: () => ({
    meta: [
      { title: "Billing — Trust Tai portal" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: BillingPage,
});

function BillingPage() {
  return (
    <div className="max-w-3xl mx-auto rounded-2xl bg-card border border-border p-8 lg:p-10 shadow-sm">
      <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal flex items-center gap-2">
        <CreditCard className="w-3.5 h-3.5" /> Billing
      </div>
      <h1 className="font-display text-3xl text-ink mt-2">
        Invoices and receipts.
      </h1>
      <p className="text-[15px] leading-[1.75] text-ink/70 mt-3">
        Your engagement history and receipts will live here. For any billing
        question, email tai@trusttai.com.
      </p>
    </div>
  );
}
