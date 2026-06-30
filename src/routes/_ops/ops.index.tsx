import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_ops/ops/")({
  beforeLoad: () => {
    throw redirect({ to: "/ops/queue" });
  },
});
