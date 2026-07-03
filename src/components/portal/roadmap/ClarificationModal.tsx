import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Send } from "lucide-react";
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
  /** Marker context that is prefilled into the message body. */
  context: {
    title: string;
    phase?: string;
    kind?: string;
  } | null;
};

/**
 * In-page "Request clarification" dialog. Writes to
 * `client_portal_messages` directly using the existing RLS-protected client;
 * keeps the roadmap panel state intact and shows a calm inline success
 * message afterwards.
 */
export function ClarificationModal({
  open,
  onOpenChange,
  projectId,
  authorEmail,
  context,
}: Props) {
  const [question, setQuestion] = useState("");
  const [sent, setSent] = useState(false);

  const send = useMutation({
    mutationFn: async () => {
      if (!projectId) throw new Error("No workspace yet");
      const contextLine = context
        ? `[Roadmap — ${context.kind ?? "milestone"}: "${context.title}"${context.phase ? ` · Phase ${context.phase}` : ""}]\n\n`
        : "";
      const { error } = await supabase.from("client_portal_messages").insert({
        project_id: projectId,
        sender_type: "client",
        author_email: authorEmail ?? null,
        subject: context ? `Clarification: ${context.title}` : "Clarification",
        body: `${contextLine}${question.trim()}`,
        message_type: "reply",
        visible_to_client: true,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      setSent(true);
      setQuestion("");
      toast.success("Question sent to Tai.");
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Could not send your question.");
    },
  });

  const errorMessage = send.error instanceof Error ? send.error.message : null;

  const reset = () => {
    setSent(false);
    setQuestion("");
    send.reset();
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
          <DialogTitle>Request clarification</DialogTitle>
          <DialogDescription>
            {context ? (
              <>
                About{" "}
                <span className="font-medium text-ink">
                  {context.title}
                </span>
                {context.phase ? ` · Phase ${context.phase}` : ""}. Your
                question is sent to Tai and appears in your Messages thread.
              </>
            ) : (
              "Your question is sent to Tai and appears in your Messages thread."
            )}
          </DialogDescription>
        </DialogHeader>

        {sent ? (
          <div className="rounded-lg bg-royal/5 border border-royal/20 p-4 text-[14px] text-ink/85 leading-[1.6]">
            Your question was sent. We'll respond here so the context stays
            together.
            <div className="mt-3">
              <Button asChild variant="outline" className="border-ink/20" size="sm">
                <Link to="/portal/messages">Open Messages</Link>
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <Textarea
              placeholder="What would you like us to clarify?"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={5}
              className="resize-none"
              autoFocus
            />
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
                disabled={!question.trim() || send.isPending || !projectId}
                className="bg-ink hover:bg-ink/90 text-white"
              >
                {send.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Send className="w-4 h-4 mr-2" />
                )}
                Send question
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
