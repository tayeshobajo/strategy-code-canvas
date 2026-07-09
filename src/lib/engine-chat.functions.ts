import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasRoleForEmail } from "@/lib/ops/access";

const uuid = z
  .string()
  .regex(
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
    "Invalid UUID",
  );

export type ChatRole = "user" | "assistant" | "system_note";

export type ChatThreadRow = {
  id: string;
  project_id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

export type ChatMessageRow = {
  id: string;
  thread_id: string;
  project_id: string;
  role: ChatRole;
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type AnswerSection =
  | { kind: "status"; text: string }
  | { kind: "evidence"; text: string }
  | { kind: "next_action"; text: string }
  | { kind: "needs_approval"; text: string }
  | { kind: "links"; items: Array<{ label: string; to: string }> };

export type IntelligenceAnswer = {
  summary: string;
  sections: AnswerSection[];
  citations: string[];
  missing: string[];
  suggested_links: Array<{ label: string; to: string }>;
};

async function assertStaff(context: {
  claims?: Record<string, unknown>;
  supabase: {
    rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  };
}) {
  const email = ((context.claims?.email as string | undefined) ?? "").toLowerCase();
  const [isOp, isAdmin] = await Promise.all([
    hasRoleForEmail(
      context.supabase as unknown as Parameters<typeof hasRoleForEmail>[0],
      email,
      "operator",
    ),
    hasRoleForEmail(
      context.supabase as unknown as Parameters<typeof hasRoleForEmail>[0],
      email,
      "admin",
    ),
  ]);
  if (!isOp && !isAdmin) throw new Error("Forbidden: operator or admin role required");
  return email;
}

export const listChatThreads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: uuid }).parse(raw))
  .handler(async ({ context, data }): Promise<{ threads: ChatThreadRow[] }> => {
    await assertStaff(context as unknown as Parameters<typeof assertStaff>[0]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: rows, error } = await sb
      .from("engine_project_chat_threads")
      .select("id,project_id,title,created_at,updated_at")
      .eq("project_id", data.projectId)
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message ?? "Failed to load threads");
    return { threads: (rows ?? []) as ChatThreadRow[] };
  });

export const createChatThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ projectId: uuid, title: z.string().trim().max(200).optional() }).parse(raw),
  )
  .handler(async ({ context, data }): Promise<{ thread: ChatThreadRow }> => {
    await assertStaff(context as unknown as Parameters<typeof assertStaff>[0]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: row, error } = await sb
      .from("engine_project_chat_threads")
      .insert({
        project_id: data.projectId,
        created_by: (context as { userId?: string }).userId ?? null,
        title: data.title?.length ? data.title : "New conversation",
      })
      .select("id,project_id,title,created_at,updated_at")
      .single();
    if (error) throw new Error(error.message ?? "Failed to create thread");
    return { thread: row as ChatThreadRow };
  });

export const getChatThread = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ threadId: uuid }).parse(raw))
  .handler(async ({ context, data }): Promise<{ thread: ChatThreadRow; messages: ChatMessageRow[] }> => {
    await assertStaff(context as unknown as Parameters<typeof assertStaff>[0]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: thread, error: tErr } = await sb
      .from("engine_project_chat_threads")
      .select("id,project_id,title,created_at,updated_at")
      .eq("id", data.threadId)
      .maybeSingle();
    if (tErr) throw new Error(tErr.message ?? "Failed to load thread");
    if (!thread) throw new Error("Thread not found");
    const { data: msgs, error: mErr } = await sb
      .from("engine_project_chat_messages")
      .select("id,thread_id,project_id,role,content,metadata,created_at")
      .eq("thread_id", data.threadId)
      .order("created_at", { ascending: true });
    if (mErr) throw new Error(mErr.message ?? "Failed to load messages");
    return { thread: thread as ChatThreadRow, messages: (msgs ?? []) as ChatMessageRow[] };
  });

