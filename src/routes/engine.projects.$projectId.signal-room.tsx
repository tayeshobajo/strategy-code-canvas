import { createFileRoute } from "@tanstack/react-router";
import { useWorkspace } from "@/hooks/use-workspace";
import { SectionCard } from "@/components/engine/primitives";
import { StepEditor } from "@/components/engine/StepEditor";

export const Route = createFileRoute("/engine/projects/$projectId/signal-room")({
  component: SignalRoom,
});

const CATEGORIES = [
  { key: "transcript", label: "Transcript" },
  { key: "brief", label: "Client Brief" },
  { key: "website", label: "Website URL" },
  { key: "uploads", label: "Uploaded Files" },
  { key: "notes", label: "Notes" },
  { key: "screenshots", label: "Screenshots" },
  { key: "research", label: "Research Links" },
  { key: "previous_roadmap", label: "Previous Roadmap" },
];

function SignalRoom() {
  const { projectId } = Route.useParams();
  const { project } = useWorkspace(projectId);
  const data = (project.signal_room ?? {}) as Record<string, unknown>;

  return (
    <div className="space-y-4">
      <header>
        <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal">Step 2</div>
        <h2 className="font-display text-3xl text-ink mt-1">Signal Room</h2>
        <p className="text-sm text-ink/60 mt-1">Raw truth. Everything the roadmap will be built from.</p>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {CATEGORIES.map((c) => {
          const val = data[c.key];
          return (
            <SectionCard key={c.key} title={c.label}>
              {val ? (
                <pre className="text-xs text-ink/80 whitespace-pre-wrap font-mono">{typeof val === "string" ? val : JSON.stringify(val, null, 2)}</pre>
              ) : (
                <div className="text-sm text-ink/40">Nothing captured yet.</div>
              )}
            </SectionCard>
          );
        })}
      </div>
      <SectionCard title="Edit signal room">
        <StepEditor projectId={projectId} step="signal-room" data={project.signal_room} />
      </SectionCard>
    </div>
  );
}
