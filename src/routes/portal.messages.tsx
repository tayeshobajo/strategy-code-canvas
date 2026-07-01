import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { MessageSquare, Send, Loader2, AlertCircle, Paperclip } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { usePortalContext } from "@/hooks/use-portal-context";
import { toast } from "sonner";

export const Route = createFileRoute("/portal/messages")({
  head: () => ({
    meta: [
      { title: "Messages — Trust Tai portal" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MessagesPage,
});

type Message = {
  id: string;
  project_id: string;
  sender_type: string;
  author_email: string | null;
  subject: string | null;
  body: string;
  message_type: string;
  action_required: boolean;
  action_completed_at: string | null;
  related_file_ids: string[];
  created_at: string;
};

type Tab = "all" | "updates" | "replies" | "actions";

function useMessages(projectId: string | undefined) {
  return useQuery({
    queryKey: ["portal", "messages", projectId],
    enabled: !!projectId,
    queryFn: async (): Promise<Message[]> => {
      const { data, error } = await supabase
        .from("client_portal_messages")
        .select(
          "id, project_id, sender_type, author_email, subject, body, message_type, action_required, action_completed_at, related_file_ids, created_at",
        )
        .eq("project_id", projectId!)
        .eq("visible_to_client", true)
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as Message[];
    },
    refetchOnWindowFocus: true,
  });
}

function MessagesPage() {
  const ctx = usePortalContext();
  const project = ctx.data?.hasAccess ? ctx.data.project : undefined;
  const projectId = project?.id;
  const { data: messages, isLoading, isError, refetch } = useMessages(projectId);
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const scrollerRef = useRef<HTMLDivElement>(null);

  const email = ctx.data?.email ?? "";

  const send = useMutation({
    mutationFn: async () => {
      if (!projectId) throw new Error("No workspace yet");
      const text = body.trim();
      if (!text) throw new Error("Message is empty");
      const { error } = await supabase.from("client_portal_messages").insert({
        project_id: projectId,
        sender_type: "client",
        author_email: email,
        body: text,
        message_type: "reply",
        visible_to_client: true,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      setBody("");
      qc.invalidateQueries({ queryKey: ["portal", "messages", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    if (!messages) return [];
    if (tab === "updates") return messages.filter((m) => m.sender_type !== "client");
    if (tab === "replies") return messages.filter((m) => m.sender_type === "client");
    if (tab === "actions") return messages.filter((m) => m.action_required && !m.action_completed_at);
    return messages;
  }, [messages, tab]);

  const grouped = useMemo(() => groupByDate(filtered), [filtered]);

  const counts = useMemo(() => {
    const all = messages ?? [];
    return {
      updates: all.filter((m) => m.sender_type !== "client").length,
      replies: all.filter((m) => m.sender_type === "client").length,
      openActions: all.filter((m) => m.action_required && !m.action_completed_at).length,
    };
  }, [messages]);

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight });
  }, [filtered.length]);

  return (
    <div className="max-w-6xl mx-auto grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div>
        <header className="mb-6">
          <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal flex items-center gap-2">
            <MessageSquare className="w-3.5 h-3.5" /> Messages
          </div>
          <h1 className="font-display text-3xl text-ink mt-2">Messages & Updates</h1>
          <p className="text-[15px] leading-[1.75] text-ink/70 mt-2">
            Updates from Trust Tai and a place for our aligned communication.
          </p>
        </header>

        <div className="rounded-2xl bg-card border border-border shadow-sm overflow-hidden flex flex-col min-h-[520px]">
          {/* Tabs */}
          <div className="flex items-center gap-6 border-b border-rule-soft px-6 py-3 text-[13px]">
            {(
              [
                ["all", "All"],
                ["updates", "Updates from Trust Tai"],
                ["replies", "Your replies"],
                ["actions", "Action items"],
              ] as [Tab, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`pb-2 border-b-2 -mb-[13px] transition-colors ${
                  tab === id
                    ? "border-royal text-ink font-medium"
                    : "border-transparent text-ink/60 hover:text-ink"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Scroller */}
          <div
            ref={scrollerRef}
            className="flex-1 overflow-y-auto p-6 space-y-8 max-h-[60vh]"
          >
            {isLoading && <SkeletonThread />}
            {isError && (
              <ErrorState onRetry={() => refetch()} message="Couldn't load messages." />
            )}
            {!isLoading && !isError && filtered.length === 0 && (
              <EmptyState tab={tab} />
            )}
            {grouped.map(([date, msgs]) => (
              <div key={date} className="space-y-4">
                <div className="text-center text-[12px] text-ink/50">{date}</div>
                {msgs.map((m) => (
                  <MessageCard key={m.id} m={m} />
                ))}
              </div>
            ))}
          </div>

          {/* Composer */}
          <form
            className="border-t border-rule-soft p-4 sm:p-5 bg-paper-soft"
            onSubmit={(e) => {
              e.preventDefault();
              if (!body.trim() || !projectId) return;
              send.mutate();
            }}
          >
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={projectId ? "Write your message…" : "Workspace not ready yet."}
              disabled={!projectId || send.isPending}
              rows={2}
              className="resize-none bg-card border-rule-soft focus-visible:ring-royal/40"
            />
            <div className="flex items-center justify-between mt-3">
              <div className="text-[12px] text-ink/50 flex items-center gap-1.5">
                <Paperclip className="w-3.5 h-3.5" />
                Attach a file or reference from{" "}
                <Link to="/portal/files" className="underline hover:text-ink">
                  Files
                </Link>
                .
              </div>
              <Button
                type="submit"
                disabled={!body.trim() || send.isPending || !projectId}
                className="bg-ink hover:bg-ink/90 text-white"
              >
                {send.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending…
                  </>
                ) : (
                  <>
                    Send message <Send className="w-4 h-4 ml-2" />
                  </>
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>

      {/* Right rail */}
      <aside className="hidden lg:flex flex-col gap-4">
        <RailCard title="Conversation summary">
          <ul className="text-[13px] space-y-3">
            <li className="flex items-center justify-between">
              <span className="text-ink/70">Updates from Trust Tai</span>
              <span className="font-medium">{counts.updates}</span>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-ink/70">Your replies</span>
              <span className="font-medium">{counts.replies}</span>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-ink/70">Open action items</span>
              <span className="font-medium">{counts.openActions}</span>
            </li>
          </ul>
        </RailCard>
        <RailCard title="Have a question?">
          <p className="text-[13px] text-ink/70 leading-relaxed">
            We typically respond within one business day.
          </p>
          <Button
            asChild
            variant="outline"
            className="mt-3 w-full border-ink/20 text-ink"
          >
            <a href="mailto:tai@trusttai.com">Email Tai</a>
          </Button>
        </RailCard>
      </aside>
    </div>
  );
}

function MessageCard({ m }: { m: Message }) {
  const isClient = m.sender_type === "client";
  const initials = isClient
    ? (m.author_email ?? "?").slice(0, 2).toUpperCase()
    : "TT";
  const time = new Date(m.created_at).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  return (
    <article className="flex gap-4">
      <div
        className={`h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-[11px] font-bold ${
          isClient ? "bg-paper-soft text-ink border border-rule-soft" : "bg-ink text-white"
        }`}
        aria-hidden="true"
      >
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3">
          <span className="text-[13px] font-medium text-ink">
            {isClient ? "You" : "Trust Tai Team"}
          </span>
          <span className="text-[12px] text-ink/50">{time}</span>
          <span
            className={`ml-auto text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full ${
              isClient
                ? "bg-royal/10 text-royal"
                : m.action_required
                  ? "bg-amber-100 text-amber-800"
                  : "bg-paper-soft text-ink/60 border border-rule-soft"
            }`}
          >
            {isClient ? "Your reply" : m.action_required ? "Action" : "Update"}
          </span>
        </div>
        {m.subject && (
          <div className="mt-1 font-display text-lg text-ink">{m.subject}</div>
        )}
        <p className="mt-1 text-[14px] leading-[1.7] text-ink/80 whitespace-pre-wrap">
          {m.body}
        </p>
      </div>
    </article>
  );
}

function RailCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-card border border-border p-5">
      <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal mb-3">
        {title}
      </div>
      {children}
    </div>
  );
}

function SkeletonThread() {
  return (
    <div className="space-y-6 animate-pulse">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex gap-4">
          <div className="h-9 w-9 rounded-full bg-paper-soft" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-1/4 bg-paper-soft rounded" />
            <div className="h-3 w-3/4 bg-paper-soft rounded" />
            <div className="h-3 w-2/3 bg-paper-soft rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ tab }: { tab: Tab }) {
  const copy: Record<Tab, string> = {
    all: "No messages yet. Trust Tai will post updates here.",
    updates: "No updates from Trust Tai yet.",
    replies: "You haven't sent any replies yet.",
    actions: "No open action items. Nice.",
  };
  return (
    <div className="text-center py-16 text-ink/60">
      <MessageSquare className="w-6 h-6 mx-auto mb-3 opacity-40" />
      <p className="text-[14px]">{copy[tab]}</p>
    </div>
  );
}

function ErrorState({ onRetry, message }: { onRetry: () => void; message: string }) {
  return (
    <div className="text-center py-16">
      <AlertCircle className="w-6 h-6 mx-auto mb-3 text-destructive" />
      <p className="text-[14px] text-ink/70">{message}</p>
      <Button onClick={onRetry} variant="outline" className="mt-4 border-ink/20 text-ink">
        Try again
      </Button>
    </div>
  );
}

function groupByDate(msgs: Message[]): [string, Message[]][] {
  const groups: Record<string, Message[]> = {};
  for (const m of msgs) {
    const key = new Date(m.created_at).toLocaleDateString(undefined, {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    (groups[key] ??= []).push(m);
  }
  return Object.entries(groups);
}
