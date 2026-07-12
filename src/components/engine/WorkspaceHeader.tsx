import { Link, useRouterState } from "@tanstack/react-router";
import {
  Settings,
  PlusCircle,
  Sparkles,
  Bot,
  ListChecks,
  DollarSign,
  GitCompare,
  ShieldCheck,
  ClipboardList,
  MessageCircle,
  Network,
  Layers,
  Database,
  ClipboardCheck,
  Wrench,
  Package,
  Compass,
  LayoutDashboard,
  Map,
  Truck,
  ChevronDown,
  MoreHorizontal,
  BrainCircuit,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";

import type { WorkspaceProject } from "@/lib/engine-workspace";
import { EngineStatusBadge } from "@/components/engine/primitives";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function WorkspaceBreadcrumb({
  projectId,
  clientName,
  stepLabel,
}: {
  projectId: string;
  clientName: string;
  stepLabel: string;
}) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-ink/60 flex items-center gap-2 flex-wrap">
      <Link to="/engine/projects" className="hover:text-ink">
        Projects
      </Link>
      <span className="text-ink/30">/</span>
      <Link
        to="/engine/projects/$projectId/overview"
        params={{ projectId }}
        className="hover:text-ink"
      >
        {clientName}
      </Link>
      <span className="text-ink/30">/</span>
      <span className="text-ink/70">Roadmap Workspace</span>
      <span className="text-ink/30">/</span>
      <span className="text-ink font-medium">{stepLabel}</span>
    </nav>
  );
}

