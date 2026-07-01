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
    <div style={{ background: "#F7F3EC" }} className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="flex-1 flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl p-10 border border-black/5">
        <div className="mb-8">
          <div className="text-xs uppercase tracking-widest text-[#B08A3E] mb-3">
            Trust Tai · Client Portal
          </div>
          <h1
            className="text-3xl font-normal text-[#0B1E3B]"
            style={{ fontFamily: "Georgia, serif" }}
          >
            Welcome back
          </h1>
          <p className="text-sm text-slate-600 mt-3 leading-relaxed">
            Enter the email tied to your engagement. If you have active portal
            access, we'll send you a secure sign-in link.
          </p>
        </div>

        {submitted ? (
          <div className="rounded-lg border border-[#0B1E3B]/10 bg-[#F7F3EC] p-5">
            <p className="text-sm text-[#0B1E3B]">
              If <span className="font-medium">{email}</span> has portal access,
              a sign-in link is on its way. Check your inbox.
            </p>
            <button
              onClick={() => {
                setSubmitted(false);
                setEmail("");
              }}
              className="mt-4 text-xs underline text-slate-600"
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-5">
            <div>
              <Label htmlFor="email" className="text-[#0B1E3B]">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                required
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-2 bg-white"
              />
            </div>
            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-[#0B1E3B] hover:bg-[#0B1E3B]/90 text-white"
            >
              {loading ? "Sending…" : "Send me a sign-in link"}
            </Button>
          </form>
        )}

        <p className="text-xs text-slate-500 mt-8 text-center">
          Access is granted only after your payment is confirmed. No signup
          form.
        </p>
      </div>
      </main>
      <SiteFooter />
    </div>
  );
}
