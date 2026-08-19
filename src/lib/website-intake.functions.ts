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

const eventSchema = z.object({
  event_key: z.string().min(3).max(300),
  event_name: z.enum([
    "page_view",
    "intake_view",
    "intake_started",
    "intake_answered",
    "intake_resume_requested",
    "intake_resumed",
    "intake_submitted",
    "intake_abandoned",
  ]),
  occurred_at: z.string().max(40),
  session_id: z.string().max(120).nullable(),
  submission_id: z.string().max(120).nullable(),
  path: z.string().max(500).nullable(),
  referrer: z.string().max(500).nullable(),
  utm: z.object({
    source: z.string().max(200).nullable(),
    medium: z.string().max(200).nullable(),
    campaign: z.string().max(200).nullable(),
    term: z.string().max(200).nullable(),
    content: z.string().max(200).nullable(),
  }),
  device: z.string().max(40).nullable(),
  properties: z.record(z.string(), z.unknown()).default({}),
});

/** Analytics only. Never throws into the conversation UX. */
export const trackWebsiteEvents = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ events: z.array(eventSchema).min(1).max(20) }).parse(input),
  )
  .handler(async ({ data }) => {
    try {
      const { recordEvents } = await import("./website-intake/events.server");
      const result = await recordEvents(
        data.events as unknown as Parameters<typeof recordEvents>[0],
      );
      return { ok: true, ...result };
    } catch (err) {
      console.error("website event send failed", (err as Error).message);
      return { ok: false, queued: 0, delivered: false };
    }
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

export const attachIntakeFile = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        resumeToken: z.string().uuid(),
        filename: z.string().min(1).max(200),
        mimeType: z.string().max(120),
        // ~7 MB of binary once decoded.
        base64: z.string().min(8).max(10_000_000),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { storeAttachment } = await import("./website-intake/session.server");
    const bytes = Uint8Array.from(Buffer.from(data.base64, "base64"));
    const mediaRef = await storeAttachment({
      resumeToken: data.resumeToken,
      filename: data.filename,
      bytes,
      contentType: data.mimeType || "application/octet-stream",
    });
    return { mediaRef };
  });

/**
 * One governed conversation turn.
 *
 * Takes what the founder just said plus the conversation so far, and returns
 * the single next thing Tai should say. Never throws into the room: if the
 * model is unreachable the deterministic posture plan is returned instead.
 */
export const interpretIntakeTurn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        latest: z.string().min(1).max(20000),
        verbatim: verbatimSchema.max(80),
        skipped: z.array(z.string().max(60)).max(40),
        followUpsAsked: z.array(z.string().max(60)).max(20),
        supported: z.array(z.string().max(60)).max(40).default([]),
        currentObjective: z.string().max(120).nullable().default(null),
        isFirstTurn: z.boolean().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { reasonTurn } = await import("./website-intake/conversation.server");
    return reasonTurn({
      state: {
        answers: data.verbatim as Parameters<typeof reasonTurn>[0]["state"]["answers"],
        skipped: data.skipped as never[],
        followUpsAsked: data.followUpsAsked as never[],
        supported: data.supported as never[],
      },
      latest: data.latest,
      currentObjective: data.currentObjective as never,
      isFirstTurn: data.isFirstTurn,
    });
  });
