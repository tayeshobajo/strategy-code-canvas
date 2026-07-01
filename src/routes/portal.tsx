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
import { Home, FileText, Folder, MessageSquare, CreditCard, User, LogOut } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

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
    <div className="min-h-screen flex flex-col" style={{ background: "#F7F3EC" }}>
      <SiteHeader />
      <div className="flex-1 flex pt-24">
        <aside
          className="w-64 flex-shrink-0 text-white flex flex-col"
          style={{ background: "#0B1E3B" }}
        >
          <div className="px-6 py-7 border-b border-white/10">
            <div className="text-xs uppercase tracking-widest text-[#D4A857]">
              Trust Tai
            </div>
            <div
              className="text-lg mt-1"
              style={{ fontFamily: "Georgia, serif" }}
            >
              Client Portal
            </div>
          </div>
          <nav className="flex-1 px-3 py-6 space-y-1">
            {NAV.map((item) => {
              const active = pathname === item.to || pathname.startsWith(item.to + "/");
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
                    active
                      ? "bg-white/10 text-white"
                      : "text-white/70 hover:text-white hover:bg-white/5"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="px-4 py-5 border-t border-white/10 text-xs text-white/60">
            <div className="truncate mb-2">{email}</div>
            <button
              onClick={signOut}
              className="flex items-center gap-2 text-white/70 hover:text-white"
            >
              <LogOut className="w-3.5 h-3.5" /> Sign out
            </button>
          </div>
        </aside>

        <main className="flex-1 p-8">
          <Outlet />
        </main>
      </div>
      <SiteFooter />
    </div>
  );
}
