import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Home, FileText, Folder, MessageSquare, CreditCard, User, LogOut, Activity } from "lucide-react";
import logoWhite from "@/assets/trust-tai-logo-white.png.asset.json";

export const Route = createFileRoute("/portal")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    // Public sub-routes that must render without an authenticated session.
    const PUBLIC_PATHS = ["/portal/login", "/portal/access-denied"];
    if (PUBLIC_PATHS.includes(location.pathname)) {
      return { user: null };
    }
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/portal/login",
        search: { redirect: location.href } as never,
      });
    }
    return { user: data.user };
  },
  component: PortalLayout,
});

const NAV = [
  { to: "/portal/home", label: "Home", icon: Home },
  { to: "/portal/roadmap", label: "Roadmap", icon: FileText },
  { to: "/portal/files", label: "Files", icon: Folder },
  { to: "/portal/messages", label: "Messages", icon: MessageSquare },
  { to: "/portal/billing", label: "Billing", icon: CreditCard },
  { to: "/portal/activity", label: "Activity", icon: Activity },
  { to: "/portal/account", label: "Account", icon: User },
];

function PortalLayout() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [email, setEmail] = useState<string>("");

  const isPublicPage =
    pathname === "/portal/login" || pathname === "/portal/access-denied";

  useEffect(() => {
    if (isPublicPage) return;
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, [isPublicPage]);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/portal/login" });
  }

  if (isPublicPage) {
    return <Outlet />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-paper">
      <div className="flex-1 flex flex-col lg:flex-row">
        {/* Sidebar: full-height on desktop, horizontal scroll strip on mobile */}
        <aside className="lg:w-64 lg:flex-shrink-0 bg-ink text-white flex flex-col">
          <div className="hidden lg:flex px-6 py-6 border-b border-white/10 items-center">
            <Link to="/" aria-label="Trust Tai home" className="block">
              <img
                src={logoWhite.url}
                alt="Trust Tai | Consultancy + AI Agency"
                className="h-9 w-auto"
              />
            </Link>
          </div>
          <div className="hidden lg:block px-6 pt-5 pb-2">
            <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal">
              Client Portal
            </div>
          </div>
          <nav
            aria-label="Portal navigation"
            className="flex lg:block overflow-x-auto lg:overflow-visible lg:flex-1 px-3 py-3 lg:py-6 gap-1 lg:gap-0 lg:space-y-1"
          >
            {NAV.map((item) => {
              const active =
                pathname === item.to || pathname.startsWith(item.to + "/");
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  aria-current={active ? "page" : undefined}
                  className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-md text-sm whitespace-nowrap transition-colors ${
                    active
                      ? "bg-white/10 text-white"
                      : "text-white/70 hover:text-white hover:bg-white/5"
                  }`}
                >
                  <span
                    aria-hidden
                    className={`hidden lg:block absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full transition-all ${
                      active ? "bg-royal opacity-100" : "opacity-0 group-hover:opacity-40 bg-white"
                    }`}
                  />
                  <Icon className="w-4 h-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="hidden lg:block px-4 py-5 border-t border-white/10 text-xs text-white/60">
            <div className="truncate mb-2">{email}</div>
            <button
              onClick={signOut}
              className="flex items-center gap-2 text-white/70 hover:text-white"
            >
              <LogOut className="w-3.5 h-3.5" /> Sign out
            </button>
          </div>
        </aside>

        <main className="flex-1 bg-paper-soft px-4 sm:px-6 lg:px-10 py-10 lg:py-16">
          <Outlet />
        </main>
      </div>
      {/* Slim editorial footer band — replaces the marketing SiteFooter inside the portal */}
      <footer className="bg-ink text-white/60">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-5 text-[12px] sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <img
              src={logoWhite.url}
              alt="Trust Tai"
              className="h-5 w-auto opacity-80"
            />
            <span className="font-mono uppercase tracking-[0.22em] text-white/40">
              Client Portal · Secure
            </span>
          </div>
          <div className="flex items-center gap-5">
            <a href="mailto:hello@trusttai.com" className="hover:text-white">
              hello@trusttai.com
            </a>
            <Link to="/" className="hover:text-white">
              trusttai.com
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
