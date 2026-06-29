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

const SubmitInput = z.object({
  name: z.string().trim().min(1).max(120),
  business: z.string().trim().max(200).optional().default(""),
  website: z.string().trim().max(500).optional().default(""),
  email: z.string().trim().email().max(255),
  authorizes_scan: z.boolean(),
  answers: z.array(AnswerSchema).min(1).max(20),
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
    return { ok: true as const };
  });
