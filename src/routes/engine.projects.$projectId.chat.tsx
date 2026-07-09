import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  MessageCircle,
  Send,
  Sparkles,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Bot,
  User as UserIcon,
  ChevronRight,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getProjectSpine, type ProjectSpinePayload } from "@/lib/engine.functions";
import {
  askProjectIntelligence,
  createChatThread,
  getChatThread,
  listChatThreads,
  type ChatMessageRow,
  type ChatThreadRow,
  type IntelligenceAnswer,
} from "@/lib/engine-chat.functions";
import {
  listChatProposals,
  getChatCapabilities,
  type ChatCapabilities,
  type ChatProposalRow,
} from "@/lib/engine-chat-proposals.functions";
import { ProposalCard } from "@/components/engine/chat/ProposalCard";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/engine/projects/$projectId/chat")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/auth", search: { redirect: location.href } });
    }
    return { user: data.user };
  },
  component: ProjectChatPage,
  errorComponent: ({ error }) => (
    <div role="alert" className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800" data-qa-state="chat-error">
      Project Chat failed to load: {(error as Error).message}
    </div>
  ),
  notFoundComponent: () => (
    <div className="rounded border border-border bg-card p-4 text-sm text-ink" data-qa-state="chat-notfound">
      Project Chat not found for this project.
    </div>
  ),
});


const SUGGESTED_PROMPTS = [
  "What is the status of this project?",
  "What is blocked?",
  "What needs review?",
  "What changed recently?",
  "What should happen next?",
  "Which QA gates are failing?",
  "What can AI draft next?",
  "Are we ready for delivery?",
];

