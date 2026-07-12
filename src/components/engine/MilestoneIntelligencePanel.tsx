/* eslint-disable @typescript-eslint/no-explicit-any */
// Phase 5B — Milestone Intelligence Panel
//
// Inline panel that answers WHY / WHERE / WHAT RISKS / DEPENDENCIES
// for any milestone. Mount beside any milestone list or detail row.

import { useQuery } from "@tanstack/react-query";
import { getMilestoneIntelligence } from "@/lib/engine-milestone-intelligence.functions";
import type { MilestoneRiskLevel, MilestoneIntelligenceCard } from "@/lib/engine-milestone-intelligence.functions";
import { ChevronDown, ChevronUp, ShieldAlert, Link2, FileSearch, GitBranch, Loader2, AlertTriangle } from "lucide-react";
import { useState } from "react";

const RISK_COLOR: Record<MilestoneRiskLevel, string> = {
  critical: "text-red-400 bg-red-500/10 border-red-500/20",
  high:     "text-orange-400 bg-orange-500/10 border-orange-500/20",
  medium:   "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
  low:      "text-blue-400 bg-blue-500/10 border-blue-500/20",
  none:     "text-white/30 bg-white/5 border-white/10",
};

const RISK_ICON_COLOR: Record<MilestoneRiskLevel, string> = {
  critical: "text-red-400",
  high:     "text-orange-400",
  medium:   "text-yellow-400",
  low:      "text-blue-400",
  none:     "text-white/20",
};

const ALIGNMENT_COLOR = {
  direct:   "text-emerald-400",
  indirect: "text-yellow-400",
  unclear:  "text-red-400",
};

const SCORE_COLOR = (score: number) =>
  score >= 70 ? "text-emerald-400" :
  score >= 40 ? "text-yellow-400" :
  "text-red-400";

function Section({ title, icon: Icon, children }: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5 text-white/40" />
        <span className="text-[10px] uppercase tracking-widest text-white/40 font-medium">{title}</span>
      </div>
      {children}
    </div>
  );
}

