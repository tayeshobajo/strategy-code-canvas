import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/")({
  ssr: false,
  // /admin has no landing UI of its own — send staff into Client portals,
  // the primary admin surface. The parent /admin route already gates access,
  // so unauthorized visitors are bounced to /auth before this ever runs.
  beforeLoad: () => {
    throw redirect({ to: "/admin/client-portals" });
  },
});
