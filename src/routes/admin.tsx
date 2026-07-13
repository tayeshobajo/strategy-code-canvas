import { createFileRoute, Outlet, redirect, Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isOperatorEmail } from "@/lib/ops/access";
import { isAdminEmail } from "@/lib/ops/access";
import {
  ClipboardList,
  Users,
  Settings,
  ShieldCheck,
  MailCheck,
  GitBranch,
  Wrench,
  Menu,
  BarChart3,
  ArrowRightLeft,
  History,
  Zap,
} from "lucide-react";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

export const Route = createFileRoute("/admin")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/auth", search: { email: undefined, redirect: location.href } });
    }
    const email = data.user.email?.toLowerCase() ?? "";
    let allowed = isOperatorEmail(email) || isAdminEmail(email) || email === "hello@trusttai.com";
    if (!allowed) {
      const { data: rpcData } = await supabase.rpc("has_role_email", {
        _email: email,
        _role: "admin",
      });
      allowed = rpcData === true;
    }
    if (!allowed) {
      throw redirect({ to: "/" });
    }
    return { adminEmail: email };
  },
  component: AdminLayout,
});

type AdminNav = { to: string; label: string; icon: typeof Users; match: string };

const NAV: AdminNav[] = [
  {
    to: "/admin/command-center",
    label: "Command Center",
    icon: Zap,
    match: "/admin/command-center",
  },
  {
    to: "/admin/client-portals",
    label: "Client portals",
    icon: Users,
    match: "/admin/client-portals",
  },
  { to: "/admin/config", label: "Runtime config", icon: Settings, match: "/admin/config" },
  { to: "/admin/roles", label: "User roles", icon: ShieldCheck, match: "/admin/roles" },
  { to: "/ops/queue", label: "Roadmap intake queue", icon: ClipboardList, match: "/ops/queue" },
  {
    to: "/admin/intake-alerts",
    label: "Intake alerts",
    icon: MailCheck,
    match: "/admin/intake-alerts",
  },
  {
    to: "/admin/milestone-changes",
    label: "Milestone changes",
    icon: GitBranch,
    match: "/admin/milestone-changes",
  },
  {
    to: "/admin/outcome-feedback",
    label: "Outcome Feedback",
    icon: BarChart3,
    match: "/admin/outcome-feedback",
  },
  {
    to: "/admin/stage-transitions",
    label: "Stage Transitions",
    icon: ArrowRightLeft,
    match: "/admin/stage-transitions",
  },
  {
    to: "/admin/decision-log",
    label: "Decision log",
    icon: History,
    match: "/admin/decision-log",
  },
  {
    to: "/admin/project-integrity",
    label: "Project integrity",
    icon: Wrench,
    match: "/admin/project-integrity",
  },
];

function NavList({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="p-3 space-y-1">
      {NAV.map((n) => {
        const Icon = n.icon;
        const active = pathname.startsWith(n.match);
        return (
          <Link
            key={n.to}
            to={n.to}
            onClick={onNavigate}
            className={`flex items-center gap-2 px-3 py-2 text-sm rounded ${active ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/5"}`}
          >
            <Icon className="w-4 h-4 shrink-0" />
            <span className="truncate">{n.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function AdminLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const currentLabel = NAV.find((n) => pathname.startsWith(n.match))?.label ?? "Admin";

  return (
    <div className="min-h-screen flex flex-col lg:flex-row" style={{ background: "#0f172a" }}>
      {/* Mobile top bar */}
      <div className="lg:hidden sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-white/10 bg-[#0f172a] px-4 py-3">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              aria-label="Open admin menu"
              className="inline-flex h-9 w-9 items-center justify-center rounded border border-white/10 text-white/80 hover:bg-white/5"
            >
              <Menu className="h-5 w-5" />
            </button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 border-white/10 bg-[#0f172a] p-0 text-white">
            <VisuallyHidden>
              <SheetTitle>Admin navigation</SheetTitle>
            </VisuallyHidden>
            <div className="px-5 py-6 border-b border-white/10">
              <div className="text-xs uppercase tracking-widest text-amber-400">Admin</div>
              <div className="text-sm mt-1">Trust Tai internal</div>
            </div>
            <NavList pathname={pathname} onNavigate={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>
        <div className="min-w-0 flex-1 text-center">
          <div className="text-[10px] uppercase tracking-widest text-amber-400">Admin</div>
          <div className="truncate text-sm text-white">{currentLabel}</div>
        </div>
        <div className="h-9 w-9" aria-hidden />
      </div>

      {/* Desktop sidebar */}
      <aside className="hidden lg:block w-60 text-white flex-shrink-0 border-r border-white/10">
        <div className="px-5 py-6 border-b border-white/10">
          <div className="text-xs uppercase tracking-widest text-amber-400">Admin</div>
          <div className="text-sm mt-1">Trust Tai internal</div>
        </div>
        <NavList pathname={pathname} />
      </aside>

      <main className="app-shell-main flex-1 text-white">
        <div className="min-w-0">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
