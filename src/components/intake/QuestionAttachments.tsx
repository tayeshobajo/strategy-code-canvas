/**
 * QuestionAttachments — compact upload strip rendered under each intake
 * question. Lets the user attach an image/file or record a voice note that
 * gets scoped to the current question via `question_id` on the attachment
 * row. Uploads flow through the intake-uploads bucket + server fns.
 *
 * Renders inline previews for images (thumbnail), audio (mini player),
 * video (small player) and docs (icon + filename). All previews use short-
 * lived signed URLs since the intake-uploads bucket is private.
 *
 * Upload UX:
 *   - Per-file progress bar (XHR upload events).
 *   - Cancel button aborts an in-flight upload.
 *   - Retry button re-runs a failed upload with the same file.
 *   - Replace button on a completed attachment (removes the old row and
 *     starts a fresh upload with a newly picked file).
 *   - Remove button deletes an attachment.
 *
 * Validation surfaced in the UI:
 *   - remaining slots (X of 3), respects in-flight uploads
 *   - max file size (25 MB)
 *   - allowed types (image, audio, video, docs)
 *   - inline per-file errors
 */
import * as React from "react";
import {
  FileText,
  Film,
  ImageIcon,
  Loader2,
  Music,
  Paperclip,
  RefreshCw,
  RotateCcw,
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

function validateFile(file: File, currentCount: number): string | null {
  if (file.size === 0) return "File is empty.";
  if (file.size > MAX_BYTES) {
    return `“${file.name}” is ${fmtBytes(file.size)} — over the 25 MB limit.`;
  }
  const ext = extOf(file.name);
  if (ext && !ALLOWED_EXT.has(ext)) return `".${ext}" files aren't allowed here.`;
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

/** Upload a file to Supabase Storage with progress + abort via XHR. */
function uploadToStorage(opts: {
  path: string;
  file: File;
  onProgress: (pct: number) => void;
  signal: AbortSignal;
}): Promise<void> {
  return new Promise(async (resolve, reject) => {
    const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
    const SUPABASE_PUBLISHABLE_KEY = import.meta.env
      .VITE_SUPABASE_PUBLISHABLE_KEY as string;
    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
      reject(new Error("Storage endpoint not configured"));
      return;
    }
    // Prefer the current session token so RLS runs as the signed-in user;
    // fall back to publishable/anon key for guest intake flows.
    let bearer = SUPABASE_PUBLISHABLE_KEY;
    try {
      const { data } = await supabase.auth.getSession();
      if (data.session?.access_token) bearer = data.session.access_token;
    } catch {
      /* keep anon */
    }

    const url = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${opts.path}`;
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);
    xhr.setRequestHeader("apikey", SUPABASE_PUBLISHABLE_KEY);
    xhr.setRequestHeader("Authorization", `Bearer ${bearer}`);
    xhr.setRequestHeader("x-upsert", "false");
    if (opts.file.type) xhr.setRequestHeader("Content-Type", opts.file.type);
    xhr.setRequestHeader("Cache-Control", "3600");

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        opts.onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        opts.onProgress(100);
        resolve();
      } else {
        let msg = `Upload failed (${xhr.status})`;
        try {
          const parsed = JSON.parse(xhr.responseText) as { message?: string };
          if (parsed?.message) msg = parsed.message;
        } catch { /* ignore */ }
        reject(new Error(msg));
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.onabort = () => reject(new DOMException("Upload cancelled", "AbortError"));

    if (opts.signal.aborted) {
      reject(new DOMException("Upload cancelled", "AbortError"));
      return;
    }
    opts.signal.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(opts.file);
  });
}

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

type InFlight = {
  id: string;
  file: File;
  progress: number;
  status: "uploading" | "error";
  error: string | null;
  abort: AbortController;
};

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className="h-full bg-primary transition-[width] duration-150"
        style={{ width: `${Math.max(4, Math.min(100, pct))}%` }}
      />
    </div>
  );
}

function InFlightTile({
  item,
  onCancel,
  onRetry,
  onDismiss,
}: {
  item: InFlight;
  onCancel: () => void;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  const ext = extOf(item.file.name);
  const k = kindOf(item.file.type || null, ext);
  return (
    <li className="flex w-[168px] flex-col overflow-hidden rounded-lg border border-border/60 bg-muted/30">
      <div className="flex h-24 w-full flex-col items-center justify-center gap-2 bg-muted/50 px-3">
        {item.status === "uploading" ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <ProgressBar pct={item.progress} />
            <span className="text-[10px] text-muted-foreground">
              {item.progress}%
            </span>
          </>
        ) : (
          <>
            <span className="text-[10px] font-medium text-destructive">
              Upload failed
            </span>
            <span
              className="line-clamp-2 text-center text-[10px] text-muted-foreground"
              title={item.error ?? undefined}
            >
              {item.error ?? "Something went wrong"}
            </span>
          </>
        )}
      </div>
      <div className="flex items-center gap-1 px-2 py-1.5 text-[11px]">
        <span className="text-muted-foreground">{kindIcon(k)}</span>
        <span
          className="flex-1 truncate text-foreground/80"
          title={item.file.name}
        >
          {item.file.name}
        </span>
        {item.status === "uploading" ? (
          <button
            type="button"
            onClick={onCancel}
            className="rounded p-0.5 text-muted-foreground hover:text-foreground"
            aria-label={`Cancel upload of ${item.file.name}`}
            title="Cancel upload"
          >
            <X className="h-3 w-3" />
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={onRetry}
              className="rounded p-0.5 text-muted-foreground hover:text-foreground"
              aria-label={`Retry ${item.file.name}`}
              title="Retry upload"
            >
              <RotateCcw className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className="rounded p-0.5 text-muted-foreground hover:text-foreground"
              aria-label={`Dismiss ${item.file.name}`}
              title="Dismiss"
            >
              <X className="h-3 w-3" />
            </button>
          </>
        )}
      </div>
    </li>
  );
}

function AttachmentPreview({
  att,
  onRemove,
  onReplace,
  removing,
  replacing,
}: {
  att: QuestionAttachmentRecord;
  onRemove: () => void;
  onReplace: () => void;
  removing: boolean;
  replacing: boolean;
}) {
  const ext = extOf(att.filename);
  const k = att.kind ?? kindOf(att.mime, ext);
  const url = useSignedUrl(att.storage_path);
  const busy = removing || replacing;

  return (
    <li className="group relative flex w-[168px] flex-col overflow-hidden rounded-lg border border-border/60 bg-muted/30">
      <div className="relative flex h-24 w-full items-center justify-center overflow-hidden bg-muted/50">
        {k === "image" && url ? (
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
        <div className="absolute right-1 top-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <button
            type="button"
            className="rounded-full bg-background/80 p-1 text-muted-foreground shadow-sm hover:text-foreground disabled:opacity-40"
            onClick={onReplace}
            disabled={busy}
            aria-label={`Replace ${att.filename}`}
            title="Replace"
          >
            {replacing ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
          </button>
          <button
            type="button"
            className="rounded-full bg-background/80 p-1 text-muted-foreground shadow-sm hover:text-foreground disabled:opacity-40"
            onClick={onRemove}
            disabled={busy}
            aria-label={`Remove ${att.filename}`}
            title="Remove"
          >
            {removing ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <X className="h-3 w-3" />
            )}
          </button>
        </div>
      </div>
      <div className="flex items-center gap-1 px-2 py-1.5 text-[11px]">
        <span className="text-muted-foreground">{kindIcon(k)}</span>
        <span className="flex-1 truncate text-foreground/80" title={att.filename}>
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
  const replaceInputRef = React.useRef<HTMLInputElement | null>(null);
  const replaceTargetRef = React.useRef<string | null>(null);

  const [describing, setDescribing] = React.useState<string | null>(null);
  const [removing, setRemoving] = React.useState<string | null>(null);
  const [replacing, setReplacing] = React.useState<string | null>(null);
  const [inFlight, setInFlight] = React.useState<InFlight[]>([]);
  const [validationError, setValidationError] = React.useState<string | null>(null);

  const mine = React.useMemo(
    () => attachments.filter((a) => (a.question_id ?? null) === questionId),
    [attachments, questionId],
  );

  const activeInFlight = inFlight.filter((i) => i.status === "uploading").length;
  const totalUsed = mine.length + activeInFlight;
  const atCap = totalUsed >= PER_QUESTION_CAP;
  const remaining = Math.max(0, PER_QUESTION_CAP - totalUsed);

  const updateInFlight = React.useCallback(
    (id: string, patch: Partial<InFlight>) => {
      setInFlight((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    },
    [],
  );

  const runUpload = React.useCallback(
    async (id: string, file: File) => {
      try {
        const token = await ensureResumeToken();
        const cleaned = file.name.replace(/[^\w.\- ]+/g, "_").slice(0, 180);
        const qslug = questionId.replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, 64) || "q";
        const path = `${token}/q/${qslug}/${crypto.randomUUID()}-${cleaned}`;

        // Fresh abort controller per attempt so retry works after cancel/error.
        const abort = new AbortController();
        updateInFlight(id, { abort, status: "uploading", error: null, progress: 0 });

        await uploadToStorage({
          path,
          file,
          signal: abort.signal,
          onProgress: (pct) => updateInFlight(id, { progress: pct }),
        });

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
        const next = (res?.attachments ?? []) as QuestionAttachmentRecord[];
        onChange(next);
        setInFlight((prev) => prev.filter((i) => i.id !== id));

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
              next.map((a) =>
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
        if (e instanceof DOMException && e.name === "AbortError") {
          setInFlight((prev) => prev.filter((i) => i.id !== id));
          return;
        }
        const msg = e instanceof Error ? e.message : "Upload failed";
        updateInFlight(id, { status: "error", error: msg });
        toast.error(msg);
      }
    },
    [ensureResumeToken, onChange, onEvidence, questionId, updateInFlight],
  );

  const startUpload = React.useCallback(
    (file: File) => {
      const err = validateFile(file, totalUsed);
      if (err) {
        setValidationError(err);
        toast.error(err);
        return;
      }
      setValidationError(null);
      const id = crypto.randomUUID();
      const item: InFlight = {
        id,
        file,
        progress: 0,
        status: "uploading",
        error: null,
        abort: new AbortController(),
      };
      setInFlight((prev) => [...prev, item]);
      void runUpload(id, file);
    },
    [runUpload, totalUsed],
  );

  const cancelInFlight = React.useCallback((id: string) => {
    setInFlight((prev) => {
      const target = prev.find((i) => i.id === id);
      target?.abort.abort();
      return prev;
    });
  }, []);

  const retryInFlight = React.useCallback(
    (id: string) => {
      const target = inFlight.find((i) => i.id === id);
      if (!target) return;
      void runUpload(id, target.file);
    },
    [inFlight, runUpload],
  );

  const dismissInFlight = React.useCallback((id: string) => {
    setInFlight((prev) => prev.filter((i) => i.id !== id));
  }, []);

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

  const requestReplace = React.useCallback((path: string) => {
    replaceTargetRef.current = path;
    replaceInputRef.current?.click();
  }, []);

  const handleReplacePicked = React.useCallback(
    async (file: File) => {
      const targetPath = replaceTargetRef.current;
      replaceTargetRef.current = null;
      if (!targetPath || !resumeToken) return;
      // Replace does not count against the cap: we free the slot first.
      const err = validateFile(file, totalUsed - 1);
      if (err) {
        setValidationError(err);
        toast.error(err);
        return;
      }
      setReplacing(targetPath);
      try {
        const mod = await import("@/lib/intake.functions");
        const res = await mod.removeIntakeAttachment({
          data: { resume_token: resumeToken, storage_path: targetPath },
        });
        onChange((res?.attachments ?? []) as QuestionAttachmentRecord[]);
        startUpload(file);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Replace failed");
      } finally {
        setReplacing(null);
      }
    },
    [onChange, resumeToken, startUpload, totalUsed],
  );

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
            if (f) startUpload(f);
            if (inputRef.current) inputRef.current.value = "";
          }}
        />
        <input
          ref={replaceInputRef}
          type="file"
          className="hidden"
          accept={ACCEPT_ATTR}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleReplacePicked(f);
            if (replaceInputRef.current) replaceInputRef.current.value = "";
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={atCap}
          onClick={() => inputRef.current?.click()}
          className="gap-2"
          title="Attach an image, document, or clip to this answer"
        >
          <Paperclip className="h-3.5 w-3.5" />
          Attach
        </Button>
        <VoiceRecorder
          disabled={atCap}
          onRecorded={async (f) => { startUpload(f); }}
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
        <p role="alert" className="text-[11px] text-destructive">
          {validationError}
        </p>
      )}

      {(mine.length > 0 || inFlight.length > 0) && (
        <ul className="flex flex-wrap gap-2">
          {mine.map((a) => (
            <AttachmentPreview
              key={a.storage_path}
              att={a}
              removing={removing === a.storage_path}
              replacing={replacing === a.storage_path}
              onRemove={() => void remove(a.storage_path)}
              onReplace={() => requestReplace(a.storage_path)}
            />
          ))}
          {inFlight.map((i) => (
            <InFlightTile
              key={i.id}
              item={i}
              onCancel={() => cancelInFlight(i.id)}
              onRetry={() => retryInFlight(i.id)}
              onDismiss={() => dismissInFlight(i.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
