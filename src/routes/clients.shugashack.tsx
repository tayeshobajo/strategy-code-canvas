import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/clients/shugashack")({
  beforeLoad: () => {
    throw redirect({ to: "/clients/shugarshack", statusCode: 301 });
  },
});
