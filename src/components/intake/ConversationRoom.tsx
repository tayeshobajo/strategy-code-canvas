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
  RotateCcw,
  SkipForward,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { TrustTaiLogo } from "@/components/TrustTaiLogo";
import { VoiceCapture } from "@/components/intake/VoiceCapture";
import {
  fileToBase64,
  CONFIRMED_REFLECTION_KEY,
  type ContactDetails,
  type IntakeConversation,
} from "@/components/intake/use-intake-conversation";
import {
  QUESTION_BY_KEY,
  type IntakeObjectiveKey,
} from "@/lib/website-intake/questions";
import { attachIntakeFile } from "@/lib/website-intake.functions";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import {
  PICTURE_TITLE,
  type ChecklistItem,
  type JourneyPhase,
  type PictureItem,
} from "@/lib/website-intake/journey";
import {
  FIELD_HINTS,
  validateAnswer,
  validateContact,
  validateField,
  type FieldKey,
} from "@/lib/website-intake/packet-validation";


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

/** "a, b and c" — readable in a sentence, unlike a bare comma list. */
function joinPhrases(items: string[]) {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

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
  const [resetIntent, setResetIntent] = React.useState(false);

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

  const picture = c.picture;
  const showRail = c.phase === "conversation";


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
          phase={c.phase === "conversation" ? c.activePhaseLabel : roomPhaseLabel(c.phase)}
          onClose={requestClose}
          onReset={c.hasProgress && c.phase !== "done" ? () => setResetIntent(true) : undefined}
        />

        <div className="flex min-h-0 flex-1">
          <div className="flex min-h-0 flex-1 flex-col">
            {c.phase === "conversation" && (
              <ConversationBody c={c} voiceFirst={props.voiceFirst} picture={picture} />
            )}
            {c.phase === "reflection" && <ReflectionBody c={c} />}
            {c.phase === "contact" && <ContactBody c={c} />}
            {c.phase === "review" && <ReviewBody c={c} />}
            {c.phase === "confirm" && <ConfirmBody c={c} />}
            {c.phase === "done" && <DoneBody onClose={props.onClose} />}
          </div>

          {showRail && (
            <aside className="hidden w-[30%] shrink-0 overflow-y-auto border-l border-ink/10 bg-white/60 p-6 lg:block">
              <PhaseList phases={c.journey} />
              <ProgressMeter
                counts={c.checklistCounts}
                items={c.checklist}
                ready={c.ready}
                className="mt-5 border-t border-ink/10 pt-4"
              />
              {picture.length > 0 && (
                <div className="mt-8 border-t border-ink/10 pt-6">
                  <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-ink/45">
                    {PICTURE_TITLE}
                  </p>
                  <ul className="mt-5 space-y-5">
                    {picture.map((p) => (
                      <li key={p.id}>
                        <p className="text-sm text-ink">{p.label}</p>
                        <p className="mt-1 text-sm leading-relaxed text-ink/55">{p.text}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </aside>
          )}
        </div>

      </div>

      {resetIntent && (
        <ConfirmCard
          title="Start the conversation again?"
          body="This clears everything you've told me so far in this browser and begins a fresh conversation. Nothing has been sent."
          confirmLabel="Yes, start over"
          onConfirm={() => {
            setResetIntent(false);
            c.resetConversation();
          }}
          onDismiss={() => setResetIntent(false)}
        />
      )}

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
  if (phase === "confirm") return "One last look";
  if (phase === "reflection" || phase === "contact" || phase === "review")
    return "Putting the picture together";
  return "Thank you";
}

function TopBar(props: { phase: string; onClose: () => void; onReset?: () => void }) {
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
        {props.onReset && (
          <button
            type="button"
            onClick={props.onReset}
            className="inline-flex min-h-9 items-center gap-2 rounded-full border border-ink/15 bg-white px-3 text-xs text-ink/60 transition hover:text-ink"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Start over
          </button>
        )}
        <button
          type="button"
          onClick={props.onClose}
          aria-label="Close the conversation"
          className="grid h-10 w-10 place-items-center rounded-full text-ink/50 transition hover:bg-ink/5 hover:text-ink"
        >
          <X className="h-4.5 w-4.5" />
        </button>
      </div>
    </header>
  );
}

/** Four quiet phases. One active at a time, finished ones carry a check. */
function PhaseList(props: { phases: JourneyPhase[] }) {
  return (
    <ol className="space-y-3" aria-label="Where we are in the conversation">
      {props.phases.map((p) => (
        <li
          key={p.key}
          data-phase={p.key}
          data-state={p.state}
          aria-current={p.state === "active" ? "step" : undefined}
          className="flex items-start gap-3"
        >
          <span
            aria-hidden
            className={`mt-[3px] grid h-4 w-4 shrink-0 place-items-center rounded-full border ${
              p.state === "complete"
                ? "border-royal bg-royal text-white"
                : p.state === "active"
                  ? "border-royal"
                  : "border-ink/20"
            }`}
          >
            {p.state === "complete" ? <Check className="h-2.5 w-2.5" /> : null}
          </span>
          <span
            className={`text-sm leading-snug ${
              p.state === "active"
                ? "text-ink"
                : p.state === "complete"
                  ? "text-ink/55"
                  : "text-ink/35"
            }`}
          >
            {p.label}
          </span>
        </li>
      ))}
    </ol>
  );
}

export type ChecklistCounts = {
  answered: number;
  skipped: number;
  total: number;
  left: number;
};

/**
 * The honest progress read: how many essential questions are settled, which
 * ones they were, and what is still to come.
 */
function ProgressMeter(props: {
  counts: ChecklistCounts;
  items: ChecklistItem[];
  ready: boolean;
  className?: string;
  dense?: boolean;
}) {
  const { counts, items, ready } = props;
  const settled = counts.answered + counts.skipped;
  const pct = counts.total === 0 ? 100 : Math.round((settled / counts.total) * 100);

  return (
    <div className={props.className}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-ink/45">Progress</p>
        <p className="text-sm text-ink/70" aria-live="polite">
          {settled} of {counts.total} settled
        </p>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={counts.total}
        aria-valuenow={settled}
        aria-label="Questions settled"
        className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-ink/10"
      >
        <div
          className="h-full rounded-full bg-royal transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-3 text-sm leading-relaxed text-ink/55">
        {ready || counts.left === 0
          ? "That's everything I need to ask. You can keep talking, or move on to the picture."
          : counts.left === 1
            ? "One more thing I'd like to understand."
            : `${counts.left} more things I'd like to understand.`}
      </p>
      {!props.dense && (
        <ul className="mt-4 space-y-2">
          {items.map((item) => (
            <li
              key={item.key}
              data-objective={item.key}
              data-state={item.state}
              className="flex items-start gap-2.5"
            >
              <span
                aria-hidden
                className={`mt-[3px] grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full border ${
                  item.state === "answered"
                    ? "border-royal bg-royal text-white"
                    : item.state === "skipped"
                      ? "border-ink/25 bg-ink/10"
                      : "border-ink/20"
                }`}
              >
                {item.state === "answered" ? <Check className="h-2 w-2" /> : null}
              </span>
              <span
                className={`text-[13px] leading-snug ${
                  item.state === "answered"
                    ? "text-ink/70"
                    : item.state === "skipped"
                      ? "text-ink/40 line-through decoration-ink/25"
                      : "text-ink/40"
                }`}
              >
                {item.label}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PictureDrawer(props: {
  phases: JourneyPhase[];
  picture: PictureItem[];
  counts?: ChecklistCounts;
  items?: ChecklistItem[];
  ready?: boolean;
}) {
  return (
    <details className="shrink-0 border-t border-ink/10 bg-white/70 px-5 py-3 lg:hidden">
      <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.24em] text-ink/45">
        {PICTURE_TITLE}
      </summary>
      <div className="mt-4 pb-1">
        <PhaseList phases={props.phases} />
        {props.counts && props.items && (
          <ProgressMeter
            counts={props.counts}
            items={props.items}
            ready={props.ready ?? false}
            className="mt-4 border-t border-ink/10 pt-4"
          />
        )}
        {props.picture.length > 0 && (
          <ul className="mt-5 space-y-4 border-t border-ink/10 pt-4">
            {props.picture.map((p) => (
              <li key={p.id}>
                <p className="text-sm text-ink">{p.label}</p>
                <p className="mt-1 text-sm leading-relaxed text-ink/55">{p.text}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}

function ConversationBody(props: {
  c: IntakeConversation;
  voiceFirst?: boolean;
  picture: PictureItem[];
}) {

  const { c } = props;
  const scrollerRef = React.useRef<HTMLDivElement>(null);
  const bottomRef = React.useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = React.useState(true);
  const [seenCount, setSeenCount] = React.useState(0);
  const { reactions, react } = useMessageReactions(c.resumeToken);

  const scrollToBottom = React.useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = scrollerRef.current;
    if (!el) return;
    // Scroll the transcript itself. scrollIntoView can move an ancestor and
    // leave the transcript stranded, which is how the trap started.
    el.scrollTo({ top: el.scrollHeight, behavior });
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

  const visible = c.answers.filter((a) => a.key !== ("founder_confirmed_reflection" as never));
  const nearingEnd = c.offerExit && !c.keepTalking;
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
        role="log"
        aria-label="Conversation transcript"
        aria-live="polite"
        tabIndex={0}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-8 outline-none sm:px-10 sm:py-10"
      >
        {/* mt-auto keeps short conversations anchored low without the
            justify-end flex trap that made older turns unreachable. */}
        <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col justify-end space-y-11">


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

          {c.ready && !c.thinking && (
            <div className="rounded-2xl border border-royal/25 bg-royal/[0.04] p-5">
              <p className="text-[15px] leading-relaxed text-ink">
                I have enough to see the shape of the business now. Let me show you the picture I've
                built from what you told me.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={c.openReflection}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full bg-ink px-5 text-sm text-paper transition hover:bg-royal"
                >
                  Show me the picture <ArrowRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => c.setKeepTalking(true)}
                  className="inline-flex min-h-11 items-center rounded-full border border-ink/15 bg-white px-5 text-sm text-ink/70 transition hover:text-ink"
                >
                  There's more I want to say
                </button>
              </div>
            </div>
          )}

          {nearingEnd && !c.ready && !c.thinking && (
            <div className="rounded-2xl border border-ink/12 bg-white/70 p-5">
              <p className="text-[15px] leading-relaxed text-ink/75">
                {c.gaps.length > 0
                  ? `We're nearly there. Two things I'd still like to hear about: ${joinPhrases(c.gaps)}. Keep going, or stop here and I'll show you the picture.`
                  : "We're nearly there. Keep going, or stop here and I'll show you the picture."}
              </p>
              <div className="mt-4">
                <button
                  type="button"
                  onClick={c.openReflection}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border border-ink/15 bg-white px-5 text-sm text-ink/75 transition hover:text-ink"
                >
                  Stop here and show me the picture <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
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

      <PictureDrawer
        phases={props.c.journey}
        picture={props.picture}
        counts={props.c.checklistCounts}
        items={props.c.checklist}
        ready={props.c.ready}
      />
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
    <div className="group relative flex items-start gap-3 sm:gap-4">
      {props.hideAvatar ? (
        <span className={`${AVATAR_SIZE} shrink-0`} aria-hidden />
      ) : (
        <TaiAvatar />
      )}
      <div className="max-w-[92%] rounded-2xl border border-ink/10 bg-white px-5 py-2.5 sm:max-w-[85%] sm:px-6 sm:py-3">
        {props.children}
      </div>
      {props.messageId && (
        <MessageActions
          messageId={props.messageId}
          text={props.copyText ?? ""}
          reaction={props.reaction}
          onReact={props.onReact}
        />
      )}
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
    <div className="group relative flex justify-end">
      <div className="max-w-[92%] rounded-2xl border border-royal/15 bg-royal/[0.05] px-5 py-2.5 sm:max-w-[85%] sm:px-6 sm:py-3">
        <p className="whitespace-pre-wrap text-base leading-relaxed text-ink">{props.children}</p>
        <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-ink/35">
          {props.modality === "voice" ? "Spoken · " : ""}
          {Number.isNaN(time.getTime())
            ? ""
            : time.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
        </p>
      </div>
      {props.messageId && (
        <MessageActions
          messageId={props.messageId}
          text={typeof props.children === "string" ? props.children : ""}
          align="end"
        />
      )}
    </div>
  );
}

function Thinking() {
  return (
    <div className="flex items-start gap-3 sm:gap-4">
      <TaiAvatar />
      <div
        className="inline-flex items-center gap-3 rounded-2xl border border-ink/10 bg-white px-5 py-3"
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
  const form = c.contact;

  const set = (k: keyof ContactDetails) => (v: string | boolean) =>
    c.setContact((f) => ({ ...f, [k]: v }));

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
          onClick={() => {
            if (!form.email.trim()) {
              toast.error("An email address is the one thing I need.");
              return;
            }
            c.setPhase("review");
          }}
          className="mt-8 inline-flex min-h-12 items-center gap-2 rounded-full bg-ink px-7 text-sm text-paper transition hover:bg-royal disabled:opacity-50"
        >
          Review what I'm sending <ArrowRight className="h-4 w-4" />
        </button>
        <p className="mt-3 text-sm text-ink/50">
          Nothing is sent yet. You'll see everything first and can correct any of it.
        </p>
      </div>
    </div>
  );
}

/** Plain-language name for one recorded line of the packet. */
function packetLabel(key: string, question: string): string {
  if (key === CONFIRMED_REFLECTION_KEY) return "The summary you confirmed";
  if (key.startsWith("aside__")) return "Something you said along the way";
  const base = key.split("__followup_")[0] as IntakeObjectiveKey;
  const q = QUESTION_BY_KEY[base];
  if (!q) return question;
  return key.includes("__followup_") ? `${q.label} (more detail)` : q.label;
}

/**
 * The last gate before anything leaves the browser: every field of the packet
 * in plain language, each one correctable, with gentle inline correction.
 */
function ReviewBody(props: { c: IntakeConversation }) {
  const { c } = props;
  const [editing, setEditing] = React.useState<number | null>(null);
  const [draft, setDraft] = React.useState("");
  const [draftError, setDraftError] = React.useState<string | null>(null);
  const [touched, setTouched] = React.useState<Partial<Record<FieldKey, boolean>>>({});
  const [showAll, setShowAll] = React.useState(false);

  const errors = validateContact(c.contact);
  const shown = (k: FieldKey) => ((touched[k] || showAll) && errors[k]) || null;
  const setField = (k: FieldKey) => (v: string) => c.setContact((f) => ({ ...f, [k]: v }));
  const blur = (k: FieldKey) => () => setTouched((t) => ({ ...t, [k]: true }));

  const rows = c.answers
    .map((a, index) => ({ a, index }))
    .filter(({ a }) => (a.answer ?? "").trim().length > 0);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-10 sm:px-10">
      <div className="mx-auto max-w-2xl pb-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-royal">
          Before anything is sent
        </p>
        <h2 className="mt-4 font-display text-3xl leading-snug text-ink sm:text-[2.4rem]">
          This is exactly what goes to Trust Tai.
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-ink/55">
          Your own words, as recorded. Correct anything that reads wrong. Nothing leaves this
          page until you send it.
        </p>

        <ProgressMeter
          counts={c.checklistCounts}
          items={c.checklist}
          ready={c.ready}
          dense
          className="mt-7 rounded-2xl border border-ink/10 bg-white p-5"
        />

        <section className="mt-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink/40">
            How to reach you
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field
              label="Your name"
              value={c.contact.name}
              hint={FIELD_HINTS.name}
              error={shown("name")}
              onBlur={blur("name")}
              onChange={setField("name")}
            />
            <Field
              label="Email"
              type="email"
              required
              value={c.contact.email}
              hint={FIELD_HINTS.email}
              error={shown("email")}
              onBlur={blur("email")}
              onChange={setField("email")}
            />
            <Field
              label="Company"
              value={c.contact.company}
              hint={FIELD_HINTS.company}
              error={shown("company")}
              onBlur={blur("company")}
              onChange={setField("company")}
            />
            <Field
              label="Website"
              optional
              value={c.contact.website}
              hint={FIELD_HINTS.website}
              error={shown("website")}
              onBlur={blur("website")}
              onChange={setField("website")}
            />
            <Field
              label="Phone"
              optional
              value={c.contact.phone}
              hint={FIELD_HINTS.phone}
              error={shown("phone")}
              onBlur={blur("phone")}
              onChange={setField("phone")}
            />
          </div>
          <label className="mt-5 flex items-start gap-3 text-sm leading-relaxed text-ink/70">
            <input
              type="checkbox"
              checked={c.contact.researchOk}
              onChange={(e) => c.setContact((f) => ({ ...f, researchOk: e.target.checked }))}
              className="mt-1 h-4 w-4"
            />
            Trust Tai may review my public business presence.
          </label>
        </section>

        <section className="mt-10">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink/40">
            What you told me
          </p>
          <ul className="mt-4 space-y-4">
            {rows.map(({ a, index }) => (
              <li key={`${a.key}-${index}`} className="rounded-2xl border border-ink/10 bg-white p-5">
                <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink/40">
                  {packetLabel(String(a.key), a.question)}
                </p>
                {editing === index ? (
                  <>
                    <textarea
                      value={draft}
                      rows={4}
                      aria-invalid={Boolean(draftError) || undefined}
                      onChange={(e) => {
                        setDraft(e.target.value);
                        if (draftError) setDraftError(validateAnswer(e.target.value));
                      }}
                      className={`mt-3 w-full rounded-xl border bg-paper p-3 text-base leading-relaxed text-ink outline-none focus:border-royal ${
                        draftError ? "border-red-400" : "border-ink/15"
                      }`}
                    />
                    <p
                      className={`mt-1.5 text-[13px] leading-snug ${
                        draftError ? "text-red-600" : "text-ink/45"
                      }`}
                    >
                      {draftError ?? "Say it however you'd say it out loud. Your words are kept as written."}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={async () => {
                          const message = validateAnswer(draft);
                          if (message) {
                            setDraftError(message);
                            return;
                          }
                          await c.editAnswer(index, draft);
                          setDraftError(null);
                          setEditing(null);
                        }}
                        className="inline-flex min-h-10 items-center rounded-full bg-ink px-4 text-sm text-paper transition hover:bg-royal"
                      >
                        Save correction
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDraftError(null);
                          setEditing(null);
                        }}
                        className="inline-flex min-h-10 items-center rounded-full border border-ink/15 px-4 text-sm text-ink/70"
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="mt-2 whitespace-pre-line text-base leading-relaxed text-ink/85">
                      {a.answer}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setDraft(a.answer);
                        setDraftError(null);
                        setEditing(index);
                      }}
                      className="mt-3 text-sm text-royal underline-offset-4 hover:underline"
                    >
                      Edit this
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>

        <div className="mt-10 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => {
              const found = validateContact(c.contact);
              if (Object.keys(found).length > 0) {
                setShowAll(true);
                toast.error("One or two details need a small correction first.");
                return;
              }
              c.setPhase("confirm");
            }}
            className="inline-flex min-h-12 items-center gap-2 rounded-full bg-ink px-7 text-sm text-paper transition hover:bg-royal"
          >
            One last look <ArrowRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => c.setPhase("contact")}
            className="inline-flex min-h-12 items-center rounded-full border border-ink/15 bg-white px-6 text-sm text-ink/70 transition hover:text-ink"
          >
            Back
          </button>
        </div>
      </div>
    </div>
  );
}

/** The final gate: the edited packet in plain language, with a way back. */
function ConfirmBody(props: { c: IntakeConversation }) {
  const { c } = props;
  const contact: Array<[string, string]> = [
    ["Name", c.contact.name.trim() || "Not given"],
    ["Email", c.contact.email.trim()],
    ["Company", c.contact.company.trim() || "Not given"],
    ["Website", c.contact.website.trim() || "Not given"],
    ["Phone", c.contact.phone.trim() || "Not given"],
    [
      "Public research",
      c.contact.researchOk
        ? "Yes, Trust Tai may review my public business presence"
        : "No, please don't research my business",
    ],
  ];
  const rows = c.answers.filter((a) => (a.answer ?? "").trim().length > 0);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-10 sm:px-10">
      <div className="mx-auto max-w-2xl pb-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-royal">
          Nothing has been sent yet
        </p>
        <h2 className="mt-4 font-display text-3xl leading-snug text-ink sm:text-[2.4rem]">
          Ready to send this to Trust Tai?
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-ink/55">
          {rows.length} {rows.length === 1 ? "answer" : "answers"} and your contact details, exactly
          as you corrected them. Go back if anything still reads wrong.
        </p>

        <section className="mt-8 rounded-2xl border border-ink/10 bg-white p-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink/40">
            How we'll reach you
          </p>
          <dl className="mt-4 space-y-3">
            {contact.map(([label, value]) => (
              <div key={label} className="flex flex-wrap items-baseline gap-x-3">
                <dt className="w-36 shrink-0 text-sm text-ink/50">{label}</dt>
                <dd className="text-base text-ink/85">{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mt-6 rounded-2xl border border-ink/10 bg-white p-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink/40">
            What you told me
          </p>
          <ul className="mt-4 space-y-5">
            {rows.map((a, i) => (
              <li key={`${a.key}-${i}`}>
                <p className="text-sm text-ink/50">{packetLabel(String(a.key), a.question)}</p>
                <p className="mt-1 whitespace-pre-line text-base leading-relaxed text-ink/85">
                  {a.answer}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <div className="mt-10 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={c.busy}
            onClick={async () => {
              const found = validateField("email", c.contact.email);
              if (found) {
                toast.error(found);
                c.setPhase("review");
                return;
              }
              const ok = await c.submitContact(c.contact);
              if (!ok) {
                toast.error("That didn't send. Nothing is lost. Try once more in a moment.");
              }
            }}
            className="inline-flex min-h-12 items-center gap-2 rounded-full bg-ink px-7 text-sm text-paper transition hover:bg-royal disabled:opacity-50"
          >
            {c.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            Send my conversation
          </button>
          <button
            type="button"
            onClick={() => c.setPhase("review")}
            className="inline-flex min-h-12 items-center rounded-full border border-ink/15 bg-white px-6 text-sm text-ink/70 transition hover:text-ink"
          >
            Go back and edit
          </button>
        </div>
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

function ConfirmCard(props: {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-ink/40 px-6 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-ink/10 bg-paper p-7">
        <h3 className="font-display text-2xl text-ink">{props.title}</h3>
        <p className="mt-3 text-sm leading-relaxed text-ink/65">{props.body}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={props.onConfirm}
            className="inline-flex min-h-11 items-center rounded-full bg-ink px-5 text-sm text-paper transition hover:bg-royal"
          >
            {props.confirmLabel}
          </button>
          <button
            type="button"
            onClick={props.onDismiss}
            className="inline-flex min-h-11 items-center rounded-full border border-ink/15 bg-white px-5 text-sm text-ink/70 transition hover:text-ink"
          >
            Never mind
          </button>
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
  hint?: string;
  error?: string | null;
  onBlur?: () => void;
}) {
  const invalid = Boolean(props.error);
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
        aria-invalid={invalid || undefined}
        onBlur={props.onBlur}
        onChange={(e) => props.onChange(e.target.value)}
        className={`mt-2 min-h-12 w-full rounded-xl border bg-white px-4 text-base text-ink outline-none transition focus:border-royal ${
          invalid ? "border-red-400" : "border-ink/15"
        }`}
      />
      {invalid ? (
        <span className="mt-1.5 block text-[13px] leading-snug text-red-600">{props.error}</span>
      ) : props.hint ? (
        <span className="mt-1.5 block text-[13px] leading-snug text-ink/45">{props.hint}</span>
      ) : null}
    </label>
  );
}
