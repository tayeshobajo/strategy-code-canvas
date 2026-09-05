import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PortalShell } from "@/components/portal/PortalShell";
import { getMyQuestions } from "@/lib/portal/portal.functions";

export const Route = createFileRoute("/_authenticated/portal/activity")({
  head: () => ({
    meta: [
      { title: "Activity | Trust Tai Client Portal" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PortalActivity,
});

function PortalActivity() {
  const fetchQuestions = useServerFn(getMyQuestions);
  const { data, isLoading } = useQuery({
    queryKey: ["portal", "questions"],
    queryFn: () => fetchQuestions({ data: undefined }),
  });

  const questions = data?.questions ?? [];

  return (
    <PortalShell title="Activity" intro="Everything you have sent us, and where it stands.">
      {isLoading ? (
        <p className="text-muted-foreground">Loading.</p>
      ) : questions.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-8">
          <h2 className="text-xl">Nothing here yet</h2>
          <p className="mt-3 text-muted-foreground">
            When you send a question it appears here with its status.
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {questions.map((q) => (
            <li key={q.id} className="rounded-2xl border border-border bg-card p-6">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
                <h2 className="min-w-0 truncate text-lg">{q.subject}</h2>
                <span className="shrink-0 rounded-full border border-border px-3 py-1 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                  {q.status}
                </span>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{q.body}</p>
              <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                {new Date(q.created_at as string).toLocaleDateString()}
              </p>
            </li>
          ))}
        </ul>
      )}
    </PortalShell>
  );
}
