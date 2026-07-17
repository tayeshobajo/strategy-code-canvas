import {
  createFileRoute,
  Outlet,
  redirect,
  Link,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import type { WorkspaceProject } from "@/lib/engine-workspace";
import { getProjectWorkspace } from "@/lib/engine.functions";
import { workspaceQueryOptions } from "@/routes/engine.projects.$projectId";
import { supabase } from "@/integrations/supabase/client";
import { isAdminEmail } from "@/lib/ops/access";
import {
  LayoutDashboard,
  FolderKanban,
  ClipboardCheck,
  Globe2,
  TrendingUp,
  Settings,
  ChevronDown,
  FileStack,
  PackageCheck,
  Activity,
  BrainCircuit,
  LogOut,
  Menu,
  Bell,
  Sparkles,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import logoWhite from "@/assets/trust-tai-logo-white.png.asset.json";
import { SourceInspectorProvider } from "@/hooks/use-source-inspector";
import { SourceTruthInspector } from "@/components/engine/SourceTruthInspector";
import { ActivityDriftBanner } from "@/components/engine/ActivityDriftBanner";

export const Route = createFileRoute("/engine")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/auth", search: { email: undefined, redirect: location.href } });
    }
    const email = (data.user.email ?? "").toLowerCase();
    let allowed = isAdminEmail(email);
    if (!allowed) {
      const [{ data: adminRpc }, { data: opRpc }, { data: teamRpc }] = await Promise.all([
        supabase.rpc("has_role_email", { _email: email, _role: "admin" }),
        supabase.rpc("has_role_email", { _email: email, _role: "operator" }),
        supabase.rpc("has_role_email", { _email: email, _role: "team_member" }),
      ]);
      allowed = adminRpc === true || opRpc === true || teamRpc === true;
    }
    if (!allowed) {
      throw redirect({ to: "/portal/access-denied" });
    }
    return { adminEmail: email };
  },
  component: EngineLayout,
});

type NavItem = {
  to:
    | "/engine"
    | "/engine/projects"
    | "/engine/approvals"
    | "/engine/templates"
    | "/engine/review"
    | "/engine/delivery"
    | "/engine/execution"
    | "/engine/operations"
    | "/engine/intelligence"
    | "/engine/strategic-sales"
    | "/engine/settings";
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
};

// Sprint 1 · Wave 1 — the six-item global shell from the design brief.
const PRIMARY_NAV: NavItem[] = [
  { to: "/engine", label: "Command Center", icon: LayoutDashboard, exact: true },
  { to: "/engine/projects", label: "Projects", icon: FolderKanban },
  { to: "/engine/approvals", label: "Approvals", icon: ClipboardCheck },
  { to: "/engine/operations", label: "Operations", icon: Globe2 },
  { to: "/engine/strategic-sales", label: "Strategic Sales", icon: TrendingUp },
  { to: "/engine/settings", label: "Settings", icon: Settings },
];

// Existing surfaces still live in the engine — collapsed into a secondary
// group so the primary shell stays clean.
const SECONDARY_NAV: NavItem[] = [
  { to: "/engine/templates", label: "Templates", icon: FileStack },
  { to: "/engine/review", label: "Review & Approvals", icon: ClipboardCheck },
  { to: "/engine/delivery", label: "Delivery Room", icon: PackageCheck },
  { to: "/engine/execution", label: "Execution Tracker", icon: Activity },
  { to: "/engine/intelligence", label: "Intelligence Memory", icon: BrainCircuit },
];

const NAV: NavItem[] = [...PRIMARY_NAV, ...SECONDARY_NAV];

