import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/trust-tai/publish")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handlePublish } = await import("@/lib/insights/publish-handler");
        const { createPublishStore } = await import("@/lib/insights/published.server");
        return handlePublish(request, {
          token: process.env["TRUST_TAI_PUBLISH_TOKEN"],
          store: createPublishStore(),
        });
      },
    },
  },
});
