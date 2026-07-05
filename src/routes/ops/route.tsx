import { createFileRoute, Link, Outlet, redirect, useRouter } from "@tanstack/react-router";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isOperatorEmail } from "@/lib/ops/access";
import { cn } from "@/lib/utils";
import { NotificationBell } from "@/components/ops/NotificationBell";
import {
  Archive,
  CheckCircle2,
  ClipboardList,
  History as HistoryIcon,
  LineChart,
  LogOut,
  Mail,
  Send,
  Eye,
  ShieldAlert,
} from "lucide-react";

export const Route = createFileRoute("/ops")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/auth", search: { redirect: location.href } });
    }
    const email = data.user.email?.toLowerCase() ?? "";
    let allowed = isOperatorEmail(email);
    if (!allowed) {
      const { data: opRpc } = await supabase.rpc("has_role_email", { _email: email, _role: "operator" });
      if (opRpc === true) allowed = true;
    }
    if (!allowed) {
      const { data: adminRpc } = await supabase.rpc("has_role_email", { _email: email, _role: "admin" });
      if (adminRpc === true) allowed = true;
    }
    if (!allowed) {
      throw redirect({ to: "/" });
    }
    return { operatorEmail: email };
  },
  component: OpsLayout,
});

const NAV: Array<{ to: string; label: string; icon: typeof ClipboardList }> = [
  { to: "/ops/queue", label: "Queue", icon: ClipboardList },
  { to: "/ops/queue?status=in_review", label: "In Review", icon: Eye },
  { to: "/ops/queue?status=approved", label: "Approved", icon: CheckCircle2 },
  { to: "/ops/queue?status=archived", label: "Archived", icon: Archive },
  { to: "/ops/history", label: "History", icon: HistoryIcon },
  { to: "/ops/insights", label: "Analytics", icon: LineChart },
  { to: "/ops/access-events", label: "Access events", icon: ShieldAlert },
  { to: "/ops/emails", label: "Email health", icon: Mail },
];

function OpsLayout() {
  const { operatorEmail } = Route.useRouteContext();
  const router = useRouter();
  const pathname = router.state.location.pathname;
  const search = router.state.location.search as Record<string, unknown>;
  const initial = useMemo(
    () => (operatorEmail?.[0] ?? "T").toUpperCase(),
    [operatorEmail],
  );

  return (
    <div className="flex min-h-screen bg-[#f6f6f3] text-[#171c38]">
      <aside className="hidden w-[232px] shrink-0 flex-col border-r border-[#1a1f3d] bg-[#0c1130] text-white md:flex">
        <div className="px-6 pt-7 pb-6">
          <Link
            to="/engine/review"
            className="inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.22em] text-white/60 hover:text-white"
          >
            ← Back to Engine
          </Link>
          <div className="mt-3 font-serif text-xl tracking-[0.32em] text-white">TRUST TAI</div>
          <div className="mt-1 text-[11px] uppercase tracking-[0.22em] text-white/55">
            Roadmap Engine · Submission Queue
          </div>
        </div>
        <nav className="flex-1 px-3 py-2">
          {NAV.map((item) => {
            const [base, query] = item.to.split("?");
            const isActive =
              pathname === base &&
              (!query ||
                query
                  .split("&")
                  .every(
                    (kv) => {
                      const [k, v] = kv.split("=");
                      return (search?.[k] as string | undefined) === v;
                    },
                  ));
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={base}
                search={
                  query
                    ? Object.fromEntries(
                        query.split("&").map((kv) => kv.split("=") as [string, string]),
                      )
                    : undefined
                }
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-white/10 text-white"
                    : "text-white/70 hover:bg-white/5 hover:text-white",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-white/10 px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-sm font-medium">
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm text-white">Tai</div>
              <div className="truncate text-[11px] text-white/55">{operatorEmail}</div>
            </div>
            <NotificationBell />
            <button
              type="button"
              onClick={async () => {
                await supabase.auth.signOut();
                router.navigate({ to: "/" });
              }}
              className="rounded-md p-1.5 text-white/60 hover:bg-white/5 hover:text-white"
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <div className="md:hidden border-b border-[#e7e6df] bg-white px-4 py-3">
          <div className="font-serif text-base tracking-[0.28em]">TRUST TAI</div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-[#5d6079]">
            Roadmap Engine · Submission Queue
          </div>
          <Link
            to="/engine/review"
            className="mt-1 inline-block text-[10px] uppercase tracking-[0.2em] text-[#5d6079] hover:text-[#171c38]"
          >
            ← Back to Engine
          </Link>
          <div className="mt-3 flex gap-1 overflow-x-auto pb-1 text-xs">
            {NAV.map((item) => {
              const [base] = item.to.split("?");
              return (
                <Link
                  key={item.to}
                  to={base}
                  className="rounded-md border border-[#e7e6df] px-2.5 py-1.5 whitespace-nowrap text-[#171c38]"
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
        <Outlet />
        <div className="h-12" />
      </main>
    </div>
  );
}

// Tiny helper icon — re-exported so the symbol stays defined.
export { Send };
