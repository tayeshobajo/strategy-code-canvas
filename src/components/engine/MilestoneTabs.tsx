import { Link } from "@tanstack/react-router";
import { FileText, Image as ImageIcon, Hammer, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Sprint 1 · Wave 3 — Milestone workspace tabs.
 *
 * Sticky strip with deep-linkable routes for a single milestone.
 * Rendered at the top of every milestone workspace page so tab state
 * lives in the URL (bookmarkable, deep-linkable, back-button friendly).
 */

const TABS: Array<{
  to:
    | "/engine/projects/$projectId/milestones/$milestoneId/brief"
    | "/engine/projects/$projectId/milestones/$milestoneId/mockups"
    | "/engine/projects/$projectId/milestones/$milestoneId/build"
    | "/engine/projects/$projectId/milestones/$milestoneId/qa";
  label: string;
  icon: ReactNode;
}> = [
  { to: "/engine/projects/$projectId/milestones/$milestoneId/brief", label: "Brief", icon: <FileText className="h-3.5 w-3.5" /> },
  { to: "/engine/projects/$projectId/milestones/$milestoneId/mockups", label: "Mockups", icon: <ImageIcon className="h-3.5 w-3.5" /> },
  { to: "/engine/projects/$projectId/milestones/$milestoneId/build", label: "Build", icon: <Hammer className="h-3.5 w-3.5" /> },
  { to: "/engine/projects/$projectId/milestones/$milestoneId/qa", label: "QA", icon: <ShieldCheck className="h-3.5 w-3.5" /> },
];

export function MilestoneTabs({
  projectId,
  milestoneId,
  milestoneName,
}: {
  projectId: string;
  milestoneId: string;
  milestoneName?: string | null;
}) {
  return (
    <div
      data-qa-role="milestone-tabs"
      className="sticky top-0 z-20 -mx-4 mb-4 border-b border-[#E8E1D6] bg-[#FBF9F4]/95 px-4 py-2 backdrop-blur"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#667085]">
            Milestone workspace
          </div>
          {milestoneName ? (
            <div className="truncate font-display text-sm text-[#0A0F1F]">{milestoneName}</div>
          ) : null}
        </div>
        <nav className="flex items-center gap-1" aria-label="Milestone tabs">
          {TABS.map((t) => (
            <Link
              key={t.to}
              to={t.to}
              params={{ projectId, milestoneId }}
              search={(prev: Record<string, unknown>) => prev}
              activeProps={{
                className:
                  "inline-flex items-center gap-1.5 rounded-full bg-[#0A0F1F] px-3 py-1.5 text-xs font-medium text-white",
              }}
              inactiveProps={{
                className:
                  "inline-flex items-center gap-1.5 rounded-full border border-transparent px-3 py-1.5 text-xs font-medium text-[#3f4a63] hover:border-[#E8E1D6] hover:bg-white",
              }}
              activeOptions={{ exact: false }}
            >
              {t.icon}
              {t.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