export const askProjectIntelligence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        projectId: uuid,
        threadId: uuid.optional(),
        message: z.string().trim().min(1).max(4000),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }): Promise<{
    thread: ChatThreadRow;
    userMessage: ChatMessageRow;
    assistantMessage: ChatMessageRow;
    answer: IntelligenceAnswer;
    context_snapshot_keys: string[];
  }> => {
    await assertStaff(context as unknown as Parameters<typeof assertStaff>[0]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;

    // Load Spine + build compact context (server-only helper).
    const { buildProjectChatContext } = await import("@/lib/engine-chat-context.server");
    const { buildChatPrompt, parseIntelligenceAnswer } = await import(
      "@/lib/engine-chat-prompt.server"
    );
    const { callLovableAi } = await import("@/lib/engine-ai.server");

    // Reuse getProjectSpine's handler by calling the SQL directly through
    // buildProjectChatContext — it queries the same underlying tables scoped
    // by the middleware-bound supabase client (RLS as the caller).
    const ctxPayload = await buildProjectChatContext(sb, data.projectId);

    // Ensure a thread exists (create if not provided).
    let threadRow: ChatThreadRow | null = null;
    if (data.threadId) {
      const { data: t } = await sb
        .from("engine_project_chat_threads")
        .select("id,project_id,title,created_at,updated_at")
        .eq("id", data.threadId)
        .maybeSingle();
      threadRow = (t as ChatThreadRow | null) ?? null;
      if (!threadRow) throw new Error("Thread not found");
    } else {
      const { data: created, error: cErr } = await sb
        .from("engine_project_chat_threads")
        .insert({
          project_id: data.projectId,
          created_by: (context as { userId?: string }).userId ?? null,
          title: data.message.slice(0, 80),
        })
        .select("id,project_id,title,created_at,updated_at")
        .single();
      if (cErr) throw new Error(cErr.message ?? "Failed to create thread");
      threadRow = created as ChatThreadRow;
    }

    // Insert user message
    const { data: userMsg, error: uErr } = await sb
      .from("engine_project_chat_messages")
      .insert({
        thread_id: threadRow.id,
        project_id: data.projectId,
        role: "user",
        content: data.message,
        metadata: {},
      })
      .select("id,thread_id,project_id,role,content,metadata,created_at")
      .single();
    if (uErr) throw new Error(uErr.message ?? "Failed to save user message");

    // Load short history for follow-ups (last 10 messages before this one).
    const { data: prior } = await sb
      .from("engine_project_chat_messages")
      .select("role,content,created_at")
      .eq("thread_id", threadRow.id)
      .order("created_at", { ascending: true })
      .limit(20);
    const history = ((prior ?? []) as Array<{ role: ChatRole; content: string }>)
      .filter((m) => m.role !== "system_note")
      .slice(-10);

    const messages = buildChatPrompt({
      context: ctxPayload,
      history: history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      userMessage: data.message,
    });

    let assistantText = "";
    let tokens_in = 0;
    let tokens_out = 0;
    let cost_cents = 0;
    let answer: IntelligenceAnswer;
    try {
      const result = await callLovableAi(messages, { json: true, temperature: 0.2 });
      assistantText = result.text;
      tokens_in = result.tokens_in;
      tokens_out = result.tokens_out;
      cost_cents = result.cost_cents;
      answer = parseIntelligenceAnswer(assistantText);
    } catch (err) {
      answer = {
        summary:
          "I couldn't reach the AI service to answer that. The project data is still available in the panels on this page.",
        sections: [
          {
            kind: "status",
            text: (err as Error).message || "AI call failed",
          },
        ],
        citations: [],
        missing: ["ai_response"],
        suggested_links: [],
      };
      assistantText = JSON.stringify(answer);
    }

    const { data: asstMsg, error: aErr } = await sb
      .from("engine_project_chat_messages")
      .insert({
        thread_id: threadRow.id,
        project_id: data.projectId,
        role: "assistant",
        content: assistantText,
        metadata: {
          answer,
          context_keys: ctxPayload.keys,
          tokens_in,
          tokens_out,
          cost_cents,
        },
      })
      .select("id,thread_id,project_id,role,content,metadata,created_at")
      .single();
    if (aErr) throw new Error(aErr.message ?? "Failed to save assistant message");

    await sb
      .from("engine_project_chat_threads")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", threadRow.id);

    return {
      thread: threadRow,
      userMessage: userMsg as ChatMessageRow,
      assistantMessage: asstMsg as ChatMessageRow,
      answer,
      context_snapshot_keys: ctxPayload.keys,
    };
  });
