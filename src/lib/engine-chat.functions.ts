import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasRoleForEmail } from "@/lib/ops/access";
import type { Json } from "@/lib/engine-workspace";

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
  metadata: Json;
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
  proposals: import("@/lib/engine-chat-proposals.functions").ProposalDraft[];
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
    const email = await assertStaff(context as unknown as Parameters<typeof assertStaff>[0]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const userId = (context as { userId?: string }).userId ?? null;

    // ---- Rate limit (per user + per project, 60s window) --------------------
    const WINDOW_SECONDS = 60;
    const USER_LIMIT = 12;
    const PROJECT_LIMIT = 30;
    try {
      const { data: rl } = await sb.rpc("count_recent_chat_events", {
        _user_id: userId,
        _project_id: data.projectId,
        _window_seconds: WINDOW_SECONDS,
      });
      const row = Array.isArray(rl) ? rl[0] : rl;
      const userCount = Number(row?.user_count ?? 0);
      const projectCount = Number(row?.project_count ?? 0);
      if (userCount >= USER_LIMIT || projectCount >= PROJECT_LIMIT) {
        await sb.from("engine_project_chat_events").insert({
          project_id: data.projectId,
          user_id: userId,
          user_email: email,
          success: false,
          error_code: "rate_limited",
          error_message: `Per-${userCount >= USER_LIMIT ? "user" : "project"} limit reached (${WINDOW_SECONDS}s window)`,
        });
        throw new Error(
          `Rate limit reached. Please wait a moment before asking again (limit: ${USER_LIMIT} requests/min per user, ${PROJECT_LIMIT}/min per project).`,
        );
      }
    } catch (rlErr) {
      // If the RPC itself fails, don't block chat — but surface only rate-limit errors.
      if ((rlErr as Error).message?.startsWith("Rate limit reached")) throw rlErr;
    }


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
    let aiSuccess = true;
    let aiErrorCode: string | null = null;
    let aiErrorMessage: string | null = null;
    const MODEL = "google/gemini-3-flash-preview";
    const PROVIDER = "lovable-ai";
    const startedAt = Date.now();
    try {
      const result = await callLovableAi(messages, { json: true, temperature: 0.2 });
      assistantText = result.text;
      tokens_in = result.tokens_in;
      tokens_out = result.tokens_out;
      cost_cents = result.cost_cents;
      answer = parseIntelligenceAnswer(assistantText);
    } catch (err) {
      aiSuccess = false;
      const raw = (err as Error).message || "AI call failed";
      // Classify without leaking provider details
      if (/rate limit/i.test(raw)) aiErrorCode = "ai_rate_limited";
      else if (/credit/i.test(raw)) aiErrorCode = "ai_credits_exhausted";
      else if (/gateway/i.test(raw)) aiErrorCode = "ai_gateway_error";
      else aiErrorCode = "ai_unknown_error";
      aiErrorMessage = raw.slice(0, 300);
      answer = {
        summary:
          "I couldn't reach the AI service to answer that. The project data is still available in the panels on this page.",
        sections: [{ kind: "status", text: aiErrorMessage }],
        citations: [],
        missing: ["ai_response"],
        suggested_links: [],
      };
      assistantText = JSON.stringify(answer);
    }
    const latency_ms = Date.now() - startedAt;

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
          model: MODEL,
          provider: PROVIDER,
          success: aiSuccess,
          error_code: aiErrorCode,
          latency_ms,
        },
      })
      .select("id,thread_id,project_id,role,content,metadata,created_at")
      .single();
    if (aErr) throw new Error(aErr.message ?? "Failed to save assistant message");

    await sb
      .from("engine_project_chat_threads")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", threadRow.id);

    // ---- Audit event (never store prompts, system messages, or secrets) -----
    try {
      await sb.from("engine_project_chat_events").insert({
        project_id: data.projectId,
        user_id: userId,
        user_email: email,
        thread_id: threadRow.id,
        message_id: (asstMsg as { id: string }).id,
        model: MODEL,
        provider: PROVIDER,
        success: aiSuccess,
        error_code: aiErrorCode,
        error_message: aiErrorMessage,
        tokens_in,
        tokens_out,
        cost_cents,
        latency_ms,
      });
    } catch {
      // audit best-effort; never break the chat response
    }

    try {
      await sb.from("engine_activity").insert({
        project_id: data.projectId,
        kind: aiSuccess ? "chat_ask" : "chat_ask_failed",
        title: aiSuccess ? "Project Chat query" : "Project Chat query failed",
        body: aiSuccess
          ? `${email} asked the project intelligence layer (${tokens_in}+${tokens_out} tokens, ${latency_ms}ms)`
          : `${email} — ${aiErrorCode ?? "error"}`,
        severity: aiSuccess ? "info" : "warn",
      });
    } catch {
      // best-effort
    }


    return {
      thread: threadRow,
      userMessage: userMsg as ChatMessageRow,
      assistantMessage: asstMsg as ChatMessageRow,
      answer,
      context_snapshot_keys: ctxPayload.keys,
    };
  });
