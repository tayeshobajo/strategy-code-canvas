/**
 * VoiceCapture — first-class voice answering inside the conversation room.
 *
 * Live waveform, timer, pause / resume / finish, then a transcript preview
 * the founder can accept, edit, or re-record. The recording itself is kept
 * (media_ref) so the spoken source is never lost behind its transcript.
 */

import * as React from "react";
import { Loader2, Mic, Pause, Play, Square } from "lucide-react";
import { toast } from "sonner";

const MAX_SECONDS = 180;
const BARS = 28;

function pickMime(): string {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined") return "";
  for (const c of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(c)) return c;
    } catch {
      /* ignore */
    }
  }
  return "";
}

function clock(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function VoiceCapture(props: {
  /** Start recording as soon as the control mounts. */
  autoStart?: boolean;
  onCancel: () => void;
  onRecorded: (file: File) => void | Promise<void>;
}) {
  const { autoStart, onRecorded } = props;
  const [state, setState] = React.useState<"idle" | "starting" | "recording" | "paused">("idle");
  const [seconds, setSeconds] = React.useState(0);
  const [levels, setLevels] = React.useState<number[]>(() => new Array(BARS).fill(0.08));

  const recRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<BlobPart[]>([]);
  const streamRef = React.useRef<MediaStream | null>(null);
  const timerRef = React.useRef<number | null>(null);
  const rafRef = React.useRef<number | null>(null);
  const audioCtxRef = React.useRef<AudioContext | null>(null);
  const elapsedRef = React.useRef(0);

  const teardown = React.useCallback(() => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    void audioCtxRef.current?.close().catch(() => undefined);
    audioCtxRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  React.useEffect(() => () => teardown(), [teardown]);

  const finish = React.useCallback(() => {
    const rec = recRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const start = React.useCallback(async () => {
    if (state !== "idle") return;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      toast.error("Recording isn't supported in this browser. You can type instead.");
      props.onCancel();
      return;
    }
    try {
      setState("starting");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMime();
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recRef.current = rec;
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        const type = rec.mimeType || mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        teardown();
        setState("idle");
        setSeconds(0);
        elapsedRef.current = 0;
        if (blob.size === 0) {
          props.onCancel();
          return;
        }
        const ext = type.includes("mp4") ? "m4a" : "webm";
        await onRecorded(new File([blob], `voice-note-${Date.now()}.${ext}`, { type }));
      };

      // Live level meter
      const Ctx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctx) {
        const ctx = new Ctx();
        audioCtxRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        const buf = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          analyser.getByteTimeDomainData(buf);
          let peak = 0;
          for (let i = 0; i < buf.length; i += 1) {
            peak = Math.max(peak, Math.abs(buf[i] - 128) / 128);
          }
          setLevels((prev) => [...prev.slice(1), Math.min(1, Math.max(0.06, peak * 1.8))]);
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      }

      rec.start();
      setState("recording");
      setSeconds(0);
      elapsedRef.current = 0;
      timerRef.current = window.setInterval(() => {
        if (recRef.current?.state !== "recording") return;
        elapsedRef.current += 1;
        setSeconds(elapsedRef.current);
        if (elapsedRef.current >= MAX_SECONDS) finish();
      }, 1000);
    } catch (err) {
      setState("idle");
      teardown();
      toast.error((err as Error)?.message || "Microphone permission was declined.");
      props.onCancel();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finish, onRecorded, state, teardown]);

  React.useEffect(() => {
    if (autoStart) void start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  const togglePause = () => {
    const rec = recRef.current;
    if (!rec) return;
    if (rec.state === "recording") {
      rec.pause();
      setState("paused");
    } else if (rec.state === "paused") {
      rec.resume();
      setState("recording");
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-royal/25 bg-royal/[0.04] px-4 py-3">
      <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-royal">
        <Mic className="h-3.5 w-3.5" aria-hidden />
        {state === "starting" ? "Getting ready" : state === "paused" ? "Paused" : "Listening"}
      </span>

      <div className="flex h-8 min-w-[140px] flex-1 items-center gap-[3px]" aria-hidden>
        {levels.map((l, i) => (
          <span
            key={i}
            className="w-[3px] rounded-full bg-royal/60 transition-[height] duration-100"
            style={{ height: `${Math.round(l * 100)}%` }}
          />
        ))}
      </div>

      <span className="font-mono text-xs tabular-nums text-ink/60">{clock(seconds)}</span>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={togglePause}
          disabled={state === "starting" || state === "idle"}
          aria-label={state === "paused" ? "Resume recording" : "Pause recording"}
          className="grid h-11 w-11 place-items-center rounded-full border border-ink/15 bg-white text-ink transition hover:border-royal hover:text-royal disabled:opacity-40"
        >
          {state === "paused" ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={finish}
          disabled={state === "starting" || state === "idle"}
          aria-label="Finish recording"
          className="inline-flex h-11 items-center gap-2 rounded-full bg-ink px-5 text-sm text-paper transition hover:bg-royal disabled:opacity-40"
        >
          {state === "starting" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Square className="h-3.5 w-3.5 fill-current" />
          )}
          Finish
        </button>
      </div>
    </div>
  );
}
