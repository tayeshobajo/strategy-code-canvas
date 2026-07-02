import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasRoleForEmail, isOperatorEmail } from "./ops/access";
import {
  AddNoteInput,
  AnalyticsInput,
  ApproveSubmissionInput,
  ArchiveSubmissionInput,
  GetSubmissionInput,
  ListHistoryInput,
  ListSubmissionsInput,
  RejectSubmissionInput,
  ReopenSubmissionInput,
  SaveDraftInput,
  SetReviewStatusInput,
} from "./ops/schema";
import {
  type AuditAction,
  type AuditRow,
  type DraftContent,
  type DraftRow,
  type IntakeSubmissionRow,
  type NoteRow,
  type ReviewArtifact,
  type ReviewRow,
  type ReviewStatus,
  deriveCoreSignal,
} from "./ops/intake-types";
import type { SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Operator gate. Every server fn in this file goes through `operatorGuard`.
// ---------------------------------------------------------------------------

function operatorEmailFromClaims(claims: Record<string, unknown> | undefined): string | null {
  if (!claims) return null;
  const raw = (claims.email ?? (claims as { user_metadata?: { email?: string } }).user_metadata?.email) as
    | string
    | undefined;
  return raw ? raw.trim().toLowerCase() : null;
}

async function loadIntake(): Promise<SupabaseClient> {
  const { getIntakeClient } = await import("@/integrations/intake/client.server");
  return getIntakeClient();
}

async function writeAudit(
  intake: SupabaseClient,
  submission_id: string,
  actor_email: string | null,
  action: AuditAction,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await intake
    .from("review_audit_log")
    .insert({ submission_id, actor_email, action, metadata });
  if (error) console.warn("[ops] audit insert failed", { action, error });
}

type OperatorContext = { operatorEmail: string };

async function requireOperatorContext(
  claims: Record<string, unknown> | undefined,
  supabase: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> },
): Promise<OperatorContext> {
  const email = operatorEmailFromClaims(claims);
  if (!email) throw new Error("Forbidden: operator access required");
  // Sync allowlist fast-path; DB check is authoritative for anyone else.
  if (isOperatorEmail(email)) return { operatorEmail: email };
  const ok =
    (await hasRoleForEmail(supabase, email, "operator")) ||
    (await hasRoleForEmail(supabase, email, "admin"));
  if (!ok) throw new Error("Forbidden: operator access required");
  return { operatorEmail: email };
}

// ---------------------------------------------------------------------------
// Queue list + stats
// ---------------------------------------------------------------------------

export const listSubmissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ListSubmissionsInput.parse(input))
  .handler(async ({ data, context }) => {
    await requireOperatorContext(context.claims as Record<string, unknown> | undefined, context.supabase as unknown as Parameters<typeof requireOperatorContext>[1]);
    const intake = await loadIntake();

    let q = intake.from("roadmap_intake_review_queue").select("*");

    if (data.status === "queue") {
      q = q.in("review_status", ["needs_review", "in_review"]);
    } else if (data.status !== "all") {
      q = q.eq("review_status", data.status);
    }

    if (data.search) {
      const s = data.search.replace(/[%]/g, "");
      q = q.or(
        [
          `name.ilike.%${s}%`,
          `business.ilike.%${s}%`,
          `email.ilike.%${s}%`,
          `website.ilike.%${s}%`,
        ].join(","),
      );
    }

    q = q.order("queued_at", { ascending: data.sort === "oldest" });
    q = q.range(data.offset, data.offset + data.limit - 1);

    const { data: rows, error } = await q;
    if (error) {
      console.error("[ops.listSubmissions] failed", error);
      throw new Error("Could not load queue");
    }

    type QueueRow = {
      review_id: string;
      submission_id: string;
      review_status: ReviewStatus;
      approval_required: boolean;
      outbound_blocked: boolean;
      artifact: ReviewArtifact | null;
      queued_at: string;
      review_updated_at: string;
      name: string;
      business: string | null;
      website: string | null;
      email: string;
      submission_status: string;
      submitted_at: string;
    };

    return (rows ?? []).map((r: QueueRow) => ({
      review_id: r.review_id,
      submission_id: r.submission_id,
      review_status: r.review_status,
      name: r.name,
      business: r.business,
      website: r.website,
      email: r.email,
      submitted_at: r.submitted_at,
      review_updated_at: r.review_updated_at,
      core_signal: deriveCoreSignal(r.artifact),
    }));
  });

