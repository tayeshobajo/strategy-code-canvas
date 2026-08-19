/**
 * Server functions for the public Build My Roadmap conversation.
 *
 * Thin wrappers only — every runtime helper lives in a server-only module
 * imported inside the handler.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const attributionSchema = z.object({
  landing_path: z.string().nullable(),
  entry_referrer: z.string().nullable(),
  utm_source: z.string().nullable(),
  utm_medium: z.string().nullable(),
  utm_campaign: z.string().nullable(),
  utm_term: z.string().nullable(),
  utm_content: z.string().nullable(),
  gclid: z.string().nullable(),
  fbclid: z.string().nullable(),
  session_id: z.string().nullable(),
  started_at: z.string().nullable(),
  page_views_before_intake: z.number().nullable(),
});

const verbatimSchema = z.array(
  z.object({
    key: z.string().max(120),
    question: z.string().max(1000),
    answer: z.string().max(20000),
    modality: z.enum(["text", "voice"]),
    media_ref: z.string().max(500).nullable().optional(),
    summary: z.string().max(4000).nullable().optional(),
    skipped: z.boolean().optional(),
    answered_at: z.string(),
  }),
);

const personSchema = z.object({
  name: z.string().max(200).nullable(),
  email: z.string().email().max(320).nullable(),
  phone: z.string().max(60).nullable(),
  role: z.string().max(200).nullable(),
});

const companySchema = z.object({
  name: z.string().max(200).nullable(),
  website: z.string().max(300).nullable(),
});

export const startIntakeSession = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ attribution: attributionSchema }).parse(input),
  )
  .handler(async ({ data }) => {
    const { createSession } = await import("./website-intake/session.server");
    return createSession(data.attribution);
  });

export const loadIntakeSession = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ resumeToken: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { loadSession } = await import("./website-intake/session.server");
    return loadSession(data.resumeToken);
  });

export const saveIntakeProgress = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        resumeToken: z.string().uuid(),
        verbatim: verbatimSchema.max(80),
        skipped: z.array(z.string().max(60)).max(40),
        followUpsAsked: z.array(z.string().max(60)).max(20),
        person: personSchema.optional(),
        company: companySchema.optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { saveProgress } = await import("./website-intake/session.server");
    return saveProgress(data as Parameters<typeof saveProgress>[0]);
  });

export const transcribeIntakeVoiceAnswer = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        resumeToken: z.string().uuid(),
        questionKey: z.string().max(120).regex(/^[a-z0-9_]+$/),
        mimeType: z.string().max(100),
        // ~8 MB of base64 keeps a two-minute recording comfortably inside limits.
        base64: z.string().min(16).max(11_000_000),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { storeVoiceRecording } = await import("./website-intake/session.server");
    const { transcribeAudio } = await import("./website-intake/transcribe.server");

    const bytes = Uint8Array.from(Buffer.from(data.base64, "base64"));
    const mediaRef = await storeVoiceRecording({
      resumeToken: data.resumeToken,
      questionKey: data.questionKey,
      bytes,
      contentType: data.mimeType,
    });
    const { transcript } = await transcribeAudio({
      base64: data.base64,
      mimeType: data.mimeType,
    });
    return { transcript, mediaRef };
  });

export const completeIntakeSession = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        resumeToken: z.string().uuid(),
        person: personSchema,
        company: companySchema,
        consent: z.object({
          contact_ok: z.boolean(),
          marketing_ok: z.boolean(),
          agreed_at: z.string().nullable(),
        }),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { completeSession } = await import("./website-intake/session.server");
    const result = await completeSession(data);

    if (data.person.email) {
      try {
        const { enqueueTransactionalEmail } = await import(
          "@/lib/email/enqueue-transactional.server"
        );
        await enqueueTransactionalEmail({
          templateName: "intake-client-confirmation",
          recipientEmail: data.person.email,
          templateData: { name: data.person.name ?? "there" },
          idempotencyKey: `intake-confirmation:${data.resumeToken}`,
        });
      } catch (err) {
        // A confirmation email must never fail the submission.
        console.error("intake confirmation email failed", err);
      }
    }
    return { received: true, delivered: result.delivered };
  });
