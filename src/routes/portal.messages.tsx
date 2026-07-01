import { createFileRoute } from "@tanstack/react-router";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/portal/messages")({
  head: () => ({
    meta: [
      { title: "Messages — Trust Tai portal" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MessagesPage,
});

function MessagesPage() {
  return (
    <div className="max-w-3xl mx-auto rounded-2xl bg-card border border-border p-8 lg:p-10 shadow-sm">
      <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal flex items-center gap-2">
        <MessageSquare className="w-3.5 h-3.5" /> Messages
      </div>
      <h1 className="font-display text-3xl text-ink mt-2">
        Reach Tai directly.
      </h1>
      <p className="text-[15px] leading-[1.75] text-ink/70 mt-3">
        In-portal messaging is on the way. For now, email is the fastest path.
      </p>
      <Button asChild className="mt-6 bg-ink hover:bg-ink/90 text-white">
        <a href="mailto:tai@trusttai.com">Email tai@trusttai.com</a>
      </Button>
    </div>
  );
}
