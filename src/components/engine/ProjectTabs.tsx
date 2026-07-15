import { Link, useRouterState } from "@tanstack/react-router";
import { Network, Map, Wrench, ShieldCheck, Eye } from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { cn } from "@/lib/utils";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;
type Tab = { key: string; label: string; suffix: string; icon: Icon };

const TABS: Tab[] = [
  { key: "spine",       label: "Spine",         suffix: "spine",        icon: Network },
  { key: "roadmap",     label: "Roadmap",       suffix: "roadmap",      icon: Map },
  { key: "work",        label: "Work",          suffix: "work",         icon: Wrench },
  { key: "qa-delivery", label: "QA & Delivery", suffix: "qa-delivery",  icon: ShieldCheck },
  { key: "client-view", label: "Client View",   suffix: "client-view",  icon: Eye },
];

function isActive(pathname: string, suffix: string) {
  return pathname.endsWith(`/${suffix}`) || pathname.includes(`/${suffix}/`);
}

export function ProjectTabs({ projectId }: { projectId: string }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav
      aria-label="Project sections"
      className="flex items-center gap-1 border-b border-border pb-0"
      data-qa-role="project-tabs"
    >
      {TABS.map((tab) => {
        const active = isActive(pathname, tab.suffix);
        const Icon = tab.icon;
        const to =
          `/engine/projects/$projectId/${tab.suffix}` as unknown as "/engine/projects/$projectId/spine";
        return (
          <Link
            key={tab.key}
            to={to}
            params={{ projectId }}
            data-qa-tab={tab.key}
            data-active={active ? "true" : undefined}
            className={cn(
              "inline-flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors",
              active
                ? "border-ink text-ink"
                : "border-transparent text-ink/60 hover:text-ink hover:border-ink/30",
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
