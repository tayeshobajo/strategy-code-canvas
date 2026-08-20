/**
 * The Build My Roadmap conversation room.
 *
 * One quiet room over the landing page: conversation, reflection, identity
 * and completion all live here. No second visual system — paper surfaces,
 * ink structure, royal as a signal, the site's own type.
 */

import * as React from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowRight,
  Check,
  ChevronDown,

  Loader2,
  Mic,
  Paperclip,
  SkipForward,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { TrustTaiLogo } from "@/components/TrustTaiLogo";
import { VoiceCapture } from "@/components/intake/VoiceCapture";
import {
  fileToBase64,
  type ContactDetails,
  type IntakeConversation,
} from "@/components/intake/use-intake-conversation";
import { attachIntakeFile } from "@/lib/website-intake.functions";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import {
  PICTURE_TITLE,
  type JourneyPhase,
  type PictureItem,
} from "@/lib/website-intake/journey";
import { EARLY_EXIT_PROMPT } from "@/lib/website-intake/adaptive";


import { trackEvent } from "@/lib/website-intake/track";
import taiHeadshot from "@/assets/tai-headshot.png.asset.json";
import {
  MessageActions,
  useMessageReactions,
  type Reaction,
} from "@/components/intake/MessageActions";

const OPENING_LINE = "Let's start with your world.";
const OPENING_SUPPORT = "There's no perfect answer. Start wherever feels natural.";
const MAX_ATTACHMENT_BYTES = 6_500_000;

type Attachment = {
  id: string;
  name: string;
  size: number;
  status: "uploading" | "done" | "error";
  mediaRef?: string;
};

