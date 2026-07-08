/**
 * QuestionAttachments — compact upload strip rendered under each intake
 * question. Lets the user attach an image/file or record a voice note that
 * gets scoped to the current question via `question_id` on the attachment
 * row. Uploads flow through the same intake-uploads bucket + server fns as
 * the review-step attachments.
 *
 * Renders inline previews for images (thumbnail), audio (mini player),
 * video (small player) and docs (icon + filename). All previews use short-
 * lived signed URLs since the intake-uploads bucket is private.
 *
 * Validation surfaced in the UI:
 *   - remaining slots (X / 3)
 *   - max file size (25 MB)
 *   - allowed types (image, audio, video, docs)
 *   - inline per-file errors (empty, too large, wrong type, cap reached)
 */
import * as React from "react";
import {
  FileText,
  Film,
  ImageIcon,
  Loader2,
  Music,
  Paperclip,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { VoiceRecorder } from "./VoiceRecorder";

const BUCKET = "intake-uploads";
const MAX_BYTES = 25 * 1024 * 1024;
const PER_QUESTION_CAP = 3;
const PREVIEW_TTL = 60 * 10; // 10 min signed URL

export type QuestionAttachmentRecord = {
  storage_path: string;
  filename: string;
  size: number;
  mime: string | null;
  question_id?: string | null;
  kind?: "image" | "audio" | "video" | "doc";
  summary?: string | null;
};

// Extensions accepted for in-conversation attachments. Kept looser than the
// review-step doc list to allow media; the server re-validates.
const ALLOWED_EXT = new Set([
  "png","jpg","jpeg","gif","webp","heic","svg",
  "pdf","doc","docx","txt","md","rtf",
  "mp3","wav","m4a","ogg","webm","mp4","mov",
]);

const ACCEPT_ATTR = "image/*,audio/*,video/*,.pdf,.doc,.docx,.txt,.md,.rtf";

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i < 0 ? "" : name.slice(i + 1).toLowerCase();
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function kindOf(mime: string | null, ext: string): "image" | "audio" | "video" | "doc" {
  const m = (mime ?? "").toLowerCase();
  if (m.startsWith("image/") || ["png","jpg","jpeg","gif","webp","heic","svg"].includes(ext)) return "image";
  if (m.startsWith("audio/") || ["mp3","wav","m4a","ogg"].includes(ext) || (ext === "webm" && m.startsWith("audio"))) return "audio";
  if (m.startsWith("video/") || ["mp4","mov"].includes(ext)) return "video";
  return "doc";
}

/**
 * Client-side validation. Returns an error message when rejected, or null
 * when the file can be attempted (server still re-validates authoritatively).
 */
function validateFile(
  file: File,
  currentCount: number,
): string | null {
  if (file.size === 0) return "File is empty.";
  if (file.size > MAX_BYTES) {
    return `“${file.name}” is ${fmtBytes(file.size)} — over the 25 MB limit.`;
  }
  const ext = extOf(file.name);
  if (ext && !ALLOWED_EXT.has(ext)) {
    return `".${ext}" files aren't allowed here.`;
  }
  if (currentCount >= PER_QUESTION_CAP) {
    return `You can attach up to ${PER_QUESTION_CAP} files per question.`;
  }
  return null;
}

function kindIcon(k: "image" | "audio" | "video" | "doc") {
  const cls = "h-3.5 w-3.5";
  if (k === "image") return <ImageIcon className={cls} />;
  if (k === "audio") return <Music className={cls} />;
  if (k === "video") return <Film className={cls} />;
  return <FileText className={cls} />;
}

/**
 * Hook: resolve a short-lived signed URL for a private-bucket object.
 * Refreshes on storage_path change; silently ignores errors (the tile still
 * renders with filename + kind).
 */
function useSignedUrl(storagePath: string | null): string | null {
  const [url, setUrl] = React.useState<string | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    setUrl(null);
    if (!storagePath) return;
    (async () => {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(storagePath, PREVIEW_TTL);
      if (cancelled) return;
      if (error || !data?.signedUrl) return;
      setUrl(data.signedUrl);
    })();
    return () => { cancelled = true; };
  }, [storagePath]);
  return url;
}

