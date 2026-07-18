import { Link } from "@tanstack/react-router";
import { useEffect, useRef, type ComponentType, type SVGProps } from "react";
import {
  Layers,
  MapPin,
  Activity,
  ClipboardCheck,
  Eye,
  Radio,
  Compass,
  Flag,
  Globe,
  ShieldCheck,
  Target,
  Gavel,
  MessageSquare,
  Bot,
  Brain,
  FileText,
  GitPullRequest,
  X,
} from "lucide-react";

import { useFocusTrap } from "@/hooks/use-focus-trap";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;
type RailNavItem = {
  label: string;
  to: string;
  icon: Icon;
  exact?: boolean;
};

const PROJECT_NAV_ITEMS: RailNavItem[] = [
  { label: "Spine", to: "/engine/projects/$projectId/spine", icon: Layers },
  { label: "Roadmap", to: "/engine/projects/$projectId/roadmap", icon: MapPin },
  { label: "Work", to: "/engine/projects/$projectId/work", icon: Activity },
  { label: "QA & Delivery", to: "/engine/projects/$projectId/qa-delivery", icon: ClipboardCheck },
  { label: "Client View", to: "/engine/projects/$projectId/client-view", icon: Eye },
];

const PROJECT_ROOM_ITEMS: RailNavItem[] = [
  { label: "Sources & Signal", to: "/engine/projects/$projectId/signal-room", icon: Radio },
  { label: "Understanding", to: "/engine/projects/$projectId/understanding-room", icon: Compass },
  { label: "World Entry", to: "/engine/projects/$projectId/world-entry", icon: Globe },
  { label: "Execution Boundary", to: "/engine/projects/$projectId/execution-boundary", icon: ShieldCheck },

  { label: "Execution Boundary", to: "/engine/projects/$projectId/execution-boundary", icon: ShieldCheck },
  { label: "Strategic Thesis", to: "/engine/projects/$projectId/strategic-thesis", icon: Target },

  { label: "Point A", to: "/engine/projects/$projectId/point-a", icon: MapPin },
  { label: "Point B", to: "/engine/projects/$projectId/point-b", icon: Flag },
  { label: "Chat with Captain", to: "/engine/projects/$projectId/chat", icon: MessageSquare },
  { label: "Agent Room", to: "/engine/projects/$projectId/agent", icon: Bot },
  { label: "Intelligence", to: "/engine/projects/$projectId/intelligence", icon: Brain },
  { label: "Evidence", to: "/engine/projects/$projectId/evidence", icon: FileText },
  { label: "Amendments", to: "/engine/projects/$projectId/amendments", icon: GitPullRequest },
];

export function LeftProjectRail({ projectId }: { projectId: string }) {
  return (
    <aside
      aria-label="Project navigation"
      className="space-y-3 xl:sticky xl:top-4 xl:self-start"
      data-qa-role="left-project-rail"
    >
      <RailNavSection heading="Project Navigation" items={PROJECT_NAV_ITEMS} projectId={projectId} />
      <RailNavSection heading="Project Rooms" items={PROJECT_ROOM_ITEMS} projectId={projectId} />
    </aside>
  );
}

function RailNavSection({
  heading,
  items,
  projectId,
}: {
  heading: string;
  items: RailNavItem[];
  projectId: string;
}) {
  return (
    <nav className="rounded-2xl border border-[#E8E1D6] bg-white p-3 shadow-sm">
      <div className="px-2 pb-2 font-mono text-[10px] uppercase tracking-[0.22em] text-[#667085]">
        {heading}
      </div>
      <ul className="space-y-0.5">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.to}>
              <Link
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                to={item.to as any}
                params={{ projectId } as never}

                activeOptions={{ exact: item.exact ?? false }}
                activeProps={{
                  className:
                    "flex items-center gap-2 rounded-lg bg-[#eef3fd] px-2 py-1.5 text-[13px] font-medium text-[#3E68B2]",
                }}
                inactiveProps={{
                  className:
                    "flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] text-[#0A0F1F] hover:bg-[#F5EFE4]",
                }}
              >
                <Icon className="h-3.5 w-3.5 text-[#667085]" />
                <span className="truncate">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function MobileRailDrawer({
  open,
  onClose,
  projectId,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(containerRef, open);
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 xl:hidden" role="dialog" aria-modal="true" aria-label="Project navigation">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        ref={containerRef}
        className="absolute inset-y-0 left-0 w-[min(320px,85vw)] overflow-y-auto bg-[#FBF9F4] p-4 shadow-xl outline-none"
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#667085]">
            Project navigation
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="rounded-full border border-[#E8E1D6] bg-white p-1.5 text-[#0A0F1F]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div onClick={onClose}>
          <LeftProjectRail projectId={projectId} />
        </div>
      </div>
    </div>
  );
}
