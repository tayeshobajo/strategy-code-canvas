import { createFileRoute, redirect } from "@tanstack/react-router";

// Spine 2.0 — project root lands on the Spine, not Overview.
export const Route = createFileRoute("/engine/projects/$projectId/")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/engine/projects/$projectId/spine",
      params: { projectId: params.projectId },
    });
  },
});