function AttachmentPreview({
  att,
  onRemove,
  removing,
}: {
  att: QuestionAttachmentRecord;
  onRemove: () => void;
  removing: boolean;
}) {
  const ext = extOf(att.filename);
  const k = att.kind ?? kindOf(att.mime, ext);
  const url = useSignedUrl(att.storage_path);

  return (
    <li className="group relative flex w-[168px] flex-col overflow-hidden rounded-lg border border-border/60 bg-muted/30">
      <div className="relative flex h-24 w-full items-center justify-center overflow-hidden bg-muted/50">
        {k === "image" && url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={att.filename}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : k === "video" && url ? (
          <video
            src={url}
            className="h-full w-full object-cover"
            muted
            playsInline
            preload="metadata"
          />
        ) : k === "audio" ? (
          <div className="flex h-full w-full items-center justify-center px-2">
            {url ? (
              <audio src={url} controls className="h-8 w-full" preload="metadata" />
            ) : (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground">
            <FileText className="h-6 w-6" />
            <span className="text-[10px] uppercase tracking-wide">
              {ext || "file"}
            </span>
          </div>
        )}
        <button
          type="button"
          className="absolute right-1 top-1 rounded-full bg-background/80 p-0.5 text-muted-foreground opacity-0 shadow-sm transition-opacity hover:text-foreground group-hover:opacity-100 focus:opacity-100 disabled:opacity-40"
          onClick={onRemove}
          disabled={removing}
          aria-label={`Remove ${att.filename}`}
        >
          {removing ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <X className="h-3 w-3" />
          )}
        </button>
      </div>
      <div className="flex items-center gap-1 px-2 py-1.5 text-[11px]">
        <span className="text-muted-foreground">{kindIcon(k)}</span>
        <span
          className="flex-1 truncate text-foreground/80"
          title={att.filename}
        >
          {att.filename}
        </span>
        <span className="shrink-0 text-[10px] text-muted-foreground">
          {fmtBytes(att.size)}
        </span>
      </div>
    </li>
  );
}

export function QuestionAttachments({
  questionId,
  resumeToken,
  ensureResumeToken,
  attachments,
  onChange,
  onEvidence,
}: {
  questionId: string;
  resumeToken: string | null;
  ensureResumeToken: () => Promise<string>;
  attachments: QuestionAttachmentRecord[];
  onChange: (next: QuestionAttachmentRecord[]) => void;
  onEvidence?: (summary: string) => void;
}) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [describing, setDescribing] = React.useState<string | null>(null);
  const [removing, setRemoving] = React.useState<string | null>(null);
  const [validationError, setValidationError] = React.useState<string | null>(null);

  const mine = React.useMemo(
    () => attachments.filter((a) => (a.question_id ?? null) === questionId),
    [attachments, questionId],
  );

  const atCap = mine.length >= PER_QUESTION_CAP;

  const upload = React.useCallback(
    async (file: File) => {
      const err = validateFile(file, mine.length);
      if (err) {
        setValidationError(err);
        toast.error(err);
        return;
      }
      setValidationError(null);
      setUploading(true);
      try {
        const token = await ensureResumeToken();
        const cleaned = file.name.replace(/[^\w.\- ]+/g, "_").slice(0, 180);
        const qslug = questionId.replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, 64) || "q";
        const path = `${token}/q/${qslug}/${crypto.randomUUID()}-${cleaned}`;
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, file, { upsert: false, contentType: file.type || undefined });
        if (upErr) throw upErr;
        const mod = await import("@/lib/intake.functions");
        const res = await mod.recordIntakeAttachment({
          data: {
            resume_token: token,
            storage_path: path,
            filename: file.name,
            size: file.size,
            mime: file.type || null,
            question_id: qslug,
          },
        });
        onChange((res?.attachments ?? []) as QuestionAttachmentRecord[]);

        // Fire-and-forget evidence extraction for images + voice notes.
        const ext = extOf(file.name);
        const k = kindOf(file.type || null, ext);
        if (k === "image" || k === "audio") {
          setDescribing(path);
          try {
            const media = await import("@/lib/intake-media.functions");
            const out = await media.describeIntakeMedia({
              data: { resume_token: token, storage_path: path },
            });
            if (out?.summary && onEvidence) onEvidence(out.summary);
            onChange(
              ((res?.attachments ?? []) as QuestionAttachmentRecord[]).map((a) =>
                a.storage_path === path ? { ...a, summary: out?.summary ?? null } : a,
              ),
            );
          } catch (err) {
            console.warn("[intake-media] describe failed (silent)", err);
          } finally {
            setDescribing(null);
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Upload failed";
        setValidationError(msg);
        toast.error(msg);
      } finally {
        setUploading(false);
      }
    },
    [ensureResumeToken, mine.length, onChange, onEvidence, questionId],
  );

  const remove = React.useCallback(
    async (path: string) => {
      if (!resumeToken) return;
      setRemoving(path);
      try {
        const mod = await import("@/lib/intake.functions");
        const res = await mod.removeIntakeAttachment({
          data: { resume_token: resumeToken, storage_path: path },
        });
        onChange((res?.attachments ?? []) as QuestionAttachmentRecord[]);
        setValidationError(null);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Remove failed");
      } finally {
        setRemoving(null);
      }
    },
    [onChange, resumeToken],
  );

  const busy = uploading || describing !== null;
  const remaining = Math.max(0, PER_QUESTION_CAP - mine.length);

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept={ACCEPT_ATTR}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
            if (inputRef.current) inputRef.current.value = "";
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={busy || atCap}
          onClick={() => inputRef.current?.click()}
          className="gap-2"
          title="Attach an image, document, or clip to this answer"
        >
          {uploading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Paperclip className="h-3.5 w-3.5" />
          )}
          Attach
        </Button>
        <VoiceRecorder
          disabled={busy || atCap}
          onRecorded={async (f) => { await upload(f); }}
        />
        <span className="text-[11px]">
          {atCap ? (
            <span className="text-amber-600 dark:text-amber-400">
              Max {PER_QUESTION_CAP} files reached
            </span>
          ) : (
            <>
              {remaining} of {PER_QUESTION_CAP} left · up to 25 MB · images,
              audio, video, PDF/DOC
            </>
          )}
        </span>
        {describing && (
          <span className="inline-flex items-center gap-1 text-[11px]">
            <Loader2 className="h-3 w-3 animate-spin" /> reading attachment…
          </span>
        )}
      </div>

      {validationError && (
        <p
          role="alert"
          className="text-[11px] text-destructive"
        >
          {validationError}
        </p>
      )}

      {mine.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {mine.map((a) => (
            <AttachmentPreview
              key={a.storage_path}
              att={a}
              removing={removing === a.storage_path}
              onRemove={() => void remove(a.storage_path)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