export function ConversationRoom(props: {
  open: boolean;
  voiceFirst?: boolean;
  conversation: IntakeConversation;
  onClose: () => void;
}) {
  const { conversation: c } = props;
  const panelRef = React.useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [closeIntent, setCloseIntent] = React.useState(false);

  useFocusTrap(panelRef, props.open);

  React.useEffect(() => {
    if (!props.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      requestClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.open, c.hasProgress, c.phase]);

  function requestClose() {
    if (c.phase !== "done" && c.hasProgress) {
      setCloseIntent(true);
      return;
    }
    props.onClose();
  }

  if (!props.open) return null;

  const themes = conversationThemes(c.answers);
  const showRail = c.phase === "conversation" && hasEnoughSignal(c.answers) && themes.length > 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Build my roadmap conversation"
      className="fixed inset-0 z-50 flex items-stretch justify-center sm:items-center sm:p-6"
    >
      <button
        type="button"
        aria-label="Close the conversation"
        onClick={requestClose}
        className="absolute inset-0 cursor-default bg-ink/40 backdrop-blur-[3px]"
        tabIndex={-1}
        data-focus-trap-skip
      />

      <div
        ref={panelRef}
        className={`relative flex h-full w-full flex-col overflow-hidden border-ink/10 bg-paper shadow-[0_30px_90px_-60px_rgba(1,5,27,0.55)] sm:h-[86vh] sm:max-h-[92vh] sm:min-h-[640px] sm:w-full sm:max-w-[1040px] sm:rounded-3xl sm:border xl:max-w-[1180px] ${
          reduced ? "" : "motion-safe:animate-in motion-safe:fade-in-0"
        }`}
      >
        <TopBar
          phase={c.phase === "conversation" ? phaseLabel(c.coverage) : roomPhaseLabel(c.phase)}
          progress={c.progress}
          onClose={requestClose}
        />

        <div className="flex min-h-0 flex-1">
          <div className="flex min-h-0 flex-1 flex-col">
            {c.phase === "conversation" && (
              <ConversationBody c={c} voiceFirst={props.voiceFirst} themes={showRail ? themes : []} />
            )}
            {c.phase === "reflection" && <ReflectionBody c={c} />}
            {c.phase === "contact" && <ContactBody c={c} />}
            {c.phase === "done" && <DoneBody onClose={props.onClose} />}
          </div>

          {showRail && (
            <aside className="hidden w-[28%] shrink-0 border-l border-ink/10 bg-white/60 p-6 lg:block">
              <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-ink/45">
                What I'm hearing
              </p>
              <ul className="mt-5 space-y-5">
                {themes.map((t) => (
                  <li key={t.id}>
                    <p className="text-sm text-ink">{t.label}</p>
                    <p className="mt-1 text-sm leading-relaxed text-ink/55">{t.support}</p>
                  </li>
                ))}
              </ul>
              {c.offerExit && (
                <div className="mt-8 border-t border-ink/10 pt-5">
                  <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-royal">
                    Almost there
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-ink/60">
                    I have most of what I need. A little more only if you want to give it.
                  </p>
                  <div className="mt-4 h-[3px] w-full overflow-hidden rounded-full bg-ink/10">
                    <div
                      className="h-full bg-royal"
                      style={{ width: `${Math.round(Math.min(1, c.coverage) * 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </aside>
          )}
        </div>
      </div>

      {closeIntent && (
        <ResumePrompt
          onDismiss={() => setCloseIntent(false)}
          onLeave={() => {
            setCloseIntent(false);
            trackEvent({ name: "intake_abandoned", dedupe: `abandoned:${c.answeredCount}` });
            props.onClose();
          }}
        />
      )}
    </div>
  );
}

function roomPhaseLabel(phase: string) {
  if (phase === "reflection") return "Finding the path";
  if (phase === "contact") return "Finding the path";
  return "Thank you";
}

function TopBar(props: { phase: string; progress: number; onClose: () => void }) {
  return (
    <header className="shrink-0 border-b border-ink/10 bg-paper/95 backdrop-blur">
      <div className="flex items-center gap-4 px-5 py-4 sm:px-8">
        <TrustTaiLogo className="h-6 w-auto" />
        <span className="hidden h-5 w-px bg-ink/15 sm:block" />
        <p className="hidden text-sm text-ink/70 sm:block">Build My Roadmap</p>
        <span className="hidden h-5 w-px bg-ink/15 lg:block" />
        <span className="hidden items-center gap-2 lg:inline-flex">
          <TaiAvatar className="h-7 w-7" alt="Tai" />
          <span className="text-sm text-ink/55">You're talking with Tai</span>
        </span>
        <p className="ml-auto font-mono text-[10px] uppercase tracking-[0.24em] text-ink/45">
          {props.phase}
        </p>
        <button
          type="button"
          onClick={props.onClose}
          aria-label="Close the conversation"
          className="grid h-10 w-10 place-items-center rounded-full text-ink/50 transition hover:bg-ink/5 hover:text-ink"
        >
          <X className="h-4.5 w-4.5" />
        </button>
      </div>
      <div className="h-[2px] w-full bg-ink/[0.06]">
        <div
          className="h-full bg-royal/70 transition-all duration-700"
          style={{ width: `${Math.max(3, Math.round(props.progress * 100))}%` }}
        />
      </div>
    </header>
  );
}

function ThemeDrawer(props: { themes: { id: string; label: string; support: string }[] }) {
  if (props.themes.length === 0) return null;
  return (
    <details className="shrink-0 border-t border-ink/10 bg-white/70 px-5 py-3 lg:hidden">
      <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.24em] text-ink/45">
        What I'm hearing
      </summary>
      <ul className="mt-4 space-y-4 pb-1">
        {props.themes.map((t) => (
          <li key={t.id}>
            <p className="text-sm text-ink">{t.label}</p>
            <p className="mt-1 text-sm leading-relaxed text-ink/55">{t.support}</p>
          </li>
        ))}
      </ul>
    </details>
  );
}

function ConversationBody(props: {
  c: IntakeConversation;
  voiceFirst?: boolean;
  themes: { id: string; label: string; support: string }[];
}) {
  const { c } = props;
  const scrollerRef = React.useRef<HTMLDivElement>(null);
  const bottomRef = React.useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = React.useState(true);
  const [seenCount, setSeenCount] = React.useState(0);
  const { reactions, react } = useMessageReactions(c.resumeToken);

  const scrollToBottom = React.useCallback((behavior: ScrollBehavior = "smooth") => {
    bottomRef.current?.scrollIntoView({ block: "end", behavior });
  }, []);

  // Follow the conversation only while the founder is reading the latest lines.
  React.useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      setAtBottom(distance < 96);
    };
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  React.useEffect(() => {
    if (atBottom) scrollToBottom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.answers.length, c.thinking, c.currentPrompt]);


  // Nothing left worth asking — move to reflection rather than a dead end.
  React.useEffect(() => {
    const done = c.turn ? c.turn.should_end : c.step.kind === "contact";
    if (done && c.hasProgress && !c.busy) c.openReflection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.turn, c.step.kind, c.hasProgress, c.busy]);

  const visible = c.answers.filter((a) => a.key !== ("founder_confirmed_reflection" as never));
  const nearingEnd = c.offerExit;
  const messageCount = visible.length * 2 + (c.currentPrompt ? 1 : 0);

  React.useEffect(() => {
    if (atBottom) setSeenCount(messageCount);
  }, [atBottom, messageCount]);

  const unread = Math.max(0, messageCount - seenCount);

  return (
    <>
      <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollerRef}
        className="flex min-h-0 flex-1 flex-col justify-end overflow-y-auto px-5 py-8 sm:px-10 sm:py-10"
      >
        <div className="mx-auto w-full max-w-2xl space-y-11">

          <div>
            <TaiBlock
              messageId="tai-opening"
              copyText={`${OPENING_LINE}\n\nTell me about the business the way you would tell a friend over coffee. What do you do, and who do you do it for?`}
              reaction={reactions["tai-opening"]}
              onReact={react}
            >
              <p className="font-display text-2xl leading-snug text-ink sm:text-[1.75rem]">
                {OPENING_LINE}
              </p>
              <p className="mt-3 text-base leading-relaxed text-ink/75">
                Tell me about the business the way you would tell a friend over coffee. What do
                you do, and who do you do it for?
              </p>
              <p className="mt-3 text-sm text-ink/45">{OPENING_SUPPORT}</p>
            </TaiBlock>
          </div>

          {visible.map((a, i) => (
            <div key={`${a.key}-${i}`} className="space-y-6">
              {i > 0 && (
                <TaiBlock
                  messageId={`tai-${a.key}-${i}`}
                  copyText={a.question}
                  reaction={reactions[`tai-${a.key}-${i}`]}
                  onReact={react}
                >
                  <p className="whitespace-pre-line text-base leading-relaxed text-ink/85">
                    {a.question}
                  </p>
                </TaiBlock>
              )}
              <FounderBlock
                modality={a.modality}
                at={a.answered_at}
                messageId={`founder-${a.key}-${i}`}
              >
                {a.answer}
              </FounderBlock>
            </div>
          ))}

          {visible.length > 0 && !c.thinking && (
            <TaiBlock
              messageId={`tai-current-${visible.length}`}
              copyText={`${c.currentTransition ? `${c.currentTransition}\n\n` : ""}${c.currentPrompt}`}
              reaction={reactions[`tai-current-${visible.length}`]}
              onReact={react}
            >
              {c.currentTransition && (
                <p className="mb-2 text-base leading-relaxed text-ink/55">{c.currentTransition}</p>
              )}
              <p className="whitespace-pre-line text-base leading-relaxed text-ink/85">
                {c.currentPrompt}
              </p>
            </TaiBlock>
          )}

          {c.thinking && <Thinking />}

          {nearingEnd && !c.thinking && (
            <div className="rounded-2xl border border-royal/25 bg-royal/[0.04] p-5">
              <p className="font-display text-xl text-ink">I think I have the picture.</p>
              <p className="mt-2 text-sm leading-relaxed text-ink/70">{EARLY_EXIT_PROMPT}</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={c.openReflection}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full bg-ink px-5 text-sm text-paper transition hover:bg-royal"
                >
                  Show me what you heard <ArrowRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => c.setKeepTalking(true)}
                  className="inline-flex min-h-11 items-center rounded-full border border-ink/15 bg-white px-5 text-sm text-ink/70 transition hover:text-ink"
                >
                  There's more I want to say
                </button>
              </div>
              {c.keepTalking && (
                <p className="mt-3 text-sm text-ink/55">
                  Good. Keep going, I'm still here.
                </p>
              )}
            </div>
          )}

          {!nearingEnd && !c.thinking && c.answeredCount >= 5 && (
            <button
              type="button"
              onClick={c.openReflection}
              className="text-sm text-ink/45 underline-offset-4 transition hover:text-royal hover:underline"
            >
              That's the picture. Show me what you heard
            </button>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

        {!atBottom && (
          <button
            type="button"
            onClick={() => scrollToBottom()}
            className="absolute bottom-4 left-1/2 z-10 inline-flex min-h-9 -translate-x-1/2 items-center gap-2 rounded-full border border-ink/10 bg-white/95 px-4 text-sm text-ink/70 shadow-[0_10px_30px_-18px_rgba(1,5,27,0.6)] backdrop-blur transition hover:text-ink"
          >
            <ChevronDown className="h-4 w-4" /> Jump to latest
            {unread > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-royal px-1.5 font-mono text-[10px] text-paper">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </button>
        )}
      </div>

      <ThemeDrawer themes={props.themes} />
      <Composer c={c} voiceFirst={props.voiceFirst} />
    </>

  );
}

const AVATAR_SIZE = "h-9 w-9 sm:h-10 sm:w-10";

function TaiAvatar(props: { className?: string; alt?: string }) {
  const [loaded, setLoaded] = React.useState(false);
  return (
    <img
      src={taiHeadshot.url}
      alt={props.alt ?? "Tai"}
      width={80}
      height={80}
      loading="lazy"
      decoding="async"
      onLoad={() => setLoaded(true)}
      className={`aspect-square shrink-0 rounded-full bg-ink/[0.06] object-cover object-center ring-1 ring-ink/10 transition-opacity duration-500 ${
        loaded ? "opacity-100" : "opacity-0"
      } ${props.className ?? AVATAR_SIZE}`}
    />
  );
}

function TaiBlock(props: {
  children: React.ReactNode;
  hideAvatar?: boolean;
  messageId?: string;
  copyText?: string;
  reaction?: Reaction;
  onReact?: (messageId: string, value: Reaction) => void;
}) {
  return (
    <div className="group flex items-start gap-3 sm:gap-4">
      {props.hideAvatar ? (
        <span className={`${AVATAR_SIZE} shrink-0`} aria-hidden />
      ) : (
        <TaiAvatar />
      )}
      <div className="max-w-[92%] rounded-2xl border border-ink/10 bg-white px-5 py-4 sm:max-w-[85%] sm:px-6 sm:py-5">
        {props.children}
        {props.messageId && (
          <MessageActions
            messageId={props.messageId}
            text={props.copyText ?? ""}
            reaction={props.reaction}
            onReact={props.onReact}
          />
        )}
      </div>
    </div>
  );
}


function FounderBlock(props: {
  children: React.ReactNode;
  modality: "text" | "voice";
  at: string;
  messageId?: string;
}) {
  const time = new Date(props.at);
  return (
    <div className="group flex justify-end">
      <div className="max-w-[92%] rounded-2xl border border-royal/15 bg-royal/[0.05] px-5 py-4 sm:max-w-[85%] sm:px-6 sm:py-5">
        <p className="whitespace-pre-wrap text-base leading-relaxed text-ink">{props.children}</p>
        <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-ink/35">
          {props.modality === "voice" ? "Spoken · " : ""}
          {Number.isNaN(time.getTime())
            ? ""
            : time.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
        </p>
        {props.messageId && (
          <MessageActions
            messageId={props.messageId}
            text={typeof props.children === "string" ? props.children : ""}
            align="end"
          />
        )}
      </div>
    </div>
  );
}

function Thinking() {
  return (
    <div className="flex items-start gap-3 sm:gap-4">
      <TaiAvatar />
      <div
        className="inline-flex items-center gap-3 rounded-2xl border border-ink/10 bg-white px-5 py-4"
        role="status"
        aria-label="Tai is replying"
      >
        <span className="flex items-center gap-1.5" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-1.5 w-1.5 rounded-full bg-royal/60 motion-safe:animate-pulse"
              style={{ animationDelay: `${i * 160}ms` }}
            />
          ))}
        </span>
      </div>
    </div>
  );
}


function Composer(props: { c: IntakeConversation; voiceFirst?: boolean }) {
  const { c } = props;
  const upload = useServerFn(attachIntakeFile);
  const [draft, setDraft] = React.useState("");
  const [recording, setRecording] = React.useState(Boolean(props.voiceFirst));
  const [transcribing, setTranscribing] = React.useState(false);
  const [preview, setPreview] = React.useState<{ text: string; mediaRef: string } | null>(null);
  const [attachments, setAttachments] = React.useState<Attachment[]>([]);
  const textRef = React.useRef<HTMLTextAreaElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!recording && !preview) textRef.current?.focus();
  }, [recording, preview, c.currentPrompt]);

  React.useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(220, el.scrollHeight)}px`;
  }, [draft]);

  async function send(text = draft) {
    const value = text.trim();
    if (!value) return;
    const refs = attachments.filter((a) => a.status === "done").map((a) => a.mediaRef!);
    setDraft("");
    setAttachments([]);
    await c.submitAnswer(value, preview ? "voice" : "text", preview?.mediaRef ?? refs[0] ?? null);
    setPreview(null);
  }

  async function handleRecorded(file: File) {
    setRecording(false);
    setTranscribing(true);
    try {
      const result = await c.transcribeVoice(file);
      setPreview({ text: result.transcript, mediaRef: result.mediaRef });
      setDraft(result.transcript);
    } catch {
      toast.error("I couldn't hear that clearly. Try again, or type it instead.");
    } finally {
      setTranscribing(false);
    }
  }

  async function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (file.size > MAX_ATTACHMENT_BYTES) {
      toast.error("That file is a little large. Anything under 6MB works.");
      return;
    }
    const id = `${file.name}-${Date.now()}`;
    setAttachments((prev) => [
      ...prev,
      { id, name: file.name, size: file.size, status: "uploading" },
    ]);
    try {
      const base64 = await fileToBase64(file);
      const token = await c.ensureAttachmentSession();
      const res = (await upload({
        data: {
          resumeToken: token,
          filename: file.name,
          mimeType: file.type || "application/octet-stream",
          base64,
        },
      })) as { mediaRef: string };
      setAttachments((prev) =>
        prev.map((a) => (a.id === id ? { ...a, status: "done", mediaRef: res.mediaRef } : a)),
      );
    } catch {
      setAttachments((prev) => prev.map((a) => (a.id === id ? { ...a, status: "error" } : a)));
    }
  }

  return (
    <div className="shrink-0 border-t border-ink/10 bg-paper/95 px-5 py-5 backdrop-blur sm:px-10 sm:py-7">
      <div className="mx-auto max-w-2xl">
        {c.saveState === "error" && (
          <p className="mb-3 rounded-xl border border-ink/10 bg-white px-4 py-3 text-sm text-ink/70">
            I couldn't save that just now. Nothing you've written is lost. It's still here, and I'll keep trying as you continue.
          </p>
        )}

        {recording ? (
          <VoiceCapture
            autoStart
            onCancel={() => setRecording(false)}
            onRecorded={handleRecorded}
          />
        ) : (
          <>
            {preview && (
              <div className="mb-3 rounded-2xl border border-royal/20 bg-royal/[0.04] px-4 py-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-royal">
                  Here's what I heard
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void send()}
                    className="min-h-11 rounded-full bg-ink px-5 text-sm text-paper transition hover:bg-royal"
                  >
                    Use this
                  </button>
                  <button
                    type="button"
                    onClick={() => textRef.current?.focus()}
                    className="min-h-11 rounded-full border border-ink/15 bg-white px-5 text-sm text-ink/70 transition hover:text-ink"
                  >
                    Edit transcript
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPreview(null);
                      setDraft("");
                      setRecording(true);
                    }}
                    className="min-h-11 rounded-full border border-ink/15 bg-white px-5 text-sm text-ink/70 transition hover:text-ink"
                  >
                    Record again
                  </button>
                </div>
              </div>
            )}

            {attachments.length > 0 && (
              <ul className="mb-3 flex flex-wrap gap-2">
                {attachments.map((a) => (
                  <li
                    key={a.id}
                    className="inline-flex items-center gap-2 rounded-full border border-ink/15 bg-white px-3 py-2 text-xs text-ink/70"
                  >
                    {a.status === "uploading" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {a.status === "done" && <Check className="h-3.5 w-3.5 text-royal" />}
                    <span className="max-w-[180px] truncate">{a.name}</span>
                    {a.status === "error" && <span className="text-destructive">didn't upload</span>}
                    <button
                      type="button"
                      aria-label={`Remove ${a.name}`}
                      onClick={() => setAttachments((prev) => prev.filter((x) => x.id !== a.id))}
                      className="text-ink/40 transition hover:text-ink"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="rounded-2xl border border-ink/15 bg-white p-2 focus-within:border-royal">
              <label className="sr-only" htmlFor="intake-composer">
                Type your answer
              </label>
              <textarea
                id="intake-composer"
                ref={textRef}
                rows={2}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  // Enter sends; shift+enter keeps writing on a new line.
                  if (e.shiftKey || e.nativeEvent.isComposing) return;
                  e.preventDefault();
                  if (c.busy || transcribing) return;
                  void send();
                }}

                placeholder="Type your answer…"
                disabled={c.busy || transcribing}
                className="w-full resize-none bg-transparent px-3 py-2 text-base leading-relaxed text-ink outline-none placeholder:text-ink/35"
              />
              <div className="flex items-center gap-2 px-1 pb-1">
                <button
                  type="button"
                  aria-label="Answer with your voice"
                  onClick={() => setRecording(true)}
                  disabled={c.busy || transcribing}
                  className="grid h-11 w-11 place-items-center rounded-full border border-ink/15 text-ink/60 transition hover:border-royal hover:text-royal disabled:opacity-40"
                >
                  <Mic className="h-4 w-4" />
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => void handleFiles(e.target.files)}
                />
                <button
                  type="button"
                  aria-label="Attach a file"
                  onClick={() => fileRef.current?.click()}
                  disabled={c.busy || transcribing}
                  className="grid h-11 w-11 place-items-center rounded-full border border-ink/15 text-ink/60 transition hover:border-royal hover:text-royal disabled:opacity-40"
                >
                  <Paperclip className="h-4 w-4" />
                </button>

                {c.step.kind !== "contact" && (
                  <button
                    type="button"
                    onClick={() => void c.skipCurrent()}
                    disabled={c.busy || transcribing}
                    className="inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-sm text-ink/45 transition hover:text-ink disabled:opacity-40"
                  >
                    <SkipForward className="h-3.5 w-3.5" /> Skip this
                  </button>
                )}

                <span className="ml-auto hidden font-mono text-[10px] uppercase tracking-[0.2em] text-ink/30 sm:block">
                  {transcribing
                    ? "Listening back…"
                    : c.saveState === "saving"
                      ? "Saving"
                      : c.saveState === "saved"
                        ? "Saved"
                        : "enter to send · shift + enter for a new line"}
                </span>

                <button
                  type="button"
                  aria-label="Send your answer"
                  onClick={() => void send()}
                  disabled={c.busy || transcribing || !draft.trim()}
                  className="grid h-11 w-11 place-items-center rounded-full bg-ink text-paper transition hover:bg-royal disabled:opacity-30"
                >
                  {c.busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowRight className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ReflectionBody(props: { c: IntakeConversation }) {
  const { c } = props;
  const [mode, setMode] = React.useState<"review" | "change" | "more">("review");
  const [text, setText] = React.useState("");

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-10 sm:px-10">
      <div className="mx-auto max-w-2xl">
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-royal">
          I think I have the picture
        </p>
        <h2 className="mt-4 font-display text-3xl leading-snug text-ink sm:text-[2.4rem]">
          Let me make sure I understood you.
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-ink/55">
          This is your own words, shortened. Nothing here is a recommendation yet.
        </p>

        <ul className="mt-8 space-y-5">
          {c.reflection.map((r) => (
            <li key={r.id} className="rounded-2xl border border-ink/10 bg-white p-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink/40">
                {r.label}
              </p>
              <p className="mt-2 text-base leading-relaxed text-ink/85">{r.text}</p>
              {r.source === "shortened" && (
                <p className="mt-2 text-xs text-ink/40">Shortened from what you said.</p>
              )}
            </li>
          ))}
        </ul>

        {mode === "review" ? (
          <div className="mt-8 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void c.confirmReflection()}
              className="inline-flex min-h-12 items-center gap-2 rounded-full bg-ink px-6 text-sm text-paper transition hover:bg-royal"
            >
              <Check className="h-4 w-4" /> Yes, that captures it
            </button>
            <button
              type="button"
              onClick={() => setMode("change")}
              className="inline-flex min-h-12 items-center rounded-full border border-ink/15 bg-white px-6 text-sm text-ink/75 transition hover:text-ink"
            >
              I'd change something
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("more");
                c.setPhase("conversation");
                c.setKeepTalking(true);
              }}
              className="inline-flex min-h-12 items-center rounded-full border border-ink/15 bg-white px-6 text-sm text-ink/75 transition hover:text-ink"
            >
              There's one more thing
            </button>
          </div>
        ) : (
          <div className="mt-8">
            <p className="text-base text-ink/80">What did I miss?</p>
            <textarea
              value={text}
              rows={5}
              onChange={(e) => setText(e.target.value)}
              className="mt-3 w-full rounded-2xl border border-ink/15 bg-white p-4 text-base leading-relaxed text-ink outline-none focus:border-royal"
            />
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={!text.trim() || c.busy}
                onClick={async () => {
                  c.setPhase("conversation");
                  await c.submitAnswer(text.trim(), "text");
                  setText("");
                  setMode("review");
                  c.openReflection();
                }}
                className="inline-flex min-h-12 items-center gap-2 rounded-full bg-ink px-6 text-sm text-paper transition hover:bg-royal disabled:opacity-40"
              >
                {c.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                Update what you heard
              </button>
              <button
                type="button"
                onClick={() => setMode("review")}
                className="inline-flex min-h-12 items-center rounded-full border border-ink/15 bg-white px-6 text-sm text-ink/70"
              >
                Never mind
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ContactBody(props: { c: IntakeConversation }) {
  const { c } = props;
  const [form, setForm] = React.useState<ContactDetails>({
    name: "",
    email: "",
    company: "",
    website: "",
    phone: "",
    researchOk: true,
  });

  const set = (k: keyof ContactDetails) => (v: string | boolean) =>
    setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-10 sm:px-10">
      <div className="mx-auto max-w-2xl">
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-royal">
          I have what I need
        </p>
        <h2 className="mt-4 font-display text-3xl leading-snug text-ink sm:text-[2.4rem]">
          Where should I send the next step?
        </h2>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <Field label="Your name" value={form.name} onChange={set("name")} />
          <Field label="Email" type="email" required value={form.email} onChange={set("email")} />
          <Field label="Company" value={form.company} onChange={set("company")} />
          <Field label="Website" value={form.website} onChange={set("website")} optional />
          <Field label="Phone" value={form.phone} onChange={set("phone")} optional />
        </div>

        <label className="mt-7 flex items-start gap-3 text-sm leading-relaxed text-ink/70">
          <input
            type="checkbox"
            checked={form.researchOk}
            onChange={(e) => set("researchOk")(e.target.checked)}
            className="mt-1 h-4 w-4"
          />
          I'm comfortable with Trust Tai reviewing my public business presence so you can
          understand the bigger picture.
        </label>

        <button
          type="button"
          disabled={c.busy}
          onClick={async () => {
            if (!form.email.trim()) {
              toast.error("An email address is the one thing I need.");
              return;
            }
            const ok = await c.submitContact(form);
            if (!ok) {
              toast.error("That didn't send. Nothing is lost. Try once more in a moment.");
            }
          }}
          className="mt-8 inline-flex min-h-12 items-center gap-2 rounded-full bg-ink px-7 text-sm text-paper transition hover:bg-royal disabled:opacity-50"
        >
          {c.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
          Send my conversation
        </button>
      </div>
    </div>
  );
}

function DoneBody(props: { onClose: () => void }) {
  const steps = [
    { label: "Conversation received", state: "completed" as const },
    { label: "Business context reviewed", state: "next" as const },
    { label: "Next move determined", state: "next" as const },
  ];
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-14 sm:px-10">
      <div className="mx-auto max-w-2xl">
        <div className="grid h-12 w-12 place-items-center rounded-full bg-royal/10">
          <Check className="h-5 w-5 text-royal" />
        </div>
        <h2 className="mt-7 font-display text-3xl leading-snug text-ink sm:text-[2.4rem]">
          Your conversation is with us.
        </h2>
        <p className="mt-5 text-base leading-relaxed text-ink/70">
          We'll now look at what you shared alongside what we can learn about the business, then
          decide what deserves attention first.
        </p>

        <ol className="mt-9 space-y-4">
          {steps.map((s) => (
            <li key={s.label} className="flex items-center gap-3">
              <span
                className={`grid h-6 w-6 place-items-center rounded-full border ${
                  s.state === "completed" ? "border-royal bg-royal text-white" : "border-ink/20 text-ink/30"
                }`}
              >
                {s.state === "completed" ? <Check className="h-3.5 w-3.5" /> : null}
              </span>
              <span className="text-base text-ink/80">{s.label}</span>
              <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.2em] text-ink/40">
                {s.state === "completed" ? "Completed" : "Next"}
              </span>
            </li>
          ))}
        </ol>

        <div className="mt-10 flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={props.onClose}
            className="inline-flex min-h-12 items-center rounded-full bg-ink px-7 text-sm text-paper transition hover:bg-royal"
          >
            Close
          </button>
          <a href="/insights" className="text-sm text-ink/55 underline-offset-4 hover:text-royal hover:underline">
            Read Insights
          </a>
          <a href="/what-we-build" className="text-sm text-ink/55 underline-offset-4 hover:text-royal hover:underline">
            What we build
          </a>
        </div>
      </div>
    </div>
  );
}

function ResumePrompt(props: { onDismiss: () => void; onLeave: () => void }) {
  return (
    <div className="absolute inset-0 z-10 grid place-items-center bg-ink/40 px-6 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-ink/10 bg-paper p-7">
        <h3 className="font-display text-2xl text-ink">Want to pick this up later?</h3>
        <p className="mt-3 text-sm leading-relaxed text-ink/65">
          Everything you've said is saved on this device. Come back to this page and we'll carry
          on exactly where we stopped.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={props.onDismiss}
            className="inline-flex min-h-11 items-center rounded-full bg-ink px-5 text-sm text-paper transition hover:bg-royal"
          >
            Keep talking
          </button>
          <button
            type="button"
            onClick={props.onLeave}
            className="inline-flex min-h-11 items-center rounded-full border border-ink/15 bg-white px-5 text-sm text-ink/70 transition hover:text-ink"
          >
            Save and close
          </button>
        </div>
      </div>
    </div>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  optional?: boolean;
}) {
  return (
    <label className="block">
      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink/45">
        {props.label}
        {props.required ? " *" : props.optional ? " (optional)" : ""}
      </span>
      <input
        type={props.type ?? "text"}
        value={props.value}
        required={props.required}
        onChange={(e) => props.onChange(e.target.value)}
        className="mt-2 min-h-12 w-full rounded-xl border border-ink/15 bg-white px-4 text-base text-ink outline-none transition focus:border-royal"
      />
    </label>
  );
}
