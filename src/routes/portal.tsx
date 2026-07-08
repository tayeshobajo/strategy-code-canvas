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
import { Home, FileText, Folder, MessageSquare, CreditCard, User, LogOut, Activity, Lock, ChevronUp, Menu } from "lucide-react";
import logoWhite from "@/assets/trust-tai-logo-white.png.asset.json";
import { usePortalContext } from "@/hooks/use-portal-context";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

export const Route = createFileRoute("/portal")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const PUBLIC_PATHS = ["/portal/login", "/portal/access-denied", "/portal/roadmap-mockup"];
    if (PUBLIC_PATHS.includes(location.pathname)) {
      return { user: null };
    }
    if (
      location.pathname === "/portal/roadmap" &&
      /(?:^|[?&])__visual=demo(?:&|$)/.test(location.searchStr ?? "")
    ) {
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
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const isPublicPage =
    pathname === "/portal/login" || pathname === "/portal/access-denied";

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

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

  const sidebarInner = (
    <div className="flex flex-col h-full bg-ink text-white">
      <div className="flex px-6 py-6 border-b border-white/10 items-center shrink-0">
        <Link to="/" aria-label="Trust Tai home" className="block">
          <img
            src={logoWhite.url}
            alt="Trust Tai | Consultancy + AI Agency"
            className="h-9 w-auto"
          />
        </Link>
      </div>
      <div className="px-6 pt-5 pb-4 shrink-0">
        <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal">
          Client Portal
        </div>
        <PortalGreeting />
      </div>
      <PortalNav pathname={pathname} />
      <div className="mt-auto shrink-0">
        <SidebarAccountZone email={email} onSignOut={signOut} />
      </div>
    </div>
  );

  return (
    <TooltipProvider delayDuration={150}>
      <div className="min-h-screen flex flex-col bg-paper overflow-x-clip">
        <header className="lg:hidden sticky top-0 z-40 flex items-center justify-between h-14 px-4 bg-ink text-white border-b border-white/10">
          <Link to="/" aria-label="Trust Tai home" className="block">
            <img
              src={logoWhite.url}
              alt="Trust Tai | Consultancy + AI Agency"
              className="h-7 w-auto"
            />
          </Link>
          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                aria-label="Open navigation"
                className="grid place-items-center h-10 w-10 rounded-md border border-white/10 hover:bg-white/5 transition-colors"
              >
                <Menu className="w-5 h-5" />
              </button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="w-[280px] max-w-[85vw] p-0 bg-ink border-r border-white/10 text-white [&>button]:text-white/70"
            >
              <VisuallyHidden>
                <SheetTitle>Portal navigation</SheetTitle>
              </VisuallyHidden>
              {sidebarInner}
            </SheetContent>
          </Sheet>
        </header>

        <div className="flex-1 flex flex-col lg:flex-row min-w-0">
          <aside className="hidden lg:flex lg:w-64 lg:flex-shrink-0 lg:sticky lg:top-0 lg:h-screen flex-col z-30">
            {sidebarInner}
          </aside>

          <main className="app-shell-main flex-1 bg-paper-soft overflow-x-clip">
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
    <div className="mt-3 text-[13px] text-white/80 font-display">
      Hello, {contactName}.
    </div>
  );
}

function initialsFromEmail(name: string | null | undefined, email: string) {
  const src = (name && name.trim()) || email || "";
  if (!src) return "?";
  const parts = src.split(/[\s@._-]+/).filter(Boolean);
  if (parts.length === 0) return src.slice(0, 2).toUpperCase();
  const first = parts[0]?.[0] ?? "";
  const second = parts[1]?.[0] ?? "";
  return (first + second || first).toUpperCase();
}

function SidebarAccountZone({
  email,
  onSignOut,
}: {
  email: string;
  onSignOut: () => void;
}) {
  const { data } = usePortalContext();
  const contactName =
    data && "project" in data ? data.project?.contact_name ?? null : null;
  const initials = initialsFromEmail(contactName, email);
  const displayName = contactName || email.split("@")[0] || "Portal user";
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-white/[0.06] bg-transparent px-4 pt-3 pb-3 space-y-2.5">
      <div className="px-1">
        <div className="h-px w-5 bg-royal/40" />
        <div className="font-display text-[11.5px] text-white/70 mt-1.5 leading-tight">
          Your success is our mission.
        </div>
      </div>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="w-full flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left hover:bg-white/[0.03] transition-colors"
            aria-label="Account menu"
            aria-expanded={open}
          >
            <span
              aria-hidden
              className="grid place-items-center h-7 w-7 rounded-full bg-royal/15 border border-royal/25 text-[10.5px] font-semibold text-white/90 shrink-0"
            >
              {initials}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] text-white/80 truncate leading-tight">
                {displayName}
              </span>
              <span className="block text-[10px] text-white/35 truncate leading-tight mt-0.5">
                Client
              </span>
            </span>
            <ChevronUp
              className={`w-3 h-3 text-white/35 shrink-0 transition-transform ${
                open ? "rotate-180" : ""
              }`}
            />
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="end"
          sideOffset={8}
          className="w-56 p-1"
        >
          <div className="px-2.5 py-2 border-b border-border">
            <div className="text-[11px] text-muted-foreground truncate">
              {email}
            </div>
          </div>
          <button
            type="button"
            onClick={onSignOut}
            className="w-full flex items-center gap-2 px-2.5 py-2 rounded-sm text-[13px] text-ink hover:bg-muted"
          >
            <LogOut className="w-3.5 h-3.5" /> Sign out
          </button>
        </PopoverContent>
      </Popover>
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
      className="block flex-1 overflow-y-auto px-3 py-4 space-y-0.5"
    >
      {NAV.map((item) => {
        const active =
          pathname === item.to || pathname.startsWith(item.to + "/");
        const Icon = item.icon;
        const lockReason = getLockReason(item.key, portalStatus, hasApprovedRoadmap);
        const baseClasses = `group relative flex items-center gap-3 px-3 py-2 rounded-md text-[13px] whitespace-nowrap transition-colors`;

        if (lockReason) {
          return (
            <Tooltip key={item.to}>
              <TooltipTrigger asChild>
                <div
                  aria-disabled="true"
                  className={`${baseClasses} text-white/30 cursor-not-allowed`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="flex-1">{item.label}</span>
                  <Lock className="w-3 h-3 opacity-60" aria-label="Locked" />
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
                ? "bg-white/[0.08] text-white"
                : "text-white/60 hover:text-white/90 hover:bg-white/[0.04]"
            }`}
          >
            <span
              aria-hidden
              className={`absolute left-0 top-2 bottom-2 w-[2.5px] rounded-r-full transition-all ${
                active ? "bg-royal opacity-100" : "opacity-0 group-hover:opacity-30 bg-white"
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
