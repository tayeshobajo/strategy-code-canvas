/**
 * VoiceRecorder — in-browser MediaRecorder wrapper for intake voice notes.
 *
 * Emits a File via onRecorded when the user stops. Caps recordings at 2
 * minutes; the parent enforces size/type after the file is emitted.
 *
 * Uses audio/webm on Chrome/Firefox and audio/mp4 on Safari (whichever
 * the browser supports).
 */
import * as React from "react";
import { Loader2, Mic, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const MAX_SECONDS = 120;

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

export function VoiceRecorder({
  disabled,
  onRecorded,
}: {
  disabled?: boolean;
  onRecorded: (file: File) => void | Promise<void>;
}) {
  const [state, setState] = React.useState<"idle" | "starting" | "recording">("idle");
  const [seconds, setSeconds] = React.useState(0);
  const recRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<BlobPart[]>([]);
  const timerRef = React.useRef<number | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);

  const stop = React.useCallback(() => {
    const rec = recRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  React.useEffect(() => () => {
    stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }, [stop]);

  const start = React.useCallback(async () => {
    if (state !== "idle") return;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      toast.error("Recording is not supported in this browser");
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
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setState("idle");
        setSeconds(0);
        if (blob.size === 0) return;
        const ext = type.includes("mp4") ? "m4a" : type.includes("webm") ? "webm" : "audio";
        const file = new File([blob], `voice-note-${Date.now()}.${ext}`, { type });
        await onRecorded(file);
      };
      rec.start();
      setState("recording");
      setSeconds(0);
      const started = Date.now();
      timerRef.current = window.setInterval(() => {
        const s = Math.floor((Date.now() - started) / 1000);
        setSeconds(s);
        if (s >= MAX_SECONDS) stop();
      }, 250);
    } catch (err) {
      setState("idle");
      toast.error((err as Error)?.message || "Microphone permission denied");
    }
  }, [onRecorded, state, stop]);

  if (state === "recording") {
    const mm = String(Math.floor(seconds / 60)).padStart(1, "0");
    const ss = String(seconds % 60).padStart(2, "0");
    return (
      <Button
        type="button"
        size="sm"
        variant="secondary"
        onClick={stop}
        className="gap-2 border-destructive/40 text-destructive"
      >
        <Square className="h-3.5 w-3.5 fill-current" />
        Stop {mm}:{ss}
      </Button>
    );
  }
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      disabled={disabled || state === "starting"}
      onClick={() => void start()}
      className="gap-2"
      title="Record a short voice note"
    >
      {state === "starting" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mic className="h-3.5 w-3.5" />}
      Voice note
    </Button>
  );
}
