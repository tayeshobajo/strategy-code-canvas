import { createFileRoute, redirect } from "@tanstack/react-router";

// Legacy stub route — the real Intelligence Layer lives at
// /engine/projects/$projectId/intelligence-layer. Redirect any lingering
// deep links (workflow spine, bookmarks) to the rich page.
export const Route = createFileRoute("/engine/projects/$projectId/intelligence")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/engine/projects/$projectId/intelligence-layer",
      params: { projectId: params.projectId },
    });
  },
});
