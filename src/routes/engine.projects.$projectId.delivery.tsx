import { createFileRoute } from "@tanstack/react-router";
import { useWorkspace } from "@/hooks/use-workspace";
import { SectionCard } from "@/components/engine/primitives";
import { StepEditor } from "@/components/engine/StepEditor";
import { Send, CheckCircle2 } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/engine/projects/$projectId/delivery")({
  component: DeliveryPrep,
});

const CHECKLIST = [
  "Point A verified with client",
  "Point B approved by client",
  "Investment ranges reviewed internally",
  "Roadmap version tagged",
  "Client-safe preview reviewed",
  "Recipient details confirmed",
];

function DeliveryPrep() {
  const { projectId } = Route.useParams();
  const { project } = useWorkspace(projectId);
  const d = (project.delivery ?? {}) as {
    recipient_name?: string;
    recipient_email?: string;
    channel?: string;
    attachments?: string[];
    personal_note?: string;
  };
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const allChecked = CHECKLIST.every((c) => checked[c]);

  return (
    <div className="space-y-4">
      <header>
        <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal">Step 14</div>
        <h2 className="font-display text-3xl text-ink mt-1">Delivery Prep</h2>
        <p className="text-sm text-ink/60 mt-1">Final gate before the roadmap leaves your desk.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <SectionCard title="Recipient">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-ink/50 text-xs">Name</dt><dd className="text-ink">{d.recipient_name ?? "—"}</dd></div>
              <div><dt className="text-ink/50 text-xs">Email</dt><dd className="text-ink">{d.recipient_email ?? project.client_owner_email ?? "—"}</dd></div>
              <div><dt className="text-ink/50 text-xs">Channel</dt><dd className="text-ink">{d.channel ?? "Email"}</dd></div>
              <div><dt className="text-ink/50 text-xs">Attachments</dt><dd className="text-ink">{(d.attachments ?? []).length} file(s)</dd></div>
            </dl>
          </SectionCard>

          <SectionCard title="Personal note">
            <p className="text-sm text-ink/80 whitespace-pre-wrap">{d.personal_note ?? "Add a short, human note here before sending."}</p>
          </SectionCard>

          <SectionCard title="Edit delivery details">
            <StepEditor projectId={projectId} step="delivery" data={project.delivery} />
          </SectionCard>
        </div>

        <div className="space-y-4">
          <SectionCard title="Approval checklist">
            <ul className="space-y-2">
              {CHECKLIST.map((c) => (
                <li key={c} className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={checked[c] ?? false}
                    onChange={(e) => setChecked((s) => ({ ...s, [c]: e.target.checked }))}
                    className="mt-1"
                  />
                  <span className="text-ink/80">{c}</span>
                </li>
              ))}
            </ul>
          </SectionCard>
          <SectionCard title="Approval confirmation">
            {allChecked ? (
              <div className="flex items-center gap-2 text-[#1f6b3b] text-sm">
                <CheckCircle2 className="w-4 h-4" /> Ready to send.
              </div>
            ) : (
              <div className="text-sm text-ink/60">Complete the checklist to enable sending.</div>
            )}
            <button
              disabled={!allChecked}
              className="mt-3 w-full inline-flex items-center justify-center gap-2 bg-ink text-white text-sm rounded-md px-3 py-2 hover:bg-ink/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="w-4 h-4" /> Send approved roadmap
            </button>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
