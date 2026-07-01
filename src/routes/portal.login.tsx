import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { requestPortalMagicLink } from "@/lib/portal.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

export const Route = createFileRoute("/portal/login")({
  head: () => ({
    meta: [
      { title: "Sign in — Trust Tai client portal" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PortalLoginPage,
});

function PortalLoginPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const requestLink = useServerFn(requestPortalMagicLink);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    try {
      await requestLink({ data: { email: email.trim() } });
      setSubmitted(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-paper min-h-screen flex flex-col">
      <SiteHeader />
      <main className="flex-1 flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-md rounded-2xl bg-card border border-border p-10">
        <div className="mb-8">
          <h1 className="font-display text-3xl text-ink">
            Welcome back
          </h1>
          <p className="text-[15px] leading-[1.75] text-ink/70 mt-3">
            Enter the email tied to your engagement. If you have active portal
            access, we'll send you a secure sign-in link.
          </p>
        </div>

        {submitted ? (
          <div className="rounded-lg border border-ink/10 bg-paper p-5">
            <p className="text-[15px] text-ink">
              If <span className="font-medium">{email}</span> has portal access,
              a sign-in link is on its way. Check your inbox.
            </p>
            <button
              onClick={() => {
                setSubmitted(false);
                setEmail("");
              }}
              className="mt-4 text-xs underline text-ink/60"
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-5">
            <div>
              <Label htmlFor="email" className="text-ink">
                Email
              </Label>
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
          </form>
        )}

        <p className="text-xs text-ink/50 mt-8 text-center">
          Access is granted only after your payment is confirmed. No signup
          form.
        </p>
      </div>
      </main>
      <SiteFooter />
    </div>
  );
}