export const getQueueStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireOperatorContext(context.claims as Record<string, unknown> | undefined, context.supabase as unknown as Parameters<typeof requireOperatorContext>[1]);
    const intake = await loadIntake();

    async function countStatus(status: ReviewStatus, sinceISO?: string): Promise<number> {
      let q = intake
        .from("roadmap_intake_reviews")
        .select("id", { count: "exact", head: true })
        .eq("status", status);
      if (sinceISO) q = q.gte("decided_at", sinceISO);
      const { count: c, error } = await q;
      if (error) {
        console.warn("[ops.getQueueStats] count failed", { status, error });
        return 0;
      }
      return c ?? 0;
    }

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const [needs_review, in_review, approved_week, archived] = await Promise.all([
      countStatus("needs_review"),
      countStatus("in_review"),
      countStatus("approved", weekAgo),
      countStatus("archived"),
    ]);

    return { needs_review, in_review, approved_week, archived };
  });

// ---------------------------------------------------------------------------
// Submission detail
// ---------------------------------------------------------------------------

export const getSubmission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => GetSubmissionInput.parse(input))
  .handler(async ({ data, context }) => {
    const { operatorEmail } = await requireOperatorContext(context.claims as Record<string, unknown> | undefined, context.supabase as unknown as Parameters<typeof requireOperatorContext>[1]);
    const intake = await loadIntake();

    const [{ data: submission, error: sErr }, { data: review, error: rErr }] = await Promise.all([
      intake.from("intake_submissions").select("*").eq("id", data.id).maybeSingle(),
      intake.from("roadmap_intake_reviews").select("*").eq("submission_id", data.id).maybeSingle(),
    ]);
    if (sErr) {
      console.error("[ops.getSubmission] submission failed", sErr);
      throw new Error("Could not load submission");
    }
    if (rErr) console.warn("[ops.getSubmission] review fetch warned", rErr);
    if (!submission) throw new Error("Submission not found");

    const [
      { data: draft, error: dErr },
      { data: notes, error: nErr },
      { data: audit, error: aErr },
    ] = await Promise.all([
      intake.from("roadmap_drafts").select("*").eq("submission_id", data.id).maybeSingle(),
      intake
        .from("review_notes")
        .select("*")
        .eq("submission_id", data.id)
        .order("created_at", { ascending: false })
        .limit(100),
      intake
        .from("review_audit_log")
        .select("*")
        .eq("submission_id", data.id)
        .order("created_at", { ascending: false })
        .limit(200),
    ]);
    if (dErr) console.warn("[ops.getSubmission] draft warn", dErr);
    if (nErr) console.warn("[ops.getSubmission] notes warn", nErr);
    if (aErr) console.warn("[ops.getSubmission] audit warn", aErr);

    await writeAudit(intake, data.id, operatorEmail, "opened");

    return {
      submission: submission as IntakeSubmissionRow,
      review: (review ?? null) as ReviewRow | null,
      draft: (draft ?? null) as DraftRow | null,
      notes: (notes ?? []) as NoteRow[],
      audit: (audit ?? []) as AuditRow[],
    };
  });

// ---------------------------------------------------------------------------
// Status changes
// ---------------------------------------------------------------------------

async function updateReviewStatus(
  intake: SupabaseClient,
  submission_id: string,
  status: ReviewStatus,
  operatorEmail: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  const update: Record<string, unknown> = {
    status,
    reviewer_email: operatorEmail,
    updated_at: new Date().toISOString(),
    ...extra,
  };
  if (status === "approved" || status === "rejected" || status === "archived") {
    update.decided_at = new Date().toISOString();
  }
  const { error } = await intake
    .from("roadmap_intake_reviews")
    .update(update)
    .eq("submission_id", submission_id);
  if (error) {
    console.error("[ops] updateReviewStatus failed", { status, error });
    throw new Error("Could not update review status");
  }
}

