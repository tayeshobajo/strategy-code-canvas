import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, MessageSquare, RotateCcw, Send, Trash2 } from "lucide-react";
import {
  createWorldEntryComment,
  deleteWorldEntryComment,
  listWorldEntryComments,
  setWorldEntryCommentResolved,
  type WorldEntryComment,
  type WorldEntrySection,
} from "@/lib/engine-world-entry-comments.functions";

type Props = {
  projectId: string;
  section: WorldEntrySection;
  worldEntryVersion: number;
  currentUserEmail?: string;
  compact?: boolean;
};

const SECTION_LABEL: Record<WorldEntrySection, string> = {
  destination: "Industry destination",
  competitors: "Competitor review",
  vocabulary: "Category vocabulary",
  evidence: "Evidence",
  general: "General",
};

export function WorldEntryCommentsThread({
  projectId,
  section,
  worldEntryVersion,
  currentUserEmail,
  compact,
}: Props) {
  const qc = useQueryClient();
  const listFn = useServerFn(listWorldEntryComments);
  const createFn = useServerFn(createWorldEntryComment);
  const resolveFn = useServerFn(setWorldEntryCommentResolved);
  const deleteFn = useServerFn(deleteWorldEntryComment);

  const key = ["engine", "world-entry-comments", projectId] as const;
  const { data: all } = useQuery({
    queryKey: key,
    queryFn: () => listFn({ data: { projectId } }),
    staleTime: 10_000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: key });

  const comments = useMemo(
    () => (all ?? []).filter((c) => c.section === section),
    [all, section],
  );

  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<WorldEntryComment | null>(null);
  const createMut = useMutation({
    mutationFn: async () => {
      const text = body.trim();
      if (!text) return;
      await createFn({
        data: {
          projectId,
          section,
          worldEntryVersion,
          body: text,
          parentId: replyTo?.id ?? null,
        },
      });
    },
    onSuccess: () => {
      setBody("");
      setReplyTo(null);
      invalidate();
    },
  });

  const resolveMut = useMutation({
    mutationFn: async (v: { commentId: string; resolved: boolean }) =>
      resolveFn({ data: { projectId, ...v } }),
    onSuccess: () => invalidate(),
  });

  const deleteMut = useMutation({
    mutationFn: async (commentId: string) =>
      deleteFn({ data: { projectId, commentId } }),
    onSuccess: () => invalidate(),
  });

  const open = comments.filter((c) => !c.resolved);
  const resolved = comments.filter((c) => c.resolved);

  return (
    <div className={compact ? "mt-3" : "mt-4"}>
      <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.2em] text-ink/50">
        <MessageSquare className="h-3 w-3" />
        Reviewer comments · {SECTION_LABEL[section]}
        {open.length > 0 && (
          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-900">
            {open.length} open
          </span>
        )}
      </div>
      <div className="mt-2 space-y-2">
        {comments.length === 0 && (
          <div className="text-xs text-ink/40 italic">No comments yet.</div>
        )}
        {open.map((c) => (
          <CommentRow
            key={c.id}
            comment={c}
            currentUserEmail={currentUserEmail}
            onToggleResolved={(next) =>
              resolveMut.mutate({ commentId: c.id, resolved: next })
            }
            onDelete={() => deleteMut.mutate(c.id)}
            onReply={() => setReplyTo(c)}
          />
        ))}
        {resolved.length > 0 && (
          <details className="text-xs">
            <summary className="cursor-pointer text-ink/50 hover:text-ink">
              {resolved.length} resolved
            </summary>
            <div className="mt-2 space-y-2">
              {resolved.map((c) => (
                <CommentRow
                  key={c.id}
                  comment={c}
                  currentUserEmail={currentUserEmail}
                  onToggleResolved={(next) =>
                    resolveMut.mutate({ commentId: c.id, resolved: next })
                  }
                  onDelete={() => deleteMut.mutate(c.id)}
                />
              ))}
            </div>
          </details>
        )}
      </div>
      <div className="mt-2 flex items-start gap-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          placeholder="Leave a comment. Use @name@company.com to mention."
          className="flex-1 rounded-md border border-ink/15 px-2 py-1.5 text-sm focus:border-royal focus:outline-none"
        />
        <button
          type="button"
          onClick={() => createMut.mutate()}
          disabled={createMut.isPending || !body.trim()}
          className="inline-flex items-center gap-1 rounded-md bg-ink px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          <Send className="h-3.5 w-3.5" /> Post
        </button>
      </div>
    </div>
  );
}

function CommentRow({
  comment,
  currentUserEmail,
  onToggleResolved,
  onDelete,
}: {
  comment: WorldEntryComment;
  currentUserEmail?: string;
  onToggleResolved: (next: boolean) => void;
  onDelete: () => void;
}) {
  const isMine =
    !!currentUserEmail &&
    comment.author_email.toLowerCase() === currentUserEmail.toLowerCase();
  return (
    <div
      className={`rounded-md border p-2 text-sm ${
        comment.resolved
          ? "border-emerald-200 bg-emerald-50/60"
          : "border-ink/10 bg-white"
      }`}
    >
      <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-ink/60">
        <div>
          <span className="font-medium text-ink">{comment.author_email}</span>
          <span className="mx-1.5">·</span>
          {new Date(comment.created_at).toLocaleString()}
          {comment.mentions.length > 0 && (
            <>
              <span className="mx-1.5">·</span>
              mentions {comment.mentions.join(", ")}
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onToggleResolved(!comment.resolved)}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-ink/60 hover:bg-ink/5"
          >
            {comment.resolved ? (
              <>
                <RotateCcw className="h-3 w-3" /> Reopen
              </>
            ) : (
              <>
                <CheckCircle2 className="h-3 w-3" /> Resolve
              </>
            )}
          </button>
          {isMine && (
            <button
              type="button"
              onClick={onDelete}
              className="rounded p-1 text-ink/40 hover:bg-red-50 hover:text-red-600"
              aria-label="Delete comment"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
      <div className="whitespace-pre-wrap text-ink">{comment.body}</div>
      {comment.resolved && (
        <div className="mt-1 text-[11px] text-emerald-700">
          Resolved by {comment.resolved_by_email}
          {comment.resolved_at
            ? ` · ${new Date(comment.resolved_at).toLocaleDateString()}`
            : ""}
        </div>
      )}
    </div>
  );
}
