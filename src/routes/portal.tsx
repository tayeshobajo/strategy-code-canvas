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
import { Home, FileText, Folder, MessageSquare, CreditCard, User, LogOut, Activity, Lock } from "lucide-react";
import logoWhite from "@/assets/trust-tai-logo-white.png.asset.json";
import { usePortalContext } from "@/hooks/use-portal-context";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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

type NavKey = "home" | "roadmap" | "files" | "messages" | "billing" | "activity" | "account";

const NAV: Array<{
  key: NavKey;
  to: string;
  label: string;
  icon: typeof Home;
}> = [
  { key: "home", to: "/portal/home", label: "Home", icon: Home },
  { key: "roadmap", to: "/portal/roadmap", label: "Roadmap", icon: FileText },
  { key: "files", to: "/portal/files", label: "Files", icon: Folder },
  { key: "messages", to: "/portal/messages", label: "Messages", icon: MessageSquare },
  { key: "billing", to: "/portal/billing", label: "Billing", icon: CreditCard },
  { key: "activity", to: "/portal/activity", label: "Activity", icon: Activity },
  { key: "account", to: "/portal/account", label: "Account", icon: User },
];

// Lifecycle-driven lock rules. Items appear in the sidebar always so clients
// see the shape of the engagement, but are disabled until the internal
// Roadmap Engine has produced approved output for that surface.
const ROADMAP_UNLOCK_STATUSES = new Set([
  "roadmap_ready",
  "roadmap_delivered",
  "engagement_active",
  "engagement_complete",
]);

const FILES_UNLOCK_STATUSES = new Set([
  "roadmap_ready",
  "roadmap_delivered",
  "engagement_active",
  "engagement_complete",
]);

function getLockReason(
  key: NavKey,
  portalStatus: string | undefined,
  hasApprovedRoadmap: boolean,
): string | null {
  const status = portalStatus ?? "payment_confirmed";
  if (key === "roadmap") {
    if (hasApprovedRoadmap || ROADMAP_UNLOCK_STATUSES.has(status)) return null;
    return "Unlocks when Tai publishes your approved Roadmap.";
  }
  if (key === "files") {
    if (FILES_UNLOCK_STATUSES.has(status)) return null;
    return "Deliverables appear here once your Roadmap is approved.";
  }
  return null;
}

function PortalLayout() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [email, setEmail] = useState<string>("");

  const isPublicPage =
    pathname === "/portal/login" || pathname === "/portal/access-denied";

  useEffect(() => {
    if (isPublicPage) {
      setEmail("");
      return;
    }
    let cancelled = false;
    const sync = async () => {
      const { data } = await supabase.auth.getUser();
      if (!cancelled) setEmail(data.user?.email ?? "");
    };
    sync();
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        setEmail("");
      } else if (session?.user?.email) {
        setEmail(session.user.email);
      } else {
        sync();
      }
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [isPublicPage]);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/portal/login" });
  }

  if (isPublicPage) {
    return <Outlet />;
  }

  return (
    <TooltipProvider delayDuration={150}>
      <div className="min-h-screen flex flex-col bg-paper">
        <div className="flex-1 flex flex-col lg:flex-row">
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
            <div className="hidden lg:block px-6 pt-5 pb-4">
              <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal">
                Client Portal
              </div>
              <PortalGreeting />
            </div>
            <PortalNav pathname={pathname} />
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
      </div>
    </TooltipProvider>
  );
}

function PortalGreeting() {
  const { data } = usePortalContext();
  const contactName =
    data && "project" in data && data.project?.contact_name
      ? data.project.contact_name.split(" ")[0]
      : null;
  if (!contactName) return null;
  return (
    <div className="mt-3 text-[13px] text-white/85 font-display">
      Hello, {contactName}.
    </div>
  );
}

function PortalNav({ pathname }: { pathname: string }) {
  const { data } = usePortalContext();
  const portalStatus =
    data && "project" in data ? data.project?.portal_status : undefined;
  const hasApprovedRoadmap =
    !!(data && "approvedRoadmap" in data && data.approvedRoadmap);

  return (
    <nav
      aria-label="Portal navigation"
      className="flex lg:block overflow-x-auto lg:overflow-visible lg:flex-1 px-3 py-3 lg:py-4 gap-1 lg:gap-0 lg:space-y-1"
    >
      {NAV.map((item) => {
        const active =
          pathname === item.to || pathname.startsWith(item.to + "/");
        const Icon = item.icon;
        const lockReason = getLockReason(item.key, portalStatus, hasApprovedRoadmap);
        const baseClasses = `group relative flex items-center gap-3 px-3 py-2.5 rounded-md text-sm whitespace-nowrap transition-colors`;

        if (lockReason) {
          return (
            <Tooltip key={item.to}>
              <TooltipTrigger asChild>
                <div
                  aria-disabled="true"
                  className={`${baseClasses} text-white/35 cursor-not-allowed`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="flex-1">{item.label}</span>
                  <Lock className="w-3 h-3 opacity-70" aria-label="Locked" />
                </div>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-[220px] text-xs">
                {lockReason}
              </TooltipContent>
            </Tooltip>
          );
        }

        return (
          <Link
            key={item.to}
            to={item.to}
            aria-current={active ? "page" : undefined}
            className={`${baseClasses} ${
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
  );
}
