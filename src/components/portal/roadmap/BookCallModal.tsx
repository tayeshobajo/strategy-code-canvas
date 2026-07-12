import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Send, ExternalLink, Calendar, CheckCircle2 } from "lucide-react";
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
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string | undefined;
  authorEmail: string | null | undefined;
  schedulingUrl?: string | null;
  /** Marker context so the request stays anchored to what triggered it. */
  context: {
    title: string;
    phase?: string;
    kind?: string;
  } | null;
};

/**
 * "Book next call" flow. Prefers an operator-provided scheduling URL
 * (Calendly-style) but always offers a fallback: capture preferred times
 * as a message so the client is never stuck.
 */
export function BookCallModal({
  open,
  onOpenChange,
  projectId,
  authorEmail,
  schedulingUrl,
  context,
}: Props) {
  const [notes, setNotes] = useState("");
  const [sent, setSent] = useState(false);
  const [confirmedExternal, setConfirmedExternal] = useState(false);

  const send = useMutation({
    mutationFn: async () => {
      if (!projectId) throw new Error("No workspace yet");
      const contextLine = context
        ? `[Roadmap — ${context.kind ?? "milestone"}: "${context.title}"${context.phase ? ` · Phase ${context.phase}` : ""}]\n\n`
        : "";
      const body = notes.trim()
        ? `${contextLine}Requesting the next call. Preferred times / notes:\n\n${notes.trim()}`
        : `${contextLine}Requesting the next call — please suggest times that work.`;
      const { error } = await supabase.from("client_portal_messages").insert({
        project_id: projectId,
        sender_type: "client",
        author_email: authorEmail ?? null,
        subject: context ? `Book next call: ${context.title}` : "Book next call",
        body,
        message_type: "reply",
        visible_to_client: true,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      setSent(true);
      setNotes("");
      toast.success("Call request sent.");
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Could not send your request.");
    },
  });

  const errorMessage = send.error instanceof Error ? send.error.message : null;

  const reset = () => {
    setSent(false);
    setNotes("");
    setConfirmedExternal(false);
    send.reset();
  };

  const openScheduler = () => {
    if (!schedulingUrl) return;
    window.open(schedulingUrl, "_blank", "noopener,noreferrer");
    setConfirmedExternal(true);
  };

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
          <DialogTitle>Book next call</DialogTitle>
          <DialogDescription>
            {context ? (
              <>
                About{" "}
                <span className="font-medium text-ink">{context.title}</span>
                {context.phase ? ` · Phase ${context.phase}` : ""}.
              </>
            ) : (
              "Pick a time with Tai. The context stays anchored to your roadmap."
            )}
          </DialogDescription>
        </DialogHeader>

        {sent ? (
          <div className="rounded-lg bg-royal/5 border border-royal/20 p-4 text-[14px] text-ink/85 leading-[1.6]">
            <div className="flex items-center gap-2 font-medium text-ink">
              <CheckCircle2 className="w-4 h-4 text-royal" />
              Request received.
            </div>
            <p className="mt-1.5">
              Tai will confirm a time in your Messages thread.
            </p>
            <div className="mt-3">
              <Button asChild variant="outline" className="border-ink/20" size="sm">
                <Link to="/portal/messages" search={{ milestone: undefined, prefill: undefined }}>Open Messages</Link>
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {schedulingUrl && (
              <div className="rounded-lg border border-royal/25 bg-royal/5 p-4">
                <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-royal mb-1">
                  Recommended
                </div>
                <div className="text-[14px] text-ink/85 leading-[1.6]">
                  Pick an open slot directly on Tai's calendar.
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <Button
                    onClick={openScheduler}
                    className="bg-ink hover:bg-ink/90 text-white"
                    size="sm"
                  >
                    <Calendar className="w-4 h-4 mr-2" />
                    Open scheduler
                    <ExternalLink className="w-3.5 h-3.5 ml-2 opacity-70" />
                  </Button>
                  {confirmedExternal && (
                    <span className="text-[12px] text-ink/60">
                      Opened in a new tab.
                    </span>
                  )}
                </div>
              </div>
            )}

            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-ink/50 mb-1.5">
                {schedulingUrl ? "Or send preferred times" : "Send preferred times"}
              </div>
              <Textarea
                placeholder="e.g. Tue or Thu afternoon UK time, or anything specific you want to cover."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                className="resize-none"
              />
            </div>
            {errorMessage && (
              <div
                role="alert"
                className="rounded-md border border-[#a4283c]/30 bg-[#a4283c]/5 p-3 text-[13px] text-[#a4283c] flex items-start justify-between gap-3"
              >
                <span>Couldn't send: {errorMessage}</span>
                <button
                  type="button"
                  className="font-medium underline underline-offset-2 hover:no-underline"
                  onClick={() => send.mutate()}
                  disabled={send.isPending || !projectId}
                >
                  Try again
                </button>
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
                disabled={send.isPending || !projectId}
                className="bg-ink hover:bg-ink/90 text-white"
              >
                {send.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Send className="w-4 h-4 mr-2" />
                )}
                Send request
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
