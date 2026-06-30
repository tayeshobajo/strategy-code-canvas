import { z } from "zod";
import { REVIEW_STATUSES } from "./intake-types";

const UUID = z.string().uuid();

export const ListSubmissionsInput = z.object({
  status: z.enum(["needs_review", "in_review", "approved", "rejected", "archived", "all", "queue"]).default("queue"),
  search: z.string().trim().max(200).optional().default(""),
  sort: z.enum(["oldest", "newest"]).default("oldest"),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});

export const GetSubmissionInput = z.object({ id: UUID });

export const SetReviewStatusInput = z.object({
  id: UUID,
  status: z.enum([...REVIEW_STATUSES] as [string, ...string[]]),
  reason: z.string().trim().max(500).optional().default(""),
});

export const AddNoteInput = z.object({
  submission_id: UUID,
  body: z.string().trim().min(1).max(4000),
});

const DraftContentSchema = z
  .object({
    situation_summary: z.string().max(8000).optional().default(""),
    core_constraint: z.string().max(8000).optional().default(""),
    strategic_diagnosis: z.string().max(8000).optional().default(""),
    first_moves: z.string().max(8000).optional().default(""),
    ninety_day_sequence: z.string().max(8000).optional().default(""),
    risks: z.string().max(8000).optional().default(""),
    recommended_engagement: z.string().max(8000).optional().default(""),
    next_step: z.string().max(8000).optional().default(""),
  })
  .strict();

export const SaveDraftInput = z.object({
  submission_id: UUID,
  content: DraftContentSchema,
});

export const ApproveSubmissionInput = z.object({ submission_id: UUID });
export const RejectSubmissionInput = z.object({
  submission_id: UUID,
  reason: z.string().trim().max(1000).optional().default(""),
});
export const ArchiveSubmissionInput = z.object({ submission_id: UUID });
export const ReopenSubmissionInput = z.object({ submission_id: UUID });

export const ListHistoryInput = z.object({
  status: z.enum(["approved", "rejected", "archived", "all"]).default("all"),
  search: z.string().trim().max(200).optional().default(""),
  page: z.number().int().min(1).default(1),
  page_size: z.number().int().min(1).max(100).default(25),
});

export const AnalyticsInput = z.object({
  range_days: z.number().int().min(1).max(365).default(30),
});