function ProjectChatPage() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const spineFn = useServerFn(getProjectSpine);
  const listFn = useServerFn(listChatThreads);
  const getThreadFn = useServerFn(getChatThread);
  const askFn = useServerFn(askProjectIntelligence);
  const createFn = useServerFn(createChatThread);

  const spineQ = useQuery({
    queryKey: ["engine", "spine", projectId],
    queryFn: () => spineFn({ data: { id: projectId } }),
    staleTime: 15_000,
  });
  const spine = spineQ.data as ProjectSpinePayload | undefined;

  const threadsQ = useQuery({
    queryKey: ["engine", "chat", "threads", projectId],
    queryFn: () => listFn({ data: { projectId } }),
  });
  const threads = ((threadsQ.data as { threads: ChatThreadRow[] } | undefined)?.threads ?? []);

  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  useEffect(() => {
    if (!activeThreadId && threads[0]) setActiveThreadId(threads[0].id);
  }, [threads, activeThreadId]);

  const threadQ = useQuery({
    queryKey: ["engine", "chat", "thread", activeThreadId],
    queryFn: () => getThreadFn({ data: { threadId: activeThreadId as string } }),
    enabled: !!activeThreadId,
  });
  const messages = ((threadQ.data as { messages: ChatMessageRow[] } | undefined)?.messages ?? []);

  // ----- Proposals (persisted per project) ---------------------------------
  const proposalsFn = useServerFn(listChatProposals);
  const proposalsQ = useQuery({
    queryKey: ["engine", "chat", "proposals", projectId, activeThreadId ?? ""],
    queryFn: () =>
      proposalsFn({
        data: {
          projectId,
          threadId: activeThreadId ?? undefined,
        },
      }),
    enabled: !!activeThreadId,
    staleTime: 5_000,
  });
  const proposalsByMessage = useMemo(() => {
    const list = (proposalsQ.data as { proposals: ChatProposalRow[] } | undefined)?.proposals ?? [];
    const map = new Map<string, ChatProposalRow[]>();
    for (const p of list) {
      if (!p.source_message_id) continue;
      const arr = map.get(p.source_message_id) ?? [];
      arr.push(p);
      map.set(p.source_message_id, arr);
    }
    return map;
  }, [proposalsQ.data]);

  // ----- Admin flag (needed for Save-as-Suggested-Task) --------------------
  const [callerEmail, setCallerEmail] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCallerEmail(data.user?.email ?? null);
    });
  }, []);
  const canConvertToTask = isAdminEmail(callerEmail);

  const [input, setInput] = useState("");
  const [pendingUser, setPendingUser] = useState<string | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    composerRef.current?.focus();
  }, [activeThreadId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, pendingUser]);

  const askMut = useMutation({
    mutationFn: async (message: string) => {
      const res = (await askFn({
        data: {
          projectId,
          threadId: activeThreadId ?? undefined,
          message,
        },
      })) as {
        thread: ChatThreadRow;
        userMessage: ChatMessageRow;
        assistantMessage: ChatMessageRow;
        answer: IntelligenceAnswer;
      };
      return res;
    },
    onSuccess: (res) => {
      setPendingUser(null);
      if (!activeThreadId) setActiveThreadId(res.thread.id);
      qc.invalidateQueries({ queryKey: ["engine", "chat", "threads", projectId] });
      qc.invalidateQueries({ queryKey: ["engine", "chat", "thread", res.thread.id] });
      // refresh spine context panel numbers after any ask
      qc.invalidateQueries({ queryKey: ["engine", "spine", projectId] });
      qc.invalidateQueries({ queryKey: ["engine", "chat", "proposals", projectId] });
      composerRef.current?.focus();
    },
    onError: () => {
      setPendingUser(null);
    },
  });

  const newThreadMut = useMutation({
    mutationFn: async () => {
      const res = (await createFn({ data: { projectId } })) as { thread: ChatThreadRow };
      return res.thread;
    },
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: ["engine", "chat", "threads", projectId] });
      setActiveThreadId(t.id);
      composerRef.current?.focus();
    },
  });

  function handleSend(text?: string) {
    const message = (text ?? input).trim();
    if (!message || askMut.isPending) return;
    setInput("");
    setPendingUser(message);
    askMut.mutate(message);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)_320px] gap-4">
      {/* Thread list */}
      <aside className="rounded-lg border border-border bg-card p-3 h-fit sticky top-4">
        <div className="flex items-center justify-between mb-2">
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink/50">
            Conversations
          </div>
          <button
            type="button"
            onClick={() => newThreadMut.mutate()}
            disabled={newThreadMut.isPending}
            className="text-[11px] rounded-md border border-border px-2 py-1 hover:border-royal/50 disabled:opacity-50"
          >
            + New
          </button>
        </div>
        <div className="space-y-1 max-h-[420px] overflow-auto">
          {threads.length === 0 && !threadsQ.isPending && (
            <div className="text-[11px] text-ink/50 px-1">No conversations yet.</div>
          )}
          {threads.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveThreadId(t.id)}
              className={cn(
                "w-full text-left rounded-md px-2 py-1.5 text-xs border",
                activeThreadId === t.id
                  ? "border-royal/60 bg-royal/5 text-ink"
                  : "border-transparent hover:border-border text-ink/80",
              )}
            >
              <div className="line-clamp-2">{t.title || "Untitled"}</div>
              <div className="text-[10px] text-ink/40 mt-0.5">
                {new Date(t.updated_at).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </div>
            </button>
          ))}
        </div>
      </aside>

      {/* Main chat column */}
      <section className="flex flex-col rounded-lg border border-border bg-card min-h-[70vh]">
        <ChatHeader
          projectId={projectId}
          spine={spine}
          onNavigateSpine={() =>
            navigate({ to: "/engine/projects/$projectId/spine", params: { projectId } })
          }
        />

        <div
          ref={scrollRef}
          className="flex-1 overflow-auto px-5 py-4 space-y-4"
          data-qa-state="chat-scroll"
        >
          {messages.length === 0 && !pendingUser && !askMut.isPending ? (
            <EmptyState onPick={(q) => handleSend(q)} />
          ) : (
            <>
              {messages.map((m) => (
                <MessageBubble
                  key={m.id}
                  message={m}
                  projectId={projectId}
                  threadId={activeThreadId}
                  persistedProposals={proposalsByMessage.get(m.id) ?? []}
                  canConvertToTask={canConvertToTask}
                />
              ))}
              {pendingUser && (
                <MessageBubble
                  message={{
                    id: "pending-user",
                    thread_id: "",
                    project_id: projectId,
                    role: "user",
                    content: pendingUser,
                    metadata: {},
                    created_at: new Date().toISOString(),
                  }}
                  projectId={projectId}
                  threadId={activeThreadId}
                  persistedProposals={[]}
                  canConvertToTask={canConvertToTask}
                />
              )}
              {askMut.isPending && (
                <div className="flex items-center gap-2 text-xs text-ink/60">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Reading project context and drafting an answer…
                </div>
              )}
              {askMut.isError && (
                <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
                  {(askMut.error as Error)?.message ?? "Failed to reach the intelligence layer."}
                </div>
              )}
            </>
          )}
        </div>

        <div className="border-t border-border p-3">
          {messages.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {SUGGESTED_PROMPTS.slice(0, 4).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => handleSend(p)}
                  disabled={askMut.isPending}
                  className="text-[11px] border border-border rounded-full px-2.5 py-1 hover:border-royal/50 text-ink/80 disabled:opacity-50"
                >
                  {p}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
            <textarea
              ref={composerRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask this project a question…"
              rows={2}
              className="flex-1 resize-none rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:border-royal/60"
              disabled={askMut.isPending}
              data-qa-role="chat-composer"
            />
            <button
              type="button"
              onClick={() => handleSend()}
              disabled={askMut.isPending || !input.trim()}
              className="inline-flex items-center gap-1.5 rounded-md bg-ink text-white text-sm px-3 py-2 disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" /> Send
            </button>
          </div>
          <div className="mt-1 text-[10px] text-ink/40">
            Read-only. Answers come from Project Spine, tasks, reviews, activity, and QA gates. This chat cannot approve, publish, or edit project state.
          </div>
        </div>
      </section>

      {/* Context panel */}
      <ContextPanel projectId={projectId} spine={spine} isPending={spineQ.isPending} />
    </div>
  );
}

