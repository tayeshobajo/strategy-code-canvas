import { Link, useRouterState } from "@tanstack/react-router";
import { Settings, PlusCircle, Sparkles, Bot, ListChecks, DollarSign, GitCompare, ShieldCheck, ClipboardList, MessageCircle, Network, Layers, Database, ClipboardCheck, Wrench, Package } from "lucide-react";

import type { WorkspaceProject } from "@/lib/engine-workspace";
import { EngineStatusBadge } from "@/components/engine/primitives";
import { cn } from "@/lib/utils";

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
      <Link to="/engine/projects" className="hover:text-ink">Projects</Link>
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
                <> · Project Owner: <span className="text-ink/80">{project.client_owner_email}</span></>
              ) : null}
              <> · Last updated: {new Date(project.last_activity_at).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}</>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-6 flex-wrap">
          <Metric label="Signals" value={project.open_decisions.toString()} hint="All sources" tone="blue" />
          <Metric label="Health Score" value={`${project.health_score}`} hint="Out of 100" tone="amber" />
          <Metric label="Progress" value={`${project.progress_pct}%`} hint="Complete" tone="green" />
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
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink/50">
          {label}
        </div>
        <div className="text-lg font-display text-ink leading-none">{value}</div>
        <div className="text-[10px] text-ink/50 mt-0.5">{hint}</div>
      </div>
    </div>
  );
}

export function WorkspaceToolbar({ projectId }: { projectId: string }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const baseCls =
    "inline-flex items-center gap-1.5 text-xs border rounded-md px-2.5 py-1.5 transition-colors";
  const linkFor = (suffix: string) => {
    const active = pathname.endsWith(`/${suffix}`) || pathname.includes(`/${suffix}/`);
    return cn(
      baseCls,
      active
        ? "border-royal bg-royal/10 text-ink font-medium"
        : "border-border text-ink hover:border-royal/50",
    );
  };
  return (
    <div className="flex items-center justify-end gap-2 flex-wrap" data-qa-role="workspace-toolbar">
      <Link
        to="/engine/projects/$projectId/spine"
        params={{ projectId }}
        className={linkFor("spine")}
        activeProps={{ "data-status": "active" } as unknown as Record<string, string>}
        data-qa-nav="spine"
      >
        <Network className="w-3.5 h-3.5" /> Project Spine
      </Link>
      <Link
        to="/engine/projects/$projectId/chat"
        params={{ projectId }}
        className={linkFor("chat")}
        activeProps={{ "data-status": "active" } as unknown as Record<string, string>}
        data-qa-nav="chat"
      >
        <MessageCircle className="w-3.5 h-3.5" /> Project Chat
      </Link>
      <Link
        to="/engine/projects/$projectId/frame-builder"
        params={{ projectId }}
        className={linkFor("frame-builder")}
        activeProps={{ "data-status": "active" } as unknown as Record<string, string>}
        data-qa-nav="frame-builder"
      >
        <Layers className="w-3.5 h-3.5" /> Frame Builder
      </Link>
      <Link
        to="/engine/projects/$projectId/mockup-builder"
        params={{ projectId }}
        className={linkFor("mockup-builder")}
        activeProps={{ "data-status": "active" } as unknown as Record<string, string>}
        data-qa-nav="mockup-builder"
      >
        <Layers className="w-3.5 h-3.5" /> Mockup Builder
      </Link>
      <Link
        to="/engine/projects/$projectId/backend-builder"
        params={{ projectId }}
        className={linkFor("backend-builder")}
        activeProps={{ "data-status": "active" } as unknown as Record<string, string>}
        data-qa-nav="backend-builder"
      >
        <Database className="w-3.5 h-3.5" /> Backend Builder
      </Link>
      <Link
        to="/engine/projects/$projectId/qa-factory"
        params={{ projectId }}
        className={linkFor("qa-factory")}
        activeProps={{ "data-status": "active" } as unknown as Record<string, string>}
        data-qa-nav="qa-factory"
      >
        <ClipboardCheck className="w-3.5 h-3.5" /> QA Factory
      </Link>
      <Link
        to="/engine/projects/$projectId/implementation-plan"
        params={{ projectId }}
        className={linkFor("implementation-plan")}
        activeProps={{ "data-status": "active" } as unknown as Record<string, string>}
        data-qa-nav="implementation-plan"
      >
        <Wrench className="w-3.5 h-3.5" /> Implementation Plan
      </Link>
      <Link
        to="/engine/projects/$projectId/build-execution"
        params={{ projectId }}
        className={linkFor("build-execution")}
        activeProps={{ "data-status": "active" } as unknown as Record<string, string>}
        data-qa-nav="build-execution"
      >
        <Package className="w-3.5 h-3.5" /> Build Execution
      </Link>
      <Link to="/engine/projects/$projectId/intelligence-layer" params={{ projectId }} className={linkFor("intelligence-layer")}>
        <Sparkles className="w-3.5 h-3.5" /> Intelligence
      </Link>
      <Link to="/engine/projects/$projectId/agent" params={{ projectId }} className={linkFor("agent")}>
        <Bot className="w-3.5 h-3.5" /> Agent
      </Link>
      <Link to="/engine/projects/$projectId/agent/tasks" params={{ projectId }} className={linkFor("agent/tasks")}>
        <ListChecks className="w-3.5 h-3.5" /> Tasks
      </Link>
      <Link to="/engine/projects/$projectId/agent/costs" params={{ projectId }} className={linkFor("agent/costs")}>
        <DollarSign className="w-3.5 h-3.5" /> Costs
      </Link>
      <Link to="/engine/projects/$projectId/versions/compare" params={{ projectId }} className={linkFor("versions/compare")}>
        <GitCompare className="w-3.5 h-3.5" /> Compare
      </Link>
      <Link to="/engine/projects/$projectId/agent/permissions" params={{ projectId }} className={linkFor("agent/permissions")}>
        <ShieldCheck className="w-3.5 h-3.5" /> Permissions
      </Link>
      <Link to="/engine/projects/$projectId/intake" params={{ projectId }} className={linkFor("intake")}>
        <ClipboardList className="w-3.5 h-3.5" /> Intake Review
      </Link>
      <Link
        to="/engine/projects/$projectId/signal-room"
        params={{ projectId }}
        className="inline-flex items-center gap-1.5 text-xs bg-ink text-white rounded-md px-3 py-1.5 hover:bg-ink/90"
      >
        <PlusCircle className="w-3.5 h-3.5" /> Add Signal
      </Link>
    </div>
  );
}

