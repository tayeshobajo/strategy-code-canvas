import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const ReflectInput = z.object({
  question: z.string().trim().min(1).max(500),
  answer: z.string().trim().min(1).max(4000),
});

const SYSTEM_PROMPT =
  "You are a quiet writing guide for Trust Tai, a firm that maps roadmaps for founder-led businesses. A founder is answering an intake question about their business. Reflect their answer back in cleaner, warmer, more precise language, keeping their meaning and their own voice. Write in the first person, as if the founder wrote it on their clearest day. Honor what they have built. Do not add claims they did not make. No jargon, no buzzwords, no em-dashes, no exclamation points, and avoid the words just, very, really, simply. Return only the reflected version, one to three sentences, nothing else.";

export const reflectAnswer = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ReflectInput.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");

    const userMessage = `${SYSTEM_PROMPT}\n\nQuestion: ${data.question}\n\nFounder's answer: ${data.answer}`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 1000,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[reflect-answer] anthropic error", res.status, body);
      throw new Error(`Anthropic ${res.status}`);
    }

    const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    const text = (json.content ?? [])
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text as string)
      .join("\n")
      .trim();

    return { text };
  });

const AnswerSchema = z.object({
  key: z.string().max(60),
  question: z.string().max(500),
  response: z.string().max(4000),
  reflected_offered: z.string().max(4000).nullable().optional(),
});

const ContactSchema = z.object({
  name: z.string().trim().max(120).optional().default(""),
  business: z.string().trim().max(200).optional().default(""),
  website: z.string().trim().max(500).optional().default(""),
  email: z.string().trim().max(255).optional().default(""),
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SaveDraftInput = z.object({
  resume_token: z.string().regex(UUID_RE).optional(),
  answers: z.array(AnswerSchema).max(20).default([]),
  contact: ContactSchema.default({ name: "", business: "", website: "", email: "" }),
});

export const saveDraft = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => SaveDraftInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const row = {
      answers: data.answers,
      contact: data.contact,
      updated_at: new Date().toISOString(),
    };
    if (data.resume_token) {
      const { error } = await (supabaseAdmin.from("intake_drafts") as unknown as {
        upsert: (r: Record<string, unknown>) => Promise<{ error: unknown }>;
      }).upsert({ resume_token: data.resume_token, ...row });
      if (error) {
        console.error("[save-draft] upsert failed", error);
        throw new Error("Could not save draft");
      }
      return { resume_token: data.resume_token };
    }
    const { data: inserted, error } = await (supabaseAdmin.from("intake_drafts") as unknown as {
      insert: (r: Record<string, unknown>) => {
        select: (s: string) => { single: () => Promise<{ data: { resume_token: string } | null; error: unknown }> };
      };
    })
      .insert(row)
      .select("resume_token")
      .single();
    if (error || !inserted) {
      console.error("[save-draft] insert failed", error);
      throw new Error("Could not create draft");
    }
    return { resume_token: inserted.resume_token };
  });

const LoadDraftInput = z.object({ resume_token: z.string().regex(UUID_RE) });

export const loadDraft = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => LoadDraftInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await (supabaseAdmin.from("intake_drafts") as unknown as {
      select: (s: string) => {
        eq: (c: string, v: string) => {
          maybeSingle: () => Promise<{ data: { answers: unknown; contact: unknown } | null; error: unknown }>;
        };
      };
    })
      .select("answers, contact")
      .eq("resume_token", data.resume_token)
      .maybeSingle();
    if (error) {
      console.error("[load-draft] failed", error);
      throw new Error("Could not load draft");
    }
    if (!row) return { found: false as const };
    return {
      found: true as const,
      answers: (row.answers as unknown[]) ?? [],
      contact: (row.contact as Record<string, string>) ?? {},
    };
  });

const SendResumeInput = z.object({
  resume_token: z.string().regex(UUID_RE),
  email: z.string().trim().email().max(255),
  resume_url: z.string().url().max(1000),
  name: z.string().trim().max(120).optional().default(""),
});

export const sendResumeLink = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => SendResumeInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const idempotencyKey = `intake-resume-${data.resume_token}`;
    const { error } = await (supabaseAdmin.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ error: unknown }>)("enqueue_email", {
      queue_name: "transactional_emails",
      payload: {
        template_name: "intake-resume-link",
        recipient_email: data.email,
        idempotency_key: idempotencyKey,
        correlation_id: data.resume_token,
        template_data: {
          name: data.name,
          resume_url: data.resume_url,
        },
      },
    });
    if (error) {
      console.error("[send-resume-link] enqueue failed", error);
      throw new Error("Could not send resume link");
    }
    return { ok: true as const };
  });

const SubmitInput = z.object({
  name: z.string().trim().min(1).max(120),
  business: z.string().trim().max(200).optional().default(""),
  website: z.string().trim().max(500).optional().default(""),
  email: z.string().trim().email().max(255),
  authorizes_scan: z.boolean(),
  answers: z.array(AnswerSchema).min(1).max(20),
  resume_token: z.string().regex(UUID_RE).optional(),
});

export const submitIntake = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => SubmitInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("intake_submissions").insert({
      source: "website/build-my-roadmap",
      name: data.name,
      business: data.business || null,
      website: data.website || null,
      email: data.email,
      authorizes_scan: data.authorizes_scan && !!data.website.trim(),
      answers: data.answers,
      status: "new",
    });
    if (error) {
      console.error("[submit-intake] insert failed", error);
      throw new Error("Could not save submission");
    }
    if (data.resume_token) {
      const { error: delErr } = await (supabaseAdmin.from("intake_drafts") as unknown as {
        delete: () => { eq: (c: string, v: string) => Promise<{ error: unknown }> };
      })
        .delete()
        .eq("resume_token", data.resume_token);
      if (delErr) {
        console.warn("[submit-intake] draft cleanup failed (non-blocking)", delErr);
      }
    }
    return { ok: true as const };
  });
