import type { ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { SiteFooter } from "@/components/SiteFooter";
import { TrustTaiLogo } from "@/components/TrustTaiLogo";
import { supabase } from "@/integrations/supabase/client";

const NAV = [
  { to: "/portal/roadmap", label: "Roadmap" },
  { to: "/portal/intake", label: "Ask a question" },
  { to: "/portal/activity", label: "Activity" },
] as const;

export function PortalShell({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/portal", replace: true });
  }

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="border-b border-border bg-card">
        <div className="mx-auto grid w-full max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 py-4 sm:px-8">
          <Link to="/" className="flex min-w-0 items-center gap-3">
            <TrustTaiLogo className="h-6 w-auto shrink-0" />
            <span className="truncate font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              Client portal
            </span>
          </Link>
          <button
            type="button"
            onClick={signOut}
            className="shrink-0 rounded-full border border-border px-4 py-2 text-sm"
          >
            Sign out
          </button>
        </div>
        <nav className="mx-auto flex w-full max-w-6xl gap-6 overflow-x-auto px-5 pb-3 sm:px-8">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              activeProps={{ className: "text-ink border-ink" }}
              inactiveProps={{ className: "text-muted-foreground border-transparent" }}
              className="shrink-0 whitespace-nowrap border-b-2 pb-2 text-sm"
            >
              {n.label}
            </Link>
          ))}
        </nav>
      </header>

      <main id="main" className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8">
        <h1 className="text-3xl tracking-tight sm:text-4xl">{title}</h1>
        {intro ? (
          <p className="mt-3 max-w-2xl text-muted-foreground">{intro}</p>
        ) : null}
        <div className="mt-10">{children}</div>
      </main>
      <SiteFooter />
    </div>
  );
}
