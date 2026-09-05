import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PortalShell } from "@/components/portal/PortalShell";
import { getMyRoadmaps, submitPortalQuestion } from "@/lib/portal/portal.functions";

export const Route = createFileRoute("/_authenticated/portal/intake")({
  head: () => ({
    meta: [
      { title: "Ask a Question | Trust Tai Client Portal" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PortalIntake,
});

function PortalIntake() {
  const fetchRoadmaps = useServerFn(getMyRoadmaps);
  const submit = useServerFn(submitPortalQuestion);
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["portal", "roadmaps"],
    queryFn: () => fetchRoadmaps({ data: undefined }),
  });

  const [slug, setSlug] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    try {
      await submit({ data: { roadmapSlug: slug || null, subject, body } });
      setState("sent");
      setMessage("Received. Tai reads these personally and will come back to you.");
      setSubject("");
      setBody("");
      await queryClient.invalidateQueries({ queryKey: ["portal", "questions"] });
    } catch {
      setState("error");
      setMessage("That did not send. Try again in a moment.");
    }
  }

  return (
    <PortalShell
      title="Ask a question"
      intro="Anything about the route, a milestone or what happens next."
    >
      <form onSubmit={onSubmit} className="max-w-2xl space-y-5">
        {(data?.roadmaps.length ?? 0) > 0 ? (
          <div>
            <label htmlFor="q-roadmap" className="block text-sm font-medium">
              Roadmap (optional)
            </label>
            <select
              id="q-roadmap"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="mt-2 h-12 w-full rounded-xl border border-border bg-card px-4"
            >
              <option value="">Not about a specific roadmap</option>
              {data!.roadmaps.map((r) => (
                <option key={r.slug} value={r.slug}>
                  {r.client}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div>
          <label htmlFor="q-subject" className="block text-sm font-medium">
            Subject
          </label>
          <input
            id="q-subject"
            required
            minLength={3}
            maxLength={200}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="mt-2 h-12 w-full rounded-xl border border-border bg-card px-4"
          />
        </div>

        <div>
          <label htmlFor="q-body" className="block text-sm font-medium">
            Your question
          </label>
          <textarea
            id="q-body"
            required
            minLength={10}
            maxLength={5000}
            rows={7}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="mt-2 w-full rounded-xl border border-border bg-card p-4"
          />
        </div>

        <button
          type="submit"
          disabled={state === "sending"}
          className="h-12 rounded-full bg-ink px-6 text-paper disabled:opacity-60"
        >
          {state === "sending" ? "Sending" : "Send to Tai"}
        </button>

        {message ? (
          <p
            role="status"
            className={`text-sm ${state === "error" ? "text-destructive" : "text-muted-foreground"}`}
          >
            {message}
          </p>
        ) : null}
      </form>
    </PortalShell>
  );
}
