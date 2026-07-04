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
import { useEffect, useRef, useState } from "react";
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
      const w = Math.min(430, Math.max(320, Math.round(window.innerWidth * 0.32)));
      canvas.setDrawerOffset(w);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("resize", measure);
      canvas.setDrawerOffset(0);
    };
  }, [open, isMobile, canvas]);

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
            // Desktop: keep the map fully interactive — don't auto-close
            // when the client clicks the canvas, mini-map, or phase labels.
            if (!isMobile) e.preventDefault();
          }}
          onPointerDownOutside={(e) => {
            if (!isMobile) e.preventDefault();
          }}
          className={
            isMobile
              ? "h-[100dvh] w-full max-w-none sm:max-w-none bg-[#FAF8F5] text-ink border-t border-border overflow-y-auto p-0"
              : "w-full sm:max-w-[410px] bg-[#FAF8F5] text-ink border-l border-ink/10 rounded-l-2xl shadow-[0_30px_80px_-30px_rgba(11,18,32,0.35)] p-0 flex flex-col"
          }
          aria-labelledby="milestone-sheet-title"
          aria-describedby="milestone-sheet-desc"
        >
          {milestone && (() => {
            const KindIcon = KIND_ICON[kind];
            const isDeadline = kind === "milestone" && !!milestone.dueDate;
            const displayKindLabel = isDeadline ? "Deadline" : KIND_LABEL[kind];
            const displayKindAccent = isDeadline
              ? "bg-[#e11d48]/12 text-[#be123c] border-[#e11d48]/30"
              : KIND_ACCENT[kind];
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

            return (
              <>
                {/* Header */}
                <SheetHeader className="text-left space-y-3 px-6 pt-6 pb-5 border-b border-ink/[0.08] bg-[#FAF8F5]/80">
                  <div className="flex items-center gap-2 flex-wrap pr-8">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full border pl-1 pr-2.5 py-0.5 text-[10.5px] font-mono uppercase tracking-[0.22em] ${displayKindAccent}`}
                    >
                      <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-white/70">
                        <KindIcon className="w-3 h-3" />
                      </span>
                      {displayKindLabel}
                    </span>
                    <span className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-ink/45">
                      {phaseNumber != null ? `Phase ${phaseNumber} \u00b7 ${phaseName}` : phaseName}
                    </span>
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${STATUS_TONE[milestone.status]}`}
                    >
                      {STATUS_LABEL[milestone.status]}
                    </span>
                  </div>
                  <SheetTitle
                    id="milestone-sheet-title"
                    ref={titleRef}
                    tabIndex={-1}
                    className="font-display text-[26px] leading-[1.15] text-ink focus:outline-none"
                  >
                    {milestone.title}
                  </SheetTitle>
                  {milestone.summary && (
                    <SheetDescription
                      id="milestone-sheet-desc"
                      className="text-[14.5px] leading-[1.65] text-ink/70"
                    >
                      {milestone.summary}
                    </SheetDescription>
                  )}
                </SheetHeader>

                {/* Scrollable body — generous spacing (space-y-6) */}
                <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
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

                  {dueLabel && (
                    <Section
                      label={milestone.dueDate ? "Due" : "Target date"}
                      icon={milestone.dueDate ? Flag : Calendar}
                    >
                      <p>{fmtDate(milestone.dueDate ?? milestone.targetDate)}</p>
                    </Section>
                  )}
                  {milestone.clientActionNeeded && (
                    <div className="rounded-lg border border-royal/25 bg-royal/[0.06] px-4 py-3">
                      <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-royal mb-1.5 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3 h-3" /> Client action needed
                      </div>
                      <p className="text-[14px] leading-[1.6] text-ink/85">
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
                    <Section label="Notes from Tai" icon={MessageSquare}>
                      <p className="italic">{milestone.ownerNote}</p>
                    </Section>
                  )}

                  {isReviewed && (
                    <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-[13px] text-emerald-900 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4" />
                      Acknowledged. Tai has been notified.
                    </div>
                  )}
                </div>

                {/* Sticky CTA footer */}
                <div className="shrink-0 border-t border-ink/10 bg-white/70 backdrop-blur px-6 pt-4 pb-5 space-y-2.5">
                  {primaryCta && "href" in primaryCta && primaryCta.href ? (
                    <Button
                      asChild
                      className="w-full h-10 bg-ink hover:bg-ink/90 text-white shadow-[0_8px_20px_-10px_rgba(11,18,32,0.55)]"
                    >
                      <a
                        href={primaryCta.href}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Eye className="w-4 h-4 mr-2" />
                        {primaryCta.label}
                      </a>
                    </Button>
                  ) : primaryCta && "onClick" in primaryCta ? (
                    <Button
                      onClick={primaryCta.onClick}
                      disabled={"disabled" in primaryCta && primaryCta.disabled}
                      className="w-full h-10 bg-ink hover:bg-ink/90 text-white shadow-[0_8px_20px_-10px_rgba(11,18,32,0.55)]"
                    >
                      {kind === "decision" ? (
                        <MessageSquare className="w-4 h-4 mr-2" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                      )}
                      {primaryCta.label}
                    </Button>
                  ) : null}

                  {/* Secondary CTA */}
                  <Button
                    variant="outline"
                    className="w-full h-9 border-ink/15 text-ink/85 hover:bg-ink/[0.03]"
                    onClick={() => setClarifyOpen(true)}
                  >
                    <MessageSquare className="w-3.5 h-3.5 mr-1.5" />
                    {kind === "decision" ? "Ask a question" : "Request clarification"}
                  </Button>

                  {/* Contextual ghost row */}
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <Button
                      asChild
                      variant="ghost"
                      className="flex-1 h-8 text-[12.5px] text-ink/60 hover:text-ink hover:bg-transparent px-1 justify-center"
                    >
                      <Link to="/portal/files" search={{ q: milestone.title }}>
                        <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                        Related files
                      </Link>
                    </Button>
                    <span aria-hidden className="h-4 w-px bg-ink/10" />
                    <button
                      type="button"
                      onClick={() => setBookOpen(true)}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 text-[12.5px] text-ink/60 hover:text-ink h-8"
                    >
                      <Calendar className="w-3.5 h-3.5" />
                      Book next call
                    </button>
                    {kind === "deliverable" && milestone.fileUrl && (
                      <>
                        <span aria-hidden className="h-4 w-px bg-ink/10" />
                        <a
                          href={milestone.fileUrl}
                          download
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 inline-flex items-center justify-center gap-1.5 text-[12.5px] text-ink/60 hover:text-ink h-8"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Download
                        </a>
                      </>
                    )}
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
      <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-ink/45 mb-2 flex items-center gap-1.5">
        {Icon && <Icon className="w-3 h-3 text-royal" />}
        {label}
      </div>
      <div className="text-[14px] leading-[1.65] text-ink/85">{children}</div>
    </div>
  );
}