function ChatHeader({
  projectId,
  spine,
  onNavigateSpine,
}: {
  projectId: string;
  spine: ProjectSpinePayload | undefined;
  onNavigateSpine: () => void;
}) {
  const nba = spine?.nba;
  return (
    <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-xs text-ink/60">
          <MessageCircle className="w-3.5 h-3.5" />
          <span>Project Chat · Intelligence Layer</span>
        </div>
        <div className="mt-1 flex items-center gap-3 flex-wrap">
          <h1 className="font-display text-xl text-ink truncate">
            {spine?.project?.name ?? "Loading project…"}
          </h1>
          {spine?.project?.status && (
            <span className="text-[10px] font-mono uppercase tracking-[0.22em] text-ink/60 border border-border rounded-full px-2 py-0.5">
              {spine.project.status}
            </span>
          )}
          {spine?.project?.current_step && (
            <span className="text-[11px] text-ink/60">
              Step: <span className="text-ink/80">{spine.project.current_step}</span>
            </span>
          )}
        </div>
        {nba && (
          <div className="mt-1.5 text-[11px] text-ink/70 inline-flex items-center gap-1.5">
            <Sparkles className="w-3 h-3 text-royal" />
            <span className="text-ink/50">Next best action:</span>
            <span className="text-ink">{nba.action}</span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Link
          to="/engine/projects/$projectId/spine"
          params={{ projectId }}
          className="text-xs border border-border rounded-md px-2.5 py-1.5 hover:border-royal/50 inline-flex items-center gap-1"
          onClick={(e) => {
            e.preventDefault();
            onNavigateSpine();
          }}
        >
          Project Spine <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    </header>
  );
}

function EmptyState({ onPick }: { onPick: (q: string) => void }) {
  return (
    <div className="max-w-xl mx-auto text-center py-10">
      <div className="w-10 h-10 rounded-full bg-royal/10 text-royal inline-flex items-center justify-center">
        <Bot className="w-5 h-5" />
      </div>
      <h2 className="mt-3 font-display text-xl text-ink">Ask the project what it knows.</h2>
      <p className="mt-2 text-sm text-ink/60">
        This chat answers from the Project Spine, tasks, reviews, activity, and QA gates. It will tell
        you when it does not know.
      </p>
      <div className="mt-5 flex flex-wrap gap-1.5 justify-center">
        {SUGGESTED_PROMPTS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPick(p)}
            className="text-xs border border-border rounded-full px-3 py-1.5 hover:border-royal/50 text-ink/80"
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  projectId,
  threadId,
  persistedProposals,
  canConvertToTask,
}: {
  message: ChatMessageRow;
  projectId: string;
  threadId: string | null;
  persistedProposals: ChatProposalRow[];
  canConvertToTask: boolean;
}) {
  const isUser = message.role === "user";
  const meta = (message.metadata ?? {}) as { answer?: IntelligenceAnswer };
  const answer = meta.answer;

  // Prefer persisted proposal rows (source of truth after reload); fall back
  // to the drafts embedded in the assistant metadata for freshly-sent messages
  // before the proposals query returns.
  const draftsFromMeta = answer?.proposals ?? [];
  const showPersisted = persistedProposals.length > 0;

  return (
    <div className={cn("flex gap-3", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-royal/10 text-royal flex items-center justify-center shrink-0">
          <Bot className="w-3.5 h-3.5" />
        </div>
      )}
      <div className={cn("max-w-[75%] min-w-0", isUser ? "" : "flex-1")}>
        <div className={cn("rounded-lg px-3 py-2 text-sm", isUser ? "bg-ink text-white inline-block" : "bg-white border border-border text-ink")}>
          {isUser || !answer ? (
            <div className="whitespace-pre-wrap">{message.content}</div>
          ) : (
            <AnswerCard answer={answer} />
          )}
        </div>
        {!isUser && (showPersisted || draftsFromMeta.length > 0) && (
          <div className="mt-1 space-y-1" data-qa-role="chat-proposals" data-qa-message-id={message.id}>
            {showPersisted
              ? persistedProposals.map((p) => (
                  <ProposalCard
                    key={p.id}
                    projectId={projectId}
                    threadId={threadId}
                    sourceMessageId={message.id}
                    proposal={p}
                    canConvertToTask={canConvertToTask}
                  />
                ))
              : draftsFromMeta.map((d, i) => (
                  <ProposalCard
                    key={`draft-${i}`}
                    projectId={projectId}
                    threadId={threadId}
                    sourceMessageId={message.id === "pending-user" ? null : message.id}
                    proposal={d}
                    canConvertToTask={canConvertToTask}
                  />
                ))}
          </div>
        )}
      </div>
      {isUser && (
        <div className="w-7 h-7 rounded-full bg-ink/10 text-ink flex items-center justify-center shrink-0">
          <UserIcon className="w-3.5 h-3.5" />
        </div>
      )}
    </div>
  );
}

function AnswerCard({ answer }: { answer: IntelligenceAnswer }) {
  return (
    <div className="space-y-2">
      <div className="text-sm text-ink leading-relaxed">{answer.summary}</div>
      {answer.sections.map((s, i) => {
        if (s.kind === "links") {
          return (
            <div key={i} className="flex flex-wrap gap-1.5 pt-1">
              {s.items.map((it) => (
                <Link
                  key={it.to + it.label}
                  to={it.to as never}
                  className="text-[11px] inline-flex items-center gap-1 border border-border rounded-md px-2 py-1 hover:border-royal/50"
                >
                  {it.label} <ChevronRight className="w-3 h-3" />
                </Link>
              ))}
            </div>

          );
        }
        const label =
          s.kind === "status"
            ? "Status"
            : s.kind === "evidence"
              ? "Evidence"
              : s.kind === "next_action"
                ? "Next action"
                : "Needs human approval";
        const tone =
          s.kind === "needs_approval"
            ? "border-amber-300 bg-amber-50 text-amber-900"
            : s.kind === "next_action"
              ? "border-royal/30 bg-royal/5 text-ink"
              : "border-border bg-white text-ink/80";
        return (
          <div key={i} className={cn("rounded-md border px-2.5 py-2 text-xs", tone)}>
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] opacity-70 mb-0.5">
              {label}
            </div>
            <div className="whitespace-pre-wrap leading-relaxed">{s.text}</div>
          </div>
        );
      })}
      {answer.missing.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1">
          {answer.missing.map((m) => (
            <span key={m} className="text-[10px] rounded-full bg-red-50 text-red-700 border border-red-200 px-2 py-0.5">
              missing: {m}
            </span>
          ))}
        </div>
      )}
      {answer.citations.length > 0 && (
        <div className="text-[10px] text-ink/40 pt-1">
          Sources: {answer.citations.join(", ")}
        </div>
      )}
    </div>
  );
}

