import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { Calendar, MessageSquare, ExternalLink } from "lucide-react";
import type { RoadmapMilestone } from "@/lib/portal-roadmap-model";

type Props = {
  milestone: RoadmapMilestone | null;
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

export function MilestoneSheet({ milestone, onClose }: Props) {
  const open = !!milestone;
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg bg-paper text-ink border-l border-border overflow-y-auto"
      >
        {milestone && (
          <>
            <SheetHeader className="text-left space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal">
                  Phase {milestone.phase}
                </span>
                <span
                  className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${STATUS_TONE[milestone.status]}`}
                >
                  {STATUS_LABEL[milestone.status]}
                </span>
              </div>
              <SheetTitle className="font-display text-2xl leading-tight text-ink">
                {milestone.title}
              </SheetTitle>
              {milestone.summary && (
                <SheetDescription className="text-[15px] leading-[1.7] text-ink/70">
                  {milestone.summary}
                </SheetDescription>
              )}
            </SheetHeader>

            <div className="mt-8 space-y-6">
              {milestone.detail && milestone.detail !== milestone.summary && (
                <Section label="Why this milestone matters">
                  <p>{milestone.detail}</p>
                </Section>
              )}
              {milestone.successLooksLike && (
                <Section label="What success looks like">
                  <p>{milestone.successLooksLike}</p>
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
              {milestone.dependencies && milestone.dependencies.length > 0 && (
                <Section label="Dependencies">
                  <ul className="list-disc pl-5 space-y-1.5">
                    {milestone.dependencies.map((d, i) => (
                      <li key={i}>{d}</li>
                    ))}
                  </ul>
                </Section>
              )}
              {milestone.ownerNote && (
                <Section label="Notes from Tai">
                  <p className="italic">{milestone.ownerNote}</p>
                </Section>
              )}

              <div className="pt-4 border-t border-border flex flex-wrap gap-3">
                <Button asChild variant="outline" className="border-ink/20">
                  <Link
                    to="/portal/messages"
                    search={{ milestone: milestone.slug } as never}
                  >
                    <MessageSquare className="w-4 h-4 mr-2" />
                    Request clarification
                  </Link>
                </Button>
                <Button asChild className="bg-ink hover:bg-ink/90 text-white">
                  <Link to="/portal/messages">
                    <Calendar className="w-4 h-4 mr-2" />
                    Book next call
                  </Link>
                </Button>
                <Button asChild variant="ghost" className="text-ink/70">
                  <Link to="/portal/files">
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Related files
                  </Link>
                </Button>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
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
