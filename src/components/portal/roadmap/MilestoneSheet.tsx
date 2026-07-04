import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Calendar,
  MessageSquare,
  ExternalLink,
  CheckCircle2,
  Loader2,
  Download,
  Eye,
  Lightbulb,
  Unlock,
  Flag,
  ListChecks,
  GitBranch,
  CircleDot,
  FileText,
  CalendarClock,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type {
  MilestoneKind,
  RoadmapMilestone,
} from "@/lib/portal-roadmap-model";
import { recordPortalMilestoneReview } from "@/lib/portal.functions";
import { toast } from "sonner";
import { ClarificationModal } from "./ClarificationModal";
import { BookCallModal } from "./BookCallModal";
import { useRoadmapCanvas } from "./canvas-context";
import { useIsMobile } from "@/hooks/use-mobile";

type Props = {
  milestone: RoadmapMilestone | null;
  roadmapId?: string;
  projectId?: string;
  authorEmail?: string | null;
  schedulingUrl?: string | null;
  onClose: () => void;
  /** Ordered slugs in journey sequence, filtered by the active view mode.
   *  Powers prev/next navigation and keyboard arrows. */
  sequence?: string[];
  /** Select another milestone (keeps drawer open, updates URL/map). */
  onSelect?: (slug: string) => void;
};

const STATUS_LABEL: Record<RoadmapMilestone["status"], string> = {
  completed: "Completed",
  in_progress: "In progress",
  upcoming: "Upcoming",
  blocked: "Blocked",
  optional: "Optional",
};

const STATUS_TONE: Record<RoadmapMilestone["status"], string> = {
  completed: "bg-emerald-100 text-emerald-800 border-emerald-200",
  in_progress: "bg-royal/15 text-royal border-royal/30",
  upcoming: "bg-ink/5 text-ink/70 border-ink/15",
  blocked: "bg-[#a4283c]/10 text-[#a4283c] border-[#a4283c]/30",
  optional: "bg-ink/5 text-ink/60 border-dashed border-ink/25",
};

const KIND_LABEL: Record<MilestoneKind, string> = {
  milestone: "Milestone",
  decision: "Decision",
  deliverable: "Deliverable",
  meeting: "Meeting",
};

const KIND_ICON: Record<MilestoneKind, typeof CircleDot> = {
  milestone: CircleDot,
  decision: GitBranch,
  deliverable: FileText,
  meeting: CalendarClock,
};

const KIND_ACCENT: Record<MilestoneKind, string> = {
  milestone: "bg-royal/15 text-royal border-royal/30",
  decision: "bg-[#8b5cf6]/15 text-[#7c3aed] border-[#8b5cf6]/30",
  deliverable: "bg-[#f59e0b]/15 text-[#b45309] border-[#f59e0b]/30",
  meeting: "bg-[#0ea5a4]/15 text-[#0f766e] border-[#0ea5a4]/30",
};

const KIND_HEX: Record<MilestoneKind, string> = {

  milestone: "#2F7DFF",
  decision: "#8B5CF6",
  deliverable: "#F59D2A",
  meeting: "#0EA5A4",
};


function fmtDate(d?: string) {
  if (!d) return null;
  try {
    return new Date(d).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return d;
  }
}
function fmtDateTime(d?: string) {
  if (!d) return null;
  try {
    return new Date(d).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return d;
  }
}