function IntelligenceContent({ card }: { card: MilestoneIntelligenceCard }) {
  return (
    <div className="space-y-4 pt-3">
      {/* Score bar */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-1 rounded-full bg-white/10">
          <div
            className="h-1 rounded-full bg-amber-400 transition-all"
            style={{ width: `${card.completenessScore}%` }}
          />
        </div>
        <span className={`text-xs font-bold ${SCORE_COLOR(card.completenessScore)}`}>
          {card.completenessScore}%
        </span>
        <span className="text-xs text-white/30">intelligence</span>
      </div>

      {/* WHY */}
      <Section title="Why this milestone" icon={GitBranch}>
        <p className="text-xs text-white/60 leading-relaxed">{card.reasoning}</p>
        {card.businessJustification && (
          <p className="text-xs text-amber-300/70 leading-relaxed mt-1 italic">{card.businessJustification}</p>
        )}
      </Section>

      {/* Spine alignment */}
      <Section title="Spine alignment" icon={Link2}>
        <div className="flex items-start gap-2">
          <span className={`text-xs font-medium capitalize ${ALIGNMENT_COLOR[card.spineAlignment]}`}>
            {card.spineAlignment}
          </span>
          <span className="text-xs text-white/40 leading-relaxed">— {card.spineAlignmentNote}</span>
        </div>
        {card.spinePointB && (
          <p className="text-xs text-white/30 leading-relaxed mt-1 line-clamp-2">
            Point B: {card.spinePointB}
          </p>
        )}
      </Section>

      {/* Evidence */}
      <Section title="Evidence sources" icon={FileSearch}>
        {card.evidenceSources.length === 0 ? (
          <p className="text-xs text-red-400/70">No evidence sources linked to this milestone.</p>
        ) : (
          <div className="space-y-1.5">
            {card.evidenceSources.slice(0, 4).map((src, i) => (
              <div key={i} className="flex items-start gap-2">
                <div className="w-1 h-1 rounded-full bg-white/20 mt-1.5 shrink-0" />
                <div className="min-w-0">
                  {src.sourceName && (
                    <span className="text-xs text-white/60 font-medium">{src.sourceName}</span>
                  )}
                  {src.snippet && (
                    <p className="text-xs text-white/30 truncate mt-0.5">{src.snippet.slice(0, 80)}</p>
                  )}
                  {src.confidence !== null && (
                    <span className="text-[10px] text-white/20">{src.confidence}% confidence</span>
                  )}
                </div>
              </div>
            ))}
            {card.evidenceCount > 4 && (
              <p className="text-xs text-white/30">+{card.evidenceCount - 4} more</p>
            )}
          </div>
        )}
      </Section>

      {/* Risks */}
      <Section title="Risk signals" icon={ShieldAlert}>
        {card.risks.length === 0 ? (
          <p className="text-xs text-emerald-400/70">No risk signals detected.</p>
        ) : (
          <div className="space-y-1.5">
            {card.risks.map((r, i) => (
              <div
                key={i}
                className={`rounded px-2 py-1.5 border text-xs leading-relaxed ${RISK_COLOR[r.level]}`}
              >
                {r.description}
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Dependencies (only if any) */}
      {card.dependencies.length > 0 && (
        <Section title="Dependencies" icon={AlertTriangle}>
          <div className="space-y-1">
            {card.dependencies.slice(0, 6).map((dep) => (
              <div key={dep.milestoneId} className="flex items-center gap-2 text-xs text-white/50">
                <span className={`shrink-0 font-medium ${
                  dep.kind === "blocked_by" ? "text-orange-400" :
                  dep.kind === "blocks" ? "text-blue-400" : "text-white/30"
                }`}>
                  {dep.kind === "blocked_by" ? "← blocked by" :
                   dep.kind === "blocks" ? "blocks →" : "related:"}
                </span>
                <span className="truncate">{dep.milestoneName}</span>
                {dep.status && (
                  <span className="text-white/20 capitalize shrink-0">[{dep.status}]</span>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

interface MilestoneIntelligencePanelProps {
  projectId: string;
  milestoneId: string;
  milestoneName: string;
  /** If true, starts expanded. Default: false (collapsed). */
  defaultOpen?: boolean;
  /** Compact mode for use in narrow list rows */
  compact?: boolean;
}

export function MilestoneIntelligencePanel({
  projectId,
  milestoneId,
  milestoneName,
  defaultOpen = false,
  compact = false,
}: MilestoneIntelligencePanelProps) {
  const [open, setOpen] = useState(defaultOpen);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["milestone-intelligence", projectId, milestoneId],
    queryFn: () => getMilestoneIntelligence({ data: { projectId, milestoneId } }),
    enabled: open,
    staleTime: 5 * 60 * 1000, // 5 min
    refetchOnWindowFocus: false,
  });

  const worstRisk = data?.worstRiskLevel ?? "none";
  const score = data?.completenessScore ?? null;

  return (
    <div className={`rounded-lg border border-white/10 ${compact ? "bg-white/3" : "bg-white/5"}`}>
      {/* Toggle row */}
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left hover:bg-white/5 rounded-lg transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              worstRisk === "critical" ? "bg-red-500" :
              worstRisk === "high"     ? "bg-orange-500" :
              worstRisk === "medium"   ? "bg-yellow-500" :
              worstRisk === "low"      ? "bg-blue-400" :
              "bg-white/20"
            }`}
          />
          <span className="text-xs text-white/70 truncate">{milestoneName}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {score !== null && (
            <span className={`text-xs font-medium ${SCORE_COLOR(score)}`}>{score}%</span>
          )}
          {open ? (
            <ChevronUp className="w-3.5 h-3.5 text-white/30" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-white/30" />
          )}
        </div>
      </button>

      {/* Content */}
      {open && (
        <div className="px-3 pb-3">
          {isLoading && (
            <div className="flex items-center gap-2 py-4 text-white/40">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-xs">Loading intelligence...</span>
            </div>
          )}
          {isError && (
            <p className="text-xs text-red-400/70 py-2">Failed to load milestone intelligence.</p>
          )}
          {data && <IntelligenceContent card={data} />}
        </div>
      )}
    </div>
  );
}
