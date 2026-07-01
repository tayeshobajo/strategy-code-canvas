import { Link, useRouterState } from "@tanstack/react-router";
import { ArrowRight, Lock, Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { TrustTaiLogo } from "@/components/TrustTaiLogo";
import { usePortalLink } from "@/hooks/use-portal-link";

export type NavItem = { label: string; to: string; hash?: string };

export const NAV: NavItem[] = [
  { label: "The Roadmap", to: "/build-my-roadmap" },
  { label: "What We Build", to: "/what-we-build" },
  { label: "Investment", to: "/investment" },
  { label: "About", to: "/about" },
  { label: "Insights", to: "/insights" },
  { label: "The Walks", to: "/walks" },
];

export function SiteHeader() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const portalLink = usePortalLink();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const isActive = (n: NavItem) => {
    if (n.to === "/build-my-roadmap") return false;
    if (n.to === "/what-we-build") return pathname === "/what-we-build";
    if (n.to === "/investment") return pathname === "/investment";
    if (n.to === "/about") return pathname === "/about";
    if (n.to === "/insights") return pathname.startsWith("/insights");
    if (n.to === "/walks") return pathname.startsWith("/walks");
    if (n.to === "/") return pathname === "/";
    return false;
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-50 flex justify-center px-2 sm:top-5 sm:px-6">
      <header className="pointer-events-auto w-full max-w-[1200px] rounded-full border border-rule/60 bg-paper/80 px-3 py-2 shadow-[0_1px_0_rgba(255,255,255,0.6)_inset,0_10px_30px_-12px_rgba(10,23,51,0.18)] backdrop-blur-xl sm:px-6">
        <div className="flex h-11 items-center justify-between gap-3 sm:h-12 sm:gap-6">
          <Link to="/" className="flex min-w-0 shrink items-center text-ink">
            <TrustTaiLogo variant="dark" />
          </Link>
          <nav className="hidden items-center gap-8 text-[13px] text-ink/75 lg:flex">
            {NAV.map((n) => {
              const active = isActive(n);
              return (
                <Link
                  key={n.label}
                  to={n.to}
                  hash={n.hash}
                  className={`relative pb-1 transition-colors hover:text-ink ${active ? "text-royal" : ""}`}
                >
                  {n.label}
                  {active && (
                    <span className="absolute -bottom-px left-0 right-0 h-[2px] bg-royal" />
                  )}
                </Link>
              );
            })}
          </nav>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              to={portalLink.to}
              className="hidden lg:inline-flex shrink-0 items-center gap-1.5 rounded-full border border-rule/60 px-3 py-2 text-[12px] text-ink/80 transition-colors hover:border-ink/30 hover:text-ink"
            >
              <Lock className="h-3.5 w-3.5" />
              {portalLink.label}
            </Link>
            <Link
              to="/build-my-roadmap"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-ink px-3 py-2 text-[12px] font-medium text-paper transition-transform hover:scale-[1.02] sm:gap-2 sm:px-4 sm:text-[12.5px]"
            >
              <span className="sm:hidden">Build Roadmap</span>
              <span className="hidden sm:inline">Build My Roadmap</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <button
              type="button"
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              aria-controls="mobile-nav"
              onClick={() => setOpen((v) => !v)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-rule/60 text-ink transition-colors hover:bg-ink/5 lg:hidden"
            >
              {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </header>

      {open && (
        <div
          id="mobile-nav"
          className="pointer-events-auto fixed inset-x-0 top-[68px] z-40 mx-2 rounded-2xl border border-rule/60 bg-paper/95 p-4 shadow-[0_20px_60px_-20px_rgba(10,23,51,0.25)] backdrop-blur-xl lg:hidden"
        >
          <nav className="flex flex-col">
            {NAV.map((n) => {
              const active = isActive(n);
              return (
                <Link
                  key={n.label}
                  to={n.to}
                  hash={n.hash}
                  className={`rounded-lg px-3 py-3 text-[15px] transition-colors hover:bg-ink/5 ${active ? "text-royal" : "text-ink/80"}`}
                >
                  {n.label}
                </Link>
              );
            })}
            <div className="my-2 border-t border-rule/60" />
            <Link
              to={portalLink.to}
              className="flex items-center gap-2 rounded-lg px-3 py-3 text-[15px] text-ink/80 transition-colors hover:bg-ink/5"
            >
              <Lock className="h-4 w-4" />
              {portalLink.label}
            </Link>
            <Link
              to="/build-my-roadmap"
              className="mt-1 flex items-center justify-center gap-2 rounded-full bg-ink px-3 py-3 text-[15px] font-medium text-paper"
            >
              Build My Roadmap
              <ArrowRight className="h-4 w-4" />
            </Link>
          </nav>
        </div>
      )}
    </div>
  );
}
