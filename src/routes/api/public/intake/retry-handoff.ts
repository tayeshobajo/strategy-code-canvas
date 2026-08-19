/**
 * Retry endpoint for intake submissions Trust Tai OS has not accepted yet.
 *
 * Called by a scheduler. Authenticated with a shared secret in a header —
 * never a publishable key. Returns counts only, never submission content.
 */

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/intake/retry-handoff")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env["INTAKE_RETRY_SECRET"];
        if (!expected) {
          return new Response("Not configured", { status: 503 });
        }
        const provided = request.headers.get("x-intake-retry-secret") ?? "";
        if (provided.length !== expected.length || provided !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { retryPendingHandoffs } = await import(
          "@/lib/website-intake/session.server"
        );
        try {
          const result = await retryPendingHandoffs();
          return Response.json(result);
        } catch (err) {
          console.error("intake retry failed", err);
          return new Response("Retry failed", { status: 500 });
        }
      },
    },
  },
});
