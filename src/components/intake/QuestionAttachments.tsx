/**
 * QuestionAttachments — compact upload strip rendered under each intake
 * question. Lets the user attach an image/file or record a voice note that
 * gets scoped to the current question via `question_id` on the attachment
 * row. Uploads flow through the same intake-uploads bucket + server fns as
 * the review-step attachments.
 *
 * When a media file (image or audio) uploads successfully, we call
 * describeIntakeMedia so Trust Tai's evidence extractor sees what was
 * shared. The summary text is returned to the parent via onEvidence so the
 * planner can bump coverage scores without re-asking.
 */
import * as React from "react";
import { Loader2, Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { VoiceRecorder } from "./VoiceRecorder";

const BUCKET = "intake-uploads";
const MAX_BYTES = 25 * 1024 * 1024;
const PER_QUESTION_CAP = 3;

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

  const mine = React.useMemo(
    () => attachments.filter((a) => (a.question_id ?? null) === questionId),
    [attachments, questionId],
  );

  const upload = React.useCallback(
    async (file: File) => {
      if (file.size === 0) return toast.error("File is empty");
      if (file.size > MAX_BYTES) return toast.error("File exceeds 25 MB limit");
      const ext = extOf(file.name);
      if (ext && !ALLOWED_EXT.has(ext)) return toast.error(`".${ext}" files aren't allowed`);
      if (mine.length >= PER_QUESTION_CAP) {
        return toast.error(`Up to ${PER_QUESTION_CAP} attachments per question`);
      }
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
        const k = kindOf(file.type || null, ext);
        if (k === "image" || k === "audio") {
          setDescribing(path);
          try {
            const media = await import("@/lib/intake-media.functions");
            const out = await media.describeIntakeMedia({
              data: { resume_token: token, storage_path: path },
            });
            if (out?.summary && onEvidence) onEvidence(out.summary);
            // Re-fetch by mutating locally — the server has already stored the summary.
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
        toast.error(e instanceof Error ? e.message : "Upload failed");
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
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Remove failed");
      } finally {
        setRemoving(null);
      }
    },
    [onChange, resumeToken],
  );

  const busy = uploading || describing !== null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.txt,.md,.rtf"
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
        disabled={busy || mine.length >= PER_QUESTION_CAP}
        onClick={() => inputRef.current?.click()}
        className="gap-2"
        title="Attach an image, document, or clip to this answer"
      >
        {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
        Attach
      </Button>
      <VoiceRecorder
        disabled={busy || mine.length >= PER_QUESTION_CAP}
        onRecorded={upload}
      />
      {describing && (
        <span className="inline-flex items-center gap-1 text-[11px]">
          <Loader2 className="h-3 w-3 animate-spin" /> reading attachment…
        </span>
      )}
      {mine.length > 0 && (
        <ul className="flex flex-wrap items-center gap-2">
          {mine.map((a) => (
            <li
              key={a.storage_path}
              className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-2 py-1"
            >
              <span className="max-w-[180px] truncate text-foreground/80" title={a.filename}>
                {a.filename}
              </span>
              <span className="text-[10px] text-muted-foreground">{fmtBytes(a.size)}</span>
              <button
                type="button"
                className="ml-0.5 text-muted-foreground hover:text-foreground disabled:opacity-40"
                onClick={() => void remove(a.storage_path)}
                disabled={removing === a.storage_path}
                aria-label={`Remove ${a.filename}`}
              >
                {removing === a.storage_path ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <X className="h-3 w-3" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