export function MilestoneSheet({
  milestone,
  roadmapId,
  projectId,
  authorEmail,
  schedulingUrl,
  onClose,
  sequence,
  onSelect,
}: Props) {
  const open = !!milestone;
  const recordReview = useServerFn(recordPortalMilestoneReview);
  const [reviewedSlugs, setReviewedSlugs] = useState<Set<string>>(new Set());
  const [ackOpen, setAckOpen] = useState(false);
  const [clarifyOpen, setClarifyOpen] = useState(false);
  const [bookOpen, setBookOpen] = useState(false);
  const [secondaryOpen, setSecondaryOpen] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const canvas = useRoadmapCanvas();
  const isMobile = useIsMobile();
  const openedSlugRef = useRef<string | null>(null);

  const { prevSlug, nextSlug } = useMemo(() => {
    if (!milestone || !sequence || sequence.length === 0)
      return { prevSlug: null as string | null, nextSlug: null as string | null };
    const i = sequence.indexOf(milestone.slug);
    if (i < 0) return { prevSlug: null, nextSlug: null };
    return {
      prevSlug: i > 0 ? sequence[i - 1] : null,
      nextSlug: i < sequence.length - 1 ? sequence[i + 1] : null,
    };
  }, [milestone, sequence]);

  const canNavigate = !!onSelect && !!sequence && sequence.length > 1;
  const goPrev = () => {
    if (prevSlug && onSelect) onSelect(prevSlug);
  };
  const goNext = () => {
    if (nextSlug && onSelect) onSelect(nextSlug);
  };

  const reviewMut = useMutation({
    mutationFn: (m: RoadmapMilestone) =>
      recordReview({
        data: {
          roadmapId: roadmapId!,
          milestoneSlug: m.slug,
          milestoneTitle: m.title,
        },
      }),
    onSuccess: (_res, m) => {
      setReviewedSlugs((prev) => {
        const next = new Set(prev);
        next.add(m.slug);
        return next;
      });
      setAckOpen(false);
      toast.success("Acknowledged. Tai will see the update.");
    },
    onError: () => {
      toast.error("Could not record acknowledgement. Please try again.");
    },
  });

  useEffect(() => {
    if (open) {
      openedSlugRef.current = milestone?.slug ?? null;
      const t = setTimeout(() => titleRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open, milestone?.slug]);

  // Publish the drawer's horizontal footprint so the canvas can pan the
  // selected marker out from behind it — and re-pan on viewport resize.
  useEffect(() => {
    if (!open || isMobile) {
      canvas.setDrawerOffset(0);
      return;
    }
    const measure = () => {
      const w = Math.min(480, Math.max(360, Math.round(window.innerWidth * 0.34)));
      canvas.setDrawerOffset(w);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("resize", measure);
      canvas.setDrawerOffset(0);
    };
  }, [open, isMobile, canvas]);

  // Keyboard: arrow left/right for prev/next, handled globally when drawer is
  // open and focus isn't in an input/textarea.
  useEffect(() => {
    if (!open || !canNavigate) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, canNavigate, prevSlug, nextSlug]);

  const handleClose = () => {
    const slug = openedSlugRef.current;
    onClose();
    if (slug) {
      setTimeout(() => canvas.focusNode(slug), 60);
    }
  };

  const isReviewed = milestone ? reviewedSlugs.has(milestone.slug) : false;
  const kind: MilestoneKind = milestone?.kind ?? "milestone";

  return (
    <>
      <Sheet
        open={open}
        modal={isMobile}
        onOpenChange={(o) => {
          if (!o) handleClose();
        }}
      >
        <SheetContent
          side={isMobile ? "bottom" : "right"}
          hideOverlay={!isMobile}
          overlayClassName={isMobile ? undefined : "bg-transparent"}
          onInteractOutside={(e) => {
            if (isMobile) return; // mobile: default modal behavior closes
            const t = e.target as HTMLElement | null;
            // Clicks on the canvas, mini-map, phase labels or explicit
            // "roadmap-interactive" surfaces should NOT close the drawer.
            if (
              t &&
              (t.closest("#portal-canvas-scroll") ||
                t.closest("[data-testid='roadmap-overview-strip']") ||
                t.closest("[data-phase-key]") ||
                t.closest("[data-roadmap-interactive]"))
            ) {
              e.preventDefault();
            }
          }}
          onPointerDownOutside={(e) => {
            if (isMobile) return;
            const t = e.target as HTMLElement | null;
            if (
              t &&
              (t.closest("#portal-canvas-scroll") ||
                t.closest("[data-testid='roadmap-overview-strip']") ||
                t.closest("[data-phase-key]") ||
                t.closest("[data-roadmap-interactive]"))
            ) {
              e.preventDefault();
            }
          }}
          className={
            isMobile
              ? "h-[100dvh] w-full max-w-none sm:max-w-none bg-[#FAF8F5] text-ink border-t border-border overflow-y-auto p-0"
              : "w-full sm:max-w-[480px] bg-[#F7F3EC] text-ink border-l border-ink/10 rounded-l-2xl shadow-[0_40px_100px_-30px_rgba(11,18,32,0.45)] p-0 flex flex-col"
          }
          aria-labelledby="milestone-sheet-title"
          aria-describedby="milestone-sheet-desc"
        >
          {milestone && (() => {
            const KindIcon = KIND_ICON[kind];
            const isDeadline = kind === "milestone" && !!milestone.dueDate;
            const displayKindLabel = isDeadline ? "Deadline" : KIND_LABEL[kind];
            void KIND_ACCENT; // retained for future kind chips; header uses accentHex directly.

            const phaseName =
              milestone.phase === "now"
                ? "Foundation"
                : milestone.phase === "next"
                  ? "Core Platform Build"
                  : milestone.phase === "later"
                    ? "Scale Systems"
                    : String(milestone.phase);
            const phaseNumber =
              milestone.phase === "now"
                ? 1
                : milestone.phase === "next"
                  ? 2
                  : milestone.phase === "later"
                    ? 3
                    : null;
            const primaryCta =
              kind === "decision"
                ? { label: "Respond", onClick: () => setClarifyOpen(true) }
                : kind === "deliverable"
                  ? milestone.fileUrl
                    ? {
                        label: "Open",
                        href: milestone.fileUrl,
                        download: false,
                      }
                    : null
                  : {
                      label: isReviewed ? "Acknowledged" : "Acknowledge",
                      onClick: () => setAckOpen(true),
                      disabled: !roadmapId || isReviewed || reviewMut.isPending,
                    };
            const dueLabel = milestone.dueDate
              ? `Due ${fmtDate(milestone.dueDate)}`
              : milestone.targetDate
                ? `Target ${fmtDate(milestone.targetDate)}`
                : null;

            const hasSecondary =
              (milestone.unlocks && milestone.unlocks.length > 0) ||
              (milestone.actions && milestone.actions.length > 0) ||
              (milestone.dependencies && milestone.dependencies.length > 0);

            const accentHex = isDeadline ? "#E11D48" : KIND_HEX[kind];
            const positionIdx =
              sequence && milestone
                ? Math.max(0, sequence.indexOf(milestone.slug)) + 1
                : null;
            const positionTotal = sequence?.length ?? null;


            return (
              <>
                {/* ================= EDITORIAL HEADER ================= */}
                <SheetHeader
                  className="relative text-left space-y-0 px-8 pt-8 pb-6 border-b border-ink/10 bg-transparent"
                >
                  {/* Vertical accent bar */}
                  <span
                    aria-hidden
                    className="absolute left-0 top-8 bottom-6 w-[3px] rounded-r-full"
                    style={{
                      background: `linear-gradient(180deg, ${accentHex} 0%, ${accentHex}55 100%)`,
                      boxShadow: `0 0 12px ${accentHex}55`,
                    }}
                  />

                  {/* Position numeral, top-right */}
                  {positionIdx && positionTotal && positionTotal > 1 && (
                    <div className="absolute top-8 right-8 text-right font-mono">
                      <div className="text-[10px] uppercase tracking-[0.32em] text-ink/35 leading-none">
                        Milestone
                      </div>
                      <div className="mt-1 text-[13px] tracking-[0.14em] text-ink/70 tabular-nums">
                        {String(positionIdx).padStart(2, "0")}
                        <span className="text-ink/25 mx-1">/</span>
                        {String(positionTotal).padStart(2, "0")}
                      </div>
                    </div>
                  )}

                  {/* Kicker — single elegant line, no boxes */}
                  <div className="font-mono text-[10.5px] uppercase tracking-[0.32em] text-ink/50 flex items-center gap-2 pr-24">
                    <KindIcon className="w-3 h-3" style={{ color: accentHex }} />
                    <span style={{ color: accentHex }}>{displayKindLabel}</span>
                    <span className="text-ink/20">—</span>
                    <span className="truncate">
                      {phaseNumber != null
                        ? `Phase ${String(phaseNumber).padStart(2, "0")} · ${phaseName}`
                        : phaseName}
                    </span>
                  </div>

                  {/* Title — bigger, tighter, editorial */}
                  <SheetTitle
                    id="milestone-sheet-title"
                    ref={titleRef}
                    tabIndex={-1}
                    className="font-display text-[32px] leading-[1.08] tracking-[-0.01em] text-ink focus:outline-none pt-4"
                    style={{ fontFeatureSettings: '"ss01", "kern"' }}
                  >
                    {milestone.title}
                  </SheetTitle>

                  {/* Hairline separator */}
                  <div aria-hidden className="pt-4">
                    <div className="h-px w-10 bg-ink/25" />
                  </div>

                  {/* Summary in serif italic */}
                  {milestone.summary && (
                    <SheetDescription
                      id="milestone-sheet-desc"
                      className="font-display italic text-[16px] leading-[1.55] text-ink/70 pt-3"
                    >
                      {milestone.summary}
                    </SheetDescription>
                  )}

                  {/* Meta row — status pill + due */}
                  <div className="flex items-center gap-3 pt-4 pr-24">
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${STATUS_TONE[milestone.status]}`}
                    >
                      {STATUS_LABEL[milestone.status]}
                    </span>
                    {dueLabel && (
                      <span className="font-mono text-[10.5px] uppercase tracking-[0.24em] text-ink/50 flex items-center gap-1.5">
                        <Calendar className="w-3 h-3" />
                        {dueLabel}
                      </span>
                    )}
                  </div>
                </SheetHeader>

                {/* Scrollable body — generous spacing, keyed for fade-slide */}
                <div
                  key={milestone.slug}
                  className="flex-1 overflow-y-auto px-8 py-7 space-y-7 animate-in fade-in slide-in-from-right-2 duration-300"
                >

                  {kind === "decision" && (
                    <DecisionBody milestone={milestone} />
                  )}
                  {kind === "deliverable" && (
                    <DeliverableBody milestone={milestone} />
                  )}
                  {kind === "meeting" && <MeetingBody milestone={milestone} />}

                  {/* Primary detail */}
                  {milestone.detail && milestone.detail !== milestone.summary && (
                    <Section label="Why it matters" icon={Lightbulb}>
                      <p>{milestone.detail}</p>
                    </Section>
                  )}
                  {milestone.successLooksLike && (
                    <Section label="What success looks like" icon={CheckCircle2}>
                      <p>{milestone.successLooksLike}</p>
                    </Section>
                  )}

                  {/* Secondary details */}
                  {hasSecondary && (
                    <Collapsible open={secondaryOpen} onOpenChange={setSecondaryOpen}>
                      <CollapsibleTrigger asChild>
                        <button
                          type="button"
                          className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-[0.24em] text-ink/45 hover:text-ink/70 transition-colors py-1"
                        >
                          <ChevronDown
                            className={`w-3.5 h-3.5 transition-transform duration-200 ${secondaryOpen ? "rotate-180" : ""}`}
                          />
                          {secondaryOpen ? "Hide details" : "More details"}
                        </button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="space-y-6 pt-4">
                        {milestone.unlocks && milestone.unlocks.length > 0 && (
                          <Section label="What it unlocks" icon={Unlock}>
                            <ul className="list-disc pl-5 space-y-1.5">
                              {milestone.unlocks.map((u, i) => (
                                <li key={i}>{u}</li>
                              ))}
                            </ul>
                          </Section>
                        )}
                        {milestone.actions && milestone.actions.length > 0 && (
                          <Section label="Key actions" icon={ListChecks}>
                            <ul className="list-disc pl-5 space-y-1.5">
                              {milestone.actions.map((a, i) => (
                                <li key={i}>{a}</li>
                              ))}
                            </ul>
                          </Section>
                        )}
                        {milestone.dependencies &&
                          milestone.dependencies.length > 0 && (
                            <Section label="Dependencies" icon={GitBranch}>
                              <ul className="list-disc pl-5 space-y-1.5">
                                {milestone.dependencies.map((d, i) => (
                                  <li key={i}>{d}</li>
                                ))}
                              </ul>
                            </Section>
                          )}
                      </CollapsibleContent>
                    </Collapsible>
                  )}

                  {milestone.clientActionNeeded && (
                    <div
                      className="relative rounded-lg border px-4 py-3.5 overflow-hidden"
                      style={{
                        borderColor: `${accentHex}40`,
                        background: `linear-gradient(180deg, ${accentHex}0f 0%, ${accentHex}04 100%)`,
                      }}
                    >
                      <div
                        aria-hidden
                        className="absolute left-0 top-0 bottom-0 w-[2px]"
                        style={{ background: accentHex }}
                      />
                      <div
                        className="font-mono text-[10px] uppercase tracking-[0.28em] mb-1.5 flex items-center gap-1.5"
                        style={{ color: accentHex }}
                      >
                        <CheckCircle2 className="w-3 h-3" /> Client action needed
                      </div>
                      <p className="text-[14px] leading-[1.6] text-ink/90">
                        {milestone.clientActionNeeded}
                      </p>
                    </div>
                  )}
                  {milestone.latestUpdate && (
                    <Section label="Latest update" icon={CircleDot}>
                      <p>{milestone.latestUpdate}</p>
                    </Section>
                  )}
                  {milestone.ownerNote && (
                    <div className="relative border-l-2 border-ink/20 pl-4 py-1">
                      <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-ink/45 mb-1.5 flex items-center gap-1.5">
                        <MessageSquare className="w-3 h-3" /> Notes from Tai
                      </div>
                      <p className="font-display italic text-[15px] leading-[1.6] text-ink/80">
                        &ldquo;{milestone.ownerNote}&rdquo;
                      </p>
                    </div>
                  )}

                  {isReviewed && (
                    <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-[13px] text-emerald-900 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4" />
                      Acknowledged. Tai has been notified.
                    </div>
                  )}
                </div>

                {/* ================= EDITORIAL FOOTER ================= */}
                <div className="shrink-0 border-t border-ink/10 bg-white/60 backdrop-blur-sm">
                  {/* Continue / previous strip */}
                  {canNavigate && (prevSlug || nextSlug) && (
                    <div className="grid grid-cols-2 divide-x divide-ink/10 border-b border-ink/10">
                      <button
                        type="button"
                        onClick={goPrev}
                        disabled={!prevSlug}
                        aria-label="Previous milestone"
                        className="group text-left px-5 py-3 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-ink/[0.03] transition-colors"
                      >
                        <div className="font-mono text-[9.5px] uppercase tracking-[0.28em] text-ink/40 flex items-center gap-1">
                          <ChevronLeft className="w-3 h-3 transition-transform group-hover:-translate-x-0.5" />
                          Previous
                        </div>
                        <div className="mt-1 text-[12.5px] text-ink/75 line-clamp-1 font-medium">
                          {prevSlug ? formatSlug(prevSlug) : "—"}
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={goNext}
                        disabled={!nextSlug}
                        aria-label="Next milestone"
                        className="group text-right px-5 py-3 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-ink/[0.03] transition-colors"
                      >
                        <div className="font-mono text-[9.5px] uppercase tracking-[0.28em] text-ink/40 flex items-center justify-end gap-1">
                          Next
                          <ChevronRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
                        </div>
                        <div className="mt-1 text-[12.5px] text-ink/75 line-clamp-1 font-medium">
                          {nextSlug ? formatSlug(nextSlug) : "—"}
                        </div>
                      </button>
                    </div>
                  )}

                  {/* Primary CTA */}
                  <div className="px-6 pt-4 pb-5 space-y-2.5">
                    {primaryCta && "href" in primaryCta && primaryCta.href ? (
                      <Button
                        asChild
                        className="w-full h-11 bg-ink hover:bg-ink/90 text-white shadow-[0_10px_24px_-12px_rgba(11,18,32,0.6)] rounded-md text-[13.5px] tracking-[0.02em]"
                      >
                        <a href={primaryCta.href} target="_blank" rel="noopener noreferrer">
                          <Eye className="w-4 h-4 mr-2" />
                          {primaryCta.label}
                        </a>
                      </Button>
                    ) : primaryCta && "onClick" in primaryCta ? (
                      <Button
                        onClick={primaryCta.onClick}
                        disabled={"disabled" in primaryCta && primaryCta.disabled}
                        className="w-full h-11 bg-ink hover:bg-ink/90 text-white shadow-[0_10px_24px_-12px_rgba(11,18,32,0.6)] rounded-md text-[13.5px] tracking-[0.02em]"
                      >
                        {kind === "decision" ? (
                          <MessageSquare className="w-4 h-4 mr-2" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4 mr-2" />
                        )}
                        {primaryCta.label}
                      </Button>
                    ) : null}

                    {/* Ghost link row — subtle text links */}
                    <div className="flex items-center justify-center gap-4 pt-1 text-[12px] text-ink/55">
                      <button
                        type="button"
                        onClick={() => setClarifyOpen(true)}
                        className="inline-flex items-center gap-1.5 hover:text-ink transition-colors"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        {kind === "decision" ? "Ask a question" : "Clarify"}
                      </button>
                      <span aria-hidden className="h-3 w-px bg-ink/15" />
                      <button
                        type="button"
                        onClick={() => setBookOpen(true)}
                        className="inline-flex items-center gap-1.5 hover:text-ink transition-colors"
                      >
                        <Calendar className="w-3.5 h-3.5" />
                        Book call
                      </button>
                      <span aria-hidden className="h-3 w-px bg-ink/15" />
                      <Link
                        to="/portal/files"
                        search={{ q: milestone.title }}
                        className="inline-flex items-center gap-1.5 hover:text-ink transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Files
                      </Link>
                      {kind === "deliverable" && milestone.fileUrl && (
                        <>
                          <span aria-hidden className="h-3 w-px bg-ink/15" />
                          <a
                            href={milestone.fileUrl}
                            download
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 hover:text-ink transition-colors"
                          >
                            <Download className="w-3.5 h-3.5" />
                            Download
                          </a>
                        </>
                      )}
                    </div>
                  </div>
                </div>

              </>
            );
          })()}
        </SheetContent>
      </Sheet>

      <AlertDialog open={ackOpen} onOpenChange={setAckOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Acknowledge this milestone?</AlertDialogTitle>
            <AlertDialogDescription>
              This lets us know you've reviewed this part of the roadmap.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reviewMut.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={reviewMut.isPending || !milestone || !roadmapId}
              onClick={(e) => {
                e.preventDefault();
                if (milestone) reviewMut.mutate(milestone);
              }}
              className="bg-ink hover:bg-ink/90 text-white"
            >
              {reviewMut.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4 mr-2" />
              )}
              Acknowledge
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ClarificationModal
        open={clarifyOpen}
        onOpenChange={setClarifyOpen}
        projectId={projectId}
        authorEmail={authorEmail}
        context={
          milestone
            ? {
                title: milestone.title,
                phase: milestone.phase,
                kind: KIND_LABEL[kind],
              }
            : null
        }
      />

      <BookCallModal
        open={bookOpen}
        onOpenChange={setBookOpen}
        projectId={projectId}
        authorEmail={authorEmail}
        schedulingUrl={schedulingUrl}
        context={
          milestone
            ? {
                title: milestone.title,
                phase: milestone.phase,
                kind: KIND_LABEL[kind],
              }
            : null
        }
      />
    </>
  );
}

function DecisionBody({ milestone }: { milestone: RoadmapMilestone }) {
  return (
    <>
      {milestone.options && milestone.options.length > 0 && (
        <Section label="Options">
          <ul className="space-y-1.5">
            {milestone.options.map((o, i) => (
              <li
                key={i}
                className={`rounded-lg border px-3 py-2 text-[14px] ${
                  milestone.recommendedOption === o
                    ? "border-royal/40 bg-royal/5 text-ink"
                    : "border-border text-ink/80"
                }`}
              >
                {o}
                {milestone.recommendedOption === o && (
                  <span className="ml-2 text-[10px] font-mono uppercase tracking-[0.24em] text-royal">
                    Recommended
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}
      {milestone.dueDate && (
        <Section label="Decision due">
          <p>{fmtDate(milestone.dueDate)}</p>
        </Section>
      )}
    </>
  );
}

function DeliverableBody({ milestone }: { milestone: RoadmapMilestone }) {
  const rows: Array<[string, string | null]> = [
    ["Type", milestone.fileType ?? null],
    ["Version", milestone.version ?? null],
    ["Published", fmtDate(milestone.publishedAt)],
  ].filter(([, v]) => !!v) as Array<[string, string | null]>;
  if (rows.length === 0) return null;
  return (
    <Section label="Deliverable">
      <dl className="grid grid-cols-3 gap-2 text-[13px]">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt className="text-ink/45 uppercase tracking-[0.18em] text-[10px] font-mono">
              {k}
            </dt>
            <dd className="text-ink mt-0.5">{v}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}

function MeetingBody({ milestone }: { milestone: RoadmapMilestone }) {
  return (
    <>
      {milestone.meetingAt && (
        <Section label="When">
          <p>{fmtDateTime(milestone.meetingAt)}</p>
        </Section>
      )}
      {milestone.meetingPurpose && (
        <Section label="Purpose">
          <p>{milestone.meetingPurpose}</p>
        </Section>
      )}
    </>
  );
}

function Section({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2.5">
        <span aria-hidden className="h-px w-6 bg-ink/25" />
        <div className="font-mono text-[10px] uppercase tracking-[0.32em] text-ink/50 flex items-center gap-1.5">
          {Icon && <Icon className="w-3 h-3 text-ink/40" />}
          {label}
        </div>
      </div>
      <div className="text-[14.5px] leading-[1.7] text-ink/85">{children}</div>
    </div>
  );
}

/** Turn a slug like "pre-test-ready" into "Pre Test Ready". Fallback label
 *  when we only have the slug (prev/next in the footer strip). */
function formatSlug(slug: string): string {
  return slug
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