export const setReviewStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SetReviewStatusInput.parse(input))
  .handler(async ({ data, context }) => {
    const { operatorEmail } = await requireOperatorContext(context.claims as Record<string, unknown> | undefined, context.supabase as unknown as Parameters<typeof requireOperatorContext>[1]);
    const intake = await loadIntake();
    const status = data.status as ReviewStatus;
    await updateReviewStatus(intake, data.id, status, operatorEmail);

    const action: AuditAction =
      status === "in_review"
        ? "marked_in_review"
        : status === "approved"
          ? "approved"
          : status === "rejected"
            ? "rejected"
            : status === "archived"
              ? "archived"
              : "opened";
    await writeAudit(intake, data.id, operatorEmail, action, { reason: data.reason || null });
    return { ok: true as const };
  });

export const archiveSubmission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ArchiveSubmissionInput.parse(input))
  .handler(async ({ data, context }) => {
    const { operatorEmail } = await requireOperatorContext(context.claims as Record<string, unknown> | undefined, context.supabase as unknown as Parameters<typeof requireOperatorContext>[1]);
    const intake = await loadIntake();
    await updateReviewStatus(intake, data.submission_id, "archived", operatorEmail);
    await writeAudit(intake, data.submission_id, operatorEmail, "archived");
    return { ok: true as const };
  });

export const reopenSubmission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ReopenSubmissionInput.parse(input))
  .handler(async ({ data, context }) => {
    const { operatorEmail } = await requireOperatorContext(context.claims as Record<string, unknown> | undefined, context.supabase as unknown as Parameters<typeof requireOperatorContext>[1]);
    const intake = await loadIntake();
    await updateReviewStatus(intake, data.submission_id, "in_review", operatorEmail, {
      decided_at: null,
    });
    await writeAudit(intake, data.submission_id, operatorEmail, "reopened");
    return { ok: true as const };
  });

export const rejectSubmission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RejectSubmissionInput.parse(input))
  .handler(async ({ data, context }) => {
    const { operatorEmail } = await requireOperatorContext(context.claims as Record<string, unknown> | undefined, context.supabase as unknown as Parameters<typeof requireOperatorContext>[1]);
    const intake = await loadIntake();
    await updateReviewStatus(intake, data.submission_id, "rejected", operatorEmail);
    await writeAudit(intake, data.submission_id, operatorEmail, "rejected", {
      reason: data.reason || null,
    });
    return { ok: true as const };
  });

// ---------------------------------------------------------------------------
// Notes & drafts
// ---------------------------------------------------------------------------

export const addNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => AddNoteInput.parse(input))
  .handler(async ({ data, context }) => {
    const { operatorEmail } = await requireOperatorContext(context.claims as Record<string, unknown> | undefined, context.supabase as unknown as Parameters<typeof requireOperatorContext>[1]);
    const intake = await loadIntake();
    const { data: inserted, error } = await intake
      .from("review_notes")
      .insert({
        submission_id: data.submission_id,
        author_email: operatorEmail,
        body: data.body,
      })
      .select("id, submission_id, author_email, body, created_at")
      .single<NoteRow>();
    if (error || !inserted) {
      console.error("[ops.addNote] failed", error);
      throw new Error("Could not save note");
    }
    await writeAudit(intake, data.submission_id, operatorEmail, "note_added", {
      preview: data.body.slice(0, 120),
    });
    return inserted;
  });

