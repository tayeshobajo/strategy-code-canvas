import {
  createFileRoute,
  Outlet,
  redirect,
  Link,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isAdminEmail } from "@/lib/ops/access";
import {
  LayoutDashboard,
  FolderKanban,
  FileStack,
  ClipboardCheck,
  PackageCheck,
  Activity,
  Globe2,
  BrainCircuit,
  LogOut,
  Menu,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import logoWhite from "@/assets/trust-tai-logo-white.png.asset.json";

export const Route = createFileRoute("/engine")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/auth", search: { redirect: location.href } });
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
  to: "/engine" | "/engine/projects" | "/engine/templates" | "/engine/review" | "/engine/delivery" | "/engine/execution" | "/engine/operations" | "/engine/intelligence";
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
};

const NAV: NavItem[] = [
  { to: "/engine", label: "Command Center", icon: LayoutDashboard, exact: true },
  { to: "/engine/projects", label: "Projects", icon: FolderKanban },
  { to: "/engine/templates", label: "Templates", icon: FileStack },
  { to: "/engine/review", label: "Review & Approvals", icon: ClipboardCheck },
  { to: "/engine/delivery", label: "Delivery Room", icon: PackageCheck },
  { to: "/engine/execution", label: "Execution Tracker", icon: Activity },
  { to: "/engine/operations", label: "Global Operations", icon: Globe2 },
  { to: "/engine/intelligence", label: "Intelligence Memory", icon: BrainCircuit },
];

function EngineLayout() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [email, setEmail] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  const crumbs = buildCrumbs(pathname);

  return (
    <div className="min-h-screen flex bg-paper-soft">
      <aside className="w-64 shrink-0 bg-ink text-white flex flex-col sticky top-0 h-screen">
        <div className="px-6 py-6 border-b border-white/10">
          <Link to="/" aria-label="Trust Tai home" className="block">
            <img src={logoWhite.url} alt="Trust Tai" className="h-9 w-auto" />
          </Link>
          <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-royal mt-3">
            Roadmap Engine
          </div>
        </div>
        <nav aria-label="Engine navigation" className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {NAV.map((item) => {
            const active = item.exact
              ? pathname === item.to
              : pathname === item.to || pathname.startsWith(item.to + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? "page" : undefined}
                className={`group relative flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                  active
                    ? "bg-white/10 text-white"
                    : "text-white/70 hover:text-white hover:bg-white/5"
                }`}
              >
                <span
                  aria-hidden
                  className={`absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full transition-all ${
                    active ? "bg-royal opacity-100" : "opacity-0 group-hover:opacity-40 bg-white"
                  }`}
                />
                <Icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="px-4 py-4 border-t border-white/10 text-xs text-white/60">
          <div className="truncate mb-2">{email}</div>
          <button
            onClick={signOut}
            className="flex items-center gap-2 text-white/70 hover:text-white"
          >
            <LogOut className="w-3.5 h-3.5" /> Sign out
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="border-b border-border bg-card">
          <div className="px-8 py-3 flex items-center justify-between gap-4">
            <nav aria-label="Breadcrumb" className="text-sm text-ink/60 flex items-center gap-2 min-w-0">
              {crumbs.map((c, i) => (
                <span key={c.to ?? c.label} className="flex items-center gap-2 min-w-0">
                  {i > 0 ? <span className="text-ink/30">/</span> : null}
                  {c.to ? (
                    <Link to={c.to} className="hover:text-ink truncate">
                      {c.label}
                    </Link>
                  ) : (
                    <span className="text-ink truncate">{c.label}</span>
                  )}
                </span>
              ))}
            </nav>
            <div className="text-xs text-ink/50 font-mono uppercase tracking-[0.2em]">
              Trust Tai Internal
            </div>
          </div>
        </header>
        <main className="flex-1 px-8 py-8 min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

// U2 (audit): breadcrumbs derived from the NAV map plus a per-subpage
// label table, so every route surface gets a real, readable trail — not a
// single capitalized slug.
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
  builder: "Roadmap Builder",
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

function buildCrumbs(pathname: string): Array<{ label: string; to?: string }> {
  const out: Array<{ label: string; to?: string }> = [
    { label: "Roadmap Engine", to: "/engine" },
  ];
  if (pathname === "/engine") return out;

  // Handle top-level NAV entries (Projects, Templates, Review, etc.)
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
      // Link the project crumb to its overview page.
      out.push({ label: "Project" });
      const sub = match[2];
      const subsub = match[3];
      if (sub) out.push({ label: titleFromSlug(sub) });
      if (subsub) out.push({ label: titleFromSlug(subsub) });
    }
    return out;
  }

  if (topNav) {
    out.push({ label: topNav.label });
    // Any additional slug segments after the top nav path.
    const rest = pathname.slice(topNav.to.length).replace(/^\/+/, "");
    if (rest) {
      for (const seg of rest.split("/")) {
        out.push({ label: titleFromSlug(seg) });
      }
    }
    return out;
  }

  // Unknown /engine/* path — fall back to slug titling.
  const rest = pathname.replace("/engine/", "");
  for (const seg of rest.split("/")) out.push({ label: titleFromSlug(seg) });
  return out;
}
