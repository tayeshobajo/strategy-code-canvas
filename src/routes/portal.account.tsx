import { createFileRoute } from "@tanstack/react-router";
import { User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "@tanstack/react-router";

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
  const [email, setEmail] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/portal/login", replace: true });
  }

  return (
    <div className="max-w-3xl mx-auto rounded-2xl bg-card border border-border p-8 lg:p-10 shadow-sm">
      <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal flex items-center gap-2">
        <User className="w-3.5 h-3.5" /> Account
      </div>
      <h1 className="font-display text-3xl text-ink mt-2">Your account</h1>
      <dl className="mt-6 grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-y-3 gap-x-6 text-[15px]">
        <dt className="text-ink/60">Email</dt>
        <dd className="text-ink">{email ?? "—"}</dd>
      </dl>
      <Button
        onClick={signOut}
        variant="outline"
        className="mt-8 border-ink/20 text-ink"
      >
        Sign out
      </Button>
    </div>
  );
}
