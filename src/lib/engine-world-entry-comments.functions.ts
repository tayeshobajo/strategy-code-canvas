/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Reviewer comments for the World Entry workspace.
 * Per-section threads (destination | competitors | vocabulary | evidence | general),
 * resolvable, reopen-able, with @mention extraction.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdminOrOperator, type AuthCtx } from "@/lib/engine-epistemic.server";
import { insertEngineActivity } from "@/lib/engine-activity";
import { notifyOperators } from "@/lib/engine-work-notify";

export type WorldEntrySection =
  | "destination"
  | "competitors"
  | "vocabulary"
  | "evidence"
  | "general";

export type WorldEntryComment = {
  id: string;
  project_id: string;
  section: WorldEntrySection;
  world_entry_version: number;
  parent_id: string | null;
  body: string;
  author_email: string;
  mentions: string[];
  resolved: boolean;
  resolved_by_email: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

const sectionSchema = z.enum([
  "destination",
  "competitors",
  "vocabulary",
  "evidence",
  "general",
]);

const listInput = z.object({ projectId: z.string().uuid() });

const createInput = z.object({
  projectId: z.string().uuid(),
  section: sectionSchema,
  worldEntryVersion: z.number().int().nonnegative(),
  body: z.string().trim().min(1).max(4000),
  parentId: z.string().uuid().nullable().optional(),
});

const idInput = z.object({
  projectId: z.string().uuid(),
  commentId: z.string().uuid(),
});

const resolveInput = idInput.extend({ resolved: z.boolean() });

const MENTION_RE = /(?:^|\s)@([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
export function extractMentions(body: string): string[] {
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = MENTION_RE.exec(body))) out.add(m[1].toLowerCase());
  return Array.from(out);
}

export const listWorldEntryComments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => listInput.parse(raw))
  .handler(async ({ context, data }): Promise<WorldEntryComment[]> => {
    const ctx = context as unknown as AuthCtx;
    const sb = ctx.supabase as any;
    const { data: rows, error } = await sb
      .from("engine_world_entry_comments")
      .select("*")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (rows ?? []) as WorldEntryComment[];
  });

export const createWorldEntryComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => createInput.parse(raw))
  .handler(async ({ context, data }): Promise<WorldEntryComment> => {
    const ctx = context as unknown as AuthCtx;
    const actor = await assertAdminOrOperator(ctx);
    const sb = ctx.supabase as any;
    const mentions = extractMentions(data.body);
    const { data: row, error } = await sb
      .from("engine_world_entry_comments")
      .insert({
        project_id: data.projectId,
        section: data.section,
        world_entry_version: data.worldEntryVersion,
        parent_id: data.parentId ?? null,
        body: data.body,
        author_email: actor,
        mentions,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    await insertEngineActivity(sb, {
      project_id: data.projectId,
      kind: "world_entry.comment.created",
      title: `Comment on World Entry · ${data.section}`,
      body: data.body.slice(0, 200),
      severity: "info",
      actor_email: actor,
    });

    // Fanout: notify @mentioned users and the parent comment author (reply).
    const recipients = new Set<string>(mentions.map((m) => m.toLowerCase()));
    if (data.parentId) {
      const { data: parent } = await sb
        .from("engine_world_entry_comments")
        .select("author_email")
        .eq("id", data.parentId)
        .maybeSingle();
      const parentAuthor = parent?.author_email as string | undefined;
      if (parentAuthor) recipients.add(parentAuthor.toLowerCase());
    }
    recipients.delete(actor.toLowerCase());

    const href = `/engine/projects/${data.projectId}/world-entry`;
    const preview = data.body.slice(0, 200);
    for (const recipient of recipients) {
      const isMention = mentions.map((m) => m.toLowerCase()).includes(recipient);
      await notifyOperators(sb, {
        projectId: data.projectId,
        kind: isMention
          ? "world_entry.comment.mention"
          : "world_entry.comment.reply",
        title: isMention
          ? `${actor} mentioned you on World Entry · ${data.section}`
          : `${actor} replied on World Entry · ${data.section}`,
        body: preview,
        href,
        actor,
        extra: {
          recipient_email: recipient,
          comment_id: (row as { id: string }).id,
          section: data.section,
          parent_id: data.parentId ?? null,
        },
      });
    }
    return row as WorldEntryComment;
  });

export const setWorldEntryCommentResolved = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => resolveInput.parse(raw))
  .handler(async ({ context, data }): Promise<WorldEntryComment> => {
    const ctx = context as unknown as AuthCtx;
    const actor = await assertAdminOrOperator(ctx);
    const sb = ctx.supabase as any;
    const patch = data.resolved
      ? {
          resolved: true,
          resolved_by_email: actor,
          resolved_at: new Date().toISOString(),
        }
      : { resolved: false, resolved_by_email: null, resolved_at: null };
    const { data: row, error } = await sb
      .from("engine_world_entry_comments")
      .update(patch)
      .eq("id", data.commentId)
      .eq("project_id", data.projectId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row as WorldEntryComment;
  });

export const deleteWorldEntryComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => idInput.parse(raw))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const ctx = context as unknown as AuthCtx;
    await assertAdminOrOperator(ctx);
    const sb = ctx.supabase as any;
    const { error } = await sb
      .from("engine_world_entry_comments")
      .delete()
      .eq("id", data.commentId)
      .eq("project_id", data.projectId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
