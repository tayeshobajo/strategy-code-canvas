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
  completed: "bg-royal/10 text-royal border-royal/30",
  in_progress: "bg-royal text-white border-royal",
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

  // Track which slug the sheet opened for so we can return focus on close.
  useEffect(() => {
    if (open) {
      openedSlugRef.current = milestone?.slug ?? null;
      // Focus the title after animation settles.
      const t = setTimeout(() => titleRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open, milestone?.slug]);

  const handleClose = () => {
    const slug = openedSlugRef.current;
    onClose();
    // Return focus to the originating node after Radix unmounts overlays.
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
        onOpenChange={(o) => {
          if (!o) handleClose();
        }}
      >
        <SheetContent
          side={isMobile ? "bottom" : "right"}
          overlayClassName={isMobile ? undefined : "bg-black/10"}

          className={
            isMobile
              ? "h-[100dvh] w-full max-w-none sm:max-w-none bg-paper text-ink border-t border-border overflow-y-auto p-5"
              : "w-full sm:max-w-md bg-paper text-ink border-l border-border overflow-y-auto rounded-l-2xl shadow-2xl"
          }
          aria-labelledby="milestone-sheet-title"
          aria-describedby="milestone-sheet-desc"
        >
          {milestone && (
            <>
              <SheetHeader className="text-left space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal">
                    {KIND_LABEL[kind]} · Phase {milestone.phase}
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
                  className="font-display text-2xl leading-tight text-ink focus:outline-none"
                >
                  {milestone.title}
                </SheetTitle>
                {milestone.summary && (
                  <SheetDescription
                    id="milestone-sheet-desc"
                    className="text-[15px] leading-[1.7] text-ink/70"
                  >
                    {milestone.summary}
                  </SheetDescription>
                )}
              </SheetHeader>

              <div className="mt-8 space-y-6">
                {/* Kind-specific detail blocks */}
                {kind === "decision" && (
                  <DecisionBody milestone={milestone} />
                )}
                {kind === "deliverable" && (
                  <DeliverableBody milestone={milestone} />
                )}
                {kind === "meeting" && <MeetingBody milestone={milestone} />}

                {milestone.detail && milestone.detail !== milestone.summary && (
                  <Section label="Why this matters">
                    <p>{milestone.detail}</p>
                  </Section>
                )}
                {milestone.successLooksLike && (
                  <Section label="What success looks like">
                    <p>{milestone.successLooksLike}</p>
                  </Section>
                )}
                {milestone.unlocks && milestone.unlocks.length > 0 && (
                  <Section label="What it unlocks">
                    <ul className="list-disc pl-5 space-y-1.5">
                      {milestone.unlocks.map((u, i) => (
                        <li key={i}>{u}</li>
                      ))}
                    </ul>
                  </Section>
                )}
                {milestone.actions && milestone.actions.length > 0 && (
                  <Section label="Key actions">
                    <ul className="list-disc pl-5 space-y-1.5">
                      {milestone.actions.map((a, i) => (
                        <li key={i}>{a}</li>
                      ))}
                    </ul>
                  </Section>
                )}
                {milestone.dependencies &&
                  milestone.dependencies.length > 0 && (
                    <Section label="Dependencies">
                      <ul className="list-disc pl-5 space-y-1.5">
                        {milestone.dependencies.map((d, i) => (
                          <li key={i}>{d}</li>
                        ))}
                      </ul>
                    </Section>
                  )}
                {milestone.clientActionNeeded && (
                  <Section label="Your next step">
                    <p>{milestone.clientActionNeeded}</p>
                  </Section>
                )}
                {milestone.latestUpdate && (
                  <Section label="Latest update">
                    <p>{milestone.latestUpdate}</p>
                  </Section>
                )}
                {(milestone.targetDate || milestone.dueDate) && (
                  <Section label={milestone.dueDate ? "Due" : "Target date"}>
                    <p>{fmtDate(milestone.dueDate ?? milestone.targetDate)}</p>
                  </Section>
                )}
                {milestone.ownerNote && (
                  <Section label="Notes from Tai">
                    <p className="italic">{milestone.ownerNote}</p>
                  </Section>
                )}

                {isReviewed && (
                  <div className="rounded-lg bg-royal/5 border border-royal/20 p-3 text-[13px] text-ink/85 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-royal" />
                    Acknowledged. Tai has been notified.
                  </div>
                )}

                <div className="pt-4 border-t border-border flex flex-wrap gap-2">
                  {kind !== "decision" && kind !== "meeting" && (
                    <Button
                      onClick={() => setAckOpen(true)}
                      disabled={!roadmapId || isReviewed || reviewMut.isPending}
                      className="bg-ink hover:bg-ink/90 text-white"
                    >
                      <CheckCircle2 className="w-4 h-4 mr-2" />
                      {isReviewed ? "Acknowledged" : "Acknowledge"}
                    </Button>
                  )}

                  {kind === "deliverable" && milestone.fileUrl && (
                    <>
                      <Button
                        asChild
                        variant="outline"
                        className="border-ink/20"
                      >
                        <a
                          href={milestone.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Eye className="w-4 h-4 mr-2" />
                          Preview
                        </a>
                      </Button>
                      <Button
                        asChild
                        variant="outline"
                        className="border-ink/20"
                      >
                        <a
                          href={milestone.fileUrl}
                          download
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Download
                        </a>
                      </Button>
                    </>
                  )}

                  {kind === "meeting" && milestone.meetingUrl && (
                    <Button asChild variant="outline" className="border-ink/20">
                      <a
                        href={milestone.meetingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Calendar className="w-4 h-4 mr-2" />
                        View meeting
                      </a>
                    </Button>
                  )}

                  <Button
                    variant="outline"
                    className="border-ink/20"
                    onClick={() => setClarifyOpen(true)}
                  >
                    <MessageSquare className="w-4 h-4 mr-2" />
                    {kind === "decision" ? "Respond" : "Request clarification"}
                  </Button>

                  <Button asChild variant="ghost" className="text-ink/70">
                    <Link
                      to="/portal/files"
                      search={{ q: milestone.title }}
                    >
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Related files
                    </Link>
                  </Button>

                  <Button
                    variant="ghost"
                    className="text-ink/70"
                    onClick={() => setBookOpen(true)}
                  >
                    <Calendar className="w-4 h-4 mr-2" />
                    Book next call
                  </Button>
                </div>
              </div>
            </>
          )}
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
            <dt className="text-ink/55 uppercase tracking-[0.18em] text-[10px] font-mono">
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
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-royal mb-2">
        {label}
      </div>
      <div className="text-[14.5px] leading-[1.7] text-ink/85">{children}</div>
    </div>
  );
}
