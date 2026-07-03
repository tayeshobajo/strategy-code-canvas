import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/unsubscribe")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Unsubscribe · Trust Tai" },
      { name: "description", content: "Manage your Trust Tai email preferences." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: UnsubscribePage,
});

type Status = "loading" | "confirm" | "already" | "invalid" | "success" | "error";

function UnsubscribePage() {
  const [status, setStatus] = useState<Status>("loading");
  const [token, setToken] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("token");
    if (!t) {
      setStatus("invalid");
      return;
    }
    setToken(t);
    fetch(`/email/unsubscribe?token=${encodeURIComponent(t)}`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
          setStatus("invalid");
          return;
        }
        if (j.valid === false && j.reason === "already_unsubscribed") setStatus("already");
        else if (j.valid) setStatus("confirm");
        else setStatus("invalid");
      })
      .catch(() => setStatus("invalid"));
  }, []);

  const confirm = async () => {
    if (!token) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/email/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || "Something went wrong.");
      if (j.success) setStatus("success");
      else if (j.reason === "already_unsubscribed") setStatus("already");
      else setStatus("error");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Something went wrong.");
      setStatus("error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center px-6 py-16">
      <div className="max-w-md w-full rounded-2xl bg-card border border-border shadow-sm p-8 sm:p-10 text-center">
        <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal mb-3">
          Email preferences
        </div>
        {status === "loading" && (
          <>
            <h1 className="font-display text-2xl text-ink mb-2">Checking your link…</h1>
            <p className="text-[15px] text-ink/70">One moment.</p>
          </>
        )}
        {status === "invalid" && (
          <>
            <h1 className="font-display text-2xl text-ink mb-2">Link not recognized</h1>
            <p className="text-[15px] text-ink/70">
              This unsubscribe link is invalid or expired. If you'd like to stop receiving emails,
              reply to any Trust Tai email and we'll take care of it.
            </p>
          </>
        )}
        {status === "already" && (
          <>
            <h1 className="font-display text-2xl text-ink mb-2">You're already unsubscribed</h1>
            <p className="text-[15px] text-ink/70">
              Nothing more to do — this address won't receive further Trust Tai emails.
            </p>
          </>
        )}
        {status === "confirm" && (
          <>
            <h1 className="font-display text-2xl text-ink mb-2">Unsubscribe from Trust Tai emails?</h1>
            <p className="text-[15px] text-ink/70 mb-6">
              We'll stop sending you notifications from this address. You can always reach out at
              hello@trusttai.com if you change your mind.
            </p>
            <button
              type="button"
              onClick={confirm}
              disabled={submitting}
              className="inline-flex items-center justify-center rounded-full bg-ink text-white px-6 py-3 text-sm font-medium disabled:opacity-60"
            >
              {submitting ? "Unsubscribing…" : "Confirm unsubscribe"}
            </button>
          </>
        )}
        {status === "success" && (
          <>
            <h1 className="font-display text-2xl text-ink mb-2">You're unsubscribed</h1>
            <p className="text-[15px] text-ink/70">
              This address won't receive further Trust Tai emails. Thanks for letting us know.
            </p>
          </>
        )}
        {status === "error" && (
          <>
            <h1 className="font-display text-2xl text-ink mb-2">Something went wrong</h1>
            <p className="text-[15px] text-ink/70 mb-4">
              {errorMsg ?? "We couldn't complete your unsubscribe."}
            </p>
            <button
              type="button"
              onClick={confirm}
              className="inline-flex items-center justify-center rounded-full bg-ink text-white px-6 py-3 text-sm font-medium"
            >
              Try again
            </button>
          </>
        )}
      </div>
    </div>
  );
}