export const saveDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SaveDraftInput.parse(input))
  .handler(async ({ data, context }) => {
    const { operatorEmail } = await requireOperatorContext(context.claims as Record<string, unknown> | undefined, context.supabase as unknown as Parameters<typeof requireOperatorContext>[1]);
    const intake = await loadIntake();

    const { data: review } = await intake
      .from("roadmap_intake_reviews")
      .select("id")
      .eq("submission_id", data.submission_id)
      .maybeSingle();

    const { data: existing } = await intake
      .from("roadmap_drafts")
      .select("id, version")
      .eq("submission_id", data.submission_id)
      .maybeSingle<{ id: string; version: number }>();

    const nextVersion = (existing?.version ?? 0) + 1;
    const row = {
      submission_id: data.submission_id,
      review_id: (review as { id: string } | null)?.id ?? null,
      content: data.content as DraftContent,
      version: nextVersion,
      last_edited_by: operatorEmail,
      updated_at: new Date().toISOString(),
    };

    const { data: saved, error } = await intake
      .from("roadmap_drafts")
      .upsert(row, { onConflict: "submission_id" })
      .select("*")
      .single<DraftRow>();
    if (error || !saved) {
      console.error("[ops.saveDraft] failed", error);
      throw new Error("Could not save draft");
    }
    await writeAudit(intake, data.submission_id, operatorEmail, "draft_saved", {
      version: nextVersion,
    });
    return saved;
  });

// ---------------------------------------------------------------------------
// Approve → notify operator
// ---------------------------------------------------------------------------

