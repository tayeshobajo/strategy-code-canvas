import { createFileRoute, Outlet, redirect, Link, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { isOperatorEmail } from "@/lib/ops/access";
import { ClipboardList, Users, Settings } from "lucide-react";

export const Route = createFileRoute("/admin")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/auth", search: { redirect: location.href } });
    }
    // Include hello@trusttai.com for portal admin
    const email = data.user.email?.toLowerCase() ?? "";
    if (!isOperatorEmail(email) && email !== "hello@trusttai.com") {
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
            to="/ops/queue"
            className="flex items-center gap-2 px-3 py-2 text-sm rounded text-white/70 hover:bg-white/5"
          >
            <ClipboardList className="w-4 h-4" /> Roadmap intake queue
          </Link>
        </nav>
      </aside>
      <main className="flex-1 p-8 text-white">
        <Outlet />
      </main>
    </div>
  );
}