function EngineLayout() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [email, setEmail] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    setMoreOpen(false);
  }, [pathname]);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", search: { email: undefined, redirect: "/" } });
  }

  const projectMatch = pathname.match(/^\/engine\/projects\/([^/]+)/);
  const activeProjectId = projectMatch?.[1] && projectMatch[1] !== "new" ? projectMatch[1] : null;
  const workspaceFn = useServerFn(getProjectWorkspace);
  const workspaceQuery = useQuery({
    ...workspaceQueryOptions(
      activeProjectId ?? "__none__",
      workspaceFn as unknown as (i: { data: { id: string } }) => Promise<unknown>,
    ),
    enabled: !!activeProjectId,
  });
  const workspaceData = workspaceQuery.data as { project?: WorkspaceProject } | undefined;
  const clientName = workspaceData?.project?.client_company;
  const crumbs = buildCrumbs(pathname, { clientName });
  const currentNav = NAV.find((n) =>
    n.exact ? pathname === n.to : pathname === n.to || pathname.startsWith(n.to + "/"),
  );

  const initials = (email || "?")
    .split("@")[0]
    .split(/[._-]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("") || "TT";

  return (
    <SourceInspectorProvider>
      <div className="engine-theme flex min-h-screen flex-col bg-paper text-ink">
        <ActivityDriftBanner />
        {/* Top nav — white bar, matches the cockpit reference. */}
        <header className="sticky top-0 z-40 border-b border-rule bg-white/95 backdrop-blur">
          <div className="flex h-14 items-center gap-3 px-4 lg:px-6">
            {/* Mobile menu trigger */}
            <div className="lg:hidden">
              <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                <SheetTrigger asChild>
                  <button
                    type="button"
                    aria-label="Open engine menu"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-rule text-ink/70 hover:bg-paper-soft"
                  >
                    <Menu className="h-5 w-5" />
                  </button>
                </SheetTrigger>
                <SheetContent side="left" className="engine-theme flex w-72 flex-col border-rule bg-white p-0">
                  <VisuallyHidden>
                    <SheetTitle>Engine navigation</SheetTitle>
                  </VisuallyHidden>
                  <div className="border-b border-rule px-5 py-5">
                    <Link to="/" aria-label="Trust Tai home" className="block">
                      <img src={logoWhite.url} alt="Trust Tai" className="h-8 w-auto brightness-0" />
                    </Link>
                    <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.24em] text-royal">
                      Roadmap Engine
                    </div>
                  </div>
                  <nav aria-label="Engine navigation" className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
                    {PRIMARY_NAV.map((item) => (
                      <MobileNavLink
                        key={item.to}
                        item={item}
                        pathname={pathname}
                        onNavigate={() => setMobileOpen(false)}
                      />
                    ))}
                    <div className="mt-4 border-t border-rule pt-3">
                      <div className="px-3 pb-2 font-mono text-[10px] uppercase tracking-[0.22em] text-ink/40">
                        More
                      </div>
                      {SECONDARY_NAV.map((item) => (
                        <MobileNavLink
                          key={item.to}
                          item={item}
                          pathname={pathname}
                          onNavigate={() => setMobileOpen(false)}
                        />
                      ))}
                    </div>
                  </nav>
                  <div className="border-t border-rule px-4 py-4 text-xs text-ink/70">
                    <div className="mb-2 truncate">{email}</div>
                    <button
                      onClick={signOut}
                      className="flex items-center gap-2 text-ink/70 hover:text-ink"
                    >
                      <LogOut className="h-3.5 w-3.5" /> Sign out
                    </button>
                  </div>
                </SheetContent>
              </Sheet>
            </div>

            {/* Brand mark */}
            <Link to="/" aria-label="Trust Tai home" className="flex items-center gap-2 pr-2">
              <img src={logoWhite.url} alt="Trust Tai" className="h-7 w-auto brightness-0" />
              <span className="hidden font-mono text-[10px] uppercase tracking-[0.24em] text-royal sm:inline">
                Roadmap Engine
              </span>
            </Link>

            {/* Primary nav (desktop) */}
            <nav aria-label="Engine primary" className="ml-4 hidden items-center gap-1 lg:flex">
              {PRIMARY_NAV.map((item) => (
                <TopNavLink key={item.to} item={item} pathname={pathname} />
              ))}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMoreOpen((v) => !v)}
                  aria-expanded={moreOpen}
                  className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-ink/70 hover:bg-paper-soft hover:text-ink"
                >
                  More
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
                {moreOpen ? (
                  <div
                    role="menu"
                    className="absolute right-0 top-full z-50 mt-1 w-56 rounded-lg border border-rule bg-white p-1 shadow-lg"
                  >
                    {SECONDARY_NAV.map((item) => (
                      <TopNavLink
                        key={item.to}
                        item={item}
                        pathname={pathname}
                        variant="menu"
                        onNavigate={() => setMoreOpen(false)}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            </nav>

            {/* Right cluster */}
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                className="hidden items-center gap-1.5 rounded-full border border-royal/30 bg-royal/5 px-3 py-1.5 text-xs font-medium text-royal transition-colors hover:bg-royal/10 sm:inline-flex"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Ask Captain
              </button>
              <button
                type="button"
                aria-label="Notifications"
                className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-ink/60 hover:bg-paper-soft hover:text-ink"
              >
                <Bell className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={signOut}
                title={email || "Sign out"}
                className="inline-flex h-9 min-w-9 items-center justify-center rounded-full bg-ink text-[11px] font-semibold uppercase text-white hover:bg-ink/90"
                aria-label={`Signed in as ${email}. Sign out.`}
              >
                {initials}
              </button>
            </div>
          </div>

          {/* Breadcrumb strip */}
          <div className="hidden items-center justify-between gap-4 border-t border-rule bg-white/60 px-6 py-2 lg:flex">
            <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-xs text-ink/60">
              {crumbs.map((c, i) => (
                <span key={c.to ?? c.label} className="flex min-w-0 items-center gap-2">
                  {i > 0 ? <span className="text-ink/25">/</span> : null}
                  {c.to ? (
                    <Link to={c.to} className="truncate hover:text-ink">
                      {c.label}
                    </Link>
                  ) : (
                    <span className="truncate text-ink">{c.label}</span>
                  )}
                </span>
              ))}
            </nav>
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink/45">
              Trust Tai Internal
            </div>
          </div>

          {/* Mobile-only current-page label */}
          <div className="border-t border-rule px-4 py-2 lg:hidden">
            <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-royal">
              Roadmap Engine
            </div>
            <div className="truncate text-sm text-ink">{currentNav?.label ?? "Engine"}</div>
          </div>
        </header>

        <main className="app-shell-main flex-1">
          <div className="min-w-0">
            <Outlet />
          </div>
        </main>
      </div>
      <SourceTruthInspector />
    </SourceInspectorProvider>
  );
}

function TopNavLink({
  item,
  pathname,
  variant = "bar",
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  variant?: "bar" | "menu";
  onNavigate?: () => void;
}) {
  const active = item.exact
    ? pathname === item.to
    : pathname === item.to || pathname.startsWith(item.to + "/");
  const Icon = item.icon;
  if (variant === "menu") {
    return (
      <Link
        to={item.to}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={`flex items-center gap-2 rounded-md px-2.5 py-2 text-sm ${
          active ? "bg-paper-soft text-ink" : "text-ink/75 hover:bg-paper-soft hover:text-ink"
        }`}
      >
        <Icon className="h-4 w-4" />
        {item.label}
      </Link>
    );
  }
  return (
    <Link
      to={item.to}
      aria-current={active ? "page" : undefined}
      className={`relative inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors ${
        active ? "text-ink" : "text-ink/65 hover:bg-paper-soft hover:text-ink"
      }`}
    >
      <Icon className="h-4 w-4" />
      <span>{item.label}</span>
      {active ? (
        <span
          aria-hidden
          className="absolute inset-x-2 -bottom-[9px] h-[2px] rounded-full bg-royal"
        />
      ) : null}
    </Link>
  );
}

function MobileNavLink({
  item,
  pathname,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  onNavigate: () => void;
}) {
  const active = item.exact
    ? pathname === item.to
    : pathname === item.to || pathname.startsWith(item.to + "/");
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
        active ? "bg-paper-soft text-ink" : "text-ink/70 hover:bg-paper-soft hover:text-ink"
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

const PROJECT_SUBPAGE_LABELS: Record<string, string> = {
  overview: "Overview",
  intelligence: "Intelligence",
  "intelligence-layer": "Intelligence Layer",
  "signal-room": "Signal Room",
  extraction: "Extraction",
  "point-a": "Point A",
  "point-b": "Point B",
  "gap-map": "Gap Map",
  "hidden-assets": "Hidden Assets",
  sequencing: "Sequencing",
  blueprint: "Blueprint",
  investment: "Investment",
  deadlines: "Deadlines",
  builder: "Roadmap",
  plans: "Plans & Specs",
  "understanding-room": "Understanding Room",
  spine: "Project Spine",
  preview: "Client Preview",
  delivery: "Delivery Prep",
  agent: "Agent",
  costs: "Costs",
  permissions: "Permissions",
  tasks: "Tasks",
  versions: "Versions",
  compare: "Compare",
  milestones: "Milestones",
  brief: "Brief",
  chat: "Captain Chat",
};

function titleFromSlug(slug: string): string {
  return (
    PROJECT_SUBPAGE_LABELS[slug] ??
    slug
      .split("-")
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join(" ")
  );
}

function buildCrumbs(
  pathname: string,
  opts: { clientName?: string } = {},
): Array<{ label: string; to?: string }> {
  const out: Array<{ label: string; to?: string }> = [{ label: "Roadmap Engine", to: "/engine" }];
  if (pathname === "/engine") return out;

  const topNav = NAV.find(
    (n) => !n.exact && (pathname === n.to || pathname.startsWith(n.to + "/")),
  );

  if (topNav && topNav.to === "/engine/projects") {
    out.push({ label: "Projects", to: "/engine/projects" });
    const match = pathname.match(/^\/engine\/projects\/([^/]+)(?:\/([^/]+))?(?:\/([^/]+))?/);
    if (match) {
      const projectId = match[1];
      if (projectId === "new") {
        out.push({ label: "New project" });
        return out;
      }
      out.push({
        label: opts.clientName ?? "Project",
        to: `/engine/projects/${projectId}/spine`,
      });
      const sub = match[2];
      const subsub = match[3];
      if (sub) out.push({ label: titleFromSlug(sub) });
      if (subsub) out.push({ label: titleFromSlug(subsub) });
    }
    return out;
  }

  if (topNav) {
    out.push({ label: topNav.label });
    const rest = pathname.slice(topNav.to.length).replace(/^\/+/, "");
    if (rest) {
      for (const seg of rest.split("/")) {
        out.push({ label: titleFromSlug(seg) });
      }
    }
    return out;
  }

  const rest = pathname.replace("/engine/", "");
  for (const seg of rest.split("/")) out.push({ label: titleFromSlug(seg) });
  return out;
}
