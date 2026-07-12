import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, Loader2, MessageCircleQuestion, XCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useServerFn } from "@tanstack/react-start";
import { respondToPortalDecision } from "@/lib/portal.functions";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";

type DecisionKind = "approve" | "changes_requested" | "declined";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string | undefined;
  milestone: { slug: string; title: string; phase?: string } | null;
};

const OPTIONS: {
  value: DecisionKind;
  label: string;
  hint: string;
  Icon: typeof CheckCircle2;
  tone: string;
}[] = [
  {
    value: "approve",
    label: "Approve",
    hint: "Green-light this decision as proposed.",
    Icon: CheckCircle2,
    tone: "border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100",
  },
  {
    value: "changes_requested",
    label: "Request changes",
    hint: "Approve in principle with adjustments — leave a note.",
    Icon: MessageCircleQuestion,
    tone: "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100",
  },
  {
    value: "declined",
    label: "Decline",
    hint: "Not the right direction — leave a note explaining why.",
    Icon: XCircle,
    tone: "border-rose-300 bg-rose-50 text-rose-900 hover:bg-rose-100",
  },
];

export function DecisionResponseModal({ open, onOpenChange, projectId, milestone }: Props) {
  const [decision, setDecision] = useState<DecisionKind | null>(null);
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);
  const respond = useServerFn(respondToPortalDecision);

  const send = useMutation({
    mutationFn: async () => {
      if (!projectId) throw new Error("No workspace yet");
      if (!milestone) throw new Error("No decision selected");
      if (!decision) throw new Error("Choose a response first");
      if (decision !== "approve" && note.trim().length < 3) {
        throw new Error("Please add a short note so Tai can act on it.");
      }
      await respond({
        data: {
          portalProjectId: projectId,
          milestoneId: milestone.slug.slice(0, 200),
          milestoneTitle: milestone.title,
          decision,
          note: note.trim() || undefined,
        },
      });
    },
    onSuccess: () => {
      setSent(true);
      toast.success("Your decision was sent to Tai.");
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Could not record your decision.");
    },
  });

  const reset = () => {
    setDecision(null);
    setNote("");
    setSent(false);
    send.reset();
  };

  const errorMessage = send.error instanceof Error ? send.error.message : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Respond to decision</DialogTitle>
          <DialogDescription>
            {milestone ? (
              <>
                About{" "}
                <span className="font-medium text-ink">{milestone.title}</span>
                {milestone.phase ? ` · Phase ${milestone.phase}` : ""}. Your response is
                logged as an internal review item and appears in your messages thread.
              </>
            ) : (
              "Your response is logged as an internal review item and appears in your messages thread."
            )}
          </DialogDescription>
        </DialogHeader>

        {sent ? (
          <div className="rounded-lg bg-royal/5 border border-royal/20 p-4 text-[14px] text-ink/85 leading-[1.6]">
            Response sent. Tai will pick this up in the review queue.
            <div className="mt-3">
              <Button asChild variant="outline" size="sm" className="border-ink/20">
                <Link to="/portal/messages" search={{ milestone: undefined, prefill: undefined }}>Open Messages</Link>
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-2">
              {OPTIONS.map(({ value, label, hint, Icon, tone }) => {
                const active = decision === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setDecision(value)}
                    className={`text-left rounded-lg border px-3.5 py-3 transition-colors flex items-start gap-3 ${
                      active ? tone + " ring-2 ring-offset-1 ring-ink/40" : tone
                    }`}
                    aria-pressed={active}
                  >
                    <Icon className="w-4 h-4 mt-0.5 shrink-0" />
                    <div>
                      <div className="text-[13.5px] font-medium">{label}</div>
                      <div className="text-[12px] opacity-80">{hint}</div>
                    </div>
                  </button>
                );
              })}
            </div>
            <Textarea
              placeholder={
                decision === "approve"
                  ? "Optional note for Tai."
                  : "Share the reasoning or the changes you'd like."
              }
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              className="resize-none"
            />
            {errorMessage && (
              <div
                role="alert"
                className="rounded-md border border-[#a4283c]/30 bg-[#a4283c]/5 p-3 text-[13px] text-[#a4283c]"
              >
                {errorMessage}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {sent ? (
            <Button
              variant="outline"
              className="border-ink/20"
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
          ) : (
            <>
              <Button
                variant="ghost"
                className="text-ink/70"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={() => send.mutate()}
                disabled={!decision || send.isPending || !projectId}
                className="bg-ink hover:bg-ink/90 text-white"
              >
                {send.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                )}
                Send response
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
