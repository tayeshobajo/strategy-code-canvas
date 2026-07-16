import { createFileRoute, redirect } from "@tanstack/react-router";

// Overview has been merged into the Project Spine — there is only one
// "where are we / what's next" surface. Any stale deep link lands here
// and is redirected to /spine.
export const Route = createFileRoute("/engine/projects/$projectId/overview")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/engine/projects/$projectId/spine",
      params: { projectId: params.projectId },
    });
  },
});