export function ProjectHeaderStrip({ project }: { project: WorkspaceProject }) {
  return (
    <div className="rounded-xl border border-border bg-card shadow-sm p-5">
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div className="flex items-start gap-4 min-w-0">
          <div className="w-11 h-11 rounded-lg bg-ink text-white flex items-center justify-center font-display text-lg shrink-0">
            {project.name.charAt(0)}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="font-display text-2xl md:text-3xl text-ink leading-tight">
                {project.name}
              </h1>
              <EngineStatusBadge status={project.status as "active"} />
            </div>
            <div className="text-xs text-ink/60 mt-1">
              {project.client_company}
              {project.client_owner_email ? (
                <>
                  {" "}
                  · Project Owner: <span className="text-ink/80">{project.client_owner_email}</span>
                </>
              ) : null}
              <>
                {" "}
                · Last updated:{" "}
                {new Date(project.last_activity_at).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-6 flex-wrap">
          <Metric
            label="Signals"
            value={project.signal_count.toString()}
            hint="All sources"
            tone="blue"
          />
          <Metric
            label="Health Score"
            value={`${project.health_score}`}
            hint="Out of 100"
            tone="amber"
          />
          <Metric
            label="Progress"
            value={`${project.progress_pct}%`}
            hint="Complete"
            tone="green"
          />
          <button
            type="button"
            className="inline-flex items-center gap-2 text-sm text-ink border border-border rounded-md px-3 py-1.5 hover:border-royal/50"
          >
            <Settings className="w-3.5 h-3.5" /> Project Settings
          </button>
        </div>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone: "blue" | "amber" | "green";
}) {
  const dot: Record<string, string> = {
    blue: "bg-royal",
    amber: "bg-[#c99a20]",
    green: "bg-[#1f6b3b]",
  };
  return (
    <div className="flex items-center gap-2">
      <span className={cn("w-2 h-2 rounded-full shrink-0", dot[tone])} />
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink/50">{label}</div>
        <div className="text-lg font-display text-ink leading-none">{value}</div>
        <div className="text-[10px] text-ink/50 mt-0.5">{hint}</div>
      </div>
    </div>
  );
}

type Icon = ComponentType<SVGProps<SVGSVGElement>>;
type NavEntry = { key: string; label: string; suffix: string; icon: Icon };

const ALL_NAV: Record<string, NavEntry> = {
  overview: { key: "overview", label: "Overview", suffix: "overview", icon: LayoutDashboard },
  intelligence: {
    key: "intelligence",
    label: "Intelligence",
    suffix: "intelligence-layer",
    icon: Sparkles,
  },
  understanding: {
    key: "understanding",
    label: "Understanding",
    suffix: "understanding-room",
    icon: BrainCircuit,
  },
  roadmap: { key: "roadmap", label: "Roadmap", suffix: "builder", icon: Map },
  delivery: { key: "delivery", label: "Delivery", suffix: "delivery", icon: Truck },
  chat: { key: "chat", label: "Chat", suffix: "chat", icon: MessageCircle },
};

const MORE_SECTIONS: Array<{
  heading: string;
  items: Array<{ label: string; suffix: string; icon: Icon }>;
}> = [
  {
    heading: "Intelligence",
    items: [
      { label: "Signal Room", suffix: "signal-room", icon: PlusCircle },
      { label: "Signal Extraction", suffix: "extraction", icon: Sparkles },
      { label: "Point A", suffix: "point-a", icon: Compass },
      { label: "Point B", suffix: "point-b", icon: Compass },
      { label: "Hidden Assets", suffix: "hidden-assets", icon: Sparkles },
      { label: "Gap Map", suffix: "gap-map", icon: Map },
      { label: "Blueprint", suffix: "blueprint", icon: Layers },
      { label: "Intake Review", suffix: "intake", icon: ClipboardList },
      { label: "Spirit First", suffix: "spirit-first", icon: Compass },
    ],
  },
  {
    heading: "Roadmap & Planning",
    items: [
      { label: "Project Spine", suffix: "spine", icon: Network },
      { label: "Sequencing", suffix: "sequencing", icon: Layers },
      { label: "Deadlines", suffix: "deadlines", icon: ClipboardList },
      { label: "Investment", suffix: "investment", icon: DollarSign },
      { label: "Client Preview", suffix: "preview", icon: ClipboardCheck },
      { label: "Frame Builder", suffix: "frame-builder", icon: Layers },
      { label: "Mockup Builder", suffix: "mockup-builder", icon: Layers },
      { label: "Backend Builder", suffix: "backend-builder", icon: Database },
      { label: "Implementation Plan", suffix: "implementation-plan", icon: Wrench },
      { label: "QA Factory", suffix: "qa-factory", icon: ClipboardCheck },
      { label: "Build Execution", suffix: "build-execution", icon: Package },
    ],
  },
  {
    heading: "Agent & Governance",
    items: [
      { label: "Agent", suffix: "agent", icon: Bot },
      { label: "Tasks", suffix: "agent/tasks", icon: ListChecks },
      { label: "Costs", suffix: "agent/costs", icon: DollarSign },
      { label: "Permissions", suffix: "agent/permissions", icon: ShieldCheck },
      { label: "Version Compare", suffix: "versions/compare", icon: GitCompare },
    ],
  },
  {
    heading: "Tools",
    items: [
      { label: "AI Workspace", suffix: "ai-workspace", icon: BrainCircuit },
    ],
  },
];

function hasKeys(v: unknown): boolean {
  return !!v && typeof v === "object" && !Array.isArray(v) && Object.keys(v as object).length > 0;
}

function primaryNavFor(project: WorkspaceProject): NavEntry[] {
  const hasSignals =
    project.signal_count > 0 || hasKeys(project.signal_room) || hasKeys(project.extraction);
  const hasRoadmapDraft = !!project.roadmap_version || hasKeys(project.roadmap);
  const hasApproved = !!project.approved_version;
  const hasDelivery = hasKeys(project.delivery) || hasKeys(project.client_preview);
  const stage =
    hasApproved || hasDelivery || project.current_step_num >= 13
      ? 4
      : hasRoadmapDraft || project.current_step_num >= 9
        ? 3
        : hasSignals || project.current_step_num >= 4
          ? 2
          : 1;

  const items: NavEntry[] = [ALL_NAV.overview, ALL_NAV.intelligence];
  if (stage >= 2) items.push(ALL_NAV.understanding);
  if (stage >= 3) items.push(ALL_NAV.roadmap);
  if (stage >= 4) items.push(ALL_NAV.delivery);
  items.push(ALL_NAV.chat);
  return items.slice(0, 6);
}

function isSuffixActive(pathname: string, suffix: string): boolean {
  return pathname.endsWith(`/${suffix}`) || pathname.includes(`/${suffix}/`);
}

export function WorkspaceToolbar({
  projectId,
  project,
}: {
  projectId: string;
  project: WorkspaceProject;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const primary = primaryNavFor(project);
  const primarySuffixes = new Set(primary.map((p) => p.suffix));

  return (
    <>
      {/* Desktop / tablet primary nav */}
      <div
        className="hidden md:flex items-center justify-end gap-1 flex-wrap"
        data-qa-role="workspace-toolbar"
      >
        {primary.map((item) => {
          const active = isSuffixActive(pathname, item.suffix);
          const Icon = item.icon;
          const to = `/engine/projects/$projectId/${item.suffix}` as unknown as "/engine/projects/$projectId/overview";
          return (
            <Link
              key={item.key}
              to={to}
              params={{ projectId }}
              data-qa-nav={item.key}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] transition-colors",
                active ? "bg-ink text-paper" : "text-ink/70 hover:text-ink hover:bg-ink/5",
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {item.label}
            </Link>
          );
        })}
        <MoreMenu projectId={projectId} pathname={pathname} hidden={primarySuffixes} />
        <Link
          to="/engine/projects/$projectId/signal-room"
          params={{ projectId }}
          className="ml-1 inline-flex items-center gap-1.5 rounded-full bg-royal px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-royal/90"
        >
          <PlusCircle className="w-3.5 h-3.5" /> Add Signal
        </Link>
      </div>

      {/* Mobile bottom bar */}
      <nav
        aria-label="Project sections"
        className="md:hidden fixed inset-x-0 bottom-0 z-40 border-t border-border bg-paper/95 backdrop-blur pb-[env(safe-area-inset-bottom)]"
      >
        <ul className="grid grid-cols-5">
          {primary.slice(0, 4).map((item) => {
            const active = isSuffixActive(pathname, item.suffix);
            const Icon = item.icon;
            const to = `/engine/projects/$projectId/${item.suffix}` as unknown as "/engine/projects/$projectId/overview";
            return (
              <li key={item.key}>
                <Link
                  to={to}
                  params={{ projectId }}
                  className={cn(
                    "flex flex-col items-center justify-center gap-0.5 py-2 text-[10px]",
                    active ? "text-royal" : "text-ink/60",
                  )}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
          <li>
            <MoreMenu projectId={projectId} pathname={pathname} hidden={primarySuffixes} mobile />
          </li>
        </ul>
      </nav>
      {/* Spacer to prevent mobile content from sitting under the bottom bar */}
      <div aria-hidden className="md:hidden h-16" />
    </>
  );
}

function MoreMenu({
  projectId,
  pathname,
  hidden,
  mobile = false,
}: {
  projectId: string;
  pathname: string;
  hidden: Set<string>;
  mobile?: boolean;
}) {
  const anyActive = MORE_SECTIONS.some((s) =>
    s.items.some((i) => !hidden.has(i.suffix) && isSuffixActive(pathname, i.suffix)),
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {mobile ? (
          <button
            type="button"
            className={cn(
              "w-full flex flex-col items-center justify-center gap-0.5 py-2 text-[10px]",
              anyActive ? "text-royal" : "text-ink/60",
            )}
          >
            <MoreHorizontal className="w-4 h-4" />
            <span>More</span>
          </button>
        ) : (
          <button
            type="button"
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[13px] transition-colors",
              anyActive ? "bg-ink/10 text-ink" : "text-ink/70 hover:text-ink hover:bg-ink/5",
            )}
          >
            More <ChevronDown className="w-3.5 h-3.5" />
          </button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 max-h-[70vh] overflow-y-auto">
        {MORE_SECTIONS.map((section, idx) => {
          const items = section.items.filter((i) => !hidden.has(i.suffix));
          if (items.length === 0) return null;
          return (
            <div key={section.heading}>
              {idx > 0 ? <DropdownMenuSeparator /> : null}
              <DropdownMenuLabel className="text-[10px] font-mono uppercase tracking-[0.2em] text-ink/50">
                {section.heading}
              </DropdownMenuLabel>
              {items.map((item) => {
                const Icon = item.icon;
                const active = isSuffixActive(pathname, item.suffix);
                const to = `/engine/projects/$projectId/${item.suffix}` as unknown as "/engine/projects/$projectId/overview";
                return (
                  <DropdownMenuItem key={item.suffix} asChild>
                    <Link
                      to={to}
                      params={{ projectId }}
                      className={cn(
                        "flex items-center gap-2 text-sm",
                        active && "text-royal font-medium",
                      )}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {item.label}
                    </Link>
                  </DropdownMenuItem>
                );
              })}
            </div>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-sm">
          <Settings className="w-3.5 h-3.5 mr-2" /> Project Settings
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