export const approveSubmission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ApproveSubmissionInput.parse(input))
  .handler(async ({ data, context }) => {
    const { operatorEmail } = await requireOperatorContext(context.claims as Record<string, unknown> | undefined, context.supabase as unknown as Parameters<typeof requireOperatorContext>[1]);
    const intake = await loadIntake();

    await updateReviewStatus(intake, data.submission_id, "approved", operatorEmail);
    await writeAudit(intake, data.submission_id, operatorEmail, "approved");

    // Pull everything needed to render the operator notice.
    const [{ data: submission }, { data: review }, { data: draft }] = await Promise.all([
      intake.from("intake_submissions").select("*").eq("id", data.submission_id).maybeSingle(),
      intake.from("roadmap_intake_reviews").select("*").eq("submission_id", data.submission_id).maybeSingle(),
      intake.from("roadmap_drafts").select("*").eq("submission_id", data.submission_id).maybeSingle(),
    ]);

    if (!submission) throw new Error("Submission missing after approval");

    const draftRow = draft as DraftRow | null;
    const reviewRow = review as ReviewRow | null;
    const draftContent: Partial<DraftContent> =
      (draftRow?.content as Partial<DraftContent> | null) ??
      (await import("./ops/intake-types")).seedDraftFromArtifact(reviewRow?.artifact ?? null);

    // Pre-render the operator-notice email (the queue processor expects
    // payload.html + payload.subject directly).
    const [{ render }, { OpsApprovalNotice }, React] = await Promise.all([
      import("@react-email/render"),
      import("./email-templates/ops-approval-notice"),
      import("react"),
    ]);

    const consoleUrl = `https://trusttai.com/ops/submissions/${data.submission_id}`;
    const html = await render(
      React.createElement(OpsApprovalNotice, {
        founderName: (submission as IntakeSubmissionRow).name,
        business: (submission as IntakeSubmissionRow).business,
        founderEmail: (submission as IntakeSubmissionRow).email,
        website: (submission as IntakeSubmissionRow).website,
        consoleUrl,
        draft: draftContent,
        reviewedBy: operatorEmail,
        decidedAt: new Date().toISOString(),
      }),
    );
    const text = await render(
      React.createElement(OpsApprovalNotice, {
        founderName: (submission as IntakeSubmissionRow).name,
        business: (submission as IntakeSubmissionRow).business,
        founderEmail: (submission as IntakeSubmissionRow).email,
        website: (submission as IntakeSubmissionRow).website,
        consoleUrl,
        draft: draftContent,
        reviewedBy: operatorEmail,
        decidedAt: new Date().toISOString(),
      }),
      { plainText: true },
    );

    // Enqueue on the main Lovable Cloud Supabase project (where the email
    // queue + cron live), not on the intake project.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { ensureUnsubscribeToken } = await import("@/lib/email/unsubscribe-token.server");
    const messageId = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`) as string;
    const recipient = (process.env.OPS_NOTIFY_EMAIL ?? "tai@trusttai.com").trim().toLowerCase();
    const unsubscribeToken = await ensureUnsubscribeToken(recipient);
    const { error: enqErr } = await (
      supabaseAdmin.rpc as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ error: unknown }>
    )("enqueue_email", {
      queue_name: "transactional_emails",
      payload: {
        message_id: messageId,
        queued_at: new Date().toISOString(),
        to: recipient,
        from: "Trust Tai <noreply@trusttai.com>",
        sender_domain: "notify.trusttai.com",
        subject: `Approved · ${(submission as IntakeSubmissionRow).name}${
          (submission as IntakeSubmissionRow).business
            ? ` · ${(submission as IntakeSubmissionRow).business}`
            : ""
        }`,
        html,
        text,
        label: "ops-approval-notice",
        purpose: "transactional",
        idempotency_key: `ops-approval-${data.submission_id}`,
        unsubscribe_token: unsubscribeToken,
      },
    });
    if (enqErr) {
      console.warn("[ops.approveSubmission] notification enqueue failed", enqErr);
    } else {
      await writeAudit(intake, data.submission_id, operatorEmail, "notified_operator", {
        recipient,
        message_id: messageId,
      });
    }

    return { ok: true as const, notified: !enqErr };
  });

// ---------------------------------------------------------------------------
// History + analytics
// ---------------------------------------------------------------------------

export const listHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ListHistoryInput.parse(input))
  .handler(async ({ data, context }) => {
    await requireOperatorContext(context.claims as Record<string, unknown> | undefined, context.supabase as unknown as Parameters<typeof requireOperatorContext>[1]);
    const intake = await loadIntake();

    let q = intake.from("roadmap_intake_review_queue").select("*", { count: "exact" });
    if (data.status === "all") {
      q = q.in("review_status", ["approved", "rejected", "archived"]);
    } else {
      q = q.eq("review_status", data.status);
    }
    if (data.search) {
      const s = data.search.replace(/[%]/g, "");
      q = q.or(
        [`name.ilike.%${s}%`, `business.ilike.%${s}%`, `email.ilike.%${s}%`].join(","),
      );
    }
    q = q.order("review_updated_at", { ascending: false });
    const from = (data.page - 1) * data.page_size;
    q = q.range(from, from + data.page_size - 1);

    const { data: rows, count, error } = await q;
    if (error) {
      console.error("[ops.listHistory] failed", error);
      throw new Error("Could not load history");
    }
    return {
      rows: (rows ?? []).map((r) => ({
        review_id: r.review_id as string,
        submission_id: r.submission_id as string,
        review_status: r.review_status as ReviewStatus,
        name: r.name as string,
        business: r.business as string | null,
        email: r.email as string,
        submitted_at: r.submitted_at as string,
        review_updated_at: r.review_updated_at as string,
        core_signal: deriveCoreSignal(r.artifact as ReviewArtifact | null),
      })),
      total: count ?? 0,
      page: data.page,
      page_size: data.page_size,
    };
  });

export const getAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => AnalyticsInput.parse(input))
  .handler(async ({ data, context }) => {
    await requireOperatorContext(context.claims as Record<string, unknown> | undefined, context.supabase as unknown as Parameters<typeof requireOperatorContext>[1]);
    const intake = await loadIntake();

    // Resolve the analysis window. Explicit from/to (YYYY-MM-DD) wins over
    // range_days; "to" is inclusive so we roll to the end of that day.
    const now = Date.now();
    const explicit = data.from && data.to;
    const fromIso = explicit
      ? new Date(`${data.from}T00:00:00.000Z`).toISOString()
      : new Date(now - data.range_days * 24 * 60 * 60 * 1000).toISOString();
    const toIso = explicit
      ? new Date(`${data.to}T23:59:59.999Z`).toISOString()
      : new Date(now).toISOString();

    let reviewsQuery = intake
      .from("roadmap_intake_reviews")
      .select("status, created_at, updated_at, decided_at")
      .gte("created_at", fromIso)
      .lte("created_at", toIso);
    if (data.outcome !== "all") {
      reviewsQuery = reviewsQuery.eq("status", data.outcome);
    }

    const [
      { data: submissions, error: sErr },
      { data: reviews, error: rErr },
    ] = await Promise.all([
      intake
        .from("intake_submissions")
        .select("id, created_at, answers")
        .gte("created_at", fromIso)
        .lte("created_at", toIso)
        .order("created_at", { ascending: true }),
      reviewsQuery,
    ]);
    if (sErr) console.warn("[ops.getAnalytics] submissions warn", sErr);
    if (rErr) console.warn("[ops.getAnalytics] reviews warn", rErr);


    const totalSubmissions = submissions?.length ?? 0;
    const backlog = (reviews ?? []).filter((r) =>
      ["needs_review", "in_review"].includes(r.status as string),
    ).length;
    const approved = (reviews ?? []).filter((r) => r.status === "approved").length;
    const rejected = (reviews ?? []).filter((r) => r.status === "rejected").length;
    const decided = approved + rejected;
    const approvalRate = decided > 0 ? approved / decided : 0;

    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const deliveredThisWeek = (reviews ?? []).filter(
      (r) =>
        r.status === "approved" &&
        r.decided_at &&
        new Date(r.decided_at as string).getTime() >= weekAgo,
    ).length;

    const decisionDurations = (reviews ?? [])
      .filter((r) => r.decided_at && r.created_at)
      .map(
        (r) =>
          (new Date(r.decided_at as string).getTime() - new Date(r.created_at as string).getTime()) /
          (1000 * 60 * 60 * 24),
      );
    const avgTimeToDecisionDays =
      decisionDurations.length > 0
        ? decisionDurations.reduce((a, b) => a + b, 0) / decisionDurations.length
        : 0;

    // Daily bucket
    const byDay = new Map<string, number>();
    (submissions ?? []).forEach((s) => {
      const day = (s.created_at as string).slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + 1);
    });
    const submissionsOverTime = Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, count]) => ({ day, count }));

    // Bottleneck keywords from "the_weight" answers
    const STOP = new Set([
      "the","and","for","with","that","this","but","are","was","were","you","your","our",
      "have","has","not","its","from","into","when","where","what","why","how","there",
      "their","them","they","more","than","then","just","still","also","being","been",
      "very","really","like","some","any","all","one","two","too","get","got","off","out",
      "about","over","much","most","every","always","never","cant","don","because","while","without",
      "into","such","each","even","ever","done","need","needs","feels","keep","keeps","again","still","make","makes",
    ]);
    const wordCounts = new Map<string, number>();
    (submissions ?? []).forEach((s) => {
      const answers = (s.answers ?? []) as Array<{ key?: string; response?: string }>;
      const weight = answers.find((a) => a.key === "the_weight")?.response ?? "";
      weight
        .toLowerCase()
        .replace(/[^a-z\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 3 && !STOP.has(w))
        .forEach((w) => wordCounts.set(w, (wordCounts.get(w) ?? 0) + 1));
    });
    const topKeywords = Array.from(wordCounts.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([word, count]) => ({ word, count }));

    return {
      range_days: data.range_days,
      from: fromIso,
      to: toIso,
      outcome: data.outcome,

      totals: {
        new_submissions: totalSubmissions,
        review_backlog: backlog,
        approval_rate: approvalRate,
        avg_time_to_decision_days: avgTimeToDecisionDays,
        delivered_this_week: deliveredThisWeek,
      },
      funnel: {
        submitted: totalSubmissions,
        in_review: (reviews ?? []).filter((r) => r.status === "in_review").length,
        needs_review: (reviews ?? []).filter((r) => r.status === "needs_review").length,
        approved,
        rejected,
        archived: (reviews ?? []).filter((r) => r.status === "archived").length,
      },
      submissions_over_time: submissionsOverTime,
      top_keywords: topKeywords,
    };
  });
