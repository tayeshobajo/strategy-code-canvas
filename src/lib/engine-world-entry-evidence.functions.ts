/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Signed URL helpers for World Entry evidence uploads.
 * Bucket: world-entry-evidence (private). Path: {projectId}/{uuid}-{filename}.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdminOrOperator, type AuthCtx } from "@/lib/engine-epistemic.server";

const BUCKET = "world-entry-evidence";

const uploadInput = z.object({
  projectId: z.string().uuid(),
  fileName: z.string().trim().min(1).max(240),
  contentType: z.string().trim().max(120).optional(),
});

const pathInput = z.object({
  projectId: z.string().uuid(),
  path: z.string().trim().min(1).max(400),
});

function sanitizeName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 200);
}

export const getWorldEntryEvidenceUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => uploadInput.parse(raw))
  .handler(async ({ context, data }) => {
    const ctx = context as unknown as AuthCtx;
    await assertAdminOrOperator(ctx);
    const sb = ctx.supabase as any;
    const path = `${data.projectId}/${crypto.randomUUID()}-${sanitizeName(data.fileName)}`;
    const { data: signed, error } = await sb.storage
      .from(BUCKET)
      .createSignedUploadUrl(path);
    if (error) throw new Error(error.message);
    return {
      path,
      signedUrl: signed.signedUrl as string,
      token: signed.token as string,
      bucket: BUCKET,
    };
  });

export const getWorldEntryEvidenceDownloadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => pathInput.parse(raw))
  .handler(async ({ context, data }) => {
    const ctx = context as unknown as AuthCtx;
    await assertAdminOrOperator(ctx);
    const sb = ctx.supabase as any;
    if (!data.path.startsWith(`${data.projectId}/`)) {
      throw new Error("Path does not belong to this project.");
    }
    const { data: signed, error } = await sb.storage
      .from(BUCKET)
      .createSignedUrl(data.path, 300);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl as string };
  });

export const deleteWorldEntryEvidenceFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => pathInput.parse(raw))
  .handler(async ({ context, data }) => {
    const ctx = context as unknown as AuthCtx;
    await assertAdminOrOperator(ctx);
    const sb = ctx.supabase as any;
    if (!data.path.startsWith(`${data.projectId}/`)) {
      throw new Error("Path does not belong to this project.");
    }
    const { error } = await sb.storage.from(BUCKET).remove([data.path]);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