function ContextPanel({
  projectId,
  spine,
  isPending,
}: {
  projectId: string;
  spine: ProjectSpinePayload | undefined;
  isPending: boolean;
}) {
  const blockedCount = useMemo(
    () => (spine?.tasks ?? []).filter((t) => t.status === "blocked").length,
    [spine],
  );
  const suggestedCount = useMemo(
    () =>
      (spine?.tasks ?? []).filter(
        (t) =>
          (t as { ai_generated?: boolean }).ai_generated &&
          ["todo", "suggested", "proposed", "draft", "pending"].includes(t.status),
      ).length,
    [spine],
  );
  const pendingReviews = spine?.reviews?.length ?? 0;
  const lastActivity = spine?.activity?.[0];

  return (
    <aside className="rounded-lg border border-border bg-card p-4 h-fit sticky top-4 space-y-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink/50 flex items-center gap-1.5">
        <Info className="w-3 h-3" /> Live project context
      </div>
      {isPending ? (
        <div className="text-xs text-ink/50">Loading context…</div>
      ) : !spine ? (
        <div className="text-xs text-red-700">Context unavailable.</div>
      ) : (
        <>
          <ContextRow label="Current step" value={spine.project?.current_step || "—"} />
          <ContextRow
            label="Next best action"
            value={spine.nba?.action ?? "Nothing waiting"}
            hint={spine.nba?.reason || undefined}
          />
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Blocked tasks" value={blockedCount} tone={blockedCount > 0 ? "red" : "green"} />
            <Stat label="Pending reviews" value={pendingReviews} tone={pendingReviews > 0 ? "amber" : "green"} />
            <Stat label="Suggested tasks" value={suggestedCount} tone={suggestedCount > 0 ? "amber" : "green"} />
            <Stat label="Sources processed" value={`${spine.sources.processed}/${spine.sources.total}`} tone="blue" />
          </div>

          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink/50 mb-1">
              QA gates
            </div>
            <QaGates spine={spine} />
          </div>

          {lastActivity && (
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink/50 mb-1">
                Last activity
              </div>
              <div className="text-xs text-ink/80">{lastActivity.title}</div>
              <div className="text-[10px] text-ink/40">
                {new Date(lastActivity.created_at).toLocaleString()}
              </div>
            </div>
          )}

          <Link
            to="/engine/projects/$projectId/spine"
            params={{ projectId }}
            className="inline-flex items-center gap-1 text-[11px] text-ink/70 hover:text-ink"
          >
            Open Project Spine <ArrowRight className="w-3 h-3" />
          </Link>
        </>
      )}
    </aside>
  );
}

