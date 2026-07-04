import { createFileRoute, redirect } from "@tanstack/react-router";

// Legacy v1 portal route. The original component performed unfiltered reads
// of `roadmap_documents` scoped only by client_email, which allowed draft
// content to reach clients (QA finding P0-1). It has been neutralised into
// a redirect to the current portal home so any stale links keep working.
export const Route = createFileRoute("/_authenticated/portal")({
  beforeLoad: () => {
    throw redirect({ to: "/portal/home" });
  },
});
