import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getProjectSpine } from "@/lib/engine.functions";
import { cn } from "@/lib/utils";
import {
  FileText, Phone, Mail, Globe, File,
  CheckCircle2, Circle, Zap, ArrowLeft, ExternalLink,
} from "lucide-react";

export const Route = createFileRoute("/engine/projects/$projectId/evidence")({
  component: EvidenceAndQA,
});

const SOURCE_TYPE_ICON: Record<string, typeof File> = {
  document: FileText,
  call: Phone,
  email: Mail,
  url: Globe,
};

const STATUS_BADGE: Record<string, { label: string; color: string }> = {
  processed: { label: "Processed", color: "bg-green-100 text-green-800" },
  pending:   { label: "Pending",   color: "bg-amber-100 text-amber-800" },
  failed:    { label: "Failed",    color: "bg-red-100 text-red-800" },
};

const FILTER_TABS = ["All", "Documents", "Calls", "Emails", "URLs", "Other"] as const;
type FilterTab = (typeof FILTER_TABS)[number];

const TYPE_MAP: Record<FilterTab, string[]> = {
  All: [],
  Documents: ["document"],
  Calls: ["call"],
  Emails: ["email"],
  URLs: ["url"],
  Other: [],
};

function EvidenceAndQA() {
  const { projectId } = Route.useParams();
  const [activeFilter, setActiveFilter] = useState<FilterTab>("All");

  const spineFn = useServerFn(getProjectSpine);
  const spineQ = useQuery({
    queryKey: ["engine", "spine", projectId],
    queryFn: () => spineFn({ data: { id: projectId } }),
    staleTime: 30_000,
  });

  const spine = spineQ.data;
  const sources = spine?.sources ?? [];
  const reviews = spine?.reviews ?? [];
  const milestones = spine?.milestones ?? [];
  const project = spine?.project;

  const filteredSources = activeFilter === "All"
    ? sources
    : activeFilter === "Other"
      ? sources.filter((s) => !["document","call","email","url"].includes(s.source_type ?? ""))
      : sources.filter((s) => TYPE_MAP[activeFilter].includes(s.source_type ?? ""));

  // QA checklist heuristics
  const qaItems = [
    {
      label: "Sources uploaded",
      complete: sources.length > 0,
    },
    {
      label: "Intelligence extracted",
      complete: sources.some((s) => s.status === "processed"),
    },
    {
      label: "Point A documented",
      complete: !!(project as any)?.point_a,
    },
    {
      label: "Point B / Goal defined",
      complete: !!(project as any)?.goal || !!(project as any)?.point_b,
    },
    {
      label: "Roadmap built",
      complete: milestones.length > 0,
    },
    {
      label: "Milestones approved",
      complete: milestones.some((m) => (m as any).approval_status === "approved"),
    },
    {
      label: "Pending reviews cleared",
      complete: reviews.filter((r) => r.status === "pending").length === 0,
    },
    {
      label: "Client portal ready",
      complete: (spine?.portal_publish as any)?.status === "published",
    },
  ];

  const completedCount = qaItems.filter((i) => i.complete).length;
  const circumference = 251.2;
  const progress = (completedCount / 8) * circumference;
  const firstIncomplete = qaItems.find((i) => !i.complete);

  if (spineQ.isLoading) {
    return (
      <div className="flex items-center justify-center py-32 text-[#667085]">
        Loading evidence...
      </div>
    );
  }

  if (spineQ.isError) {
    return (
      <div className="flex items-center justify-center py-32 text-red-500">
        Failed to load project data.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FBF9F4]">
      {/* Header */}
      <div className="border-b border-[#E8E1D6] bg-white px-8 py-6">
        <Link
          to="/engine/projects/$projectId/overview"
          params={{ projectId }}
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-[#667085] hover:text-[#0A0F1F]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Overview
        </Link>
        <h1 className="font-display text-3xl text-[#0A0F1F]">Evidence &amp; QA</h1>
        <p className="mt-1 text-sm text-[#667085]">
          Source documents, extracted intelligence, and quality assurance status.
        </p>
      </div>

      {/* Body */}
      <div className="grid gap-8 px-8 py-8 lg:grid-cols-5">
        {/* LEFT: Evidence Library */}
        <div className="lg:col-span-3">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[#0A0F1F]">
              Evidence Library
              <span className="ml-2 text-sm font-normal text-[#667085]">{sources.length} sources</span>
            </h2>
          </div>

          {/* Filter tabs */}
          <div className="mb-4 flex flex-wrap gap-2">
            {FILTER_TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveFilter(tab)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  activeFilter === tab
                    ? "bg-[#0A0F1F] text-white"
                    : "bg-white border border-[#E8E1D6] text-[#667085] hover:border-[#3E68B2] hover:text-[#3E68B2]",
                )}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Source cards */}
          {filteredSources.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#E8E1D6] bg-white p-12 text-center text-[#667085]">
              {sources.length === 0
                ? "No sources yet. Add source documents to begin intelligence extraction."
                : "No sources match this filter."}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredSources.map((source) => {
                const Icon = SOURCE_TYPE_ICON[(source as any).source_type] ?? File;
                const badge = STATUS_BADGE[(source as any).status] ?? { label: (source as any).status ?? "Unknown", color: "bg-gray-100 text-gray-700" };
                return (
                  <div
                    key={source.id}
                    className="rounded-xl border border-[#E8E1D6] bg-white p-4 transition-colors hover:border-[#3E68B2]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#F6F9FC] text-[#3E68B2]">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-[#0A0F1F] truncate">{(source as any).name ?? "Untitled source"}</div>
                          <div className="text-xs text-[#667085] capitalize">{(source as any).source_type ?? "document"}</div>
                          {(source as any).notes && (
                            <div className="mt-1 text-xs italic text-[#667085] line-clamp-2">{(source as any).notes}</div>
                          )}
                          {(source as any).url && (
                            <a
                              href={(source as any).url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-1 inline-flex items-center gap-1 text-xs text-[#3E68B2] hover:underline"
                            >
                              <ExternalLink className="h-3 w-3" />
                              View source
                            </a>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 flex flex-col items-end gap-1">
                        <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", badge.color)}>
                          {badge.label}
                        </span>
                        {(source as any).created_at && (
                          <span className="text-xs text-[#667085]">
                            {new Date((source as any).created_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* RIGHT: QA Status */}
        <div className="lg:col-span-2 space-y-6">
          <div>
            <h2 className="mb-4 text-lg font-semibold text-[#0A0F1F]">QA Checklist</h2>

            {/* Donut */}
            <div className="mb-6 flex justify-center">
              <div className="relative">
                <svg width="120" height="120" viewBox="0 0 100 100">
                  <circle
                    cx="50" cy="50" r="40"
                    fill="none"
                    stroke="#E8E1D6"
                    strokeWidth="8"
                  />
                  <circle
                    cx="50" cy="50" r="40"
                    fill="none"
                    stroke="#1f6b3b"
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={`${progress} ${circumference}`}
                    strokeDashoffset={circumference * 0.25}
                    style={{ transform: "rotate(-90deg)", transformOrigin: "50% 50%" }}
                  />
                  <text x="50" y="46" textAnchor="middle" className="font-display" style={{ fontSize: "18px", fill: "#0A0F1F", fontWeight: 600 }}>
                    {completedCount}/8
                  </text>
                  <text x="50" y="60" textAnchor="middle" style={{ fontSize: "8px", fill: "#667085" }}>
                    Ready
                  </text>
                </svg>
              </div>
            </div>

            {/* Checklist items */}
            <div className="space-y-2">
              {qaItems.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between rounded-lg border border-[#E8E1D6] bg-white px-4 py-2.5"
                >
                  <div className="flex items-center gap-2.5">
                    {item.complete ? (
                      <CheckCircle2 className="h-4 w-4 text-[#1f6b3b]" />
                    ) : (
                      <Circle className="h-4 w-4 text-[#E8E1D6]" />
                    )}
                    <span className={cn("text-sm", item.complete ? "text-[#0A0F1F]" : "text-[#667085]")}>
                      {item.label}
                    </span>
                  </div>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-medium",
                      item.complete
                        ? "bg-green-100 text-green-800"
                        : "bg-[#F6F9FC] text-[#667085]",
                    )}
                  >
                    {item.complete ? "Complete" : "Incomplete"}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Captain QA note */}
          {firstIncomplete && (
            <div className="rounded-lg border border-[#D4A843] bg-[#FBF9F4] p-3">
              <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#D4A843]">
                <Zap className="h-3.5 w-3.5" />
                Next QA action
              </div>
              <div className="text-sm text-[#0A0F1F]">{firstIncomplete.label}</div>
            </div>
          )}

          {completedCount === 8 && (
            <div className="rounded-lg border border-[#1f6b3b] bg-green-50 p-3 text-center">
              <div className="text-sm font-medium text-[#1f6b3b]">All QA checks passed</div>
              <div className="text-xs text-[#667085] mt-0.5">This project is ready for delivery.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
