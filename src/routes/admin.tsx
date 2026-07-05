import { createFileRoute, Outlet, redirect, Link, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { isOperatorEmail } from "@/lib/ops/access";
import { isAdminEmail } from "@/lib/ops/access";
import { ClipboardList, Users, Settings, ShieldCheck, MailCheck, GitBranch } from "lucide-react";

export const Route = createFileRoute("/admin")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/auth", search: { redirect: location.href } });
    }
    const email = data.user.email?.toLowerCase() ?? "";
    // Admin surface: allow allow-listed operators (backward compat) and any
    // email that is either the legacy hello@ address or has an admin/operator
    // role in `public.user_roles` (checked via the security-definer RPC).
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

function AdminLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="min-h-screen flex" style={{ background: "#0f172a" }}>
      <aside className="w-60 text-white flex-shrink-0 border-r border-white/10">
        <div className="px-5 py-6 border-b border-white/10">
          <div className="text-xs uppercase tracking-widest text-amber-400">Admin</div>
          <div className="text-sm mt-1">Trust Tai internal</div>
        </div>
        <nav className="p-3 space-y-1">
          <Link
            to="/admin/client-portals"
            className={`flex items-center gap-2 px-3 py-2 text-sm rounded ${pathname.startsWith("/admin/client-portals") ? "bg-white/10" : "text-white/70 hover:bg-white/5"}`}
          >
            <Users className="w-4 h-4" /> Client portals
          </Link>
          <Link
            to="/admin/config"
            className={`flex items-center gap-2 px-3 py-2 text-sm rounded ${pathname.startsWith("/admin/config") ? "bg-white/10" : "text-white/70 hover:bg-white/5"}`}
          >
            <Settings className="w-4 h-4" /> Runtime config
          </Link>
          <Link
            to="/admin/roles"
            className={`flex items-center gap-2 px-3 py-2 text-sm rounded ${pathname.startsWith("/admin/roles") ? "bg-white/10" : "text-white/70 hover:bg-white/5"}`}
          >
            <ShieldCheck className="w-4 h-4" /> User roles
          </Link>
          <Link
            to="/ops/queue"
            className="flex items-center gap-2 px-3 py-2 text-sm rounded text-white/70 hover:bg-white/5"
          >
            <ClipboardList className="w-4 h-4" /> Roadmap intake queue
          </Link>
          <Link
            to="/admin/intake-alerts"
            className={`flex items-center gap-2 px-3 py-2 text-sm rounded ${pathname.startsWith("/admin/intake-alerts") ? "bg-white/10" : "text-white/70 hover:bg-white/5"}`}
          >
            <MailCheck className="w-4 h-4" /> Intake alerts
          </Link>
          <Link
            to="/admin/milestone-changes"
            className={`flex items-center gap-2 px-3 py-2 text-sm rounded ${pathname.startsWith("/admin/milestone-changes") ? "bg-white/10" : "text-white/70 hover:bg-white/5"}`}
          >
            <GitBranch className="w-4 h-4" /> Milestone changes
        </nav>
      </aside>
      <main className="flex-1 p-8 text-white">
        <Outlet />
      </main>
    </div>
  );
}
