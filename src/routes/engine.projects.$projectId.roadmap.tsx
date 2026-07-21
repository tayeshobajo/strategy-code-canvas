import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/engine/projects/$projectId/roadmap")({
  component: () => <Outlet />,
});