function ContextRow({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink/50">{label}</div>
      <div className="text-sm text-ink">{value}</div>
      {hint && <div className="text-[11px] text-ink/50">{hint}</div>}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone: "red" | "amber" | "green" | "blue";
}) {
  const cls: Record<string, string> = {
    red: "border-red-200 bg-red-50 text-red-800",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    green: "border-emerald-200 bg-emerald-50 text-emerald-800",
    blue: "border-royal/20 bg-royal/5 text-ink",
  };
  return (
    <div className={cn("rounded-md border p-2", cls[tone])}>
      <div className="font-mono text-[10px] uppercase tracking-[0.22em] opacity-70">{label}</div>
      <div className="text-lg font-display leading-none mt-1">{value}</div>
    </div>
  );
}

function QaGates({ spine }: { spine: ProjectSpinePayload }) {
  const gates: Array<{ name: string; ok: "pass" | "warn" | "fail" }> = [];
  gates.push({ name: "Point A", ok: spine.project?.point_a ? "pass" : "fail" });
  gates.push({ name: "Point B goal", ok: spine.project?.goal ? "pass" : "fail" });
  gates.push({
    name: "Sources",
    ok: spine.sources.processed > 0 ? "pass" : spine.sources.total > 0 ? "warn" : "fail",
  });
  gates.push({ name: "Milestones", ok: (spine.milestones?.length ?? 0) > 0 ? "pass" : "fail" });
  gates.push({
    name: "No blocked tasks",
    ok: (spine.tasks ?? []).some((t) => t.status === "blocked") ? "fail" : "pass",
  });
  gates.push({
    name: "No pending reviews",
    ok: (spine.reviews?.length ?? 0) > 0 ? "warn" : "pass",
  });
  return (
    <div className="space-y-1">
      {gates.map((g) => (
        <div key={g.name} className="flex items-center gap-2 text-xs">
          {g.ok === "pass" ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          ) : g.ok === "warn" ? (
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
          ) : (
            <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
          )}
          <span className="text-ink/80">{g.name}</span>
        </div>
      ))}
    </div>
  );
}
